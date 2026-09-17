// Аксиомы разборного мира (владелец, 2026-09-17) как исполняемый контракт:
// хлам = то, что разбирается на конечные материалы; материалы — составные части
// хлама и ингредиенты крафта; материалы обладают редкостью; материалы не
// разбираются (п.5 — гард isScrapMaterial в operations). Плюс пин составной
// тройки из сообщения владельца: лупа = стекло×2 + медь×1 + кристалл×2,
// медь/стекло — uncommon, кристалл — rare.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import useCharacterStore from '../../src/store/characterStore';
import { salvageItem, salvagePreview } from '../../modules/fallout/salvage/operations';
import { salvageButtonForItem, salvageSublineForItem } from '../../modules/fallout/salvage/subline';
import { buildSalvageReport } from '../../components/screens/InventoryScreen/logic/salvageResultReport';
import { tInventory } from '../../components/screens/InventoryScreen/logic/inventoryI18n';

const ROOT = new URL('../../', import.meta.url).pathname;
const readJson = (rel) => JSON.parse(readFileSync(ROOT + rel, 'utf8'));

const state = () => useCharacterStore.getState();
const scrapperRank = (n) => useCharacterStore.setState({
  selectedPerks: Array.from({ length: n }, () => ({ perkId: 'scrapper' })),
});
const stackOf = (itemId, quantity = 1) => {
  const instanceId = state().addNewItem({ itemId, quantity });
  return state().items[instanceId];
};

beforeEach(() => { state().resetCharacterStore(); });
afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('данные: материалы — содержимое хлама, а не второй хлам', () => {
  it('ни один материал не лежит в файле хлама и не имеет печатного состава', () => {
    const materials = readJson('modules/fallout/data/junk/material.json');
    const mids = new Set(materials.map((m) => m.id));
    const junkRows = readJson('modules/fallout/data/junk/junk.json');
    const junk = new Set(junkRows.map((j) => j.id));
    expect([...mids].filter((id) => junk.has(id))).toEqual([]);
    // Разбор живёт В КАРТОЧКЕ (269). Материалы карточек-материалов не касаются:
    // ни одна строка junk с составом не является материалом.
    expect(junkRows.filter((j) => j.composition && mids.has(j.id))).toEqual([]);
  });

  it('все материалы имеют редкость 0..2 (п.3 аксиом, реформа: равенство — не бесправие)', () => {
    const materials = readJson('modules/fallout/data/junk/material.json');
    for (const m of materials) {
      expect(m.rarity, m.id).toBeGreaterThanOrEqual(0);
      expect(m.rarity, m.id).toBeLessThanOrEqual(2);
      expect(['common', 'uncommon', 'rare'], `${m.id}: materialType`).toContain(m.materialType);
      expect(m.materialType, `${m.id}: materialType ↔ rarity`).toBe(
        ['common', 'uncommon', 'rare'][m.rarity],
      );
      expect(m.itemType, 'itemType у материалов удалён (269)').toBeUndefined();
      expect(m.namedMaterial, 'namedMaterial удалён (269)').toBeUndefined();
    }
    // Пачки — такие же строки справочника (единственное различие — id в CRAFT_RULES).
    const ids = new Set(materials.map((m) => m.id));
    const packs = ['item_common_materials', 'item_uncommon_materials', 'item_rare_materials'];
    for (const id of packs) expect(ids.has(id), id).toBe(true);
  });
});

describe('состав лупы (проверка владельца 2026-09-17): стекло×2 + медь×1 + кристалл×2', () => {
  it('Состав лупы виден прямо из карточки хлама — один вариант, ровно эти строки', () => {
    const row = readJson('modules/fallout/data/junk/junk.json').find((j) => j.id === 'magnifying_glass');
    expect(row.composition.length).toBe(1);
    expect(row.composition[0].map((r) => [r.material, r.count])).toEqual([
      ['glass', 2], ['copper', 1], ['crystal', 2],
    ]);
  });

  it('редкости материалов: медь и стекло — uncommon (1), кристалл — rare (2)', () => {
    const byId = new Map(readJson('modules/fallout/data/junk/material.json').map((m) => [m.id, m]));
    expect(byId.get('copper').rarity).toBe(1);
    expect(byId.get('glass').rarity).toBe(1);
    expect(byId.get('crystal').rarity).toBe(2);
  });

  it('игра: без «Мусорщика» лупа не разбирается (+3 скрыто), ранг 1 даёт стекло и медь, ранг 2 — и кристаллы', () => {
    scrapperRank(0);
    let id = stackOf('magnifying_glass').id;
    expect(salvagePreview(id)).toMatchObject({ salvageable: false, reason: 'no-materials' });
    let button = salvageButtonForItem(state().items[id], state());
    expect(button).toMatchObject({ enabled: false, hidden: 3, hasComposition: true });

    scrapperRank(1);
    id = stackOf('magnifying_glass').id;
    expect(salvageSublineForItem(state().items[id], state()).parts
      .map((p) => `${p.itemId}×${p.count}`).sort()).toEqual(['copper×1', 'glass×2']);
    expect(salvageButtonForItem(state().items[id], state())).toMatchObject({
      enabled: true, hidden: 1,
    });

    scrapperRank(2);
    id = stackOf('magnifying_glass').id;
    expect(salvageSublineForItem(state().items[id], state()).parts
      .map((p) => `${p.itemId}×${p.count}`).sort()).toEqual(['copper×1', 'crystal×2', 'glass×2']);
    expect(salvageButtonForItem(state().items[id], state()).hidden).toBe(0);
  });
});

describe('п.5: материалы не разбираются — гард до типа и состава', () => {
  it('steel и crystal в сумке: превью отказывает с причиной material, кнопки нет', () => {
    for (const id of ['steel', 'crystal', 'glass', 'copper']) {
      const stack = stackOf(id);
      expect(salvagePreview(stack.id), id).toMatchObject({ salvageable: false, reason: 'material' });
      expect(salvageSublineForItem(stack, state()), id).toBeNull();
      expect(salvageButtonForItem(stack, state()), id).toBeNull();
    }
  });

  it('прямой вызов salvageItem на материале: отказ без изменений в сумке', () => {
    const stack = stackOf('glass', 3);
    const result = salvageItem(stack.id);
    expect(result).toMatchObject({ done: false, stage: 'gate', reason: 'material' });
    expect(state().items[stack.id].quantity ?? 1).toBe(3);
  });

  it('отчёт для материала — человеческая строка, не техническая причина', () => {
    const report = buildSalvageReport({ done: false, stage: 'gate', reason: 'material', time: null });
    expect(report.message).toBe(tInventory('screen.salvage.material'));
    expect(report.message).not.toContain('material');
  });

  it('обратная совместимость: хлам и радио с составом гард не задевает', () => {
    const battery = stackOf('battery');
    expect(salvageButtonForItem(state().items[battery.id], state())).not.toBeNull();
    const radio = stackOf('item_radio');
    const preview = salvagePreview(radio.id);
    expect(preview.reason, 'радио — не материал').not.toBe('material');
    expect(preview.salvageable || preview.reason === 'no-materials').toBe(true);
  });
});
