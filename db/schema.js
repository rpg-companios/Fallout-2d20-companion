export const SCHEMA_VERSION = 8;

export const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS weapons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    weapon_type TEXT NOT NULL,
    damage INTEGER,
    damage_effects TEXT,
    damage_type TEXT,
    fire_rate TEXT,
    qualities TEXT,
    weight TEXT,
    cost TEXT,
    rarity TEXT,
    ammo_id TEXT,
    range TEXT,
    range_name TEXT,
    main_attr TEXT,
    main_skill TEXT,
    rules TEXT,
    flavour TEXT,
    mods_config TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS weapon_mods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT,
    slot TEXT NOT NULL,
    complexity INTEGER,
    perk_1 TEXT,
    perk_2 TEXT,
    skill TEXT,
    rarity TEXT,
    materials TEXT,
    cost INTEGER,
    effects TEXT,
    effect_description TEXT,
    weight TEXT,
    applies_to_ids TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS weapon_mod_slots (
    weapon_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    mod_id TEXT NOT NULL,
    PRIMARY KEY (weapon_id, slot, mod_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ammo_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rarity TEXT,
    cost TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS weapon_qualities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    effect TEXT,
    opposite TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS perks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    perk_name TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 1,
    max_rank INTEGER NOT NULL DEFAULT 1,
    requirements TEXT,
    description TEXT,
    level_increase INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_subtype TEXT,
    phys_dr INTEGER,
    energy_dr INTEGER,
    rad_dr INTEGER,
    protected_area TEXT,
    clothing_type TEXT,
    find_formula TEXT,
    weight TEXT,
    price TEXT,
    rarity TEXT,
    category TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    origin_name TEXT,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS perk_effects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    perk_name TEXT NOT NULL,
    perk_rank INTEGER NOT NULL DEFAULT 1,
    target_type TEXT NOT NULL,
    target_id TEXT,
    condition_field TEXT,
    condition_op TEXT,
    condition_value TEXT,
    effect_field TEXT,
    effect_op TEXT,
    effect_value TEXT,
    notes TEXT
  )`,
];
