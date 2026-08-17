/**
 * Правило владельца: смена ориджина/трейта/комплекта.
 *
 * - locked = attributesSaved || skillsSaved (после распределения).
 * - До locked: смена свободна, без подтверждения; комплект сбрасывается
 *   вместе с ориджином.
 * - После locked: смена ориджина/трейта — полный сброс персонажа; смена
 *   комплекта — сброс инвентаря, навыков и наград (атрибуты сохраняются).
 * - Просмотр списков свободен всегда.
 */
import { describe, it, expect } from 'vitest';
import { isCharacterLocked } from '../../domain/characterCreation';
import useCharacterStore from '../../src/store/characterStore';
import { mergeEquipmentWithStore, mergeEquippedWeapons, migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

describe('isCharacterLocked (точка невозврата)', () => {
  it('не зафиксирован, пока ничего не распределено', () => {
    expect(isCharacterLocked(false, false)).toBe(false);
  });

  it('зафиксирован после распределения атрибутов', () => {
    expect(isCharacterLocked(true, false)).toBe(true);
  });

  it('зафиксирован после распределения навыков', () => {
    expect(isCharacterLocked(false, true)).toBe(true);
  });

  it('зафиксирован при обоих', () => {
    expect(isCharacterLocked(true, true)).toBe(true);
  });
});

describe('resetKitAndRewards (сброс комплекта)', () => {
  it('очищает инвентарь/награды, сохраняя атрибуты и навыки стора', () => {
    // resetKitAndRewards в контексте вызывает resetCharacterStore с текущими
    // attributes/skills и rewardedSkills: []. Проверяем контракт resetCharacterStore.
    useCharacterStore.getState().resetCharacterStore({
      attributes: [{ name: 'STR', value: 7 }],
      skills: [{ name: 'SMALL_GUNS', value: 2 }],
      rewardedSkills: ['SMALL_GUNS'],
    });
    useCharacterStore.getState().addNewItem({ weaponId: 'weapon_10mm_pistol', itemType: 'weapon', name: 'x' });
    expect(Object.keys(useCharacterStore.getState().items)).toHaveLength(1);

    // Симуляция resetKitAndRewards: те же атрибуты/навыки, rewardedSkills: []
    useCharacterStore.getState().resetCharacterStore({
      attributes: [{ name: 'STR', value: useCharacterStore.getState().attributes.STR.base }],
      skills: [{ name: 'SMALL_GUNS', value: useCharacterStore.getState().skills.SMALL_GUNS.base }],
      rewardedSkills: [],
    });

    expect(Object.keys(useCharacterStore.getState().items)).toHaveLength(0);
    expect(useCharacterStore.getState().rewardedSkills).toEqual([]);
    expect(useCharacterStore.getState().attributes.STR.base).toBe(7);
    expect(useCharacterStore.getState().skills.SMALL_GUNS.base).toBe(2);
  });
});

describe('mergeEquipmentWithStore (сохранение комплекта)', () => {
  it('сохраняет метаданные комплекта из снапшота и items из стора', () => {
    const snapshotEquipment = {
      id: 'securitron_standard',
      name: 'Секьюритрон',
      weight: 10,
      price: 20,
      items: [{ id: 'weapon_laser_gun', name: 'Лазерный пистолет' }],
    };
    const storeEquipment = {
      items: [
        { id: 'weapon_laser_gun' },
        { id: 'weapon_missile_launcher' },
        { id: 'ammo_energy_cell' },
      ],
    };
    const merged = mergeEquipmentWithStore(snapshotEquipment, storeEquipment);
    expect(merged.id).toBe('securitron_standard');
    expect(merged.name).toBe('Секьюритрон');
    // items — из стора (не теряются купленные/добавленные)
    expect(merged.items.map((i) => i.id).sort()).toEqual([
      'ammo_energy_cell', 'weapon_laser_gun', 'weapon_missile_launcher',
    ]);
  });

  it('без выбранного комплекта: null, если предметов нет', () => {
    expect(mergeEquipmentWithStore(null, { items: [] })).toBeNull();
  });

  it('без выбранного комплекта: {items} из стора (лут/купленное не теряется)', () => {
    const merged = mergeEquipmentWithStore(null, { items: [{ id: 'chem_stimpak' }] });
    expect(merged).toEqual({ items: [{ id: 'chem_stimpak' }] });
  });
});

describe('mergeEquippedWeapons (не теряем встроенное оружие)', () => {
  it('объединяет снапшот и стор по id, без дублей', () => {
    const snapshot = [{ id: 'unarmed_human', isBuiltin: true }, { id: 'weapon_laser_gun' }];
    const store = [{ id: 'weapon_laser_gun' }, { id: 'weapon_missile_launcher' }];
    const merged = mergeEquippedWeapons(snapshot, store);
    expect(merged.map((w) => w.id).sort()).toEqual([
      'unarmed_human', 'weapon_laser_gun', 'weapon_missile_launcher',
    ]);
  });

  it('снапшот-метаданные (кулаки) не затираются', () => {
    const merged = mergeEquippedWeapons([{ id: 'unarmed_human', isBuiltin: true }], []);
    expect(merged).toEqual([{ id: 'unarmed_human', isBuiltin: true }]);
  });
});

describe('Миграция v4→v5: восстановление комплекта в старых сейвах', () => {

  it('ставит заглушку (id=null), если предметы есть, а комплект неизвестен', () => {
    const state = {
      schemaVersion: 4,
      origin: { id: 'securitron' },
      equipment: {
        items: [
          { itemId: 'robot_item_printer' },
          { weaponId: 'weapon_laser_gun' },
          { weaponId: 'weapon_missile_launcher' },
        ],
      },
      equippedWeapons: [],
      rewardedSkills: [],
    };
    const migrated = migrateCharacterState(state);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.equipment.id).toBeNull();
    // Предметы на месте — снаряжение не потеряно
    expect(migrated.equipment.items).toHaveLength(3);
  });

  it('не трогает сейв, где id уже есть', () => {
    const state = {
      schemaVersion: 4,
      origin: { id: 'brotherhood' },
      equipment: { id: 'brotherhood_initiate', name: 'Initiate', items: [{ weaponId: 'weapon_laser_gun' }] },
    };
    const migrated = migrateCharacterState(state);
    expect(migrated.equipment.id).toBe('brotherhood_initiate');
    expect(migrated.equipment.name).toBe('Initiate');
  });

  it('без предметов — не трогает (не ломает данные)', () => {
    const state = { schemaVersion: 4, equipment: { items: [] } };
    const migrated = migrateCharacterState(state);
    expect(migrated.equipment.id).toBeUndefined();
  });
});
