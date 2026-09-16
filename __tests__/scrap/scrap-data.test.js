// Данные разбора (патч 256): каталог хлама, именованные материалы, составы
// разбора, d20-таблицы для ГМ-секции. Источник истины — scripts/scrap-source.json
// (таблицы владельца от 2026-09-16), файлы генерирует scripts/build-scrap-data.mjs.
// Тесты следят за инвариантами, не за содержательными числами (числа — за генератором).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import junkData from '../../modules/fallout/data/junk.json';
import materialsData from '../../modules/fallout/data/materials.json';
import salvage from '../../modules/fallout/data/scrap/salvage.json';
import tables from '../../modules/fallout/data/scrap/tables.json';
import i18nJunkRu from '../../modules/fallout/i18n/ru-RU/data/junk.json';
import i18nJunkEn from '../../modules/fallout/i18n/en-EN/data/junk.json';
import i18nMatsRu from '../../modules/fallout/i18n/ru-RU/data/materials.json';
import i18nMatsEn from '../../modules/fallout/i18n/en-EN/data/materials.json';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(ROOT + rel, 'utf8'));

const junkById = new Map(junkData.map((x) => [x.id, x]));
const matsById = new Map(materialsData.map((x) => [x.id, x]));
const PACK_IDS = ['item_common_materials', 'item_uncommon_materials', 'item_rare_materials'];
const namedMaterials = materialsData.filter((m) => m.namedMaterial);

// ── каталог ───────────────────────────────────────────────────────────────────

describe('каталоги разбора', () => {
  it('пачковые материалы остались ровно тремя и не изменены', () => {
    const packs = materialsData.filter((m) => !m.namedMaterial);
    expect(packs.map((m) => m.id).sort()).toEqual([...PACK_IDS].sort());
    for (const p of packs) {
      expect(p).toMatchObject({ itemType: 'misc', weight: 1 });
      expect([1, 3, 5]).toContain(p.cost);
    }
  });

  it('именованных материалов 33, у каждого корректные rarity/цена/вес', () => {
    expect(namedMaterials).toHaveLength(33);
    for (const m of namedMaterials) {
      expect(m.itemType).toBe('misc');
      expect([0, 1, 2]).toContain(m.rarity);
      expect(m.cost).toBeGreaterThan(0);
      expect(m.weight).toBeGreaterThan(0);
      expect(Math.abs(Math.round(m.weight * 10) - m.weight * 10)).toBeLessThan(1e-6); // вес кратен 0.1
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

// ── ссылки и таблицы ────────────────────────────────────────────────────────────

const collectCatalogIds = (rel, acc = new Set()) => {
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
      collectCatalogIds(f, catalog);
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
});

// ── составы разбора ─────────────────────────────────────────────────────────────

describe('составы разбора', () => {
  it('каждый материал состава — существующий именованный материал', () => {
    const walkComp = (c) => {
      expect(matsById.has(c.material), c.material).toBe(true);
      if (c.effect) {
        if (c.effect.options) c.effect.options.forEach(walkComp);
        else expect(matsById.has(c.effect.material), c.effect.material).toBe(true);
      }
    };
    for (const [id, entry] of Object.entries(salvage)) {
      expect(entry.options.length, id).toBeGreaterThan(0);
      for (const alt of entry.options) {
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

  it('ссылки salvage живут только на реальные предметы (хлам или линк-каталог)', () => {
    const catalog = new Set();
    for (const f of ['modules/fallout/data/equipment/weapons.json', 'modules/fallout/data/equipment/general_goods.json',
      'modules/fallout/data/consumables/chems.json', 'modules/fallout/data/consumables/drinks.json']) {
      collectCatalogIds(f, catalog);
    }
    for (const id of Object.keys(salvage)) {
      expect(junkById.has(id) || catalog.has(id), id).toBe(true);
    }
  });

  it('расходники и оружие из чужих каталогов состава не имеют (булка, стимпак, кита — не разбираются)', () => {
    for (const id of ['drink_blood_pack', 'chem_stimpak', 'weapon_baseball_bat', 'drink_purified_water']) {
      expect(salvage[id], id).toBeUndefined();
    }
    expect(salvage.item_radio).toBeTruthy(); // а радио — разбирается, состав с таблицы
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
    expect(salvage.iron_ore.options[0][0]).toMatchObject({ material: 'iron', dc: 2 });
    for (const id of ['aluminum_ore', 'copper_ore', 'gold_ore', 'silver_ore', 'uranium_ore']) {
      const comp = salvage[id].options[0][0];
      expect(comp.count, id).toBe(1);
      expect(comp.dc, id).toBeUndefined();
    }
    expect(salvage.uranium_ore.options[0][0].material).toBe('nuclear_material');
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
