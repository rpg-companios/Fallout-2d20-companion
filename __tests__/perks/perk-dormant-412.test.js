// ПРИЁМОЧНЫЙ (патч 412): закон погашенных перков. Слово владельца:
// «показать уведомление о недоступных перках. Оставить серым и не
// рабочим, персонаж может вручную его заменить или дождаться условий,
// пусть сам решает». Недоступные по книге перки («книга приоритетнее»,
// 410) остаются в списке, НЕ ДЕЙСТВУЮТ (бонусы и гейты рецептов/разборки
// их не видят) и снова заработают, когда выполнятся условия. Снимаются
// только неизвестные каталогу id. Уведомление при загрузке — один показ
// на изменение множества погасших.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import {
  evaluateSelectedPerkPicks,
  reconcileSelectedPerksWithCatalog,
  calculatePerkEffects,
  selectPerkBonuses,
  countActivePerkSelections,
} from '../../domain/perks';
import catalog from '../../modules/fallout/data/perks/perks.json';
import { juryRigFor } from '../../modules/fallout/crafting/operations';
import { scrapperCeiling } from '../../modules/fallout/salvage/operations';
import ruScreen from '../../modules/fallout/i18n/ru-RU/screens/perksAndTraits/screen.json';
import enScreen from '../../modules/fallout/i18n/en-EN/screens/perksAndTraits/screen.json';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const CTX = (over = {}) => ({
  attributes: { STR: 5, PER: 5, END: 5, CHA: 5, INT: 5, AGI: 5, LCK: 5, ...over },
  level: 12,
  isRobot: false,
  ...over, // level/isRobot поверх значений по умолчанию
});

const ids = (list) => list.map((entry) => entry.id);

describe('Патч 412: оценка выбора — кто действует, кто погас', () => {
  it('здоровый список: все активны, ранги по порядку', () => {
    const { picks, inactivePicks } = evaluateSelectedPerkPicks(
      [{ id: 'lifeGiver' }, { id: 'strongBack' }],
      catalog,
      CTX({ STR: 8 }),
    );
    expect(inactivePicks).toEqual([]);
    expect(picks.map((p) => p.rank)).toEqual([1, 1]);
    expect(picks.every((p) => p.active)).toBe(true);
  });

  it('Крепкий хребет ×3: действует ранг 1 (книга), два лишних — rank-limit', () => {
    const { activePicks, inactivePicks } = evaluateSelectedPerkPicks(
      [{ id: 'strongBack' }, { id: 'strongBack' }, { id: 'strongBack' }],
      catalog,
      CTX({ STR: 8 }),
    );
    expect(activePicks).toHaveLength(1);
    expect(inactivePicks).toHaveLength(2);
    expect(inactivePicks.every((p) => p.reason === 'rank-limit')).toBe(true);
    expect(activePicks[0].rank).toBe(1);
  });

  it('СИЛ 4: Крепкий хребет погас с пояснением «нужна СИЛ 5 (есть 4)»', () => {
    const { inactivePicks } = evaluateSelectedPerkPicks(
      [{ id: 'strongBack' }],
      catalog,
      CTX({ STR: 4 }),
    );
    expect(inactivePicks[0]).toMatchObject({
      id: 'strongBack', reason: 'attributes', code: 'STR', need: 5, have: 4,
    });
  });

  it('уровень: «Прицел с подсветкой» с 8-го — на 3-м погас (payload), на 8-м действует', () => {
    const early = evaluateSelectedPerkPicks([{ id: 'glowSight' }], catalog, CTX({ level: 3, PER: 8 }));
    expect(early.inactivePicks[0]).toMatchObject({ id: 'glowSight', reason: 'level', need: 8, have: 3 });
    const grown = evaluateSelectedPerkPicks([{ id: 'glowSight' }], catalog, CTX({ level: 8, PER: 8 }));
    expect(grown.inactivePicks).toEqual([]);
  });

  it('роботу «не для роботов» перк погас (reason robot)', () => {
    const { inactivePicks } = evaluateSelectedPerkPicks(
      [{ id: 'ghoulish' }],
      catalog,
      CTX({ END: 9, level: 12, isRobot: true }),
    );
    expect(inactivePicks[0]).toMatchObject({ id: 'ghoulish', reason: 'robot' });
  });

  it('«или-или»: Дерзкий действует (взят первым), Осмотрительный погас с otherId', () => {
    const { activePicks, inactivePicks } = evaluateSelectedPerkPicks(
      [{ id: 'daringNature' }, { id: 'cautiousNature' }],
      catalog,
      CTX({ LCK: 5, PER: 7 }),
    );
    expect(ids(activePicks)).toEqual(['daringNature']);
    expect(inactivePicks[0]).toMatchObject({ id: 'cautiousNature', reason: 'excluded', otherId: 'daringNature' });
  });

  it('неизвестный каталогу id — reason unknown', () => {
    const { inactivePicks } = evaluateSelectedPerkPicks(
      [{ id: 'perk_from_the_past' }],
      catalog,
      CTX(),
    );
    expect(inactivePicks[0]).toMatchObject({ id: 'perk_from_the_past', reason: 'unknown' });
  });

  it('идемпотентность: повторная оценка — тот же результат', () => {
    const list = [{ id: 'strongBack' }, { id: 'strongBack' }, { id: 'strongBack' }];
    const first = evaluateSelectedPerkPicks(list, catalog, CTX({ STR: 8 }));
    const second = evaluateSelectedPerkPicks(list, catalog, CTX({ STR: 8 }));
    expect(second).toEqual(first);
  });
});

describe('Патч 412: мигратор — серые остаются, неизвестные снимаются', () => {
  it('погасшие перки НЕ снимаются (changed false), список в отчете inactivePicks', () => {
    const result = reconcileSelectedPerksWithCatalog(
      [{ id: 'strongBack' }, { id: 'strongBack' }, { id: 'strongBack' }],
      catalog,
      CTX({ STR: 8 }),
    );
    expect(result.changed).toBe(false);
    expect(result.selectedPerks).toHaveLength(3);
    expect(result.inactivePicks).toHaveLength(2);
    expect(result.removed).toEqual([]);
  });

  it('неизвестный id снимается — слот освобождается', () => {
    const result = reconcileSelectedPerksWithCatalog(
      [{ id: 'strongBack' }, { id: 'perk_from_the_past' }],
      catalog,
      CTX({ STR: 8 }),
    );
    expect(result.changed).toBe(true);
    expect(ids(result.selectedPerks)).toEqual(['strongBack']);
    expect(result.removed[0]).toMatchObject({ id: 'perk_from_the_past', reason: 'unknown' });
  });
});

describe('Патч 412: погасший перк не действует — нигде', () => {
  it('бонусы: Крепкий хребет ×3 при СИЛ 8 даёт ранг 1 (25), при СИЛ 4 — ноль', () => {
    const three = [{ id: 'strongBack' }, { id: 'strongBack' }, { id: 'strongBack' }];
    const strong = calculatePerkEffects(catalog, three, CTX({ STR: 8 }));
    expect(strong.bonuses.carryWeightBonus).toBe(25);
    const weak = calculatePerkEffects(catalog, three, CTX({ STR: 4 }));
    expect(weak.bonuses.carryWeightBonus).toBeUndefined();
  });

  it('Фармацевт ×2 при уровне ниже 2-го ранга действует как ранг 1 (+2 антирада)', () => {
    const bonuses = selectPerkBonuses(
      {
        selectedPerks: [{ id: 'pharmacist' }, { id: 'pharmacist' }],
        attributes: { INT: { total: 8 } },
        level: 2, // 2-й ранг Фармацевта с 8-го уровня — погас
      },
      catalog,
    );
    expect(bonuses.antiradRadiationBonus).toBe(2);
  });

  it('стор: setSelectedPerks → пересчёт уже без погасших; reconcile выставляет флаги', () => {
    useCharacterStore.setState({
      level: 12,
      attributes: {
        STR: { total: 8 }, PER: { total: 5 }, END: { total: 5 },
        CHA: { total: 5 }, INT: { total: 5 }, AGI: { total: 5 }, LCK: { total: 5 },
      },
    });
    state().setSelectedPerks([{ id: 'strongBack' }, { id: 'strongBack' }, { id: 'strongBack' }]);
    expect(state().perkBonuses.carryWeightBonus).toBe(25);

    const first = state().reconcilePerksAtLoad();
    expect(first.changed).toBe(false);
    expect(first.dormant).toHaveLength(2);
    expect(first.shouldNotify).toBe(true); // множество изменилось (впервые)
    expect(state().pendingPerksDormant).toHaveLength(2);

    const second = state().reconcilePerksAtLoad();
    expect(second.shouldNotify).toBe(false); // то же множество — не повторяем
  });

  it('стор: неизвестный id снимается при загрузке (changed true)', () => {
    state().setSelectedPerks([{ id: 'strongBack' }, { id: 'perk_from_the_past' }]);
    const result = state().reconcilePerksAtLoad();
    expect(result.changed).toBe(true);
    expect(ids(state().selectedPerks)).toEqual(['strongBack']);
  });

  it('гейт крафта: погасший «Ломовые патроны» режим не открывает', () => {
    const ammo = { category: 'ammo', requires: { complexity: 1 } };
    useCharacterStore.setState({
      level: 1,
      selectedPerks: [{ perkId: 'juryRiggedAmmo' }, { perkId: 'juryRiggedAmmo' }],
    });
    expect(juryRigFor(ammo)).toBeNull(); // УДЧ6/уровень 6 не набраны — перк погас

    useCharacterStore.setState({
      level: 10,
      attributes: { LCK: { total: 6 } },
    });
    expect(juryRigFor(ammo)).toMatchObject({ maxRarity: 2 }); // оба ранга действуют
  });

  it('гейт разборки: Мусорщик — только действующие ранги', () => {
    useCharacterStore.setState({
      level: 1,
      selectedPerks: [{ perkId: 'scrapper' }, { perkId: 'scrapper' }],
    });
    expect(scrapperCeiling(state())).toBe(0); // погас (нужен 3-й уровень)

    useCharacterStore.setState({ level: 8 });
    expect(scrapperCeiling(state())).toBe(2);
  });
});

describe('Патч 412: словари уведомлений и пояснений (оба языка, без фолбэков)', () => {
  it('alerts.dormantPerks* и dormant.* присутствуют; perksBookAdjusted* удалены', () => {
    for (const dict of [ruScreen, enScreen]) {
      expect(typeof dict.alerts.dormantPerksTitle).toBe('string');
      expect(dict.alerts.dormantPerksMessage).toContain('{perks}');
      expect(dict.alerts.perksBookAdjustedTitle).toBeUndefined();
      for (const key of ['prefix', 'level', 'attributes', 'robot', 'excluded', 'rankLimit']) {
        expect(typeof dict.dormant[key], key).toBe('string');
        expect(dict.dormant[key].length).toBeGreaterThan(0);
      }
      for (const code of ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK']) {
        expect(typeof dict.modal.attributeFilters[code]).toBe('string');
      }
    }
  });

  it('экран проводит погашенные перки: серые стили и пояснение', () => {
    const screen = readFileSync('modules/fallout/screens/PerksAndTraitsScreen/PerksAndTraitsScreen.js', 'utf8');
    expect(screen).toContain('evaluateSelectedPerkPicks');
    expect(screen).toContain('dormancyById');
    expect(screen).toContain('dormantNoteFor');
    expect(screen).toContain('styles.spoilerHeaderInactive');
    expect(screen).toContain('styles.spoilerInactiveNote');

    const styles = readFileSync('modules/fallout/styles/PerksAndTraitsScreen.styles.js', 'utf8');
    for (const key of ['spoilerHeaderInactive', 'spoilerTitleInactive', 'spoilerRankInactive', 'spoilerInactiveNote']) {
      expect(styles).toContain(key);
    }
  });
});
