// domain/ammoFoundTable.js
// Таблица нахождения боеприпасов «пачками» (Ammunition Found) из Fallout 2d20.
// Синхронизирована 1-в-1 с docs/reference-data/ammo-found-table.json (42 базовых типа)
// + 9 химических шприцов инъектора (по 1 шт., согласно modules/fallout/data/recipes/ammo.json)
// + резервный расчёт по редкости для пользовательских паков снаряжения.

export const AMMO_FOUND_BY_ID = Object.freeze({
  // Базовые и дополненные типы из docs/reference-data/ammo-found-table.json
  ammo_38: Object.freeze({ base: 10, cd: 5 }),
  ammo_10mm: Object.freeze({ base: 8, cd: 4 }),
  ammo_308: Object.freeze({ base: 6, cd: 3 }),
  ammo_flare: Object.freeze({ base: 2, cd: 1 }),
  ammo_shotgun_shell: Object.freeze({ base: 6, cd: 3 }),
  ammo_45: Object.freeze({ base: 8, cd: 4 }),
  ammo_flamer_fuel: Object.freeze({ base: 12, cd: 6 }),
  ammo_energy_cell: Object.freeze({ base: 14, cd: 7 }),
  ammo_gamma_round: Object.freeze({ base: 4, cd: 2 }),
  ammo_railway_spike: Object.freeze({ base: 6, cd: 3 }),
  ammo_syringe: Object.freeze({ base: 4, cd: 2 }),
  ammo_44_magnum: Object.freeze({ base: 4, cd: 2 }),
  ammo_50_cal: Object.freeze({ base: 4, cd: 2 }),
  ammo_5_56mm: Object.freeze({ base: 8, cd: 4 }),
  ammo_5mm: Object.freeze({ base: 12, cd: 6 }),
  ammo_fusion_core: Object.freeze({ base: 1, cd: 0 }),
  ammo_missile: Object.freeze({ base: 2, cd: 1 }),
  ammo_plasma_cartridge: Object.freeze({ base: 10, cd: 5 }),
  ammo_2mm_ec: Object.freeze({ base: 6, cd: 3 }),
  ammo_mini_nuke: Object.freeze({ base: 1, cd: 1 }),
  ammo_357_magnum: Object.freeze({ base: 6, cd: 3 }),
  ammo_12_7mm: Object.freeze({ base: 6, cd: 3 }),
  ammo_9mm: Object.freeze({ base: 10, cd: 5 }),
  ammo_50_ball: Object.freeze({ base: 4, cd: 2 }),
  ammo_25mm_grenade: Object.freeze({ base: 2, cd: 1 }),
  ammo_40mm_grenade: Object.freeze({ base: 2, cd: 1 }),
  ammo_alien_power_cell: Object.freeze({ base: 4, cd: 2 }),
  ammo_alien_power_module: Object.freeze({ base: 3, cd: 1 }),
  ammo_arrow: Object.freeze({ base: 6, cd: 4 }),
  ammo_bolt: Object.freeze({ base: 4, cd: 4 }),
  ammo_plasma_cartridge_alien: Object.freeze({ base: 1, cd: 0 }),
  ammo_cryo_cell: Object.freeze({ base: 12, cd: 6 }),
  ammo_acid_concentrate: Object.freeze({ base: 12, cd: 6 }),
  ammo_harpoon: Object.freeze({ base: 4, cd: 2 }),
  ammo_cannonball: Object.freeze({ base: 2, cd: 1 }),
  ammo_tranq_dart: Object.freeze({ base: 4, cd: 2 }),
  ammo_syringe_bloodpack: Object.freeze({ base: 4, cd: 2 }),
  ammo_tear_gas: Object.freeze({ base: 2, cd: 1 }),
  ammo_gas_grenade: Object.freeze({ base: 2, cd: 1 }),
  ammo_grappling_hook: Object.freeze({ base: 1, cd: 1 }),
  ammo_homemade: Object.freeze({ base: 10, cd: 5 }),
  ammo_anything: Object.freeze({ base: 12, cd: 6 }),

  // Специальные химические шприцы инъектора (штучные расходники)
  ammo_syringe_berserk: Object.freeze({ base: 1, cd: 0 }),
  ammo_syringe_bleed_out: Object.freeze({ base: 1, cd: 0 }),
  ammo_syringe_bloatfly_larva: Object.freeze({ base: 1, cd: 0 }),
  ammo_syringe_endangerol: Object.freeze({ base: 1, cd: 0 }),
  ammo_syringe_lock_joint: Object.freeze({ base: 1, cd: 0 }),
  ammo_syringe_mind_cloud: Object.freeze({ base: 1, cd: 0 }),
  ammo_syringe_pax: Object.freeze({ base: 1, cd: 0 }),
  ammo_syringe_radscorpion_venom: Object.freeze({ base: 1, cd: 0 }),
  ammo_syringe_yellow_belly: Object.freeze({ base: 1, cd: 0 }),
});

const FALLBACK_BY_RARITY = Object.freeze({
  0: Object.freeze({ base: 10, cd: 5 }),
  1: Object.freeze({ base: 6, cd: 3 }),
  2: Object.freeze({ base: 6, cd: 3 }),
  3: Object.freeze({ base: 4, cd: 2 }),
});

const DEFAULT_AMMO_FOUND = Object.freeze({ base: 2, cd: 1 });

export const isAmmoItem = (item) => {
  if (!item || typeof item !== 'object') return false;
  if (item.itemType === 'ammo') return true;
  if (item.itemSnapshot?.itemType === 'ammo') return true;
  const rawId = String(item.itemId || item.id || '');
  return rawId.startsWith('ammo_');
};

export const getAmmoFoundSpec = (itemOrId) => {
  if (itemOrId && typeof itemOrId === 'object') {
    const customFound = itemOrId.found || itemOrId.itemSnapshot?.found;
    if (customFound && typeof customFound === 'object') {
      const base = Math.max(0, Math.floor(Number(customFound.base) || 0));
      const cd = Math.max(0, Math.floor(Number(customFound.cd) || 0));
      if (base > 0 || cd > 0) return { base, cd };
    }
    const id = String(itemOrId.itemId || itemOrId.id || '').trim();
    if (id && AMMO_FOUND_BY_ID[id]) {
      return { ...AMMO_FOUND_BY_ID[id] };
    }
    const rarity = Number(itemOrId.rarity ?? itemOrId.itemSnapshot?.rarity);
    if (Number.isFinite(rarity) && rarity >= 0) {
      const bucket = FALLBACK_BY_RARITY[Math.floor(rarity)] || DEFAULT_AMMO_FOUND;
      return { ...bucket };
    }
    return { base: 6, cd: 3 };
  }

  const id = String(itemOrId || '').trim();
  if (id && AMMO_FOUND_BY_ID[id]) {
    return { ...AMMO_FOUND_BY_ID[id] };
  }
  return { base: 6, cd: 3 };
};

export const formatAmmoFoundFormula = (spec) => {
  const base = Math.max(0, Math.floor(Number(spec?.base) || 0));
  const cd = Math.max(0, Math.floor(Number(spec?.cd) || 0));
  if (cd <= 0) return `${Math.max(1, base)}`;
  if (base <= 0) return `${cd} CD`;
  return `${base} + ${cd} CD`;
};
