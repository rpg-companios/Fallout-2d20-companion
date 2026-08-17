/**
 * Единый конвейер обогащения предмета (патч 106).
 *
 * Одно и то же оружие (база + моды + вариант + качества) даёт ОДИНАКОВЫЕ
 * имя и статы через все пути: enrichWeaponItem (конвейер) и
 * resolveWeaponWithAppliedMods (обёртка resolveItem). Полная механика модов
 * (все структурированные поля) — единый источник вместо урезанных копий.
 *
 * Правила имени (решения владельца):
 *   [префиксы модов] [имена качеств] [базовое имя];
 *   качества ВСЕГДА добавляются; ложа меняет имя только при stockNames.with.
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { enrichWeaponItem, applyWeaponMods, getItemDisplayName, applyNumberModifier } from '../../domain/enrichItem';
import { resolveWeaponWithAppliedMods } from '../../domain/resolveItem';
import { setCurrentModuleLocale } from '../../i18n/locale';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const load = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf-8'));

const mergeById = (data, i18n) => {
  const byId = new Map((i18n || []).map((x) => [x.id, x]));
  return (data || []).map((d) => {
    const entry = byId.get(d.id);
    if (!entry?.name) throw new Error(`no i18n name for ${d.id}`);
    return { ...d, ...entry, name: entry.name };
  });
};

const ruWeapons = load('modules/fallout/i18n/ru-RU/data/equipment/weapons/weapons.json');
const ruWeaponMods = load('modules/fallout/i18n/ru-RU/data/equipment/weapon_mods.json');
const catalog = {
  weapons: mergeById(load('modules/fallout/data/equipment/weapons.json'), ruWeapons),
  weaponMods: mergeById(load('modules/fallout/data/equipment/weapon_mods.json'), ruWeaponMods),
};

const qname = (id) => ({ dashing: 'Дерзкая', elegant: 'Элегантная' }[id] || id);

beforeEach(() => {
  setCurrentModuleLocale('ru-RU');
});

describe('Конвейер: BASE + MODS + QUALITIES (оружие)', () => {
  it('вариант: механика истинного предмета, имя варианта, моды применяются', () => {
    const item = enrichWeaponItem({
      id: 'inst-1',
      weaponId: 'weapon_straight_razor',
      itemType: 'weapon',
      baseName: 'Опасная бритва',
      appliedMods: { Uniques: 'mod_113' },
    }, catalog, { qualityNameById: qname });
    expect(item.damage).toBe(3); // нож 2 + мод +1
    expect(item.name).toBe('Зазубренное лезвие Опасная бритва');
    expect(item.displayName).toBe(item.name);
    expect(item.qualities).toEqual([{ qualityId: 'quality_concealed' }]);
    expect(item.effects).toEqual([{ effectId: 'effect_piercing_x' }]);
  });

  it('качества ВСЕГДА добавляются к имени (не заменяют)', () => {
    const item = enrichWeaponItem({
      id: 'inst-2',
      weaponId: 'weapon_straight_razor',
      itemType: 'weapon',
      baseName: 'Опасная бритва',
      uniqQualities: ['dashing'],
      appliedMods: { Uniques: 'mod_113' },
    }, catalog, { qualityNameById: qname });
    expect(item.name).toBe('Зазубренное лезвие Дерзкая Опасная бритва');
  });

  it('обёртка resolveWeaponWithAppliedMods даёт тот же результат (единый путь)', () => {
    const instance = {
      id: 'inst-3',
      weaponId: 'weapon_straight_razor',
      itemType: 'weapon',
      baseName: 'Опасная бритва',
      uniqQualities: ['elegant'],
      appliedMods: { Uniques: 'mod_113' },
    };
    const direct = enrichWeaponItem(instance, catalog, { qualityNameById: qname });
    const viaResolve = resolveWeaponWithAppliedMods(instance, catalog);
    expect(viaResolve.name).toBe(direct.name);
    expect(viaResolve.damage).toBe(direct.damage);
    expect(viaResolve.qualities).toEqual(direct.qualities);
  });

  it('applyWeaponMods: полная механика (qualityChanges gain, damageModifier)', () => {
    const pistol = catalog.weapons.find((w) => w.id === 'weapon_10mm_pistol');
    const mod = catalog.weaponMods.find((m) => m.id === 'mod_008');
    const eff = applyWeaponMods(pistol, [mod]);
    expect(eff.damage).toBe(pistol.damage - 1);
    expect(eff.qualities.some((q) => q.qualityId === 'quality_inaccurate')).toBe(true);
  });

  it('applyWeaponMods: damageTypeOverride set и ammoOverride', () => {
    const pistol = catalog.weapons.find((w) => w.id === 'weapon_10mm_pistol');
    const eff = applyWeaponMods(pistol, [{
      id: 'mod_test',
      damageTypeOverride: { op: 'set', value: ['physical', 'energy'] },
      ammoOverride: 'ammo_10mm',
    }]);
    expect(eff.damageType).toEqual(['physical', 'energy']);
    expect(eff.ammoId).toBe('ammo_10mm');
  });

  it('applyWeaponMods: range shift клэмпится шкалой', () => {
    const pistol = catalog.weapons.find((w) => w.id === 'weapon_10mm_pistol');
    const down = applyWeaponMods(pistol, [{ id: 'mod_test', rangeModifier: { op: '-', value: 5 } }]);
    expect(down.range_name).toBe('Close');
    const up = applyWeaponMods(pistol, [{ id: 'mod_test', rangeModifier: { op: '+', value: 9 } }]);
    expect(up.range_name).toBe('Extreme');
  });

  it('getItemDisplayName: [моды] [качества] [база]', () => {
    expect(getItemDisplayName({ baseName: 'Бритва', modPrefixes: ['Дерзкая'], qualityNames: [] })).toBe('Дерзкая Бритва');
    expect(getItemDisplayName({ baseName: 'Бритва', modPrefixes: [], qualityNames: [] })).toBe('Бритва');
    expect(getItemDisplayName({ baseName: '', modPrefixes: ['A'], qualityNames: ['B'] })).toBe('A B');
  });

  it('applyNumberModifier: + - set', () => {
    expect(applyNumberModifier(5, { op: '+', value: 2 })).toBe(7);
    expect(applyNumberModifier(5, { op: '-', value: 2 })).toBe(3);
    expect(applyNumberModifier(5, { op: 'set', value: 9 })).toBe(9);
    expect(applyNumberModifier(1, { op: '-', value: 5 })).toBe(0); // не ниже нуля
  });
});
