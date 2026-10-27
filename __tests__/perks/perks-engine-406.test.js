// ПРИЁМОЧНЫЙ (патч 406): одиннадцать перков по механикам, согласованным
// с владельцем — Гуль, Кровопийца, Super Duper, Омолодившийся, Мохавский
// верблюд, Полевой хирург, Фармацевт, Power User, Коллекционер крышек,
// Естественная стойкость, вторая половина ХИМИКА.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import {
  resolveConsumableVitalChanges,
  scaleDuration,
  getInstantHealAmount,
} from '../../domain/effects';
import { selectPerkBonuses } from '../../domain/perks';
import { calculateDerivedStats } from '../../modules/fallout/logic/derivedStats.js';
import { createSurvivalState, advanceHours, consumeDrink, SURVIVAL_LADDER_MAX, SURVIVAL_RULES } from '../../modules/fallout/survival/survival';
import { sleepSurvival } from '../../modules/fallout/survival/operations';
import { craftRecipe } from '../../modules/fallout/crafting/operations';
import perksCatalog from '../../modules/fallout/data/perks/perks.json';
import drinksData from '../../modules/fallout/data/consumables/drinks.json';
import chemsData from '../../modules/fallout/data/consumables/chems.json';

// 412: книжный профиль теста — перки проходят требования книги
// (иначе они честно гасятся: уровень 30 закрывает ранги, характеристики 9).
const BOOK = {
  level: 30,
  attributes: {
    STR: { total: 9 }, PER: { total: 9 }, END: { total: 9 }, CHA: { total: 9 },
    INT: { total: 9 }, AGI: { total: 9 }, LCK: { total: 9 },
  },
};

const state = () => useCharacterStore.getState();
const byId = (list, id) => (Array.isArray(list) ? list : Object.values(list)).find((x) => x.id === id);

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const takePerks = (...ids) => {
  // 412: книжный профиль — иначе перк честно погас (требования книги).
  useCharacterStore.setState({
    level: 30,
    attributes: {
      STR: { total: 9 }, PER: { total: 9 }, END: { total: 9 }, CHA: { total: 9 },
      INT: { total: 9 }, AGI: { total: 9 }, LCK: { total: 9 },
    },
  });
  // ЭКШН стора (не setState напрямую): он пересчитывает perkBonuses.
  state().setSelectedPerks(ids.map((id, index) => ({ perkId: id, index })));
};

describe('Патч 406: перк-бонусы и их слияние', () => {
  it('все одиннадцать перков кладут свои ключи', () => {
    const cases = {
      fieldSurgeon: { stimpakHpBonus: 3, antiradRadiationBonus: 1 },
      pharmacist: { antiradRadiationBonus: 2 },
      powerUser: { fusionCoreChargeBonus: 3 },
      capCollector: { capCollectorDiscountPercent: 10 },
      naturalResistance: { sleepOnGroundDiseaseImmune: true },
      rejuvenated: { rejuvenatedSatedMaxHp: 2, ladderAccRates: { food: 0.5, water: 0.5 } },
      dromedary: { dromedaryExtraWaterStep: 1 },
      superDuper: { superDuper: true },
      ghoulish: { ghoulish: { hpPerUnits: 4 } },
      chemist: { chemDurationMultiplier: 2 },
    };
    for (const [id, expected] of Object.entries(cases)) {
      const bonuses = selectPerkBonuses({ ...BOOK, selectedPerks: [{ id, rank: 1 }] }, perksCatalog);
      expect(bonuses, id).toMatchObject(expected);
    }
    // 410: книжные нормы по рангам — Фармацевт 2/3/4, Мощный 3/6/10.
    expect(selectPerkBonuses({ ...BOOK, selectedPerks: [{ id: 'pharmacist', rank: 3 }] }, perksCatalog))
      .toMatchObject({ antiradRadiationBonus: 4 });
    expect(selectPerkBonuses({ ...BOOK, selectedPerks: [{ id: 'powerUser', rank: 3 }] }, perksCatalog))
      .toMatchObject({ fusionCoreChargeBonus: 10 });
    const blood = selectPerkBonuses({ ...BOOK, selectedPerks: [{ id: 'bloodsucker', rank: 1 }] }, perksCatalog);
    expect(blood.bloodPackHealMultiplier).toBe(2);
    expect(blood.bloodPackDrinkIds).toContain('drink_blood_pack');
  });

  it('Полевой хирург + Фармацевт: антирад складывается; Физик-ядерщик + Power User: заряды по книге', () => {
    const bonuses = selectPerkBonuses(
      { ...BOOK, selectedPerks: [{ id: 'fieldSurgeon', rank: 1 }, { id: 'pharmacist', rank: 1 }] },
      perksCatalog,
    );
    expect(bonuses.antiradRadiationBonus).toBe(3); // +1 хирург + 2 фармацевт
    const cores = selectPerkBonuses(
      { ...BOOK, selectedPerks: [{ id: 'nuclearPhysicist', rank: 1 }, { id: 'powerUser', rank: 1 }] },
      perksCatalog,
    );
    expect(cores.fusionCoreChargeBonus).toBe(6); // 3 (ядерщик) + 3 (книга, ранг 1)
  });
});

describe('Патч 406: конвейер употребления', () => {
  it('стимпак лечит +3 с перком (реальные данные каталога)', () => {
    const chems = chemsData;
    const stimpak = byId(chems, 'chem_stimpak');
    expect(getInstantHealAmount(stimpak)).toBe(5);
    const withPerk = resolveConsumableVitalChanges(stimpak, {
      currentHealth: 5, maxHealth: 20, radiation: 0, stimpakHpBonus: 3,
    });
    expect(withPerk.healAmount).toBe(8);
    const without = resolveConsumableVitalChanges(stimpak, {
      currentHealth: 5, maxHealth: 20, radiation: 0,
    });
    expect(without.healAmount).toBe(5);
  });

  it('Рад-а-вей: −4 базово, −5 с одним перком, −6 с двумя (клампится дном)', () => {
    const radaway = byId(chemsData, 'chem_radaway');
    const run = (bonus, current = 3) => resolveConsumableVitalChanges(radaway, {
      currentHealth: 10, maxHealth: 20, radiation: current, antiradRadiationBonus: bonus,
    });
    expect(run(0).radiationAmount).toBe(-3); // есть только 3 радиации
    expect(run(1, 10).radiationAmount).toBe(-5);
    expect(run(2, 10).radiationAmount).toBe(-6);
  });

  it('Гулеподобный (канон 408): радиация действует, лечение по норме 1 за 4', () => {
    const irradiated = {
      id: 'test_meat', itemType: 'food',
      radiationModifier: { op: '+', value: 2 },
    };
    // +2 радиации: счётчик растёт, лечение floor(2/4) = 0 ОЗ.
    const ghoul = resolveConsumableVitalChanges(irradiated, {
      currentHealth: 5, maxHealth: 20, radiation: 0, ghoulish: true,
    });
    expect(ghoul.healAmount).toBe(0);
    expect(ghoul.radiationAmount).toBe(2);
    expect(ghoul.radiationAfter).toBe(2);

    // Гурман уменьшает радиацию preserved-еды (2 → 1) — полученная единица
    // меньше нормы, лечение только гурманское.
    const canned = {
      id: 'test_canned', itemType: 'food', preserved: true,
      radiationModifier: { op: '+', value: 2 },
    };
    const both = resolveConsumableVitalChanges(canned, {
      currentHealth: 5, maxHealth: 20, radiation: 0,
      ghoulish: true, oldWorldGourmet: { hpBonus: 2, radiationReduction: 1 },
    });
    expect(both.radiationAmount).toBe(1);
    expect(both.healAmount).toBe(2); // только +2 от гурмана
  });

  it('Кровопийца: пакет крови лечит 3 → 6 (id уже в каталоге напитков)', () => {
    const pack = byId(drinksData, 'drink_blood_pack');
    expect(pack.hpHealed).toBe(3);
    const result = resolveConsumableVitalChanges(pack, {
      currentHealth: 5, maxHealth: 20, radiation: 0,
      hpHealMultiplier: 2, // так его применяет applyConsumableFull
    });
    expect(result.healAmount).toBe(6);
  });

  it('ХИМИК: длительность ×2 (lasting → 2 сцены, 3 сцены → 6, instant не тронут)', () => {
    expect(scaleDuration('lasting', 2)).toBe(2);
    expect(scaleDuration(3, 2)).toBe(6);
    expect(scaleDuration('instant', 2)).toBe('instant');
    expect(scaleDuration('lasting', 1)).toBe('lasting');
  });
});

describe('Патч 406: Мохавский верблюд и Омолодившийся (выживание)', () => {
  it('верблюд: обычный напиток +2 ступени, чистая вода +3 (базово 1 и 2)', () => {
    // Свежий персонаж сыт (лестницы на потолке, питьё не двигает) —
    // для теста ступеней опускаем воду к «обезвожен».
    const thirsty = () => {
      const s = createSurvivalState('human');
      s.water = 1;
      return s;
    };
    const water = { id: 'test_w', itemType: 'drinks' };
    expect(consumeDrink(thirsty(), water).gained.water).toBe(1);
    expect(consumeDrink(thirsty(), water, { extraWaterSteps: 1 }).gained.water).toBe(2);

    const purified = { id: 'test_p', itemType: 'drinks', purified: true };
    expect(consumeDrink(thirsty(), purified).gained.water).toBe(2);
    expect(consumeDrink(thirsty(), purified, { extraWaterSteps: 1 }).gained.water).toBe(3);
  });

  it('омолодившийся: лестницы еды и воды спускаются вдвое медленнее', () => {
    const fed = createSurvivalState('human');
    fed.food = 3;
    fed.water = 3;
    // Часов ровно на порог спуска с 3-й ступени: обычная скорость — спуск,
    // половинная (омолодившийся) — порог не достигнут, без спуска.
    const hours = SURVIVAL_RULES.stepHours.food[3];
    const slow = advanceHours(fed, hours, { ladderAccRates: { food: 0.5, water: 0.5 } });
    const fast = advanceHours(fed, hours);
    expect(fast.state.food).toBe(2);
    expect(slow.state.food).toBe(3);
    // Вода: порог другой, но соотношение то же (взял удвоенный порог воды).
    const hoursW = SURVIVAL_RULES.stepHours.water[3];
    const slowW = advanceHours(fed, hoursW, { ladderAccRates: { food: 0.5, water: 0.5 } });
    const fastW = advanceHours(fed, hoursW);
    expect(fastW.state.water).toBe(2);
    expect(slowW.state.water).toBe(3);
  });

  it('омолодившийся: +2 Макс. ОЗ только на высшей ступени сытости', () => {
    const ATTRS = Object.fromEntries(
      ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK'].map((id) => [id, { id, base: 5, modifiers: [], total: 5 }]),
    );
    const mk = (food) => {
      // ЭКШН стора: каскад пересчёта сидит в экшенах, сырой set его не зовёт.
      state().setStateExtension('survival', { ...createSurvivalState('human'), food });
    };
    takePerks('rejuvenated');
    mk(SURVIVAL_LADDER_MAX.food);
    const sated = state().derivedStats.maxHealth;
    mk(SURVIVAL_LADDER_MAX.food - 1);
    const notSated = state().derivedStats.maxHealth.total;
    // Сыт: +2 модификатором перка; ушёл с высшей ступени — модификатор снялся.
    expect(sated.total).toBe(notSated + 2);
    expect(sated.modifiers).toContainEqual({
      source: 'perks.rejuvenated', value: 2, operation: '+',
    });
    expect(state().derivedStats.maxHealth.modifiers).not.toContainEqual(
      expect.objectContaining({ source: 'perks.rejuvenated' }),
    );
  });
});

describe('Патч 406: Естественная стойкость и Super Duper', () => {
  it('сон в пустоши с перком: проверка на болезнь не запускается', () => {
    useAppSettingsStore.getState().setValue('survivalModeEnabled', true);
    state().setStateExtension('survival', createSurvivalState('human'));
    takePerks('naturalResistance');
    const result = sleepSurvival({ place: 'wasteland', hours: 3 });
    expect(result.ok).toBe(true);
    expect(result.diseaseRiskResult).toEqual({ skipped: 'naturalResistance' });
  });

  it('Super Duper: Эффект на кубике возвращает половину потраченного (floor)', () => {
    takePerks('superDuper', 'ammosmith');
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 1, total: 1 } },
    }));
    const seed = (itemId, quantity) => {
      useCharacterStore.setState((prev) => ({
        items: { ...prev.items, [`sd_${itemId}_${Math.random().toString(36).slice(2, 7)}`]: { weaponId: itemId, quantity } },
      }));
    };
    const count = (itemId) => Object.values(state().items)
      .filter((item) => item.weaponId === itemId)
      .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);

    seed('item_common_materials', 5);
    const result = craftRecipe('ammo_38', {
      rollCD: (cd) => cd * 2,
      superDuperRoll: () => ({ faces: [6], effectCount: 1 }),
    });
    expect(result.done).toBe(true);
    // Потрачено 2 материала, вернулась половина = 1.
    expect(result.superDuper).toEqual({ faces: [6], effectCount: 1, returned: [{ itemId: 'item_common_materials', quantity: 1 }] });
    expect(count('item_common_materials')).toBe(5 - 2 + 1);
  });

  it('Super Duper без Эффекта: возврата нет', () => {
    takePerks('superDuper', 'ammosmith');
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 1, total: 1 } },
    }));
    useCharacterStore.setState((prev) => ({
      items: { ...prev.items, sd_x: { weaponId: 'item_common_materials', quantity: 5 } },
    }));
    const result = craftRecipe('ammo_38', {
      rollCD: (cd) => cd * 2,
      superDuperRoll: () => ({ faces: [3], effectCount: 0 }),
    });
    expect(result.done).toBe(true);
    expect(result.superDuper).toEqual({ faces: [3], effectCount: 0, returned: [] });
  });
});
