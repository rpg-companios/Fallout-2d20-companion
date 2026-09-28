// ПРИЁМОЧНЫЙ (патч 398): «загрузил старый сейв, в инвентаре оказался мод
// mod_043, но сейчас имена все другие. И никакого парсера не было в
// миграторе сейвов» (владелец). Мост 375 переводил appliedMods/modIds,
// но не каталог-id самого мод-предмета (поле weaponId) — старые моды
// из сумки оставались mod_NNN вне каталога, с голым id вместо имени.
// 398: weaponId проходит через ту же карту; оружие/робо-моды насквозь;
// идемпотентно; без подъёма версии схемы. Точка применения —
// deserializeState (src/saves/characterSaves.js), он уже зовёт мост.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  WEAPON_MOD_ID_MAP,
  migrateWeaponModIdsToCanonical,
} from '../../domain/weaponModCanonical';
import catalog from '../../modules/fallout/data/equipment/weapon_mods.json';

describe('патч 398: мод-предметы инвентаря канонизируются при загрузке', () => {
  it('репорт владельца: предмет с weaponId mod_043 получает канон-id из каталога', () => {
    const state = {
      items: {
        inst1: { weaponId: 'mod_043', qty: 1, name: 'whatever' },
        inst2: { weaponId: 'weapon_10mm_pistol', qty: 1 },
        inst3: { weaponId: 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_v' },
      },
    };
    const out = migrateWeaponModIdsToCanonical(state);
    expect(out.items.inst1.weaponId).toBe('mod_beta_wave_tuner');
    expect(out.items.inst2.weaponId).toBe('weapon_10mm_pistol');
    expect(out.items.inst3.weaponId).toBe('robot_weapon_mod_assaultron_head_laser_capacitor_mk_v');
    // канон-id реально существует в каталоге модов (имя оживёт)
    expect(catalog.some((m) => m.id === 'mod_beta_wave_tuner')).toBe(true);
  });

  it('слияние фантомов: разные старые носители дают один канон', () => {
    const out = migrateWeaponModIdsToCanonical({
      items: {
        a: { weaponId: 'mod_051' },
        b: { weaponId: 'mod_075' },
      },
    });
    expect(out.items.a.weaponId).toBe('mod_long_barrel');
    expect(out.items.b.weaponId).toBe('mod_long_barrel');
  });

  it('карта покрывает mod_043 и вообще все mod_NNN вида mod_0NN из репорта', () => {
    expect(WEAPON_MOD_ID_MAP['mod_043']).toBe('mod_beta_wave_tuner');
    expect(Object.keys(WEAPON_MOD_ID_MAP).length).toBeGreaterThanOrEqual(205);
  });

  it('идемпотентно; контейнеры 375 не сломаны', () => {
    const state = {
      items: { w: { weaponId: 'mod_043', appliedMods: { Receiver: 'mod_004' }, modIds: ['mod_030'] } },
    };
    const once = migrateWeaponModIdsToCanonical(state);
    expect(once.items.w).toEqual({
      weaponId: 'mod_beta_wave_tuner',
      appliedMods: { Receiver: 'mod_hardened' },
      modIds: ['mod_recoil_compensating_stock'],
    });
    const twice = migrateWeaponModIdsToCanonical(once);
    expect(twice.items.w).toEqual(once.items.w);
  });

  it('проводка: точка чтения сейва зовёт мост (без подъёма версии схемы)', () => {
    const src = readFileSync('src/saves/characterSaves.js', 'utf8');
    expect(src).toContain('migrateWeaponModIdsToCanonical(migrated)');
    expect(src).not.toMatch(/schemaVersion.*\+\s*1/);
  });
});
