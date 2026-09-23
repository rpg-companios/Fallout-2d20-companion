// __tests__/crafting/crafting-data.test.js
//
// Предохранитель ДАННЫХ крафта (патчи 249–250).
//
// Что охраняет:
//   1. файлы рецептов существуют и описаны в индексе категории;
//   2. все ссылки рецептов — только id нашего каталога (предмет, ингредиент,
//      перк) и ключ навыка; ни одной ссылки по имени;
//   3. лежащие в репо файлы совпадают с тем, что умеет генератор
//      (правил «имя → id» менять, не перегенерировав данные, нельзя);
//   4. кривая «сложность → материалы» из книги не расходится с колонками
//      материалов, уже проставленными на модах оружия в данных сеттинга;
//   5. файл-обменник незакрытых позиций (Missing_craft.json) тоже совпадает с
//      генератором, у каждой позиции есть объяснение блокировки, а ссылки — либо
//      id каталога, либо «unknown»: обменник не смеет выдумывать предметы.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  buildCraftingData,
  MATERIALS_BY_COMPLEXITY,
  FILE_BY_BUCKET,
  OUT_DIR,
  MISSING_FILE,
  MISSING_CATEGORY_ORDER,
} from '../../scripts/build-crafting-data.mjs';

import { ALL_SKILL_KEYS } from '../../domain/characterCreation';

import weaponsData from '../../modules/fallout/data/equipment/weapons.json';
import ammoData from '../../modules/fallout/data/equipment/ammo.json';
import chemsData from '../../modules/fallout/data/consumables/chems.json';
import drinksData from '../../modules/fallout/data/consumables/drinks.json';
import foodData from '../../modules/fallout/data/consumables/food.json';
import magazinesData from '../../modules/fallout/data/consumables/magazines.json';
import goodsData from '../../modules/fallout/data/equipment/general_goods.json';
import odditiesData from '../../modules/fallout/data/equipment/oddities.json';
import armorData from '../../modules/fallout/data/equipment/armor.json';
import clothesData from '../../modules/fallout/data/equipment/clothes.json';
import powerArmorData from '../../modules/fallout/data/equipment/powerArmor.json';
import weaponModsData from '../../modules/fallout/data/equipment/weapon_mods.json';
import perksData from '../../modules/fallout/data/perks/perks.json';
import junkData from '../../modules/fallout/data/junk/junk.json';
import materialsData from '../../modules/fallout/data/junk/material.json';
import foragingTable from '../../modules/fallout/data/loot/foraging.json';

import armorModsData from '../../modules/fallout/data/equipment/armor_mods.json';
import uniqArmorModsData from '../../modules/fallout/data/equipment/uniq_armor_mods.json';

import craftingIndex from '../../modules/fallout/data/recipes/index.json';

const ROOT = new URL('../../', import.meta.url).pathname;

// ── Каталог: id → itemType (то, на что обязаны ссылаться рецепты) ─────────────
const collectIds = (node, itemType, into) => {
  if (Array.isArray(node)) {
    for (const child of node) collectIds(child, itemType, into);
    return into;
  }
  if (node && typeof node === 'object') {
    if (typeof node.id === 'string' && !into.has(node.id)) into.set(node.id, itemType);
    for (const value of Object.values(node)) collectIds(value, itemType, into);
  }
  return into;
};

const catalogIds = new Map();
collectIds(weaponsData, 'weapon', catalogIds);
collectIds(ammoData, 'ammo', catalogIds);
collectIds(chemsData, 'chem', catalogIds);
collectIds(drinksData, 'drinks', catalogIds);
collectIds(foodData, 'food', catalogIds);
collectIds(magazinesData, 'magazine', catalogIds);
collectIds(goodsData, 'misc', catalogIds);
collectIds(odditiesData, 'misc', catalogIds);
collectIds(armorData, 'armor', catalogIds);
collectIds(clothesData, 'clothing', catalogIds);
collectIds(powerArmorData, 'powerArmor', catalogIds);
collectIds(junkData, 'junk', catalogIds);
collectIds(materialsData, 'misc', catalogIds);
collectIds(armorModsData, 'armorMod', catalogIds);
collectIds(uniqArmorModsData, 'armorMod', catalogIds);

const perkIds = new Set(perksData.map((p) => p.id));

const readRepo = (rel) => readFileSync(ROOT + rel, 'utf8');

const loadRecipeFile = (file) => JSON.parse(readRepo(`${OUT_DIR}/${file}`));

const allRecipes = () => {
  const list = [];
  for (const entry of craftingIndex.recipes) {
    for (const record of loadRecipeFile(entry.file)) list.push({ category: entry.category, record });
  }
  return list;
};

// Реформа 269: результат рецепта — это его id; варианты (несколько рецептов на
// один предмет) различаются суффиксом. Каталог сверяется по базе id.
const resolveOutput = (id) => {
  if (catalogIds.has(id)) return id;
  const parts = id.split('_');
  for (let n = parts.length - 1; n >= 2; n -= 1) {
    const base = parts.slice(0, n).join('_');
    if (catalogIds.has(base)) return base;
  }
  return null;
};

/** Рекурсивно: какие строковые значения вообще есть в данных рецептов. */
const stringValues = (node, out = []) => {
  if (Array.isArray(node)) { for (const v of node) stringValues(v, out); return out; }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') out.push({ key, value });
      else stringValues(value, out);
    }
    return out;
  }
  return out;
};

describe('данные крафта: файлы категории', () => {
  it('индекс объявляет только существующие файлы и честное число рецептов', () => {
    expect(craftingIndex.id).toBe('crafting');
    for (const entry of craftingIndex.recipes) {
      expect(FILE_BY_BUCKET[entry.category], `категория-файл для ${entry.category}`).toBe(entry.file);
      const records = loadRecipeFile(entry.file);
      expect(records.length, `записей в ${entry.file}`).toBe(entry.count);
    }
    // Порядок и состав манифеста — он же порядок вкладок окна (269).
    expect(craftingIndex.recipes).toEqual([
      { file: 'ammo.json', category: 'ammo', count: 28 },
      { file: 'armor.json', category: 'armor', count: 44 },
      { file: 'chems.json', category: 'chems', count: 21 },
      { file: 'drinks.json', category: 'drinks', count: 8 },
      { file: 'explosives.json', category: 'explosives', count: 9 },
      { file: 'food.json', category: 'food', count: 27 },
    ]);
  });

  it('файлов больше, чем объявлено в индексе, нет', () => {
    const declared = new Set(['index.json', ...craftingIndex.recipes.map((r) => r.file)]);
    for (const bucket of Object.keys(FILE_BY_BUCKET)) {
      const file = FILE_BY_BUCKET[bucket];
      let exists = true;
      try { readRepo(`${OUT_DIR}/${file}`); } catch { exists = false; }
      if (exists) expect(declared.has(file), `необъявленный файл ${file}`).toBe(true);
    }
  });

  it('генератор и лежащие в репо файлы не расходятся', () => {
    const generated = buildCraftingData();
    const drift = [];
    for (const file of generated.files) {
      if (readRepo(`${OUT_DIR}/${file.file}`) !== file.content) drift.push(file.file);
    }
    if (readRepo('docs/reference-data/CRAFTING-MAPPING.md') !== generated.report) drift.push('отчёт');
    if (readRepo(MISSING_FILE) !== generated.missingContent) drift.push('файл-обменник');
    expect(drift, `расхождение с генератором: ${drift.join(', ')} — перегенерируйте`).toEqual([]);
  });
});

describe('данные крафта: ссылки', () => {
  it('рецептов достаточно, чтобы срез считался живым', () => {
    expect(allRecipes().length).toBeGreaterThanOrEqual(60);
  });

  it('результат (он же id) и каждый ингредиент — id из каталога сеттинга', () => {
    for (const { category, record } of allRecipes()) {
      const base = resolveOutput(record.id);
      expect(base, `${record.id}: результат не найден в каталоге`).toBeTruthy();
      for (const material of record.materials) {
        expect(catalogIds.has(material.itemId), `${record.id}: ингредиент ${material.itemId}`).toBe(true);
      }
    }
  });

  it('количество результата и флаг сгорания — честная форма (269)', () => {
    for (const { record } of allRecipes()) {
      const q = record.outputQuantity;
      expect(
        (Number.isInteger(q) && q >= 1) || (q && typeof q === 'object'),
        `${record.id}: outputQuantity = int >= 1 или {base,cd}`,
      ).toBe(true);
      // 270: сгорание — правило реестра (навык), в 74 записях не дублируется.
      expect(record.failBurnsMaterials, `${record.id}: поля сгорания в данных нет`).toBeUndefined();
      // Верстака и «output» в данных больше нет (реформа 269).
      expect(record.bench, `${record.id}: bench удалён из данных`).toBeUndefined();
      expect(record.output, `${record.id}: output удалён из данных`).toBeUndefined();
      expect(record.sourcePage, `${record.id}: sourcePage удалён из данных`).toBeUndefined();
      expect(record.derivedMaterials, `${record.id}: derivedMaterials — только в обменнике`).toBeUndefined();
    }
  });

  it('перк-требование — id перка из каталога, ранг не меньше 1', () => {
    for (const { record } of allRecipes()) {
      for (const perk of record.requires.perks ?? []) {
        expect(perkIds.has(perk.perkId), `${record.id}: перк ${perk.perkId}`).toBe(true);
        expect(Number.isInteger(perk.rank) && perk.rank >= 1, `${record.id}: ранг перка`).toBe(true);
      }
    }
  });

  it('навык — канонический ключ, категория — из манифеста', () => {
    for (const { category, record } of allRecipes()) {
      expect(ALL_SKILL_KEYS, `${record.id}: навык ${record.requires.skill}`).toContain(record.requires.skill);
      expect(['ammo', 'armor', 'explosives', 'chems', 'food', 'drinks'], `${record.id}: категория ${category}`).toContain(category);
      expect(Number.isInteger(record.requires.complexity)).toBe(true);
      expect(record.requires.complexity).toBeGreaterThanOrEqual(1);
      expect(record.requires.complexity).toBeLessThanOrEqual(7);
    }
  });

  it('ни одной ссылки по имени: каждая строка — член известного словаря', () => {
    // Данные крафта обязаны состоять только из ключей словарей: id предмета из
    // каталога, id перка, ключ навыка, тип верстака. Любая новая строка «в свободную
    // форму» (имя, описание, «Common Materials») падает здесь, а не превращается в
    // второй резолвер по имени в движке.
    const recipes = allRecipes();
    const recipeIds = new Set(recipes.map(({ record }) => record.id));
    for (const { record } of recipes) {
      for (const { key, value } of stringValues(record)) {
        if (key === 'id') { expect(recipeIds.has(value), `${record.id}: id «${value}»`).toBe(true); continue; }
        if (key === 'skill') { expect(ALL_SKILL_KEYS, `${record.id}: навык «${value}»`).toContain(value); continue; }
        if (key === 'itemId') { expect(catalogIds.has(value), `${record.id}: ссылка «${value}» не из каталога`).toBe(true); continue; }
        if (key === 'perkId') { expect(perkIds.has(value), `${record.id}: перк «${value}»`).toBe(true); continue; }
        expect(false, `${record.id}: ключ «${key}»=${value} — в данных крафта текстов быть не должно`).toBe(true);
      }
    }
  });

  it('id рецепта — это id предмета, который он даёт', () => {
    // Владелец так и сформулировал: «скрафтить ягодные ментаты» = chem_mentats_berry.
    // Уточнение к id допускается только там, где предмет умеют давать несколько
    // рецептов (у книги это боеприпасы: ранг перка меняет рецепт).
    const recipes = allRecipes();
    const ids = recipes.map(({ record }) => record.id);
    expect(new Set(ids).size, 'id рецептов уникальны во всех файлах категории').toBe(ids.length);
    const byItem = new Map();
    for (const { record } of recipes) {
      const base = resolveOutput(record.id);
      expect(
        base && (record.id === base || record.id.startsWith(`${base}_`)),
        `${record.id}: id рецепта обязан начинаться с id результата`,
      ).toBe(true);
      byItem.set(base, [...(byItem.get(base) || []), record.id]);
    }
    for (const [itemId, list] of byItem) {
      if (list.length < 2) expect(list[0], `${itemId}: один рецепт — id равен id предмета`).toBe(itemId);
      expect(new Set(list).size, `${itemId}: варианты рецептов различимы`).toBe(list.length);
    }
  });

  it('иденты рецептов — ключи, а не тексты', () => {
    for (const { record } of allRecipes()) expect(record.id).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe('данные крафта: количества', () => {
  it('боеприпас — число с боевыми кубиками, всё остальное — одна штука', () => {
    for (const { category, record } of allRecipes()) {
      const quantity = record.outputQuantity;
      if (category === 'ammo') {
        // Дротики шприцера штучные: их нет в таблице находки, объём не берётся
        // откуда попало — единицу зафиксировал владелец (патч 250).
        if (quantity === 1) continue;
        expect(typeof quantity, `${record.id}: количество боеприпаса должно быть словарём`).toBe('object');
        expect(Number.isInteger(quantity.base) && quantity.base >= 1, `${record.id}: base`).toBe(true);
        if (quantity.cd !== undefined) expect(quantity.cd).toBeGreaterThanOrEqual(1);
      } else {
        expect(quantity, `${record.id}: не-боеприпас крафтится по одной штуке`).toBe(1);
      }
    }
  });

  it('материалы — целые положительные количества, без дублей', () => {
    for (const { record } of allRecipes()) {
      const seen = new Set();
      for (const material of record.materials) {
        expect(Number.isInteger(material.count) && material.count > 0, `${record.id}: ${material.itemId}`).toBe(true);
        expect(seen.has(material.itemId), `${record.id}: ${material.itemId} повторяется`).toBe(false);
        seen.add(material.itemId);
      }
      expect(record.materials.length).toBeGreaterThan(0);
    }
  });
});

describe('правило «сложность → материалы» сверено с данными сеттинга', () => {
  const parseMaterials = (text) => {
    const counts = { common: 0, uncommon: 0, rare: 0 };
    for (const [, tier, count] of String(text).matchAll(/(Common|Uncommon|Rare)\s*x\s*(\d+)/g)) {
      counts[tier.toLowerCase()] = Number(count);
    }
    return counts;
  };

  it('кривая генератора совпадает с колонками материалов на модах оружия', () => {
    // Значения с пометкой «?» (непроверено по книге) в сверку не берём.
    const rows = weaponModsData.filter(
      (mod) => typeof mod.materials === 'string' && !mod.materials.startsWith('?') && Number.isInteger(mod.complexity),
    );
    expect(rows.length).toBeGreaterThan(100);
    for (const mod of rows) {
      const curve = MATERIALS_BY_COMPLEXITY[mod.complexity];
      expect(curve, `мо ${mod.id}: сложности ${mod.complexity} нет в кривой`).toBeTruthy();
      expect(parseMaterials(mod.materials), `мо ${mod.id}: ${mod.materials} против сложности ${mod.complexity}`)
        .toEqual({ common: curve.common, uncommon: curve.uncommon, rare: curve.rare });
    }
  });
});

describe('данные крафта: файл-обменник незакрытых рецептов', () => {
  const doc = JSON.parse(readRepo(MISSING_FILE));

  it('структура: мета и ровно четыре договорные категории', () => {
    expect(Object.keys(doc)).toEqual(['_meta', ...MISSING_CATEGORY_ORDER]);
    const total = MISSING_CATEGORY_ORDER.reduce((n, c) => n + doc[c].length, 0);
    // Дыры прошлого среза закрыл владелец (патч 250): предметы добавлены в
    // каталоги, в обменнике осталась одна позиция. Если файл однажды опустеет
    // полностью — это подозрение, что генератор что-то потерял, а не что всё
    // закрыто: одна честная дыра обязана оставаться видимой, пока верстак
    // «Cooking Station» не описан предметом.
    expect(total).toBeGreaterThanOrEqual(1);
    expect(doc.loot.map((r) => r.sourceName)).toContain('Cooking Station');
    expect(doc._meta.counts).toEqual(
      Object.fromEntries(MISSING_CATEGORY_ORDER.map((c) => [c, doc[c].length])),
    );
  });

  it('каждая позиция — рецепт: ссылки либо id каталога, либо «unknown»', () => {
    const published = new Set(allRecipes().map(({ record }) => record.id));
    for (const category of MISSING_CATEGORY_ORDER) {
      for (const record of doc[category]) {
        const label = `${category}/${record.sourceName}`;
        // Идентификатор — id предмета, как в данных: если результат известен,
        // его id обязан существовать в каталоге; если неизвестен — unknown всюду.
        if (record.id === 'unknown') {
          expect(record.outputQuantity, `${label}: неизвестный id обязан сопровождаться неизвестным результатом`).toBe('unknown');
        } else {
          expect(catalogIds.has(record.id), `${label}: результат ${record.id} есть в каталоге`).toBe(true);
        }
        expect(published.has(record.id), `${label}: закрытая позиция не должна оставаться в обменнике`).toBe(false);
        expect(ALL_SKILL_KEYS, `${label}: навык`).toContain(record.requires.skill);
        expect(record.requires.complexity).toBeGreaterThanOrEqual(1);
        expect(typeof record.blockedBy, `${label}: позиция без объяснения недопустима`).toBe('string');
        expect(record.blockedBy.length, `${label}: причина обязана быть`).toBeGreaterThan(0);
        for (const material of record.materials) {
          if (material.itemId === 'unknown') {
            expect(typeof material.sourceName, `${label}: у неизвестной позиции должно быть напечатанное имя`).toBe('string');
            expect(material.sourceName.length, `${label}: имя не пустое`).toBeGreaterThan(0);
          } else {
            expect(catalogIds.has(material.itemId), `${label}: ингредиент ${material.itemId}`).toBe(true);
          }
          expect(material.count, `${label}: количество`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('обменник не говорит втихомолку: каждая позиция перечислена в отчёте', () => {
    const report = readRepo('docs/reference-data/CRAFTING-MAPPING.md');
    for (const category of MISSING_CATEGORY_ORDER) {
      for (const record of doc[category]) {
        expect(report, `отчёт молчит о «${record.sourceName}»`).toContain(`| ${record.sourceName} |`);
      }
    }
  });
});

describe('дикоросы и новые каталоги (закрытие дыр — патч 250)', () => {
  it('таблица дикоросов: броски 1..20 без пропусков, ссылки — только на каталог еды', () => {
    expect(foragingTable.map((row) => row.roll)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const row of foragingTable) {
      expect(catalogIds.get(row.id), `дикоросы: ${row.id}`).toBe('food');
    }
  });

  it('исправление владельца: материалы «Ментат» — ровно печатные числа', () => {
    const rec = allRecipes().find(({ record }) => record.id === 'chem_mentats');
    expect(rec, 'рецепт chem_mentats в данных').toBeTruthy();
    const counts = Object.fromEntries(rec.record.materials.map((m) => [m.itemId, m.count]));
    expect(counts).toEqual({
      food_brain_fungus: 2,
      item_rare_materials: 2,
      item_uncommon_materials: 3,
    });
  });

  it('дротики шприцера выпущены: штучные, Наука, категория боеприпасов', () => {
    const want = [
      'ammo_syringe_berserk', 'ammo_syringe_bloatfly_larva', 'ammo_syringe_bleed_out',
      'ammo_syringe_endangerol', 'ammo_syringe_lock_joint', 'ammo_syringe_mind_cloud',
      'ammo_syringe_pax', 'ammo_syringe_radscorpion_venom', 'ammo_syringe_yellow_belly',
    ].sort();
    const darts = allRecipes().filter(({ record }) => want.includes(record.id));
    expect(darts.map(({ record }) => record.id).sort()).toEqual(want);
    for (const { category, record } of darts) {
      expect(record.outputQuantity, `${record.id}: дротик штучный`).toBe(1);
      expect(record.requires.skill, `${record.id}: навык`).toBe('SCIENCE');
      expect(category, `${record.id}: категория`).toBe('ammo');
    }
  });

  it('«Berserk Syringe» из рецепта Fury ведёт на дротик, а не на выдуманный предмет', () => {
    const fury = allRecipes().find(({ record }) => record.id === 'chem_fury');
    expect(fury).toBeTruthy();
    expect(fury.record.materials).toContainEqual({ itemId: 'ammo_syringe_berserk', count: 1 });
  });
});
