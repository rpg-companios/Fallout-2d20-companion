// Патч 215 — болезни с рангами.
//
// Правила владельца:
//   - болезнь имеет ранг (в данных — duration: 1/3/4); ранг живёт на эффекте
//     болезни (поле rank) и растёт на каждой 20-ке в сопротивлении;
//   - антибиотик снимает 1 единицу с КАЖДОЙ болезни, не более 1 дозы в 24 ч;
//   - отдых в постели: каждые 12 накопленных часов сна в кровати снимают
//     1 единицу с каждой болезни;
//   - заражение даёт +1 усталость источника «болезнь»; излечение болезни
//     снимает её (часовое снятие и сон эту усталость не трогают);
//   - «Сопротивляться»: 2d20, успех грани <= ВЫН + Выживание; грань 1 —
//     2 успеха; отмеченный навык «Выживание» и грань <= его ранга —
//     2 успеха; сумма успехов >= ранга излечивает болезнь; каждая грань
//     20 повышает ранг болезни на 1.

import { describe, expect, it } from 'vitest';
import {
  addPersistentDiseaseEffect,
  createPersistentDiseaseEffect,
  DISEASE_RESIST_COOLDOWN_MS,
  effectDiseaseRank,
  increaseDiseaseRank,
  reduceDiseaseRanks,
  resistDiseaseRoll,
} from '../../domain/diseaseConditions';
import {
  addDiseaseFatigue,
  addFatigue,
  advanceHours,
  cloneSurvivalState,
  createSurvivalState,
  fatigueFromSource,
  forecastSleep,
  rest,
  SURVIVAL_RULES,
  totalFatigue,
  withDiseaseFatigue,
  withoutDiseaseFatigue,
} from '../../modules/fallout/survival/survival';
import { migrateDiseaseRanks } from '../../modules/fallout/diseases/migration';
import { migrateCharacterState } from '../../src/store/migrations';

const buzzBrain = {
  id: 'disease_buzz_brain',
  name: 'Гул в голове',
  effectLabel: 'Сложность проверок ИНТ увеличивается на 1.',
  d20Roll: 3,
  duration: 4,
};

const shellShock = {
  id: 'disease_shell_shock',
  name: 'Контузия',
  effectLabel: 'Тест.',
  d20Roll: 14,
  duration: 3,
};

describe('болезни: ранг на эффекте', () => {
  it('создание эффекта берёт ранг из duration', () => {
    const effect = createPersistentDiseaseEffect(buzzBrain, 1000);
    expect(effect.rank).toBe(4);
    expect(effect.effectType).toBe('disease');
    expect(effect.isPermanent).toBe(true);
  });

  it('каталог без валидного duration — ошибка данных', () => {
    expect(() => createPersistentDiseaseEffect({ ...buzzBrain, duration: 0 })).toThrow(/ранга/);
  });

  it('effectDiseaseRank: поле rank; эффект без поля — ранг 1 (миграция v25)', () => {
    expect(effectDiseaseRank({ rank: 3 })).toBe(3);
    expect(effectDiseaseRank({})).toBe(1);
    expect(effectDiseaseRank({ rank: 0 })).toBe(1);
    expect(effectDiseaseRank(null)).toBe(1);
  });
});

describe('болезни: лечение по единицам (антибиотик, отдых)', () => {
  it('reduceDiseaseRanks снимает по 1 с каждой болезни, излеченные удаляются', () => {
    let effects = [
      createPersistentDiseaseEffect(buzzBrain, 1000), // ранг 4
      createPersistentDiseaseEffect(shellShock, 1000), // ранг 3
      { id: 'timed', effectType: 'positive', scenesLeft: 3 }, // не болезнь
    ];
    const first = reduceDiseaseRanks(effects, 1);
    expect(first.healed).toEqual([]);
    expect(effectDiseaseRank(first.effects[0])).toBe(3);
    expect(effectDiseaseRank(first.effects[1])).toBe(2);

    const second = reduceDiseaseRanks(first.effects, 2);
    expect(effectDiseaseRank(second.effects[0])).toBe(1);
    expect(second.healed).toEqual(['disease_shell_shock']); // 2-2 = 0

    const third = reduceDiseaseRanks(second.effects, 1);
    expect(third.healed).toEqual(['disease_buzz_brain']);
    expect(third.effects).toEqual([{ id: 'timed', effectType: 'positive', scenesLeft: 3 }]);
  });

  it('increaseDiseaseRank поднимает ранг только указанной болезни', () => {
    const effects = [
      createPersistentDiseaseEffect(buzzBrain, 1000),
      createPersistentDiseaseEffect(shellShock, 1000),
    ];
    const next = increaseDiseaseRank(effects, 'disease_shell_shock', 1);
    expect(effectDiseaseRank(next[0])).toBe(4);
    expect(effectDiseaseRank(next[1])).toBe(4);
  });

  it('повторное заражение той же болезнью эффект не дублирует', () => {
    const effects = [createPersistentDiseaseEffect(buzzBrain, 1000)];
    const applied = addPersistentDiseaseEffect(effects, buzzBrain, 2000);
    expect(applied.added).toBe(false);
    expect(applied.effects).toHaveLength(1);
  });
});

describe('болезни: проверка «Сопротивляться» (2d20)', () => {
  it('грань <= цели — успех; грань 1 — два успеха', () => {
    const r = resistDiseaseRoll({ targetNumber: 10, diseaseRank: 2, rollD20: () => 5 });
    expect(r.successes).toBe(2);
    expect(r.cured).toBe(true);
    expect(r.rankIncrease).toBe(0);
  });

  it('отмеченный навык: грань <= ранга навыка — два успеха', () => {
    const r = resistDiseaseRoll({ targetNumber: 12, taggedSurvivalRank: 4, diseaseRank: 3, rollD20: () => 4 });
    expect(r.successes).toBe(4);
    expect(r.cured).toBe(true);
  });

  it('без отмеченного навыка та же грань — один успех', () => {
    const r = resistDiseaseRoll({ targetNumber: 12, taggedSurvivalRank: null, diseaseRank: 3, rollD20: () => 4 });
    expect(r.successes).toBe(2);
    expect(r.cured).toBe(false);
  });

  it('грань 20 — успеха нет, сложность +1 (за каждую 20-ку)', () => {
    const r = resistDiseaseRoll({ targetNumber: 10, diseaseRank: 3, rollD20: () => 20 });
    expect(r.successes).toBe(0);
    expect(r.cured).toBe(false);
    expect(r.rankIncrease).toBe(2);
  });

  it('успехов меньше ранга — болезнь остаётся', () => {
    const faces = [7, 7];
    const r = resistDiseaseRoll({
      targetNumber: 10,
      diseaseRank: 3,
      rollD20: () => faces.shift(),
    });
    expect(r.successes).toBe(2);
    expect(r.cured).toBe(false);
  });

  it('кулдаун — сутки', () => {
    expect(DISEASE_RESIST_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('некорректные аргументы — ошибка', () => {
    expect(() => resistDiseaseRoll({ targetNumber: 0, diseaseRank: 1, rollD20: () => 1 })).toThrow();
    expect(() => resistDiseaseRoll({ targetNumber: 10, diseaseRank: 0, rollD20: () => 1 })).toThrow();
    expect(() => resistDiseaseRoll({ targetNumber: 10, diseaseRank: 1, rollD20: () => 42 })).toThrow();
  });
});

describe('болезни: усталость источника «болезнь»', () => {
  it('заражение +1, излечение −1 — чистыми переходами без мутации', () => {
    const base = createSurvivalState('human');
    const infected = withDiseaseFatigue(base, 1);
    expect(fatigueFromSource(infected, 'disease')).toBe(1);
    expect(totalFatigue(base)).toBe(0); // исходное не тронуто
    const cured = withoutDiseaseFatigue(infected, 1);
    expect(fatigueFromSource(cured, 'disease')).toBe(0);
  });

  it('часовое снятие не трогает усталость болезни', () => {
    const s = createSurvivalState('human');
    addDiseaseFatigue(s, 1);
    addFatigue(s, 'food', 2);
    const after = advanceHours(s, 2).state;
    expect(fatigueFromSource(after, 'disease')).toBe(1); // не снялась
    expect(fatigueFromSource(after, 'food')).toBe(0); // пищевая снялась
  });

  it('сон не снимает усталость болезни (только источник «сон» на 6-м часе)', () => {
    const s = createSurvivalState('human');
    addDiseaseFatigue(s, 1);
    addFatigue(s, 'sleep', 2);
    const after = rest(s, { place: 'bed', hours: 8 }).state;
    expect(fatigueFromSource(after, 'disease')).toBe(1);
    expect(fatigueFromSource(after, 'sleep')).toBe(0);
  });

  it('cloneSurvivalState — глубокая копия (fatigue не разделяется)', () => {
    const s = createSurvivalState('human');
    addFatigue(s, 'food', 2);
    const copy = cloneSurvivalState(s);
    addFatigue(copy, 'water', 1);
    expect(totalFatigue(s)).toBe(2);
    expect(totalFatigue(copy)).toBe(3);
  });
});

describe('болезни: отдых в постели (аккумулятор 12 часов)', () => {
  it('сон в кровати копит часы; порции по 12 снимаются из аккумулятора', () => {
    let s = createSurvivalState('human');
    const first = rest(s, { place: 'bed', hours: 8 });
    expect(first.bedRestCompleted).toBe(0);
    expect(first.state.bedRestHours).toBe(8);

    const second = rest(first.state, { place: 'bed', hours: 4 });
    expect(second.bedRestCompleted).toBe(1);
    expect(second.state.bedRestHours).toBe(0);

    const third = rest(second.state, { place: 'bed', hours: 24 });
    expect(third.bedRestCompleted).toBe(2);
    expect(third.state.bedRestHours).toBe(0);
  });

  it('сон в пустоши аккумулятор не двигает', () => {
    let s = createSurvivalState('human');
    s = rest(s, { place: 'bed', hours: 8 }).state;
    const wasteland = rest(s, { place: 'wasteland', hours: 8 });
    expect(wasteland.bedRestCompleted).toBe(0);
    expect(wasteland.state.bedRestHours).toBe(8);
  });

  it('прогноз сна не меняет исходное состояние', () => {
    const s = createSurvivalState('human');
    forecastSleep(s, { place: 'bed', hours: 12 });
    expect(s.bedRestHours).toBe(0);
    expect(SURVIVAL_RULES.bedRestHealHours).toBe(12);
  });
});

describe('болезни: миграция v24 → v25 (ранги из каталога)', () => {
  it('эффектам болезней без rank проставляется duration каталога', () => {
    const state = {
      schemaVersion: 24,
      activeTimedEffects: [
        { id: 'c-buzz', effectType: 'disease', conditionId: 'disease_buzz_brain', isPermanent: true },
        { id: 'c-shell', effectType: 'disease', conditionId: 'disease_shell_shock', isPermanent: true, rank: 2 },
        { id: 'timed', effectType: 'positive', scenesLeft: 4 },
      ],
    };
    const out = migrateDiseaseRanks(state);
    expect(out.activeTimedEffects[0].rank).toBe(4);
    expect(out.activeTimedEffects[1].rank).toBe(2); // существующий ранг не переписан
    expect(out.activeTimedEffects[2].rank).toBeUndefined();
  });

  it('идемпотентна', () => {
    const state = {
      schemaVersion: 24,
      activeTimedEffects: [
        { id: 'c-buzz', effectType: 'disease', conditionId: 'disease_buzz_brain', isPermanent: true },
      ],
    };
    const once = migrateDiseaseRanks(state);
    expect(migrateDiseaseRanks(once)).toEqual(once);
  });

  it('полная цепочка migrateCharacterState доводит сейв до v26', () => {
    const v23 = {
      schemaVersion: 23,
      characterName: 'Курьер',
      activeTimedEffects: [
        { id: 'c-buzz', effectType: 'disease', conditionId: 'disease_buzz_brain', isPermanent: true },
      ],
    };
    const out = migrateCharacterState(v23);
    expect(out.schemaVersion).toBe(26);
    expect(out.activeTimedEffects[0].rank).toBe(4);
  });
});

describe('болезни: i18n новых строк (ru/en)', () => {
  it('ключи сопротивления есть в обоих словарях экрана', async () => {
    const ruWaA = (await import('../../i18n/ru-RU/screens/weaponsAndArmor/screen.json')).default;
    const enWaA = (await import('../../i18n/en-EN/screens/weaponsAndArmor/screen.json')).default;
    for (const dict of [ruWaA, enWaA]) {
      expect(dict.effectsPanel.resist).toBeTruthy();
      expect(dict.effectsPanel.resistTitle).toBeTruthy();
      expect(dict.effectsPanel.resistRolls).toContain('{r1}');
      expect(dict.effectsPanel.resistCured).toContain('{name}');
      expect(dict.effectsPanel.resistFailed).toContain('{name}');
      expect(dict.effectsPanel.resistRankIncreased).toContain('{r}');
      expect(dict.effectsPanel.resistCooldown).toBeTruthy();
    }
  });

  it('ключи лечения антибиотиками есть в обоих словарях инвентаря', async () => {
    const ruInv = (await import('../../i18n/ru-RU/screens/inventory/screen.json')).default;
    const enInv = (await import('../../i18n/en-EN/screens/inventory/screen.json')).default;
    for (const dict of [ruInv, enInv]) {
      expect(dict.alerts.antibioticDailyLimit).toBeTruthy();
      expect(dict.alerts.antibioticReduced).toContain('{units}');
    }
  });

  it('данные: антибиотик помечен antibiotic, у всех болезней валидный ранг', async () => {
    const chems = (await import('../../modules/fallout/data/consumables/chems.json')).default;
    const antibiotics = chems.find((c) => c.id === 'chem_antibiotics');
    expect(antibiotics?.antibiotic).toBe(true);
    expect(antibiotics?.positiveEffect?.removeCondition).toContain('diseased');

    const diseases = (await import('../../modules/fallout/data/conditions/diseases.json')).default;
    expect(diseases).toHaveLength(20);
    for (const disease of diseases) {
      expect(Number.isInteger(disease.duration) && disease.duration >= 1, disease.id).toBe(true);
    }
  });
});
