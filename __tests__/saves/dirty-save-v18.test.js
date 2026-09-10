// Регресс-фикстура «грязного» сейва (реальный экспорт персонажа Minuteman,
// schemaVersion 18, обезличен). Такой сейв ДОЛЖЕН загружаться как положено:
//
//  - навыки уже канонические ключи (мост migrateSkillsToCanonical — no-op),
//    а legacy-сейвы с русскими именами («Ремонт») канонизируются на загрузке;
//  - в equipment.items болтается «призрак» встроенного кулака
//    (unarmed_human, isBuiltin, без instanceId) — артефакт старого флоу
//    выдачи комплекта; конвейер должен его ТЕРПЕТЬ, не падая;
//  - caps — персистентный контракт (рантайм-имя currency, поле сейва caps);
//  - мёртвые производные (carryWeight/initiative/…) игнорируются конвейером
//    и осыпаются при следующем сохранении;
//  - жирные предметы (имена/статы/imageName в файле) — норма для v18
//    (слайм начался с v19): каталог на загрузке восстанавливает их заново.
//
// Дополнительно фиксируется НОВЫЙ слим экспорта (патч 225): slimSaveData →
// restoreSaveData на этом же сейве — круговой рейс без потерь имени.

import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dirty-save-v18.json';
import { migrateCharacterState } from '../../src/store/migrations';
import { restoreSaveData, slimSaveData } from '../../domain/saveSlimming';
import { resolveItem, findCatalogEntry } from '../../domain/resolveItem';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { setCurrentModuleLocale } from '../../i18n/locale';
import { migrateSkillsToCanonical } from '../../domain/skillCanonical';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

const withCatalog = (fn) => {
  setCurrentModuleLocale('ru-RU');
  const catalog = getEquipmentCatalog('ru-RU');
  expect(catalog).toBeTruthy();
  return fn(catalog);
};

describe('фикстура грязного сейва v18: конвейер загрузки', () => {
  it('миграции v18 → текущая: без потерь, навыки/крышки/призрак на месте', () => {
    const migrated = migrateCharacterState(fixture);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Навыки канонические, значения не тронуты.
    expect(migrated.skills).toHaveLength(17);
    expect(migrated.skills.find((s) => s.name === 'REPAIR')?.value).toBe(0);
    expect(migrated.skills.find((s) => s.name === 'SPEECH')?.value).toBe(2);

    // Персистентный контракт: caps остаётся caps.
    expect(migrated.caps).toBe(5);

    // «Призрак» кулака в комплекте терпится (не роняет конвейер).
    const ghost = migrated.equipment?.items?.find((item) => item.id === 'unarmed_human');
    expect(ghost?.isBuiltin).toBe(true);

    // Комплект без id — поле name сохраняется (деградация дисплея — отдельный слой).
    expect(migrated.equipment?.name).toBe('Застрельщик Минитмен');
  });

  it('восстановление из каталога: имена возвращаются по id, стаб без записи не ломается', () => {
    withCatalog((catalog) => {
      const migrated = migrateCharacterState(fixture);
      const restored = restoreSaveData(migrated, {
        resolve: (item) => {
          try { return resolveItem(item, catalog); } catch (e) { return item; }
        },
      });

      const clothes = restored.equipment.items.find((i) => i.id === 'clothing_casual_clothes');
      const entry = findCatalogEntry(catalog, 'clothing_casual_clothes', 'clothing');
      expect(entry).toBeTruthy();
      // Имя пришло из каталога (совпадает с записью), не из сейва.
      expect(clothes.name).toBe(entry.name);

      // Стаб (trinkets_stub_2) без каталожной записи остаётся как есть.
      const stub = restored.equipment.items.find((i) => i.id === 'trinkets_stub_2');
      expect(stub.name).toBe('Заглючивший голодиск');
    });
  });

  it('новый слим экспорта: slim → restore на этом сейве — круговой рейс без потерь', () => {
    withCatalog((catalog) => {
      const migrated = migrateCharacterState(fixture);
      const slimmed = slimSaveData(migrated, {
        getEntry: (id, itemType) => {
          try { return findCatalogEntry(catalog, id, itemType); } catch (e) { return null; }
        },
      });
      // Слайм выкинул каталог-владельческое имя у обычной одежды...
      const slimClothes = slimmed.equipment.items.find((i) => i.id === 'clothing_casual_clothes');
      expect(slimClothes.name).toBeUndefined();
      // ...но НЕ тронул стаб (каталог им не владеет).
      const slimStub = slimmed.equipment.items.find((i) => i.id === 'trinkets_stub_2');
      expect(slimStub.name).toBe('Заглючивший голодиск');
      // Состояние экземпляра переживает слайм.
      const slimAmmo = slimmed.equipment.items.find((i) => i.id === 'ammo_shotgun_shell');
      expect(slimAmmo.quantity).toBe(5);

      // И полный круг: restore возвращает имя из каталога.
      const restored = restoreSaveData(slimmed, {
        resolve: (item) => {
          try { return resolveItem(item, catalog); } catch (e) { return item; }
        },
      });
      expect(restored.equipment.items.find((i) => i.id === 'clothing_casual_clothes').name)
        .toBe(findCatalogEntry(catalog, 'clothing_casual_clothes', 'clothing').name);
    });
  });
});

describe('мост канонизации навыков (domain/skillCanonical)', () => {
  it('legacy русские имена → канонические ключи', () => {
    const result = migrateSkillsToCanonical([
      { name: 'Ремонт', value: 2 },
      { name: 'Красноречие', value: 0 },
    ]);
    expect(result.map((s) => s.name)).toEqual(['REPAIR', 'SPEECH']);
    expect(result[0].value).toBe(2);
  });

  it('канонический сейв проходит насквозь (no-op), не-массив → null', () => {
    const canonical = [{ name: 'REPAIR', value: 3 }];
    expect(migrateSkillsToCanonical(canonical)).toEqual(canonical);
    expect(migrateSkillsToCanonical('мусор')).toBeNull();
    expect(migrateSkillsToCanonical(null)).toBeNull();
  });
});
