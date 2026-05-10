#!/usr/bin/env node
// Marks weapons that have no mod slots with "withoutMods": true
// Sources: weapon_mod_slots.json (explicit slots) + weapon_mods.json (applies_to_ids)
// Run: node scripts/markWeaponsWithoutMods.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FILES = [
  'data/equipment/weapons.json',
  'data/equipment/robot/weapons.json',
];

// Source 1: weapon_mod_slots.json — explicit slot assignments
const modSlots = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/equipment/weapon_mod_slots.json'), 'utf8')
);

// Source 2: weapon_mods.json — applies_to_ids on each mod
const weaponMods = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/equipment/weapon_mods.json'), 'utf8')
);

// Build set of weapon ids that have at least one mod
const weaponsWithMods = new Set();

// From weapon_mod_slots.json (non-empty slot objects)
for (const [weaponId, slots] of Object.entries(modSlots)) {
  if (Object.keys(slots).length > 0) {
    weaponsWithMods.add(weaponId);
  }
}

// From weapon_mods.json applies_to_ids
for (const mod of weaponMods) {
  for (const weaponId of (mod.applies_to_ids || [])) {
    weaponsWithMods.add(weaponId);
  }
}

console.log(`Weapons with mods: ${weaponsWithMods.size}`);

let totalMarked = 0;
let totalCleared = 0;

for (const file of FILES) {
  const filePath = path.join(ROOT, file);
  const weapons = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let changed = false;
  for (const weapon of weapons) {
    const hasMods = weaponsWithMods.has(weapon.id);
    if (!hasMods && !weapon.withoutMods) {
      weapon.withoutMods = true;
      changed = true;
      totalMarked++;
      console.log(`  + withoutMods: ${weapon.id}`);
    } else if (hasMods && weapon.withoutMods) {
      delete weapon.withoutMods;
      changed = true;
      totalCleared++;
      console.log(`  - removed withoutMods: ${weapon.id}`);
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(weapons, null, 2), 'utf8');
    console.log(`Saved: ${file}`);
  } else {
    console.log(`No changes: ${file}`);
  }
}

console.log(`\nDone. Marked: ${totalMarked}, Cleared: ${totalCleared}.`);

// TODO: проверить и добавить моды для этих оружий в weapon_mods.json / weapon_mod_slots.json:
// - weapon_fat_man (Толстяк) — возможно есть уникальные моды
// - weapon_heavy_incinerator (Тяжёлый инсенератор) — точно есть моды
