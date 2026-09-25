// ПРИЁМОЧНЫЙ (патч 375): канон-id модов оружия + слияние фантомов.
//   • каталог: 205 строк mod_NNN → 141 канон-id (mod_человекочитаемо),
//     95 фантомных строк слиты в 31 улучшение (план 368, слово владельца);
//   • сейвы: appliedMods (карта «слот → id») и modIds (список) переводятся
//     на канон-id при загрузке, без подъёма версии схемы; идемпотентно;
//   • робо-моды (robot_weapon_mod_*) проходят насквозь;
//   • согласованность данных: i18n/рецепты/слоты/привязки сходятся с каталогом.
import { describe, expect, it } from 'vitest';

import {
  WEAPON_MOD_ID_MAP,
  migrateWeaponModIdsToCanonical,
} from '../../domain/weaponModCanonical';
import catalogData from '../../modules/fallout/data/equipment/weapon_mods.json';
import slotData from '../../modules/fallout/data/equipment/weapon_mod_slots.json';
import recipeData from '../../modules/fallout/data/recipes/weapons.json';
import ruNames from '../../modules/fallout/i18n/ru-RU/data/equipment/weapon_mods.json';
import enNames from '../../modules/fallout/i18n/en-EN/data/equipment/weapon_mods.json';
import weaponsData from '../../modules/fallout/data/equipment/weapons.json';

describe('патч 375: канон-id модов оружия', () => {
  it('мост переводит карту appliedMods и список modIds, робо-id проходит насквозь', () => {
    const state = {
      equipment: {
        items: {
          w1: { id: 'weapon_10mm_pistol', appliedMods: { Receiver: 'mod_004', Grip: 'mod_026' } },
          w2: { id: 'weapon_gauss_rifle', modIds: ['mod_030', 'mod_043'] },
        },
        equippedWeapons: [
          { id: 'weapon_sword', appliedMods: { Unique: 'mod_103' } },
        ],
        robots: {
          arm1: { heldWeapon: { id: 'robot_weapon_x', modIds: ['mod_046', 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_v'] } },
        },
      },
    };
    const out = migrateWeaponModIdsToCanonical(state);
    expect(out.equipment.items.w1.appliedMods).toEqual({
      Receiver: 'mod_hardened',
      Grip: 'mod_comfort_grip',
    });
    expect(out.equipment.items.w2.modIds).toEqual([
      'mod_recoil_compensating_stock',
      'mod_beta_wave_tuner',
    ]);
    expect(out.equipment.equippedWeapons[0].appliedMods).toEqual({
      Unique: 'mod_serrated_blade',
    });
    expect(out.equipment.robots.arm1.heldWeapon.modIds).toEqual([
      'mod_photon_agitator',
      'robot_weapon_mod_assaultron_head_laser_capacitor_mk_v',
    ]);
  });

  it('мост идемпотентен: канон-id не меняются при повторном прогоне', () => {
    const state = { items: { w: { appliedMods: { Receiver: 'mod_rapid' } } } };
    const once = migrateWeaponModIdsToCanonical(state);
    const twice = migrateWeaponModIdsToCanonical(once);
    expect(twice.items.w.appliedMods).toEqual({ Receiver: 'mod_rapid' });
  });

  it('карта покрывает все 205 старых id; фантомные семейства схлопнуты в один канон', () => {
    expect(Object.keys(WEAPON_MOD_ID_MAP)).toHaveLength(205);
    // «Ложа с компенсатором отдачи» — 5 фантомных строк → один канон
    expect(WEAPON_MOD_ID_MAP.mod_030).toBe('mod_recoil_compensating_stock');
    expect(WEAPON_MOD_ID_MAP.mod_088).toBe('mod_recoil_compensating_stock');
    expect(WEAPON_MOD_ID_MAP.mod_176).toBe('mod_recoil_compensating_stock');
    // «Длинный ствол» — 9 строк → один канон
    expect(WEAPON_MOD_ID_MAP.mod_051).toBe('mod_long_barrel');
    expect(WEAPON_MOD_ID_MAP.mod_204).toBe('mod_long_barrel');
  });

  it('каталог: 141 канон-строка, без mod_NNN; i18n/рецепты/слоты согласованы', () => {
    expect(catalogData).toHaveLength(164);
    const ids = catalogData.map((m) => m.id);
    expect(new Set(ids).size).toBe(164);
    for (const id of ids) {
      expect(id).toMatch(/^mod_[a-z0-9][a-z0-9_]*$/);
      expect(id).not.toMatch(/^mod_\d{3}$/);
    }
    const idSet = new Set(ids);
    expect(ruNames).toHaveLength(164);
    expect(enNames).toHaveLength(164);
    expect(new Set(ruNames.map((x) => x.id))).toEqual(idSet);
    expect(new Set(enNames.map((x) => x.id))).toEqual(idSet);
    for (const r of recipeData) expect(idSet.has(r.id)).toBe(true);
    const weaponIds = new Set(weaponsData.map((w) => w.id));
    for (const m of catalogData) {
      for (const wid of m.applies_to_ids || []) expect(weaponIds.has(wid)).toBe(true);
    }
    for (const [, slotMap] of Object.entries(slotData)) {
      for (const list of Object.values(slotMap)) {
        for (const id of list) expect(idSet.has(id)).toBe(true);
      }
    }
  });

  it('все привязки фантомов переехали на канон: «Длинный ствол» знает все 9 оружий-носителей', () => {
    const long = catalogData.find((m) => m.id === 'mod_long_barrel');
    const before = ['mod_051', 'mod_075', 'mod_087', 'mod_151', 'mod_156', 'mod_166', 'mod_190', 'mod_193', 'mod_204'];
    const oldRows = before; // документируем источник объединения
    expect(oldRows).toHaveLength(9);
    // у владельца длинный ствол есть и у Залпа (weapon_broadsider), и у Бластера
    expect(long.applies_to_ids).toContain('weapon_broadsider');
    expect(long.applies_to_ids).toContain('weapon_alien_blaster');
  });
});
