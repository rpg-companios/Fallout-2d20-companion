import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

// ─── helpers ────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..');

/** Recursively collect all .json files under a directory */
function collectJsonFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(full));
    } else if (entry.name.endsWith('.json')) {
      files.push(full);
    }
  }
  return files;
}

/** Return all keys (recursively) of a JSON value */
function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      keys.add(key);
      collectKeys(value[key], keys);
    }
  }
  return keys;
}

const CYRILLIC_RE = /[\u0400-\u04FF]/;

function hasCyrillicKey(value) {
  const keys = collectKeys(value);
  return [...keys].filter((k) => CYRILLIC_RE.test(k));
}

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

// ─── 1. data/ — no cyrillic keys ────────────────────────────────────────────

describe('data/ files — no cyrillic keys', () => {
  const dataDir = join(ROOT, 'data');
  const files = collectJsonFiles(dataDir);

  it('should have at least one data file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.replace(ROOT, '')} has no cyrillic keys`, () => {
      const json = loadJson(file);
      const bad = hasCyrillicKey(json);
      expect(bad, `Cyrillic keys found: ${bad.join(', ')}`).toHaveLength(0);
    });
  }
});

// ─── 2. i18n/ — no "Name" or "Название" keys ────────────────────────────────

describe('i18n/ files — no "Name" or "Название" keys', () => {
  const i18nDir = join(ROOT, 'i18n');
  // Only locale JSON files (ru-RU / en-EN), not .js files
  const files = [
    ...collectJsonFiles(join(i18nDir, 'ru-RU')),
    ...collectJsonFiles(join(i18nDir, 'en-EN')),
  ];

  it('should have at least one i18n file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.replace(ROOT, '')} has no "Name" or "Название" keys`, () => {
      const json = loadJson(file);
      const keys = collectKeys(json);
      const bad = [...keys].filter((k) => k === 'Name' || k === 'Название');
      expect(bad, `Legacy keys found: ${bad.join(', ')}`).toHaveLength(0);
    });
  }
});

// ─── 3. data/equipment/weapon_mods.json, armor_mods.json, uniq_armor_mods.json — no PascalCase legacy keys ────────────────

describe('data/equipment mods files — no legacy PascalCase keys', () => {
  const FORBIDDEN = ['Slot', 'Complexity', 'Perk 1', 'Perk 2', 'Skill', 'Rarity', 'Materials', 'Cost', 'Weight'];

  for (const file of ['weapon_mods.json', 'armor_mods.json', 'uniq_armor_mods.json']) {
    it(`${file} does not contain legacy PascalCase keys`, () => {
      const mods = loadJson(join(ROOT, `data/equipment/${file}`));
      const keys = collectKeys(mods);
      const bad = FORBIDDEN.filter((k) => keys.has(k));
      expect(bad, `Legacy keys found: ${bad.join(', ')}`).toHaveLength(0);
    });
  }
});

// ─── 4. getEquipmentCatalog() — weapons have non-empty name ─────────────────

describe('getEquipmentCatalog() — weapons have non-empty name', () => {
  it('every weapon has a non-empty string name', async () => {
    const { getEquipmentCatalog } = await import('../i18n/equipmentCatalog.js');
    const catalog = getEquipmentCatalog();
    const weapons = catalog.weapons || [];
    expect(weapons.length).toBeGreaterThan(0);
    const unnamed = weapons.filter((w) => typeof w.name !== 'string' || w.name.trim() === '');
    expect(unnamed, `Weapons without name: ${unnamed.map((w) => w.id).join(', ')}`).toHaveLength(0);
  });
});

// ─── 5. catalog items have "name", no "Название" ────────────────────────────
// (kitResolver.js cannot be imported in vitest because it transitively pulls
//  in react-native which uses Flow syntax. We verify the contract at the
//  catalog level instead — if catalog items have no "Название", kitResolver
//  cannot produce it either since it spreads catalog objects directly.)

describe('catalog items — name present, no Название', () => {
  it('all catalog weapons have name and no Название', async () => {
    const { getEquipmentCatalog } = await import('../i18n/equipmentCatalog.js');
    const catalog = getEquipmentCatalog();
    const weapons = catalog.weapons || [];
    expect(weapons.length).toBeGreaterThan(0);

    for (const item of weapons) {
      expect(typeof item.name).toBe('string');
      expect(Object.prototype.hasOwnProperty.call(item, 'Название')).toBe(false);
    }
  });

  it('all catalog ammoTypes have name and no Название', async () => {
    const { getEquipmentCatalog } = await import('../i18n/equipmentCatalog.js');
    const catalog = getEquipmentCatalog();
    const ammo = catalog.ammoTypes || [];
    expect(ammo.length).toBeGreaterThan(0);

    for (const item of ammo) {
      expect(typeof item.name).toBe('string');
      expect(Object.prototype.hasOwnProperty.call(item, 'Название')).toBe(false);
    }
  });
});

// ─── 6. armorMods — mechanics + i18n names ───────────────────────────────────

describe('getEquipmentCatalog() — armorMods have mechanics and i18n names', () => {
  it('every armorMod has a non-empty name and mechanic fields from data/', async () => {
    const { getEquipmentCatalog } = await import('../i18n/equipmentCatalog.js');
    const catalog = getEquipmentCatalog();
    const armorMods = catalog.armorMods || [];
    expect(armorMods.length).toBeGreaterThan(0);

    for (const mod of armorMods) {
      // i18n name must be present
      expect(typeof mod.name, `armorMod ${mod.id} missing name`).toBe('string');
      expect(mod.name.trim(), `armorMod ${mod.id} has empty name`).not.toBe('');
      // mechanic fields from data/ must be present
      expect(mod, `armorMod ${mod.id} missing complexity`).toHaveProperty('complexity');
      expect(mod, `armorMod ${mod.id} missing modType`).toHaveProperty('modType');
    }
  });
});
