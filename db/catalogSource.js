// db/catalogSource.js
//
// Single source of truth for the STATIC catalog (weapons, mods, ammo, qualities,
// perks, items), read directly from JSON via i18n/equipmentCatalog.
//
// Previously this data was copied into SQLite by seed.js and queried with SELECT.
// Now the catalog lives only in JSON; these functions reproduce the exact DB *row
// shape* (snake_case columns, JSON-stringified arrays) the consumers expect, so the
// db/Database query functions can delegate here without changing any call sites.
//
// Character SAVES remain in SQLite (see Database.js / characters table).

import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { getCurrentLocale } from '../i18n/locale';
import perksData from '../data/perks/perks.json';
import ruPerksData from '../i18n/ru-RU/data/perks/perks.json';
import enPerksData from '../i18n/en-EN/data/perks/perks.json';

// ─── helpers (mirrors seed.js) ──────────────────────────────────────────────
const safeStr = (v) => (v === null || v === undefined ? null : String(v));
const safeNum = (v) => {
  if (v === null || v === undefined || v === '—' || v === '-') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const slugify = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '_').replace(/_+/g, '_').slice(0, 40);
};

const ROBOT_WEAPON_BASE_MAP = {
  robot_weapon_flamethrower: 'weapon_022',
  robot_weapon_laser_cutter: 'weapon_018',
  robot_weapon_auto_10mm: 'weapon_002',
};

// ─── row builders (identical shape to seed.js INSERTs) ──────────────────────

const buildWeaponRow = (w) => {
  // Поддержка массива и строки для damageType (обратная совместимость)
  const damageType = Array.isArray(w.damageType)
    ? JSON.stringify(w.damageType)
    : safeStr(w.damageType);

  return {
    id: w.id,
    name: w.name || '',
    weaponType: w.weaponType || '',
    // Вариант предмета: истинный id (механика наследуется от него).
    // Например, «Опасная бритва» — это weapon_switchblade с другим именем.
    trueItemId: safeStr(w.trueItemId),
    damage: safeNum(w.damage),
    damageEffects: safeStr(w.damageEffects),
    damageType,
    fireRate: safeStr(w.fireRate),
    qualities: Array.isArray(w.qualities) ? JSON.stringify(w.qualities) : safeStr(w.qualities),
    effects: Array.isArray(w.effects) ? JSON.stringify(w.effects) : safeStr(w.effects),
    weight: safeStr(w.weight),
    cost: safeStr(w.cost),
    rarity: safeStr(w.rarity),
    ammoId: safeStr(w.ammoId),
    range: safeStr(w.range),
    rangeName: safeStr(w.rangeName),
    // Имена оружия с ложей/без ложи (лазерный пистолет → лазерная винтовка).
    // Необходимо для правила «сток-мод меняет пистолет на винтовку».
    stockNames: w.stockNames != null ? w.stockNames : null,
    mainAttr: safeStr(w.mainAttr),
    mainSkill: safeStr(w.mainSkill),
    rules: safeStr(w.rules),
    flavour: safeStr(w.flavour),
    modsConfig: w.modsConfig != null ? safeStr(w.modsConfig) : null,
  };
};

const buildWeaponModRow = (m) => {
  const baseIds = Array.isArray(m.applies_to_ids) ? m.applies_to_ids : [];
  const robotAliases = Object.entries(ROBOT_WEAPON_BASE_MAP)
    .filter(([, baseId]) => baseIds.includes(baseId))
    .map(([robotId]) => robotId);
  const appliesToIds = Array.from(new Set([...baseIds, ...robotAliases]));
  return {
    id: m.id,
    name: m.name || '',
    prefix: safeStr(m.prefix),
    slot: m.slot || '',
    complexity: safeNum(m.complexity),
    perk_1: safeStr(m.perk1),
    perk_2: safeStr(m.perk2),
    skill: safeStr(m.skill),
    rarity: safeStr(m.rarity),
    materials: safeStr(m.materials),
    cost: safeNum(m.cost),
    effects: safeStr(m.effects),
    effectDescription: safeStr(m.effectDescription),
    weight: safeStr(m.weight),
    damageModifier: m.damageModifier || null,
    fireRateModifier: m.fireRateModifier || null,
    rangeModifier: m.rangeModifier || null,
    qualityChanges: Array.isArray(m.qualityChanges) ? m.qualityChanges : null,
    effectChanges: Array.isArray(m.effectChanges) ? m.effectChanges : null,
    damageTypeOverride: m.damageTypeOverride || null,
    damageType: safeStr(m.damageType),
    ammoOverride: safeStr(m.ammoOverride),
    ammoPerShotDelta: m.ammoPerShotDelta ?? null,
    // Список оружия, к которому подходит мод (JSON-строка для фильтра).
    appliesToIds: appliesToIds.length ? JSON.stringify(appliesToIds) : null,
  };
};

const buildAmmoRow = (a) => ({
  id: a.id,
  name: a.name,
  rarity: safeStr(a.rarity),
  cost: safeStr(a.cost),
});

const buildQualityRow = (q) => ({
  id: q.id,
  name: q.name || '',
  effect: safeStr(q.effect),
  opposite: safeStr(q.opposite),
});

const PERK_I18N = {
  'ru-RU': new Map(ruPerksData.map((entry) => [entry.id, entry])),
  'en-EN': new Map(enPerksData.map((entry) => [entry.id, entry])),
};

const buildPerkRows = () => {
  const locale = getCurrentLocale();
  const localizedById = PERK_I18N[locale] || PERK_I18N['ru-RU'];
  const ruById = PERK_I18N['ru-RU'];
  return perksData.map((perk) => {
    const localized = localizedById.get(perk.id) || ruById.get(perk.id) || {};
    return {
      id: perk.id,
      perk_name: localized.name || perk.id,
      rank: 1,
      max_rank: perk.maxRanks || 1,
      requirements: perk.prerequisites ? JSON.stringify(perk.prerequisites) : null,
      description: localized.effect || '',
      level_increase: perk.prerequisites?.levelIncreasePerRank ?? null,
    };
  });
};

const buildItemRows = (catalog) => {
  const { armorList, clothes, chems, miscellaneous } = catalog;
  const rows = [];
  const addItem = (item, itemType, category = null, subtype = null) => {
    const name = item.name || '';
    const id = itemType + '_' + slugify(name) + (category ? '_' + slugify(category) : '');
    rows.push({
      id,
      name,
      item_type: itemType,
      item_subtype: subtype,
      phys_dr: safeNum(item.physicalDamageRating),
      energy_dr: safeNum(item.energyDamageRating),
      rad_dr: safeNum(item.radiationDamageRating),
      protected_area: safeStr(item.protected_area),
      clothing_type: safeStr(item.clothingType),
      find_formula: safeStr(item.find_formula),
      weight: safeStr(item.weight),
      price: safeStr(item.cost),
      rarity: safeStr(item.rarity),
      category,
    });
  };
  (armorList || []).forEach((item) => addItem(item, 'armor', item.category || item.armorCategoryKey || null));
  (clothes?.clothes || []).forEach((group) =>
    (group.items || []).forEach((item) => addItem(item, 'clothing', group.type, item.clothingType)),
  );
  (chems || []).forEach((item) =>
    rows.push({
      id: 'chem_' + slugify(item.name || item.id || ''),
      name: item.name || '',
      item_type: 'chem',
      item_subtype: null,
      phys_dr: null, energy_dr: null, rad_dr: null,
      protected_area: null, clothing_type: null, find_formula: null,
      weight: safeStr(item.weight),
      price: safeStr(item.cost),
      rarity: safeStr(item.rarity),
      category: null,
    }),
  );
  (miscellaneous?.miscellaneous || []).forEach((group) =>
    (group.items || []).forEach((item) => addItem(item, item.itemType || 'misc', group.type)),
  );
  return rows;
};

// Mod-slot overrides → list of { weapon_id, slot, mod_id } (mirrors seedWeaponModSlots)
const buildModSlotRows = (catalog) => {
  const modsOverridesData = catalog.modsOverrides || {};
  const robotSlotOverrides = {};
  Object.entries(ROBOT_WEAPON_BASE_MAP).forEach(([robotWeaponId, baseWeaponId]) => {
    if (modsOverridesData[baseWeaponId]) robotSlotOverrides[robotWeaponId] = modsOverridesData[baseWeaponId];
  });
  const merged = { ...modsOverridesData, ...robotSlotOverrides };
  const rows = [];
  for (const [weaponId, slots] of Object.entries(merged)) {
    for (const [slot, modIds] of Object.entries(slots)) {
      for (const modId of modIds) rows.push({ weapon_id: weaponId, slot, mod_id: modId });
    }
  }
  return rows;
};

// ─── cached catalog (per-locale) ────────────────────────────────────────────
let _cache = null;
let _cacheLocale = null;

const build = () => {
  const locale = getCurrentLocale();
  if (_cache && _cacheLocale === locale) return _cache;
  const catalog = getEquipmentCatalog(locale);
  _cache = {
    weapons: (catalog.weapons || []).map(buildWeaponRow),
    weaponMods: (catalog.weaponMods || []).map(buildWeaponModRow),
    modSlots: buildModSlotRows(catalog),
    ammo: (catalog.ammoTypes || []).map(buildAmmoRow),
    qualities: (catalog.qualities || []).map(buildQualityRow),
    perks: buildPerkRows(),
    items: buildItemRows(catalog),
  };
  _cacheLocale = locale;
  return _cache;
};

/** Clear the cache (e.g. after a locale change). */
export const invalidateCatalogCache = () => { _cache = null; _cacheLocale = null; };

// ─── query API (same semantics as the old SQL functions) ────────────────────

export const catalogGetWeapons = (weaponType = null) => {
  const list = build().weapons;
  const out = weaponType ? list.filter((w) => w.weaponType === weaponType) : [...list];
  return out.sort((a, b) =>
    (a.weaponType || '').localeCompare(b.weaponType || '') || (a.name || '').localeCompare(b.name || ''));
};
export const catalogGetWeaponById = (id) => build().weapons.find((w) => w.id === id) || null;
export const catalogSearchWeapons = (q) =>
  build().weapons.filter((w) => (w.name || '').toLowerCase().includes(String(q).toLowerCase()));
export const catalogGetWeaponByName = (name) => build().weapons.find((w) => w.name === name) || null;

export const catalogGetWeaponMods = (weaponId = null) => {
  const list = build().weaponMods;
  if (weaponId) {
    return list.filter((m) => typeof m.appliesToIds === 'string' && m.appliesToIds.includes(weaponId));
  }
  return [...list].sort((a, b) => (a.slot || '').localeCompare(b.slot || '') || (a.name || '').localeCompare(b.name || ''));
};
export const catalogGetWeaponModById = (id) => build().weaponMods.find((m) => m.id === id) || null;

export const catalogGetModsForWeaponSlot = (weaponId, slot) => {
  const ids = build().modSlots.filter((r) => r.weapon_id === weaponId && r.slot === slot).map((r) => r.mod_id);
  return ids.map((id) => catalogGetWeaponModById(id)).filter(Boolean);
};
export const catalogGetSlotsForWeapon = (weaponId) =>
  Array.from(new Set(build().modSlots.filter((r) => r.weapon_id === weaponId).map((r) => r.slot)));

export const catalogGetAmmoTypes = () =>
  [...build().ammo].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
export const catalogGetAmmoById = (id) => build().ammo.find((a) => a.id === id) || null;

export const catalogGetWeaponQualities = () =>
  [...build().qualities].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
export const catalogGetQualityByName = (name) => build().qualities.find((q) => q.name === name) || null;

export const catalogGetPerks = (perkName = null) => {
  const list = build().perks;
  const out = perkName ? list.filter((p) => p.perk_name === perkName) : [...list];
  return out.sort((a, b) =>
    (a.perk_name || '').localeCompare(b.perk_name || '') || (a.rank || 0) - (b.rank || 0));
};

export const catalogGetItems = (itemType = null) => {
  const list = build().items;
  const out = itemType ? list.filter((i) => i.item_type === itemType) : [...list];
  return out.sort((a, b) =>
    (a.item_type || '').localeCompare(b.item_type || '') || (a.name || '').localeCompare(b.name || ''));
};
export const catalogGetItemByName = (name) => build().items.find((i) => i.name === name) || null;

/** Total catalog row count (replaces getRowCount used as a "is seeded" check). */
export const catalogRowCount = () => {
  const c = build();
  return c.weapons.length + c.weaponMods.length + c.ammo.length + c.qualities.length + c.perks.length + c.items.length;
};
