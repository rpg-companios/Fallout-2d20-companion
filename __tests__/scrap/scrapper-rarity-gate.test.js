// Патч 263: редкость получаемых материалов под потолком «Мусорщика» — для
// печатного состава тоже. Аккумулятор (battery) — эталон: ровно по одному
// материалу каждой редкости (plastic common, lead uncommon, acid rare).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { getItemId } from '../../domain/itemIdentity';
import { getSalvageComposition } from '../../domain/registry';
import { salvageItem, salvagePreview } from '../../modules/fallout/salvage/operations';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const give = (itemId, quantity = 1) => state().addNewItem({ itemId, quantity });
const countOf = (itemId) => Object.values(state().items)
  .reduce((sum, item) => (getItemId(item) === itemId ? sum + (Number(item.quantity) || 1) : sum), 0);
const scrapper = (rank) => useCharacterStore.setState({
  selectedPerks: Array.from({ length: rank }, () => ({ perkId: 'scrapper' })),
});

const grantedIds = (result) => result.granted.map((g) => g.itemId);

describe('потолок «Мусорщика» на печатном составе (battery: common+uncommon+rare)', () => {
  it('без перка: выдаётся только обычный, необычный и редкий не бросаются', () => {
    const result = salvageItem(give('battery'), { rollD20: () => 3, choose: (n) => n });
    expect(result.done).toBe(true);
    expect(result.granted).toEqual([{ itemId: 'plastic', quantity: 1, instanceId: result.granted[0].instanceId }]);
    expect(countOf('plastic')).toBe(1);
    expect(countOf('battery')).toBe(0); // хлам списан честно: что мог вынуть — вынул
  });

  it('ранг 1: обычный + необычный', () => {
    scrapper(1);
    const result = salvageItem(give('battery'), { rollD20: () => 3, choose: (n) => n });
    expect(result.done).toBe(true);
    expect(grantedIds(result).sort()).toEqual(['lead', 'plastic']);
    expect(countOf('acid')).toBe(0);
  });

  it('ранг 2: все три — и ровно состав, без надбавки сверху', () => {
    scrapper(2);
    const result = salvageItem(give('battery'), { rollD20: () => 3, choose: (n) => n });
    const printed = getSalvageComposition('battery').options[0].map((r) => r.material).sort();
    expect(grantedIds(result).sort()).toEqual(printed); // ничего лишнего не появилось
  });

  it('если в хламе только то, что выше потолка — попытка отказывает, предмет цел', () => {
    // alarm_clock: три unusual и одна rare — без «Мусорщика» ловить нечего.
    const instanceId = give('alarm_clock', 2);
    const result = salvageItem(instanceId, { rollD20: () => 3 });
    expect(result).toMatchObject({ done: false, stage: 'gate', reason: 'no-materials', rarityCeiling: 0 });
    expect(countOf('alarm_clock')).toBe(2);
    expect(result.time).toBeNull(); // и время не тратится: броска не было
  });

  it('строка без основного материала остаётся ради достижимого эффекта', () => {
    // blood_sac: антисептик (rare) с костью-эффектом fiberglass (uncommon).
    // Ранг 1: основа срезана, кости строки живут — эффект падает как падает.
    scrapper(1);
    const result = salvageItem(give('blood_sac'), {
      rollD20: () => 3,
      rollDice: () => ({ units: 0, effects: 1 }),
      choose: (n) => n,
    });
    expect(result.done).toBe(true);
    expect(grantedIds(result)).toEqual(['fiberglass']);
    expect(countOf('antiseptic')).toBe(0);
  });

  it('линк-исключение (радио) тоже под потолком: без перка — только пластику и резина', () => {
    const result = salvageItem(give('item_radio'), { rollD20: () => 3 });
    expect(result.done).toBe(true);
    expect(grantedIds(result).sort()).toEqual(['plastic', 'rubber']);
    expect(countOf('circuitry')).toBe(0);
    expect(countOf('copper')).toBe(0);
    scrapper(2);
    const full = salvageItem(give('item_radio'), { rollD20: () => 3 });
    expect(grantedIds(full).sort()).toEqual(['circuitry', 'copper', 'plastic', 'rubber']);
  });
});

describe('превью знает потолок', () => {
  it('rarityCeiling и число срезанных строк; полный отказ тоже описан', () => {
    const alarmNone = salvagePreview(give('alarm_clock'));
    expect(alarmNone).toMatchObject({ salvageable: false, reason: 'no-materials', rarityCeiling: 0 });
    scrapper(1);
    const alarmOne = salvagePreview(give('alarm_clock'));
    expect(alarmOne).toMatchObject({ salvageable: true, mode: 'table', rarityCeiling: 1, gatedRows: 1 });
    expect(alarmOne.composition.options[0].map((r) => r.material).sort())
      .toEqual(['aluminum', 'glass', 'spring']);
    scrapper(2);
    const alarmTwo = salvagePreview(give('alarm_clock'));
    expect(alarmTwo.gatedRows).toBe(0);
    const gland = salvagePreview(give('bloatfly_gland'));
    expect(gland).toMatchObject({ mode: 'generic', rarityCeiling: 2 });
  });
});
