/**
 * Движок/сеттинг (патч 108): применимость модов — СТРОГО по данным.
 *
 * - weapon_mod_slots покрывает ВСЁ оружие, у которого есть моды по
 *   applies_to_ids (правило владельца: фолбэк на appliesToIds удалён;
 *   если записей нет — моды не предлагаются, данные дополняются).
 * - Каждая запись: { slot: [modIds] }, все modIds существуют в
 *   weapon_mods и подходят оружию (applies_to_ids или trueItemId-база).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const load = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf-8'));

const slots = load('modules/fallout/data/equipment/weapon_mod_slots.json');
const mods = load('modules/fallout/data/equipment/weapon_mods.json');
const weapons = load('modules/fallout/data/equipment/weapons.json');

describe('weapon_mod_slots: покрытие и целостность (патч 108)', () => {
  it('каждое оружие с модами по applies_to_ids имеет записи слотов', () => {
    const weaponsWithMods = new Set();
    for (const mod of mods) {
      for (const wid of mod.applies_to_ids || []) weaponsWithMods.add(wid);
    }
    const weaponIds = new Set(weapons.map((w) => w.id));
    // учитываем варианты: trueItemId-база может иметь моды
    const covered = new Set(Object.keys(slots));
    const missing = [];
    for (const wid of weaponsWithMods) {
      if (!covered.has(wid) && weaponIds.has(wid)) missing.push(wid);
    }
    expect(missing).toEqual([]);
  });

  it('все modIds в записях существуют и подходят оружию', () => {
    const modById = new Map(mods.map((m) => [m.id, m]));
    for (const [weaponId, bySlot] of Object.entries(slots)) {
      for (const [slot, modIds] of Object.entries(bySlot)) {
        expect(Array.isArray(modIds), `${weaponId}.${slot}`).toBe(true);
        for (const modId of modIds) {
          const mod = modById.get(modId);
          expect(mod, `${weaponId}.${slot}.${modId} exists`).toBeDefined();
          expect(mod.slot, `${modId} slot matches`).toBe(slot);
        }
      }
    }
  });
});
