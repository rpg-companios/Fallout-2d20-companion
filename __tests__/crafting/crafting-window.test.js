// Окно крафта (патч 265): модель верстаков, пакет, отчёт владельца — чистые
// функции без React; плюс гварды обвязки экрана и словарей локализации.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { findCatalogEntry } from '../../domain/resolveItem';
import { getCraftingRecipes } from '../../domain/registry';
import useCharacterStore from '../../src/store/characterStore';
import { getCurrentModuleLocale, setCurrentModuleLocale } from '../../i18n/locale';
import { getCraftingCategories } from '../../domain/registry';
import {
  buildCraftModel,
  craftBatch,
  buildCraftReport,
  formatCraftMinutes,
} from '../../modules/fallout/crafting/windowModel';
import ruDict from '../../modules/fallout/i18n/ru-RU/screens/inventory/craftingModal.json';
import enDict from '../../modules/fallout/i18n/en-EN/screens/inventory/craftingModal.json';

const state = () => useCharacterStore.getState();

// Сид стека — тот же канон, что в crafting-operations: items-карта, weaponId.
const seedStack = (itemId, quantity) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`seed_${itemId}_${Math.random().toString(36).slice(2, 7)}`]: {
      weaponId: itemId, quantity,
    } },
  }));
};
const countStack = (itemId) => Object.values(state().items)
  .filter((item) => item.weaponId === itemId)
  .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
const setSkill = (skillId, total) => {
  useCharacterStore.setState((prev) => ({
    skills: { ...prev.skills, [skillId]: { ...(prev.skills?.[skillId] ?? {}), base: total, total } },
  }));
};
const seedFor = (recipe, mult) => {
  for (const m of recipe.materials) seedStack(m.itemId, m.count * mult);
};

const allRows = () => buildCraftModel().flatMap((g) => g.rows);
const flattenKeys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    (v && typeof v === 'object' && !Array.isArray(v) ? flattenKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

const prevLocale = getCurrentModuleLocale();
beforeEach(() => {
  setCurrentModuleLocale('ru-RU'); // строки отчёта проверяем на русской локали
  state().resetCharacterStore();
});
afterEach(async () => {
  setCurrentModuleLocale(prevLocale);
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('каталожные имена материалов-редкостей (переименование владельца)', () => {
  it('ru: «обычный/необычный/редкий материал» — единственное число, без «пачек»', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    for (const [id, name] of [
      ['item_common_materials', 'Обычный материал'],
      ['item_uncommon_materials', 'Необычный материал'],
      ['item_rare_materials', 'Редкий материал'],
    ]) {
      const entry = findCatalogEntry(catalog, id, 'misc');
      expect(entry, id).toBeTruthy();
      expect(entry.name, id).toBe(name);
    }
  });

  it('en: Common/Uncommon/Rare material', () => {
    const catalog = getEquipmentCatalog('en-EN');
    for (const [id, name] of [
      ['item_common_materials', 'Common material'],
      ['item_uncommon_materials', 'Uncommon material'],
      ['item_rare_materials', 'Rare material'],
    ]) {
      expect(findCatalogEntry(catalog, id, 'misc')?.name, id).toBe(name);
    }
  });
});

describe('вкладки категорий (269: верстаков в данных нет)', () => {
  it('каждый рецепт реестра живёт на заявленной вкладке, все вкладки непустые', () => {
    const categories = getCraftingCategories();
    expect(categories).toEqual(['ammo', 'chems', 'drinks', 'food', 'weapons']);
    const recipes = getCraftingRecipes();
    for (const recipe of recipes) {
      expect(categories, `категория ${recipe.category}`).toContain(recipe.category);
    }
    const groups = buildCraftModel();
    expect(groups.map((g) => g.category)).toEqual(categories);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(recipes.length);
  });

  it('подписи вкладок — i18n-категории, а не тексты из данных', () => {
    const dict = getCurrentModuleLocale() === 'en-EN' ? enDict : ruDict;
    expect(dict.categoryNames).toBeTruthy();
    for (const g of buildCraftModel()) {
      expect(g.label, `вкладка ${g.category}`).toBe(dict.categoryNames[g.category]);
      expect(ruDict.benchNames, 'benchNames больше нет ни в одном словаре').toBeUndefined();
      expect(enDict.benchNames).toBeUndefined();
    }
  });
});

describe('buildCraftModel: статусы строк', () => {
  it('без перка — «нужен перк»; без материалов — «не хватает»; о заменах окно молчит', () => {
    const rows = allRows();
    const withPerk = rows.filter((r) => r.status === 'missing-perk');
    expect(withPerk.length).toBeGreaterThan(0);
    for (const row of withPerk) {
      expect(row.reason).toContain(ruDict.ui.needPerk.split('{')[0].trim());
      expect(row.canCraft).toBe(false);
    }
    const jet = rows.find((r) => r.outputId === 'chem_jet');
    expect(jet, 'рецепт реактика должен быть в модели').toBeTruthy();
    expect(jet.status).toBe('missing-material');
    expect(jet.reason).toBe(ruDict.ui.shortMaterials);
    // «рецепт знает только требуемые материалы»: в строке нет поля про замены
    expect(JSON.stringify(jet)).not.toContain('substitut');
    expect(JSON.stringify(jet)).not.toContain('замена');
    // антибиотики требуют «Химика» — без перка статус именно про перк
    const ab = rows.find((r) => r.recipeId === 'chem_antibiotics');
    expect(ab.status).toBe('missing-perk');
    seedFor(ab && getCraftingRecipes().find((r) => r.id === 'chem_antibiotics'), 1);
    expect(allRows().find((r) => r.recipeId === 'chem_antibiotics').status).toBe('missing-perk');
  });

  it('готовый рецепт: можно крафтить, максимум пакета — по дефицитному материалу', () => {
    const jetRecipe = getCraftingRecipes().find((r) => r.id === 'chem_jet');
    seedFor(jetRecipe, 3);
    setSkill('SCIENCE', 10); // сложность снята — автоуспех
    const row = allRows().find((r) => r.outputId === 'chem_jet');
    expect(row.status).toBe('ready');
    expect(row.canCraft).toBe(true);
    expect(row.reason).toBe(null);
    expect(row.maxCraft).toBe(3);
    for (const m of row.materials) expect(m.have).toBeGreaterThanOrEqual(m.need);
    expect(row.metaLine).toContain('Сложность 2');
    expect(row.metaLine).toContain('1 ч'); // сложность 2 → час по таблице 262
  });

  it('формат времени: минуты/часы/сутки', () => {
    expect(formatCraftMinutes(10)).toBe('10 мин');
    expect(formatCraftMinutes(60)).toBe('1 ч');
    expect(formatCraftMinutes(2 * 60)).toBe('2 ч');
    expect(formatCraftMinutes(1440)).toBe('1 сут');
    expect(formatCraftMinutes(3 * 1440)).toBe('3 сут');
  });
});

describe('craftBatch: пакет и остановка на исходе', () => {
  const paxRecipe = () => getCraftingRecipes().find((r) => r.id === 'ammo_syringe_pax');

  it('пакет из трёх проходит тремя попытками и всё тратит', () => {
    const recipe = paxRecipe();
    seedFor(recipe, 3);
    setSkill(recipe.requires.skill, 10);
    const run = craftBatch(recipe.id, 3);
    expect(run.attempts.length).toBe(3);
    expect(run.attempts.every((a) => a.done)).toBe(true);
    expect(run.stoppedEarly).toBe(0);
    expect(countStack('ammo_syringe_pax')).toBe(3);
    expect(countStack('item_common_materials')).toBe(0);
  });

  it('материалов на две попытки: остальные не начинаются, это видно в отчёте', () => {
    const recipe = paxRecipe();
    seedFor(recipe, 2);
    setSkill(recipe.requires.skill, 10);
    const run = craftBatch(recipe.id, 5);
    expect(run.attempts.length).toBe(2);
    expect(run.stoppedEarly).toBe(3);
    const report = buildCraftReport(recipe.id, run);
    expect(report.lines.at(-1)).toContain('Остановлено');
    expect(report.lines.at(-1)).toContain('3');
  });
});

describe('buildCraftReport: формат владельца', () => {
  const attempt = (over = {}) => ({
    stage: 'done',
    done: true,
    auto: false,
    check: { rolls: [3, 12], successes: 2, passed: true, targetNumber: 5, complicationCount: 0 },
    granted: { itemId: 'steel', quantity: 1 },
    spent: [{ itemId: 'item_common_materials', count: 2 }],
    burned: [],
    time: { minutes: 60, durationMultiplier: 1 },
    ...over,
  });

  it('одна попытка — ровно три строки: арифметика, кубики, итог', () => {
    const recipeId = getCraftingRecipes()[0].id;
    const report = buildCraftReport(recipeId, { attempts: [attempt()], stoppedEarly: 0 });
    expect(report.lines.length).toBe(3);
    expect(report.lines[0]).toMatch(/^Интеллект \+ .+ = 5$/);
    expect(report.lines[1]).toBe('Выпало 3, 12. Успехов 2');
    expect(report.lines[2]).toContain('Получено: Сталь ×1');
    expect(report.lines[2]).toContain('Потрачено: Обычный материал ×2');
    expect(report.lines[2]).toContain('Время: 1 ч');
  });

  it('провал: неудача и честная пометка — сгорело или цело', () => {
    const recipeId = getCraftingRecipes()[0].id;
    const failed = {
      stage: 'check', done: false, auto: false,
      check: { rolls: [19, 20], successes: 0, passed: false, targetNumber: 5, complicationCount: 0 },
      granted: null, spent: [], burned: [],
    };
    const intact = buildCraftReport(recipeId, { attempts: [attempt(failed)], stoppedEarly: 0 });
    expect(intact.lines[1]).toBe(`Выпало 19, 20. Неудача. ${ruDict.ui.intactNote}`);
    expect(intact.lines[2]).toContain(ruDict.ui.nothing);
    const burn = buildCraftReport(recipeId, {
      attempts: [attempt({
        ...failed,
        spent: [{ itemId: 'item_common_materials', count: 2 }],
        burned: [{ itemId: 'item_common_materials', count: 2 }],
      })],
      stoppedEarly: 0,
    });
    expect(burn.lines[1]).toContain(ruDict.ui.burnNote);
    expect(burn.lines[2]).toContain('Потрачено: Обычный материал ×2');
  });

  it('автоуспех без броска; осложнение помечено и удваивает время в итоге', () => {
    const recipeId = getCraftingRecipes()[0].id;
    const auto = buildCraftReport(recipeId, {
      attempts: [attempt({ auto: true, check: null })], stoppedEarly: 0,
    });
    expect(auto.lines[1]).toBe(ruDict.ui.autoNote);
    const comp = buildCraftReport(recipeId, {
      attempts: [attempt({
        check: { rolls: [1, 20], successes: 1, passed: true, targetNumber: 5, complicationCount: 1 },
        time: { minutes: 60, durationMultiplier: 2 },
      })],
      stoppedEarly: 0,
    });
    expect(comp.lines[1]).toContain(ruDict.ui.complicationNote);
    expect(comp.lines[2]).toContain('Время: 2 ч');
  });

  it('пакет: арифметика общая, у каждой попытки своя строка, итог свёрнут', () => {
    const recipeId = getCraftingRecipes()[0].id;
    const failed = {
      stage: 'check', done: false, auto: false,
      check: { rolls: [19, 20], successes: 0, passed: false, targetNumber: 5, complicationCount: 0 },
      granted: null, spent: [], burned: [],
    };
    const report = buildCraftReport(recipeId, {
      attempts: [attempt(), attempt(failed), attempt()],
      stoppedEarly: 0,
    });
    expect(report.lines[1]).toMatch(/^#1: Выпало 3, 12/);
    expect(report.lines[2]).toMatch(/^#2: Выпало 19, 20/);
    expect(report.lines[3]).toMatch(/^#3: Выпало 3, 12/);
    expect(report.lines[4]).toContain('Получено: Сталь ×2');
    expect(report.lines[4]).toContain('Потрачено: Обычный материал ×4');
  });
});

describe('обвязка экрана и словари', () => {
  const screenSrc = readFileSync('components/screens/InventoryScreen/InventoryScreen.js', 'utf8');
  const modalSrc = readFileSync(
    'modules/fallout/screens/InventoryScreen/modals/CraftingModal.js', 'utf8');

  it('до перестройки (266) кнопка неактивна: модалка не открывается, обвязка на месте', () => {
    expect(screenSrc).not.toContain('setCraftModalVisible(true)');
    expect(screenSrc).toContain('tInventory(\'screen.craft.placeholder\')');
    // модалка и модель не удалены — 267 подключит окно к категориям предмета
    expect(screenSrc).toContain('modals/CraftingModal');
    expect(screenSrc).toContain('<CraftingModal');
  });

  it('модалка тонкая: только модель и прогон, без своей механики', () => {
    expect(modalSrc).toContain('craftBatch(');
    expect(modalSrc).toContain('buildCraftReport(');
    expect(modalSrc).toContain('buildCraftModel()');
  });

  it('ru/en словари модалки идентичны по ключам', () => {
    expect(flattenKeys(ruDict).sort()).toEqual(flattenKeys(enDict).sort());
  });
});
