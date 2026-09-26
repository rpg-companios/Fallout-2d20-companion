// ПРИЁМОЧНЫЙ (патч 352): кнопка «Создать» на позиции мода в модалке оружия
// (первая очередь плана §2.10 — для тестирования интерфейса владельцем).
//   • helper buildModCraftHint: зелёная (enabled) когда материалов хватает,
//     притенённая (dimmed) когда нет — правило владельца;
//   • требования в одну строку: Перк N · материалы по редкостям · Сложность M;
//   • кнопка и строка скрыты, если мод уже в инвентаре (hint.inInventory);
//   • у мода без рецепта помощник вернёт null (кнопки не будет);
//   • проводка модалки: настройка «Установка модификаций», кнопка в строке,
//     крафт при нажатии (craftRecipe + settleCraftTime).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import useCharacterStore from '../../src/store/characterStore';
import { buildModCraftHint } from '../../modules/fallout/crafting/windowModel';
import { craftRecipe, settleCraftTime } from '../../modules/fallout/crafting/operations';

const state = () => useCharacterStore.getState();
const seed = (weaponId, quantity = 1) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`s_${Math.random().toString(36).slice(2, 8)}`]: { weaponId, quantity } },
  }));
};

describe('ПРИЁМОЧНЫЙ (патч 352): кнопка «Создать» в модалке оружия', () => {
  it('материалов хватает → enabled (зелёная); не хватает → dimmed', () => {
    useCharacterStore.setState({ items: {}, selectedPerks: [{ perkId: 'gunNut', index: 0 }] });
    // «Скорострельный»: Обычные ×4 + Необычные ×2
    const ok = buildModCraftHint('mod_rapid', { items: state().items, selectedPerks: state().selectedPerks });
    expect(ok.enabled).toBe(false); // пустая сумка

    seed('item_common_materials', 4);
    seed('item_uncommon_materials', 2);
    const green = buildModCraftHint('mod_rapid', { items: state().items, selectedPerks: state().selectedPerks });
    expect(green.enabled).toBe(true);

    seed('item_common_materials', 1); // обычных 5, но необычных 2 — всё ещё хватает
    expect(buildModCraftHint('mod_rapid', { items: state().items, selectedPerks: state().selectedPerks }).enabled).toBe(true);
  });

  it('требования блоком: «Требования» (перк · сложность) + материалы «есть/нужно»', () => {
    useCharacterStore.setState({ items: {} });
    const hint = buildModCraftHint('mod_rapid', { items: {}, selectedPerks: [] });
    // строка требований: перк и сложность
    expect(hint.requirements).toBe('Gun Nut 1 · Complexity 3');
    // строка материалов: «есть/нужно» мелким слева от кнопки (макет 353)
    expect(hint.materialsLine).toBe('Common material 0/4, Uncommon material 0/2');

    useCharacterStore.setState((prev) => ({
      items: { ...prev.items, k1: { weaponId: 'item_common_materials', quantity: 2 } },
    }));
    const partial = buildModCraftHint('mod_rapid', { items: useCharacterStore.getState().items, selectedPerks: [] });
    expect(partial.materialsLine).toBe('Common material 2/4, Uncommon material 0/2');
    expect(partial.enabled).toBe(false);
  });

  it('мод уже в инвентаре → hint.inInventory (кнопка и требования скрыты)', () => {
    useCharacterStore.setState({ items: {} });
    seed('mod_rapid', 1);
    const hint = buildModCraftHint('mod_rapid', { items: state().items, selectedPerks: [] });
    expect(hint.inInventory).toBe(true);
  });

  it('установленный (installedOn) мод не считается ни материалом, ни инвентарём', () => {
    useCharacterStore.setState({ items: {} });
    useCharacterStore.setState((prev) => ({
      items: { ...prev.items, k1: { weaponId: 'item_common_materials', quantity: 4, installedOn: 'weapon_x' } },
    }));
    const hint = buildModCraftHint('mod_rapid', { items: state().items, selectedPerks: [] });
    expect(hint.enabled).toBe(false); // надетые/установленные материалыми не являются
  });

  it('мод без колонок (без рецепта) — null: кнопки нет', () => {
    const hint = buildModCraftHint('mod_999', { items: {}, selectedPerks: [] });
    expect(hint).toBeNull();
  });

  it('крафт по кнопке: успех кладёт мод в сумку; отказ на перке — stage gate', () => {
    useCharacterStore.setState({ items: {}, selectedPerks: [] });
    const blocked = craftRecipe('mod_rapid', {}, { deferTime: true });
    expect(blocked.done).toBe(false);
    expect(blocked.stage).toBe('gate');
    expect(blocked.reasons.some((r) => r.code === 'missing-perk')).toBe(true);

    seed('item_common_materials', 4);
    seed('item_uncommon_materials', 2);
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'gunNut', index: 0 }] });
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 6, total: 6 } },
    }));
    const run = craftRecipe('mod_rapid', { rollD20: () => 3 }, { deferTime: true });
    expect(run.done).toBe(true);
    const settled = settleCraftTime('mod_rapid', run, { spendActionPoints: false });
    expect(settled.minutes).toBeGreaterThan(0);
    const inBag = Object.values(state().items).some((i) => i.weaponId === 'mod_rapid');
    expect(inBag).toBe(true);
  });

  it('проводка модалки: настройка, подписки, кнопка, скрытие, крафт', () => {
    const src = readFileSync(
      'modules/fallout/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal.js',
      'utf8',
    );
    expect(src).toContain("getSettingValue('modsRequireInventoryItem')");
    expect(src).toContain('buildModCraftHint');
    expect(src).toContain('craftRecipe');
    expect(src).toContain('settleCraftTime');
    expect(src).toContain('styles.createButton');
    expect(src).toContain('!hint.inInventory'); // скрытие, если мод в инвентаре
    expect(src).toContain('!hint.enabled'); // dimmed по материалам
    // список не фильтруется (352): у строк кнопки, а не удаление модов
    expect(src).not.toContain('weapon.mod.gate.filtered');
  });
});
