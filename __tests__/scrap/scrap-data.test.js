// Данные разбора (патч 256, реформа 269): единый каталог хлама junk/ junk.json
// — карточки с печатным составом разбора прямо в строке; справочник материалов
// material.json; d20-таблицы без подписей (подписи — слой i18n). Источник
// истины — scripts/scrap-source.json (таблицы владельца от 2026-09-16), файлы
// генерирует scripts/build-scrap-data.mjs. Тесты следят за инвариантами, не за
// содержательными числами (числа — за генератором).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import junkData from '../../modules/fallout/data/junk/junk.json';
import materialsData from '../../modules/fallout/data/junk/material.json';
import tables from '../../modules/fallout/data/junk/tables.json';
import generalGoods from '../../modules/fallout/data/equipment/general_goods.json';
import i18nJunkRu from '../../modules/fallout/i18n/ru-RU/data/junk/junk.json';
import i18nJunkEn from '../../modules/fallout/i18n/en-EN/data/junk/junk.json';
import i18nMatsRu from '../../modules/fallout/i18n/ru-RU/data/junk/material.json';
import i18nMatsEn from '../../modules/fallout/i18n/en-EN/data/junk/material.json';
import i18nTablesRu from '../../modules/fallout/i18n/ru-RU/data/junk/tables.json';
import i18nTablesEn from '../../modules/fallout/i18n/en-EN/data/junk/tables.json';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(ROOT + rel, 'utf8'));

const junkById = new Map(junkData.map((x) => [x.id, x]));
const matsById = new Map(materialsData.map((x) => [x.id, x]));
const PACK_IDS = ['item_common_materials', 'item_uncommon_materials', 'item_rare_materials'];
const namedMaterials = materialsData.filter((m) => !PACK_IDS.includes(m.id));

// все составы разбора: строки хлама + карточки каталога (реформа: отдельного
// файла salvage.json нет — состав носит карточка предмета)
const collectCompositions = () => {
  const out = [];
  for (const row of junkData) if (row.composition) out.push([row.id, row.composition]);
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.id === 'string' && Array.isArray(node.composition)) out.push([node.id, node.composition]);
    Object.values(node).forEach(walk);
  };
  walk(generalGoods);
  return out;
};

// ── каталоги ───────────────────────────────────────────────────────────────────

describe('каталоги разбора (269: все материалы равны)', () => {
  it('пачковые материалы остались ровно тремя и не изменены', () => {
    const packs = materialsData.filter((m) => PACK_IDS.includes(m.id));
    expect(packs.map((m) => m.id).sort()).toEqual([...PACK_IDS].sort());
    for (const p of packs) {
      expect(p.weight).toBe(1);
      expect([1, 3, 5]).toContain(p.cost);
      expect(p.materialType).toBe(['common', 'uncommon', 'rare'][p.rarity]);
    }
  });

  it('именованных материалов 33, у каждого корректные rarity/цена/вес', () => {
    expect(namedMaterials).toHaveLength(33);
    for (const m of namedMaterials) {
      expect([0, 1, 2]).toContain(m.rarity);
      expect(m.cost).toBeGreaterThan(0);
      expect(m.weight).toBeGreaterThan(0);
      expect(Math.abs(Math.round(m.weight * 10) - m.weight * 10)).toBeLessThan(1e-6); // вес кратен 0.1
    }
  });

  it('служебных флагов в данных нет (269): ни itemType, ни namedMaterial', () => {
    for (const m of materialsData) {
      expect(m.itemType, m.id).toBeUndefined();
      expect(m.namedMaterial, m.id).toBeUndefined();
    }
  });

  it('четыре материала по правилу редкости (1/3/5, вес 1)', () => {
    const byId = (id) => matsById.get(id);
    expect(byId('coal')).toMatchObject({ cost: 1, weight: 1, rarity: 0 });
    expect(byId('iron')).toMatchObject({ cost: 1, weight: 1, rarity: 0 });
    expect(byId('crystal')).toMatchObject({ cost: 5, weight: 1, rarity: 2 });
    expect(byId('gold')).toMatchObject({ cost: 5, weight: 1, rarity: 2 });
  });

  it('антисептик и асбест — материалы, и их нет в хламе (нет дублей id)', () => {
    expect(matsById.has('antiseptic')).toBe(true);
    expect(matsById.has('asbestos')).toBe(true);
    expect(matsById.get('antiseptic')).toMatchObject({ cost: 3, weight: 0.1, rarity: 2 });
    expect(matsById.get('asbestos')).toMatchObject({ cost: 6, weight: 0.1, rarity: 2 });
    expect(junkById.has('antiseptic')).toBe(false);
    expect(junkById.has('asbestos')).toBe(false);
  });

  it('id хлама и материалов не пересекаются', () => {
    for (const id of junkById.keys()) expect(matsById.has(id)).toBe(false);
  });

  it('у каждого хлам-предмета положительная цена и вес (находка «<1» = 0.2)', () => {
    for (const it of junkData) {
      expect(it.itemType).toBe('junk');
      expect(it.cost).toBeGreaterThan(0);
      expect(it.weight).toBeGreaterThan(0);
    }
  });
});

// ── таблицы и их подписи ─────────────────────────────────────────────────────

const allTableFaces = () => {
  const refs = [];
  for (const [key, t] of Object.entries(tables.tables)) {
    for (const [face, ref] of Object.entries(t.faces)) refs.push([key, Number(face), ref]);
  }
  return refs;
};

describe('d20-таблицы', () => {
  it('каждая таблица (и категории, и добыча) покрывает 1..20 ровно по разу', () => {
    const checks = [['категории', tables.categories.faces], ['добыча', tables.mining.faces],
      ...Object.entries(tables.tables).map(([k, v]) => [k, v.faces])];
    for (const [name, faces] of checks) {
      const nums = Object.keys(faces).map(Number).sort((a, b) => a - b);
      expect(nums, name).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    }
  });

  it('ссылки таблиц разрешаются: хлам — в каталоге хлама, линки — в своих каталогах, действия — валидны', () => {
    const catalog = new Set();
    for (const f of ['modules/fallout/data/equipment/weapons.json', 'modules/fallout/data/equipment/general_goods.json',
      'modules/fallout/data/equipment/ammo.json', 'modules/fallout/data/consumables/chems.json',
      'modules/fallout/data/consumables/food.json', 'modules/fallout/data/consumables/drinks.json']) {
      collectIdsInto(f, catalog);
    }
    for (const [table, face, ref] of allTableFaces()) {
      if (ref.action) {
        expect(['rollFood', 'reroll'], `${table}:${face}`).toContain(ref.action);
        if (ref.action === 'reroll') expect(tables.tables[ref.table]).toBeTruthy();
      } else {
        expect(junkById.has(ref.item) || catalog.has(ref.item), `${table}:${face} -> ${ref.item}`).toBe(true);
      }
    }
  });

  it('грань «еда» у animal только на 12–20, reroll у household4 только на 19–20', () => {
    const facesOf = (refPred) => Object.entries(tables.tables.animal.faces).filter(([, r]) => refPred(r)).map(([f]) => Number(f)).sort((a, b) => a - b);
    expect(facesOf((r) => r.action === 'rollFood')).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const hh4 = Object.entries(tables.tables.household4.faces).filter(([, r]) => r.action === 'reroll').map(([f]) => Number(f));
    expect(hh4.sort((a, b) => a - b)).toEqual([19, 20]);
  });

  it('руда: количество формулой из парсера кубиков; находка либо предмет-руда, либо прямо материал', () => {
    for (const [face, ref] of Object.entries(tables.mining.faces)) {
      expect(ref.qty, `mining:${face}`).toMatch(/^\d+(\+\d+<cd>)?$/);
      const known = (ref.item && junkById.has(ref.item)) || (ref.material && matsById.has(ref.material));
      expect(known, `mining:${face}`).toBe(true);
    }
  });

  it('данные таблиц молчат на человеческом (269): подписей в данных нет', () => {
    expect(tables.categories.ru).toBeUndefined();
    expect(tables.categories.en).toBeUndefined();
    expect(tables.mining.ru).toBeUndefined();
    expect(tables.mining.en).toBeUndefined();
    for (const [key, t] of Object.entries(tables.tables)) {
      expect(t.ru, key).toBeUndefined();
      expect(t.en, key).toBeUndefined();
    }
  });

  it('подписи таблиц — словарь i18n: наборы ключей совпадают, ru/en зеркальны', () => {
    expect(Object.keys(i18nTablesRu.tables).sort()).toEqual(Object.keys(tables.tables).sort());
    expect(Object.keys(i18nTablesEn.tables).sort()).toEqual(Object.keys(tables.tables).sort());
    for (const loc of [i18nTablesRu, i18nTablesEn]) {
      expect(typeof loc.categories).toBe('string');
      expect(loc.categories.trim().length).toBeGreaterThan(0);
      expect(typeof loc.mining).toBe('string');
      for (const [key, label] of Object.entries(loc.tables)) {
        expect(typeof label, key).toBe('string');
        expect(label.trim().length, key).toBeGreaterThan(0);
      }
    }
    expect(i18nTablesRu.mining).toBe('Шахты и раскопки');
  });
});

// ── составы разбора ────────────────────────────────────────────────────────────

const collectIdsInto = (rel, acc = new Set()) => {
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if (typeof node.id === 'string') acc.add(node.id);
      Object.values(node).forEach(walk);
    }
  };
  walk(readJson(rel));
  return acc;
};

describe('составы разбора (в карточках предметов, 269)', () => {
  it('каждый материал состава — существующий материал справочника', () => {
    const walkComp = (c) => {
      expect(matsById.has(c.material), c.material).toBe(true);
      if (c.effect) {
        if (c.effect.options) c.effect.options.forEach(walkComp);
        else expect(matsById.has(c.effect.material), c.effect.material).toBe(true);
      }
    };
    const compositions = collectCompositions();
    expect(compositions.length).toBeGreaterThanOrEqual(120);
    for (const [id, options] of compositions) {
      expect(options.length, id).toBeGreaterThan(0);
      for (const alt of options) {
        expect(alt.length, id).toBeGreaterThan(0);
        for (const c of alt) {
          walkComp(c);
          const hasFixed = typeof c.count === 'number';
          const hasDice = typeof c.dc === 'number';
          expect(hasFixed || hasDice, `${id}: ${JSON.stringify(c)}`).toBe(true);
          if (hasDice) expect(c.dc, id).toBeGreaterThanOrEqual(1);
          if (typeof c.base === 'number') {
            expect(hasDice, `${id}: base без dc`).toBe(true);
            expect(c.base).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it('состав носит карточка: у хлама — строка junk.json, у линка — запись каталога', () => {
    const glass = junkById.get('magnifying_glass');
    expect(glass.composition[0].map((r) => [r.material, r.count])).toEqual([
      ['glass', 2], ['copper', 1], ['crystal', 2],
    ]);
    const found = [];
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      if (node.id === 'item_radio' && node.composition) found.push(node);
      Object.values(node).forEach(walk);
    };
    walk(generalGoods);
    expect(found.length, 'радио: одна карточка с составом').toBe(1);
    expect(found[0].composition[0].some((r) => matsById.has(r.material))).toBe(true);
  });

  it('расходники и оружие из чужих каталогов состава не имеют (булка, стимпак, кита — не разбираются)', () => {
    for (const id of ['drink_blood_pack', 'chem_stimpak', 'weapon_baseball_bat', 'drink_purified_water']) {
      expect(junkById.has(id), id).toBe(false);
    }
    const walk = (node) => {
      if (Array.isArray(node)) return node.some(walk);
      if (!node || typeof node !== 'object') return false;
      if (node.id && node.composition && ['drink_blood_pack', 'chem_stimpak', 'weapon_baseball_bat', 'drink_purified_water'].includes(node.id)) return true;
      return Object.values(node).some(walk);
    };
    expect(walk(generalGoods), 'ни один расходник не притворился разбираемым').toBe(false);
  });

  it('каждый предмет хлама либо покрыт таблицей, либо рудой, либо легаси без таблицы', () => {
    const inTable = new Set();
    for (const [, , ref] of allTableFaces()) if (ref.item) inTable.add(ref.item);
    for (const [, ref] of Object.entries(tables.mining.faces)) if (ref.item) inTable.add(ref.item);
    const LEGACY_UNTABLED = new Set(['bloatfly_gland', 'stingwing_barb']);
    for (const id of junkById.keys()) {
      expect(inTable.has(id) || LEGACY_UNTABLED.has(id), id).toBe(true);
    }
  });

  it('железная руда сдаёт случайное количество (2 DC), прочая руда — по одной единице', () => {
    expect(junkById.get('iron_ore').composition[0][0]).toMatchObject({ material: 'iron', dc: 2 });
    for (const id of ['aluminum_ore', 'copper_ore', 'gold_ore', 'silver_ore', 'uranium_ore']) {
      const comp = junkById.get(id).composition[0][0];
      expect(comp.count, id).toBe(1);
      expect(comp.dc, id).toBeUndefined();
    }
    expect(junkById.get('uranium_ore').composition[0][0].material).toBe('nuclear_material');
  });
});

// ── i18n-зеркала ─────────────────────────────────────────────────────────────────

describe('i18n-зеркала', () => {
  it('наборы id зеркал совпадают с данными (ru и en, хлам и материалы)', () => {
    const eq = (mirror, ids, what) => {
      expect(new Set(mirror.map((x) => x.id)), what).toEqual(new Set(ids));
    };
    eq(i18nJunkRu, [...junkById.keys()], 'ru junk');
    eq(i18nJunkEn, [...junkById.keys()], 'en junk');
    const allMatIds = materialsData.map((m) => m.id); // зеркало покрывает и пачковые
    eq(i18nMatsRu, allMatIds, 'ru materials');
    eq(i18nMatsEn, allMatIds, 'en materials');
  });

  it('имена непустые, сохранённые владельцем не перебиты', () => {
    for (const m of [...i18nJunkRu, ...i18nJunkEn, ...i18nMatsRu, ...i18nMatsEn]) {
      expect(typeof m.name).toBe('string');
      expect(m.name.trim().length).toBeGreaterThan(0);
    }
    const byId = (arr, id) => arr.find((x) => x.id === id)?.name;
    expect(byId(i18nJunkRu, 'abraxo_cleaner')).toBe('Чистящее средство Абраксо');
    expect(byId(i18nJunkRu, 'blood_sac')).toBe('Кровяной мешок');
    expect(byId(i18nMatsRu, 'antiseptic')).toBe('Антисептик');
  });
});
