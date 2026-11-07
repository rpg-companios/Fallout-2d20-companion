// __tests__/lootTrade/item-name-parts-562.test.js
// Патч 562: «Длинные названия должны читаться целиком. Обрати внимание на
// базовые имена из 2х слов, по типу боевой карабин, двуствольный дробовик и т.п».
//
// Проверяем не косметику, а контракт разбора имени:
//   • базовое имя из двух слов остаётся целым;
//   • качества и переименование прикладом не теряются;
//   • инвариант «title + mods = исходное имя, слово в слово» на ВСЁМ каталоге
//     оружия (включая максимально обвешанные стволы — их владелец и имел в виду);
//   • оба окна (склад и торговец) рисуют имя одной разметкой и ничего не режут.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { enrichWeaponItem } from '../../domain/enrichItem';
import { getItemNameParts, buildModsIndex, formatItemNameLine } from '../../domain/itemNameParts';

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const qualityName = (catalog, id) => (catalog.qualities || []).find((q) => q.id === id)?.name || '';

// Максимально обвешанный предмет: по одному моду в каждый слот, плюс качество.
const maxModded = (catalog, weaponId, { qualities = 1 } = {}) => {
  const weapon = catalog.weapons.find((w) => w.id === weaponId);
  const slots = {};
  for (const mod of catalog.weaponMods || []) {
    if (!(mod.applies_to_ids || []).includes(weaponId)) continue;
    if (mod.slot && !slots[mod.slot]) slots[mod.slot] = mod.id;
  }
  const uniqQualities = (weapon.qualities || []).map((q) => q.qualityId).slice(0, qualities);
  const enriched = enrichWeaponItem(
    { weaponId, appliedMods: slots, uniqQualities },
    catalog,
    { qualityNameById: (id) => qualityName(catalog, id) },
  );
  return { weapon, enriched, parts: getItemNameParts(enriched, buildModsIndex(catalog)) };
};

describe('562 — имя предмета читается целиком', () => {
  const catalog = getEquipmentCatalog();
  const modsIndex = buildModsIndex(catalog);

  it('базовое имя из двух слов не разрезается', () => {
    for (const id of ['weapon_combat_rifle', 'weapon_double_barrel_shotgun', 'weapon_pipe_bolt_action']) {
      const { weapon, parts } = maxModded(catalog, id);
      expect(parts.mods.length).toBeGreaterThan(0);
      expect(parts.title).toContain(weapon.name);
      expect(parts.title.split(/\s+/)).toEqual(expect.arrayContaining(weapon.name.split(/\s+/)));
    }
  });

  it('качество и переименование прикладом остаются в имени', () => {
    // Laser Pistol + приклад = Laser Rifle, качество «Close Quarters» — оба слова
    // обязаны остаться в заголовке: раньше брали baseWeaponName и теряли их.
    const { weapon, parts } = maxModded(catalog, 'weapon_laser_gun');
    const renamed = weapon.stockNames?.with;
    expect(renamed).toBeTruthy();
    expect(parts.title).toContain(renamed);
    expect(parts.title).not.toContain(weapon.name); // имя ДО приклада не врёт
    const quality = qualityName(catalog, weapon.qualities[0].qualityId);
    expect(quality).toBeTruthy();
    expect(parts.title).toContain(quality);
  });

  it('инвариант: ни одного слова не теряется (весь каталог оружия)', () => {
    const words = (s) => String(s).split(/\s+/).filter(Boolean);
    let checked = 0;
    for (const weapon of catalog.weapons) {
      const hasMods = (catalog.weaponMods || []).some((m) => (m.applies_to_ids || []).includes(weapon.id));
      if (!hasMods) continue;
      const { enriched, parts } = maxModded(catalog, weapon.id);
      checked += 1;
      const shown = new Set(words([parts.title, ...parts.mods].join(' ')));
      // 1. Заголовок не выдумывает слов: всё, что в нём есть, есть в имени.
      const source = new Set(words(enriched.name));
      for (const word of words(parts.title)) {
        expect(source.has(word), `${weapon.id}: лишнее слово «${word}» в заголовке`).toBe(true);
      }
      // 2. Ни одно слово имени не пропало — ни в заголовке, ни в строке модов.
      for (const word of source) {
        expect(shown.has(word), `${weapon.id}: потеряно слово «${word}»`).toBe(true);
      }
      // 3. Заголовок по-прежнему содержит базовое имя (или переименованное
      //    прикладом) целиком — это и есть «читается целиком».
      const expectedBase = weapon.stockNames?.with || weapon.name;
      expect(parts.title).toContain(expectedBase);
    }
    expect(checked).toBeGreaterThan(80);
  });

  it('максимально обвешанный ствол делится на короткий заголовок и строку модов', () => {
    const { enriched, parts } = maxModded(catalog, 'weapon_pipe_bolt_action');
    expect(parts.mods.length).toBeGreaterThanOrEqual(6);
    // Заголовок — качества + базовое имя, а не вся склейка.
    expect(parts.title.length).toBeLessThan(enriched.name.length / 2);
    // Строка модов — полные имена, каждое читается отдельно.
    expect(parts.mods.every((name) => name.length > 1)).toBe(true);
    expect(formatItemNameLine(parts)).toContain(parts.title);
  });

  it('префиксы снимаются в порядке склейки, а не по длине', () => {
    // Реальные данные: у мода есть короткий prefix («Long») и читаемое name
    // («Long Barrel»). Склеивается prefix. Снимаем ровно его, а показываем name.
    const index = {
      m_scope: { name: 'Long Night Vision Scope', token: 'Long Night Vision Scope' },
      m_long: { name: 'Long Barrel', token: 'Long' },
    };
    const item = {
      name: 'Long Night Vision Scope Long Pipe Pistol',
      appliedMods: { Barrel: 'm_scope', Muzzle: 'm_long' },
    };
    const parts = getItemNameParts(item, index);
    expect(parts.title).toBe('Pipe Pistol');
    expect(parts.mods).toEqual(['Long Night Vision Scope', 'Long Barrel']);
  });

  it('без модов имя показывается целиком, а непустых частей не выдумываем', () => {
    const plain = { name: 'Лабораторный халат', itemType: 'clothing' };
    expect(getItemNameParts(plain, modsIndex)).toEqual({ title: 'Лабораторный халат', mods: [] });
    // Мод, которого нет в каталоге, — имя не трогаем (не режем вслепую).
    const unknown = { name: 'Странный ствол', appliedMods: { Barrel: 'mod_нет_такого' } };
    expect(getItemNameParts(unknown, modsIndex)).toEqual({ title: 'Странный ствол', mods: [] });
    // Пустой предмет не должен ронять рендер.
    expect(getItemNameParts(null, modsIndex)).toEqual({ title: '', mods: [] });
  });

  it('одинаковые имена разных слотов не дублируются в строке модов', () => {
    const duo = {
      name: 'Beam Focuser Beam Focuser Pipe Pistol',
      appliedMods: { Barrel: 'mod_same', Muzzle: 'mod_same_2' },
    };
    const index = {
      mod_same: { name: 'Beam Focuser', token: 'Beam Focuser' },
      mod_same_2: { name: 'Beam Focuser', token: 'Beam Focuser' },
    };
    expect(getItemNameParts(duo, index).mods).toEqual(['Beam Focuser']);
  });

  it('склад и торговец рисуют имя одной разметкой и ничего не режут', () => {
    const lines = read('components/lootTrade/ItemNameLines.js');
    expect(lines).not.toContain('numberOfLines');
    expect(lines).toContain('tradeRowName');
    expect(lines).toContain('tradeRowMods');

    const storage = read('components/lootTrade/PartyStorageModal.js');
    const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
    for (const src of [storage, overlay]) {
      expect(src).toContain("from './ItemNameLines'");
      expect(src).not.toMatch(/tradeRowName[\s\S]{0,120}numberOfLines/);
    }
    // Склад: выдача, приём и панель Мастера. Торговец: продажа, покупка, лут.
    expect(storage.match(/<ItemNameLines/g)).toHaveLength(3);
    expect(overlay.match(/<ItemNameLines/g)).toHaveLength(3);
  });

  it('стили имени: моды отдельной серой строкой, флекс сжимается', () => {
    const styles = read('components/lootTrade/tradeOverlayStyles.js');
    expect(styles).toContain('tradeRowMods:');
    expect(styles).toMatch(/tradeRowInfo:\s*\{[^}]*minWidth: 0/);
    expect(styles).toMatch(/lootRowInfo:\s*\{[^}]*minWidth: 0/);
  });
});
