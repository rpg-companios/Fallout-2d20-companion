// ПРИЁМОЧНЫЙ (патч 399): модель владельца «мод — осязаемая запись, а не
// два разных предмета» (контракт «бутылок»):
//   • на оружии ствол, в инвентаре 3 ствола — сверка по недостатку: ровно
//     недостающее связывается/создаётся; повторная загрузка НИКОГДА не
//     добавляет (анти-двоение — главное требование владельца);
//   • 3 оружия × (стволы/ложи/конденсаторы), одинаковые моды — каждый слот
//     получает свою связанную запись; безличность (никаких номеров в UI);
//   • продал оружие, не сняв моды — моды ушли вместе (344, единая точка);
//   • снял — вернулся в пачку без памяти, стек общий с купленными;
//   • кит = «пульт с батарейками»: моды из коробки — обычные записи;
//   • старый сейв (записей нет вовсе) — оживает при первой загрузке;
//   • броня (mod_std_*) и робо-моды (robot_weapon_mod_*) не тронуты.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

import { syncWeaponModInstances, robotWeaponHostKeyOf } from '../../domain/weaponModInstances';
import { robotWeaponHostKey } from '../../src/engine/items/weaponMods';
import { generateStackKey } from '../../domain/itemIdentity';
import { WEAPON_MOD_ID_MAP } from '../../domain/weaponModCanonical';
import catalog from '../../modules/fallout/data/equipment/weapon_mods.json';

const weaponModIds = new Set(catalog.map((m) => m.id));
const BARREL = 'mod_long_barrel';
const STOCK = 'mod_full_stock';
const CAP = 'mod_full_capacitors';

const clone = (value) => JSON.parse(JSON.stringify(value));

// Пример владельца: 3 оружия и одинаковые моды на них.
const ownerScenario = (bagMods = 2) => ({
  items: {
    w1: { id: 'w1', weaponId: 'weapon_10mm_pistol', itemType: 'weapon', appliedMods: { Receiver: BARREL, Capacitor: CAP } },
    w2: { id: 'w2', weaponId: 'weapon_hunting_rifle', itemType: 'weapon', appliedMods: { Receiver: BARREL, Stock: STOCK } },
    w3: { id: 'w3', weaponId: 'weapon_combat_rifle', itemType: 'weapon', appliedMods: { Receiver: BARREL, Stock: STOCK, Capacitor: CAP } },
    ...Object.fromEntries(Array.from({ length: bagMods }, (_, i) => (
      [`bag${i}`, { id: `bag${i}`, weaponId: BARREL, itemType: 'weaponMod', quantity: 1, equipped: false }
      ]))),
  },
});

const boundEntries = (state) => Object.entries(state.items).filter(([, i]) => i.installedOn);

describe('патч 399: мод — осязаемая запись; сверка по недостатку', () => {
  it('пример владельца: 7 ролей → 7 связанных записей, свободные из пачки уходят', () => {
    const state = ownerScenario(2);
    syncWeaponModInstances(state, weaponModIds);
    const bound = boundEntries(state);
    expect(bound.length).toBe(7);
    expect(bound.filter(([, i]) => i.weaponId === BARREL).length).toBe(3);
    expect(bound.filter(([, i]) => i.weaponId === STOCK).length).toBe(2);
    expect(bound.filter(([, i]) => i.weaponId === CAP).length).toBe(2);
    // пачка: обе свободные штуки ушли на роли
    expect(state.items.bag0.installedOn).toBeTruthy();
    expect(state.items.bag1.installedOn).toBeTruthy();
    // у связанной записи известен слот («мод знает, куда вставлен»)
    expect(bound.find(([, i]) => i.installedOn === 'w1' && i.weaponId === BARREL)[1].installedSlot).toBe('Receiver');
  });

  it('АНТИ-ДВОЕНИЕ: пять загрузок подряд — байт в байт', () => {
    let state = ownerScenario(0);
    for (let run = 0; run < 5; run += 1) {
      const before = clone(state.items);
      syncWeaponModInstances(state, weaponModIds);
      if (run > 0) expect(state.items).toEqual(before);
    }
    expect(boundEntries(state).length).toBe(7);
  });

  it('старый сейв (записей нет, сумка пуста): создаются ровно 7 записей, второй прогон — ничего', () => {
    const state = ownerScenario(0);
    syncWeaponModInstances(state, weaponModIds);
    expect(boundEntries(state).length).toBe(7);
    const snapshot = clone(state.items);
    syncWeaponModInstances(state, weaponModIds);
    expect(state.items).toEqual(snapshot);
    // созданная запись сливается в общую пачку при снятии (тот же stackKey)
    const created = boundEntries(state).find(([key]) => key.startsWith('inst-'));
    expect(created[1].stackKey).toBe(generateStackKey(BARREL));
  });

  it('лишняя связанная запись (задвоение из старого сейва) возвращается в пачку', () => {
    const state = ownerScenario(0);
    // На пару w1|BARREL претендуют двое: законная связка и дубль.
    state.items.primary = { id: 'primary', weaponId: BARREL, itemType: 'weaponMod', equipped: true, installedOn: 'w1', installedSlot: 'Receiver' };
    state.items.dupe = { id: 'dupe', weaponId: BARREL, itemType: 'weaponMod', equipped: true, installedOn: 'w1' };
    syncWeaponModInstances(state, weaponModIds);
    expect(state.items.dupe.installedOn).toBeUndefined();
    expect(state.items.dupe.equipped).toBe(false);
    // законная связка осталась, слот на ней не потерян
    expect(state.items.primary.installedOn).toBe('w1');
    expect(state.items.primary.installedSlot).toBe('Receiver');
    expect(boundEntries(state).filter(([, i]) => i.weaponId === BARREL && i.installedOn === 'w1').length).toBe(1);
  });

  it('осиротевшая запись (оружие продано) — в пачку без памяти о прошлом', () => {
    const state = { items: {
      ghost: { id: 'ghost', weaponId: BARREL, itemType: 'weaponMod', equipped: true, installedOn: 'sold-w9', installedSlot: 'Receiver' },
    } };
    syncWeaponModInstances(state, weaponModIds);
    expect(state.items.ghost.equipped).toBe(false);
    expect(state.items.ghost.installedOn).toBeUndefined();
    expect(state.items.ghost.installedSlot).toBeUndefined();
  });

  it('кит = пульт с батарейками: заводские моды становятся обычными записями', () => {
    const state = { items: {
      kitGun: { id: 'kitGun', weaponId: 'weapon_10mm_pistol', itemType: 'weapon', equipped: true, appliedMods: { Receiver: 'mod_hardened' } },
    } };
    syncWeaponModInstances(state, weaponModIds);
    const [key, entry] = boundEntries(state)[0];
    expect(entry.weaponId).toBe('mod_hardened');
    expect(entry.installedOn).toBe('kitGun');
    expect(entry.itemType).toBe('weaponMod');
    expect(key).toBeTruthy();
  });

  it('робо-слоты: ключ robotSlot:..., формат совпадает с движком; анти-двоение', () => {
    expect(robotWeaponHostKeyOf('leftArm', 'weapon_flamer')).toBe(robotWeaponHostKey('leftArm', 'weapon_flamer'));
    const state = { items: {}, robot: { slots: {
      leftArm: { heldWeapon: { weaponId: 'weapon_flamer', modIds: [BARREL] } },
    } } };
    syncWeaponModInstances(state, weaponModIds);
    const [, entry] = boundEntries(state)[0];
    expect(entry.installedOn).toBe(robotWeaponHostKey('leftArm', 'weapon_flamer'));
    const snapshot = clone(state.items);
    syncWeaponModInstances(state, weaponModIds);
    expect(state.items).toEqual(snapshot);
  });

  it('броня и робо-моды не тронуты', () => {
    const state = { items: {
      armorMod: { id: 'armorMod', weaponId: 'mod_std_boiled_leather', itemType: 'armorMod', equipped: true, installedOn: 'armor1' },
      roboMod: { id: 'roboMod', weaponId: 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_v', itemType: 'weaponMod', equipped: true, installedOn: 'robotSlot:leftArm:weapon_x' },
    } };
    const snapshot = clone(state.items);
    syncWeaponModInstances(state, weaponModIds);
    expect(state.items).toEqual(snapshot);
  });

  it('продал оружие, не сняв моды, — моды ушли вместе (единая точка 344, стор)', async () => {
    const storeModule = await import('../../src/store/characterStore');
    const useCharacterStore = storeModule.default;
    const state = () => useCharacterStore.getState();
    useCharacterStore.setState((prev) => ({
      items: {
        ...(prev.items || {}),
        w1: { id: 'w1', weaponId: 'weapon_10mm_pistol', itemType: 'weapon', quantity: 1, appliedMods: {} },
        m1: { id: 'm1', weaponId: 'mod_hardened', itemType: 'weaponMod', quantity: 1, equipped: false },
      },
    }));
    const key = state().installArmorMod({ modId: 'mod_hardened', hostKey: 'w1', slot: 'Receiver' });
    expect(key).toBe('m1');
    expect(state().items.m1.installedSlot).toBe('Receiver');
    state().adjustItemQuantity('w1', -1);
    expect(state().items.w1).toBeUndefined();
    expect(state().items.m1).toBeUndefined();
  });

  it('карта 375 покрывает репорт-мод; проводка: deserializeState зовёт сверку до ремонта 381', () => {
    expect(WEAPON_MOD_ID_MAP['mod_043']).toBe('mod_beta_wave_tuner');
    const src = readFileSync('src/saves/characterSaves.js', 'utf8');
    expect(src).toContain('syncWeaponModInstances(migrated, weaponModIds)');
    expect(src.indexOf('syncWeaponModInstances(migrated'))
      .toBeLessThan(src.indexOf('migrateRepairMisroutedWeaponMods(migrated'));
  });
});
