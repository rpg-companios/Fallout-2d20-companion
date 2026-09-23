// ПРИЁМОЧНЫЙ (патч 318): редизайн окна крафта — квадраты категорий (все 8,
// даже без рецептов), списки-спойлеры, сводка материалов по редкости
// (обычные/необычные/редкие — только требуемые типы), максимальная партия.
// Механика (гейты перков, подсчёт сумки) — движок 251, не менялся.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import {
  CRAFT_CATEGORIES,
  buildCraftTiles,
  buildCategoryModel,
  craftDict,
} from '../../modules/fallout/crafting/windowModel';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const seedStack = (itemId, quantity, extra = {}) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`seed_${itemId}_${Math.random().toString(36).slice(2, 7)}`]: {
      weaponId: itemId, quantity, ...extra,
    } },
  }));
};

describe('Модалка крафта (318): квадраты, спойлеры, редкость материалов', () => {
  it('восемь квадратов в порядке владельца, включая пустые данными', () => {
    expect(CRAFT_CATEGORIES).toEqual([
      'food', 'drinks', 'chems', 'explosives', 'weapons', 'armor', 'powerArmor', 'ammo',
    ]);
    const tiles = buildCraftTiles();
    expect(tiles.map((t) => t.category)).toEqual(CRAFT_CATEGORIES);
    const byId = new Map(tiles.map((t) => [t.category, t]));
    expect(byId.get('ammo').recipes).toBe(28);
    expect(byId.get('food').recipes).toBe(27);
    expect(byId.get('explosives').recipes).toBe(9); // 325: вся взрывчатка переехала из «оружия»
    expect(buildCategoryModel('explosives').length).toBe(9);
    // пустых данных квадраты видны, но рецептов внутри нет
    for (const empty of ['weapons', 'armor', 'powerArmor']) {
      expect(byId.get(empty).recipes).toBe(0); // «оружие» опустело после переезда взрывчатки (325)
      expect(buildCategoryModel(empty)).toEqual([]);
    }
  });

  it('ammo_38: сводка редкости, максимальная партия, гейт перка', () => {
    seedStack('item_common_materials', 10);
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'ammosmith', index: 0 }] });
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 5, total: 5 } },
    }));

    const row = buildCategoryModel('ammo').find((r) => r.recipeId === 'ammo_38');
    expect(row).toBeTruthy();
    expect(row.canCraft).toBe(true);
    expect(row.maxCraft).toBe(5); // 10 обычных материалов по 2 на попытку
    expect(row.materials[0].rarity).toBe('common');
    expect(row.materialGroups).toEqual([{ type: 'common' }]); // 326: без счётчиков видов

    // без перка — спойлер серый: причина «нужен перк» с рангом
    useCharacterStore.setState({ selectedPerks: [] });
    const blocked = buildCategoryModel('ammo').find((r) => r.recipeId === 'ammo_38');
    expect(blocked.canCraft).toBe(false);
    expect(blocked.status).toBe('missing-perk');
    expect(String(blocked.reason)).toContain('1');
  });

  it('ингредиент вне материалов (мясо) — без редкости и без сводки', () => {
    const row = buildCategoryModel('food').find((r) => r.recipeId === 'food_grilled_bloatfly');
    expect(row).toBeTruthy();
    expect(row.materials.length).toBeGreaterThan(0);
    expect(row.materials[0].rarity).toBeNull();
    expect(row.materialGroups).toEqual([]);
  });

  it('словарь редкости и окна количества на месте (ru-файл; ключи — в активной локали)', () => {
    const ui = craftDict().ui;
    // активная локаль в тестах может быть любой — проверяем структуру словаря
    for (const key of ['create', 'close', 'emptyCategory', 'qtyPrompt', 'cancel',
      'rarityCommon', 'rarityUncommon', 'rarityRare', 'components']) {
      expect(typeof ui[key]).toBe('string');
      expect(ui[key].length).toBeGreaterThan(0);
    }
    expect(ui.qtyPrompt).toContain('{max}');
    expect(ui.qtyPrompt).toContain('{name}');
    // русские формулировки — слово владельца (318)
    const ru = require('../../modules/fallout/i18n/ru-RU/screens/inventory/craftingModal.json');
    expect(ru.ui.create).toBe('Создать');
    expect(ru.ui.close).toBe('Закрыть');
    expect(ru.ui.rarityCommon).toBe('Обычные материалы');
    expect(ru.ui.rarityUncommon).toBe('Необычные материалы');
    expect(ru.ui.rarityRare).toBe('Редкие материалы');
    expect(ru.ui.qtyPrompt).toBe('Вы можете создать {max} «{name}», сколько штук вы хотите создать?');
    expect(ru.categoryNames.powerArmor).toBe('Силовая броня');
    expect(ru.categoryNames.explosives).toBe('Взрывчатка');
    expect(ru.categoryNames.ammo).toBe('Патроны');
  });
});
