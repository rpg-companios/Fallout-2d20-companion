// Адаптер разбора (патч 260) на НАСТОЯЩИХ данных пакета: реестр, стор, списание
// и выдача. Кубики подменены там, где важна достоверность ветки.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { getItemId } from '../../domain/itemIdentity';
import { getSalvageComposition, getScrapMaterials } from '../../domain/registry';
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
// «Мусорщик» ранга N (263): тесты печатного состава выше common играют с ним,
// иначе редкий материал строка просто не бросается и разбор отказывает по гейту.
const setScrapper = (rank) => useCharacterStore.setState({
  selectedPerks: Array.from({ length: rank }, () => ({ perkId: 'scrapper' })),
});

describe('разбор хлама по печатному составу', () => {
  it('фиксированный состав: будильник даёт алюминий, стекло, ядерку и пружину; стек тратится', () => {
    setScrapper(2); // в составе unusual и rare (263)
    const instanceId = give('alarm_clock', 2);
    const result = salvageItem(instanceId, { rollD20: () => 3 });
    expect(result.done).toBe(true);
    expect(result.granted.map((g) => [g.itemId, g.quantity]).sort()).toEqual([
      ['aluminum', 2], ['glass', 1], ['nuclear_material', 1], ['spring', 1],
    ].sort());
    expect(countOf('alarm_clock')).toBe(1);
    expect(countOf('aluminum')).toBe(2);
    expect(result.time.minutes).toBe(10);
  });

  it('DC-кости идут портом: нули законны — предмет списан, выход пуст', () => {
    setScrapper(1); // стекло — unusual
    const instanceId = give('glass_bottle');
    const result = salvageItem(instanceId, {
      rollD20: () => 3,
      rollDice: () => ({ units: 0, effects: 0 }),
    });
    expect(result.done).toBe(true);
    expect(result.granted).toEqual([]);
    expect(countOf('glass_bottle')).toBe(0);
  });

  it('эффект-грани добавляют материал; choose выбирает альтернативу «или»', () => {
    setScrapper(2); // кислота и ядерка — rare
    const instanceId = give('mutated_viscera');
    const result = salvageItem(instanceId, {
      rollD20: () => 3,
      rollDice: () => ({ units: 2, effects: 2 }),
    });
    expect(result.granted.map((g) => [g.itemId, g.quantity]).sort()).toEqual([
      ['acid', 2], ['nuclear_material', 2],
    ].sort());

    const canId = give('can');
    const alt = salvageItem(canId, {
      rollD20: () => 3,
      choose: () => 1, // вторая альтернатива: сталь
    });
    expect(alt.granted).toEqual([{ itemId: 'steel', quantity: 2, instanceId: alt.granted[0].instanceId }]);
  });

  it('осложнение не отменяет успех: время ×2, изделие выдано', () => {
    const instanceId = give('bucket');
    let i = 0;
    const seq = [3, 20];
    const result = salvageItem(instanceId, { rollD20: () => seq[i++] });
    expect(result.done).toBe(true);
    expect(result.granted[0]).toMatchObject({ itemId: 'steel', quantity: 2 });
    expect(result.time).toEqual({ minutes: 10, durationMultiplier: 2 });
  });

  it('провал: предмет не расходуется, выход не бросается', () => {
    setScrapper(2); // состав выше common — без перка отказ отдался бы раньше проверки (263)
    const instanceId = give('alarm_clock', 2);
    const result = salvageItem(instanceId, { rollD20: () => 20 });
    expect(result.done).toBe(false);
    expect(result.reason).toBe('check-failed');
    expect(countOf('alarm_clock')).toBe(2);
    expect(countOf('aluminum')).toBe(0);
  });
});

describe('разбор не-хлама и линкованные предметы', () => {
  it('линк из таблицы (радио) разбирается по составу таблицы', () => {
    setScrapper(2); // в составе радио rare и unusual — потолок не должен резать этот тест
    expect(getSalvageComposition('item_radio')).toBeTruthy();
    const instanceId = give('item_radio');
    const result = salvageItem(instanceId, { rollD20: () => 3 });
    expect(result.done).toBe(true);
    expect(result.granted.map((g) => [g.itemId, g.quantity]).sort()).toEqual([
      ['circuitry', 1], ['copper', 1], ['plastic', 2], ['rubber', 2],
    ].sort());
  });

  it('НЕ-хлам без печатного состава не разбирается и не расходуется', () => {
    const instanceId = give('weapon_baseball_bat', 2);
    const result = salvageItem(instanceId, { rollD20: () => 3 });
    expect(result).toMatchObject({ done: false, stage: 'gate', reason: 'not-salvageable' });
    expect(countOf('weapon_baseball_bat')).toBe(2);
  });

  it('хлам без печатного состава идёт общим правилом: один common, кап по весу', () => {
    const instanceId = give('weapon_baseball_bat', 2);
    // для модалки бита мертва, но её вес — образец; разбираем желёзу (хлам без таблицы)
    const glandId = give('bloatfly_gland');
    const result = salvageItem(glandId, {
      rollD20: () => 3,
      choose: (n) => n, // pickOption приводит % len → 0
    });
    expect(result.done).toBe(true);
    // 269: пул общий — любой материал редкости 0, включая пачку (все равны).
    const commonOnly = getScrapMaterials().filter((m) => m.rarity === 0).map((m) => m.id);
    expect(result.granted.length).toBe(1);
    expect(commonOnly).toContain(result.granted[0].itemId);
    expect(result.granted[0].quantity).toBe(1);
    expect(countOf('bloatfly_gland')).toBe(0);
    expect(countOf('weapon_baseball_bat')).toBe(2); // рядом лежащая бита не тронута
  });

  it('«Мусорщик» поднимает потолок редкости; клей и масло — никогда', () => {
    const previewNone = salvagePreview(give('bloatfly_gland'));
    expect(previewNone.mode).toBe('generic');
    const rarities = (previewNone.pool || []).map((p) => (getScrapMaterials().find((m) => m.id === p.id) || {}).rarity);
    expect(rarities.length).toBeGreaterThan(0);
    expect(rarities.every((r) => r === 0)).toBe(true);
    const ids = (previewNone.pool || []).map((p) => p.id);
    expect(ids).not.toContain('adhesive');
    expect(ids).not.toContain('oil');

    useCharacterStore.setState({ selectedPerks: [{ perkId: 'scrapper' }, { perkId: 'scrapper' }] });
    const previewTwo = salvagePreview(give('bloatfly_gland'));
    const raritiesTwo = (previewTwo.pool || []).map((p) => (getScrapMaterials().find((m) => m.id === p.id) || {}).rarity);
    expect(raritiesTwo).toContain(2);
    expect(new Set(raritiesTwo)).toEqual(new Set([0, 1, 2]));
  });
});

describe('гейты операций разбора', () => {
  it('расходники и боеприпасы не разбираются (они не хлам и состава не имеют)', () => {
    expect(salvageItem(give('drink_purified_water'), { rollD20: () => 3 }))
      .toMatchObject({ done: false, stage: 'gate', reason: 'not-salvageable' });
    expect(salvageItem(give('ammo_9mm'), { rollD20: () => 3 }))
      .toMatchObject({ done: false, stage: 'gate', reason: 'not-salvageable' });
  });

  it('надетое и запертое не расходуется', () => {
    const instanceId = give('abraxo_cleaner');
    useCharacterStore.setState((prev) => ({
      items: { ...prev.items, [instanceId]: { ...prev.items[instanceId], equipped: true } },
    }));
    expect(salvageItem(instanceId, { rollD20: () => 3 })).toMatchObject({ stage: 'gate', reason: 'in-use' });
  });

  it('несуществующий инстанс и пустая сумка — gate без изменений', () => {
    expect(salvageItem('no-such-instance', { rollD20: () => 3 })).toMatchObject({ stage: 'gate', reason: 'item-not-found' });
  });

  it('превью: режим table у хлама из таблицы, generic у остального', () => {
    expect(salvagePreview(give('bloatfly_gland'))).toMatchObject({ salvageable: true, mode: 'generic' });
    expect(salvagePreview(give('weapon_baseball_bat'))).toMatchObject({ salvageable: false, reason: 'not-salvageable' });
    expect(salvagePreview(give('totally_unknown_item'))).toMatchObject({ salvageable: false, reason: 'unknown-item' });
    const radioPreview = salvagePreview(give('item_radio'));
    expect(radioPreview.mode).toBe('table');
    expect(radioPreview.difficulty).toBe(0);
    expect(radioPreview.complicationDurationMultiplier).toBe(2);
  });
});
