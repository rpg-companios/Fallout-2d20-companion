// ПРИЁМОЧНЫЙ (патч 333): снятие дублей-«материалов» синтов из общих модов.
//
// Что проверяет:
//   1. из данных общих модов убраны ровно три записи
//      (mod_std_laminate / mod_std_rubberized / mod_std_microcarbon),
//      а остальные 12 и все uniq_synth_* на месте;
//   2. миграция v25 → v26 аккуратно снимает ссылки на убранные id из
//      инвентаря, альбома modifiedItems и надетой брони — и НЕ трогает
//      другие моды (в т.ч. уникальные синтов и обычный mod_std_dense).

import { describe, expect, it } from 'vitest';

import armorMods from '../../modules/fallout/data/equipment/armor_mods.json';
import ruArmorMods from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/armor_mods.json';
import uniqArmorMods from '../../modules/fallout/data/equipment/uniq_armor_mods.json';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';
import { migrateCharacterState } from '../../src/store/migrations';

const REMOVED = ['mod_std_laminate', 'mod_std_rubberized', 'mod_std_microcarbon'];

describe('патч 333: дубли-«материалы» синтов убраны из общих модов', () => {
  it('в данных общих модов нет трёх дублей, остальное на месте', () => {
    for (const id of REMOVED) {
      expect(armorMods.some((m) => m.id === id), `${id} убран`).toBe(false);
      expect(ruArmorMods.some((m) => m.id === id), `${id} убран из ru`).toBe(false);
    }
    expect(armorMods.length).toBe(12);
    expect(ruArmorMods.length).toBe(12);
    // уникальные моды синтов не тронуты (все четыре «материала» на месте)
    for (const id of ['uniq_synth_laminated', 'uniq_synth_rubberized', 'uniq_synth_microcarbon', 'uniq_synth_nanofiber']) {
      expect(uniqArmorMods.some((m) => m.id === id), `${id} на месте`).toBe(true);
    }
  });

  it('миграция v25→v26 снимает ссылки на дубли и не трогает остальные', () => {
    const save = {
      schemaVersion: 25,
      inventory: [
        { id: 'armor_leather', itemType: 'armor', appliedArmorModId: 'mod_std_laminate' },
        { id: 'clothes_casual', itemType: 'clothing', appliedClothingModId: 'mod_std_microcarbon' },
        { id: 'armor_metal', itemType: 'armor', appliedArmorModId: 'mod_std_dense' }, // живой общий мод — остаётся
        { id: 'armor_synth', itemType: 'armor', appliedUniqueArmorModId: 'uniq_synth_laminated' }, // уникальный — остаётся
      ],
      modifiedItems: {
        armor_leather: { id: 'armor_leather', appliedArmorMod: { id: 'mod_std_rubberized' } },
      },
      equippedArmor: { id: 'armor_leather_2', appliedArmorModId: 'mod_std_laminate' },
    };

    const migrated = migrateCharacterState(save);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(26);

    const [lam, micro, dense, synth] = migrated.inventory;
    expect(lam.appliedArmorModId).toBeUndefined(); // дубль снят
    expect(micro.appliedClothingModId).toBeUndefined(); // дубль снят с одежды
    expect(dense.appliedArmorModId).toBe('mod_std_dense'); // живой мод не тронут
    expect(synth.appliedUniqueArmorModId).toBe('uniq_synth_laminated'); // уникальный не тронут
    expect(migrated.modifiedItems.armor_leather.appliedArmorMod).toBeUndefined();
    expect(migrated.equippedArmor.appliedArmorModId).toBeUndefined();
  });

  it('миграция идемпотентна: повторный прогон ничего не ломает', () => {
    const save = {
      schemaVersion: 25,
      inventory: [{ id: 'armor_leather', itemType: 'armor', appliedArmorModId: 'mod_std_laminate' }],
    };
    const once = migrateCharacterState(save);
    expect(once.inventory[0].appliedArmorModId).toBeUndefined();
    expect(migrateCharacterState(once).inventory[0].appliedArmorModId).toBeUndefined();
  });
});
