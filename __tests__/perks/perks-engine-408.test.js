// ПРИЁМОЧНЫЙ (патч 408): «ГУЛЕПОДОБНЫЙ» по каноническому тексту владельца —
// перк 3 рангов (+8 к требованию уровня за ранг), радиация действует как
// обычно, перк добавляет 1 ОЗ за каждые 4/3/2 полученные единицы (по рангу).
// Норма считается и для ручного изменения счётчика; конвейер расходников
// показывает её в отчёте и не дублирует при установке счётчика.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { resolveConsumableVitalChanges } from '../../domain/effects';
import { selectPerkBonuses } from '../../domain/perks';
import { ghoulishHpPerUnitsByRank } from '../../domain/perks/ghoulish';
import catalog from '../../modules/fallout/data/perks/perks.json';
import ruCatalog from '../../modules/fallout/i18n/ru-RU/data/perks/perks.json';
import enCatalog from '../../modules/fallout/i18n/en-EN/data/perks/perks.json';

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

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const takeGhoulish = (rank) => {
  // 412: книга — Гулеподобный ВЫН 9 с 7-го уровня, шаг +8; иначе ранг погас.
  useCharacterStore.setState({
    level: 7 + 8 * (Math.max(1, rank) - 1),
    attributes: {
      STR: { total: 5 }, PER: { total: 5 }, END: { total: 9 }, CHA: { total: 5 },
      INT: { total: 5 }, AGI: { total: 5 }, LCK: { total: 5 },
    },
  });
  state().setSelectedPerks(
    Array.from({ length: rank }, (_, index) => ({ perkId: 'ghoulish', index })),
  );
};

describe('Патч 408: данные перка — канонический текст', () => {
  it('в каталоге 3 ранга, шаг уровня +8, требование END 9 / уровень 7', () => {
    const perk = catalog.find((p) => p.id === 'ghoulish');
    expect(perk.maxRanks).toBe(3);
    expect(perk.prerequisites).toMatchObject({
      special: { END: 9 },
      level: 7,
      levelIncreasePerRank: 8,
    });
  });

  it('ru-текст — дословно текст владельца; en-текст синхронно про 4/3/2', () => {
    const ru = ruCatalog.find((p) => p.id === 'ghoulish');
    expect(ru.name).toBe('ГУЛЕПОДОБНЫЙ');
    expect(ru.effect).toContain('восстанавливаете 1 ОЗ за каждые 4 единицы');
    expect(ru.effect).toContain('за каждые 3 единицы');
    expect(ru.effect).toContain('за каждые 2 единицы');
    expect(ru.effect).toContain('максимальный запас ОЗ по-прежнему снижается');
    expect(ru.effect).toContain('увеличивается на 8');
    const en = enCatalog.find((p) => p.id === 'ghoulish');
    expect(en.effect).toContain('1 HP for every 4 points');
    expect(en.effect).toContain('every 3 points');
    expect(en.effect).toContain('every 2 points');
  });

  it('норма по рангам: 4 / 3 / 2 (и не ниже 2)', () => {
    expect(ghoulishHpPerUnitsByRank(1)).toBe(4);
    expect(ghoulishHpPerUnitsByRank(2)).toBe(3);
    expect(ghoulishHpPerUnitsByRank(3)).toBe(2);
    expect(ghoulishHpPerUnitsByRank(4)).toBe(2);
    const b1 = selectPerkBonuses({ ...BOOK, selectedPerks: [{ id: 'ghoulish', rank: 1 }] }, catalog);
    const b3 = selectPerkBonuses({ ...BOOK, selectedPerks: [{ id: 'ghoulish', rank: 3 }] }, catalog);
    expect(b1.ghoulish).toEqual({ hpPerUnits: 4 });
    expect(b3.ghoulish).toEqual({ hpPerUnits: 2 });
  });
});

describe('Патч 408: расходники — радиация действует, лечение по норме', () => {
  const irradiated = (value) => ({
    id: 'test_meat', itemType: 'food',
    radiationModifier: { op: '+', value },
  });

  it('ранг 1: +8 радиации → счётчик +8, лечение +2 ОЗ', () => {
    const r = resolveConsumableVitalChanges(irradiated(8), {
      currentHealth: 5, maxHealth: 20, radiation: 0, ghoulish: { hpPerUnits: 4 },
    });
    expect(r.radiationAfter).toBe(8);
    expect(r.radiationAmount).toBe(8);
    expect(r.healAmount).toBe(2);
  });

  it('ранг 2: +8 радиации → лечение floor(8/3) = 2; ранг 3: +7 → 3 ОЗ', () => {
    const rank2 = resolveConsumableVitalChanges(irradiated(8), {
      currentHealth: 5, maxHealth: 20, radiation: 0, ghoulish: { hpPerUnits: 3 },
    });
    expect(rank2.healAmount).toBe(2);
    const rank3 = resolveConsumableVitalChanges(irradiated(7), {
      currentHealth: 5, maxHealth: 20, radiation: 0, ghoulish: { hpPerUnits: 2 },
    });
    expect(rank3.healAmount).toBe(3);
    expect(rank3.radiationAfter).toBe(7);
  });

  it('снятие радиации (Рад-а-вей) нормы не включает, лечение не отрицательное', () => {
    const radaway = {
      id: 'test_radaway', itemType: 'chem',
      radiationModifier: { op: '-', value: 5 },
    };
    const r = resolveConsumableVitalChanges(radaway, {
      currentHealth: 5, maxHealth: 20, radiation: 6, ghoulish: { hpPerUnits: 2 },
    });
    expect(r.radiationAmount).toBe(-5);
    expect(r.healAmount).toBe(0);
  });

  it('лечение складывается с лечением предмета и капом макс. ОЗ', () => {
    const item = {
      id: 'test_snack', itemType: 'food', preserved: true,
      positiveEffect: { hpModifier: { op: '+', value: 3 } },
      radiationModifier: { op: '+', value: 8 },
    };
    const r = resolveConsumableVitalChanges(item, {
      currentHealth: 10, maxHealth: 14, radiation: 0,
      ghoulish: { hpPerUnits: 4 }, oldWorldGourmet: { hpBonus: 2, radiationReduction: 1 },
    });
    // Радиация после гурманской скидки: 8 → 7 (полученные единицы).
    // Лечение: 3 предмета + 2 гурмана + floor(7/4) = 1 гулеподобного = 6,
    // но потолок 14 − 10 = 4.
    expect(r.radiationAmount).toBe(7);
    expect(r.healAmount).toBe(6);
    expect(r.healthAfter).toBe(14);
  });
});

describe('Патч 408: ручной счётчик — по той же норме', () => {
  it('ранг 2: +9 радиации вручную → счётчик 9, ОЗ +3', () => {
    takeGhoulish(2);
    useCharacterStore.setState({ currentHealth: 5, radiation: 0 });
    state().setRadiation((prev) => prev + 9);
    expect(state().radiation).toBe(9);
    expect(state().currentHealth).toBe(8); // floor(9/3)
  });

  it('два подъёма по +2 при норме 4 лечат по 0, вместе не копятся (каждый сам)', () => {
    takeGhoulish(1);
    useCharacterStore.setState({ currentHealth: 5, radiation: 0 });
    state().setRadiation((prev) => prev + 2);
    state().setRadiation((prev) => prev + 2);
    expect(state().radiation).toBe(4);
    expect(state().currentHealth).toBe(5); // floor(2/4) = 0 в каждом шаге
  });

  it('конвейер: setRadiation со skip-флагом не дублирует норму из отчёта', () => {
    takeGhoulish(1);
    useCharacterStore.setState({ currentHealth: 5, radiation: 0 });
    state().setRadiation(8, { skipGhoulishHeal: true });
    expect(state().radiation).toBe(8);
    expect(state().currentHealth).toBe(5); // лечение уже учёл резолвер
  });
});
