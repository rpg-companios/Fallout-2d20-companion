// src/store/migrations.js
// Минимальные миграционные функции для перехода к нормализованному формату

import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from './saveSchema';
import { catalogGetWeaponModById } from '../../db/catalogSource';
import { getPerks, getSettingService } from '../../domain/registry';
import { trimSelectedPerksToMaxRanks } from '../../domain/perks';
import { getRegisteredStateMigrations } from './stateExtensions';
import { effectsDictToLegacyArray, legacyEffectsArrayToStore } from './effectsSync.js';
import { debugLog } from '../engine/debug/runtimeTrace.js';

const getSettingItemParameterFields = () => {
  const fields = getSettingService('inventory')?.itemParameterFields;
  return Array.isArray(fields) ? fields.filter((field) => typeof field === 'string') : [];
};

const normalizeSettingItemParameters = (normalizedItem, sourceItem) => {
  for (const field of getSettingItemParameterFields()) {
    if (sourceItem?.[field] === undefined) continue;
    normalizedItem[field] = typeof sourceItem[field] === 'number'
      ? { base: sourceItem[field], modifiers: [], total: sourceItem[field] }
      : sourceItem[field];
  }
  return normalizedItem;
};

/**
 * Преобразует атрибуты из старого формата [{name, value}] в словарь
 */
export const normalizeAttributes = (attributesArray = []) => {
  const result = {};
  
  attributesArray.forEach(attr => {
    if (!attr?.name) return;
    
    const attrName = attr.name.toUpperCase();
    result[attrName] = {
      id: attrName,
      base: Number(attr.value) || 0,
      modifiers: [],
      total: Number(attr.value) || 0,
    };
  });
  
  return result;
};

/**
 * Преобразует навыки из старого формата [{name, value}] в словарь
 */
export const normalizeSkills = (skillsArray = []) => {
  const result = {};
  
  skillsArray.forEach(skill => {
    if (!skill?.name) return;
    
    result[skill.name] = {
      id: skill.name,
      base: Number(skill.value) || 0,
      modifiers: [],
      total: Number(skill.value) || 0,
    };
  });
  
  return result;
};

/**
 * Преобразует предметы из старого формата (массив) в словарь
 * Объединяет equipment.items и equippedWeapons в один словарь
 * 
 * ID предметов берется из item.id (человекопонятный ID из catalog:
 * - оружие: 'weapon_10mm_pistol'
 * - броня: 'armor_leather_chest_001'
 * - одежда: 'leatherArmor_chest'
 * - consumable: a setting-declared catalog id
 * - и т.д.)
 */
export const normalizeItems = (equipment = {}, equippedWeapons = []) => {
  const result = {};
  
  // Сохраняем ВСЕ поля предмета при загрузке из БД — каталожные данные
  // (вес/цена/эффект/имя) всё равно обогащаются на отображении через
  // resolveItem по id, но сам инстанс обязан пройти сейв↔загрузку без потерь.
  //
  // Прежний короткий fieldsToCopy срезал weight/cost/qualities/effects/
  // fire_rate/baseWeaponName/positiveEffect/hpHealed/value и т.д. — отсюда
  // «вес/цена 0» у предметов и слёт пересчитанных статов модов оружия после
  // перезагрузки персонажа из БД. Каталог = источник истины; инстанс — без потерь.
  const copyItemFields = (item) => (item && typeof item === 'object' ? { ...item } : {});
  
  // Обычные предметы из инвентаря
  const inventoryItems = equipment?.items || [];
  inventoryItems.forEach(item => {
    if (!item) return;
    
    // ID предмета — предпочитаем item.id, но принимаем любой доступный идентификатор
    const itemId = item.id || item.weaponId || item.itemId || item.armorId || item.clothingId || item.code;
    if (!itemId) return;
    
    // Determine if item is equipped (для брони/одежды в equipment.items)
    const isEquipped = item.equipped === true || Boolean(item.equipInstanceId);
    
    // Создаем объект с минимальным набором полей
    const normalizedItem = {
      ...copyItemFields(item),
      id: itemId,
      equipped: isEquipped,
    };
    
    // Преобразуем простые поля в нормализованные параметры
    if (item.damage !== undefined) {
      normalizedItem.damage = typeof item.damage === 'number' 
        ? { base: item.damage, modifiers: [], total: item.damage }
        : item.damage;
    }
    if (item.fireRate !== undefined) {
      normalizedItem.fireRate = typeof item.fireRate === 'number' 
        ? { base: item.fireRate, modifiers: [], total: item.fireRate }
        : item.fireRate;
    }
    normalizeSettingItemParameters(normalizedItem, item);
    
    result[itemId] = normalizedItem;
  });
  
  // Экипированное оружие
  equippedWeapons.forEach(item => {
    if (!item) return;
    
    // ID предмета — предпочитаем item.id, но принимаем любой доступный идентификатор
    const itemId = item.id || item.weaponId || item.itemId || item.armorId || item.clothingId || item.code;
    if (!itemId) return;
    
    // Если предмет уже есть в словаре (из equipment.items), обновляем его
    if (result[itemId]) {
      result[itemId] = {
        ...result[itemId],
        equipped: true,
      };
    } else {
      // Создаем объект с минимальным набором полей
      const normalizedItem = {
        ...copyItemFields(item),
        id: itemId,
        equipped: true,
      };
      
      // Преобразуем простые поля в нормализованные параметры
      if (item.damage !== undefined) {
        normalizedItem.damage = typeof item.damage === 'number' 
          ? { base: item.damage, modifiers: [], total: item.damage }
          : item.damage;
      }
      if (item.fireRate !== undefined) {
        normalizedItem.fireRate = typeof item.fireRate === 'number' 
          ? { base: item.fireRate, modifiers: [], total: item.fireRate }
          : item.fireRate;
      }
      normalizeSettingItemParameters(normalizedItem, item);
      
      result[itemId] = normalizedItem;
    }
  });
  
  return result;
};

/**
 * Преобразует эффекты из старого формата в словарь
 */
export const normalizeEffects = (activeTimedEffects = []) =>
  legacyEffectsArrayToStore(activeTimedEffects);

/**
 * Основная функция нормализации для загрузки данных из БД
 * Alias for normalizeForStore to match naming convention
 */
export const normalizeCharacterState = (data = {}) => {
  return normalizeForStore(data);
};

/**
 * Основная функция нормализации для загрузки данных из БД
 */
export const normalizeForStore = (data = {}) => {
  return {
    attributes: normalizeAttributes(data.attributes),
    skills: normalizeSkills(data.skills),
    items: normalizeItems(data.equipment, data.equippedWeapons),
    effects: normalizeEffects(data.activeTimedEffects),
    rewardedSkills: Array.isArray(data.rewardedSkills) ? data.rewardedSkills : [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
};

/**
 * Преобразует нормализованные атрибуты обратно в массив для базы данных
 */
export const denormalizeAttributes = (attributesDict = {}) => {
  return Object.values(attributesDict).map(attr => ({
    name: attr.id,
    value: attr.base,
  }));
};

/**
 * Преобразует нормализованные навыки обратно в массив для базы данных
 */
export const denormalizeSkills = (skillsDict = {}) => {
  return Object.values(skillsDict).map(skill => ({
    name: skill.id,
    value: skill.base,
  }));
};

/**
 * Преобразует нормализованные предметы обратно в разделенные массивы
 */
export const denormalizeItems = (itemsDict = {}) => {
  const equipment = { items: [] };
  const equippedWeapons = [];
  
  Object.values(itemsDict).forEach(item => {
    const simpleItem = { ...item };
    
    // Убираем нормализованные параметры
    delete simpleItem.modifiers;
    if (simpleItem.damage && typeof simpleItem.damage === 'object') {
      simpleItem.damage = simpleItem.damage.base;
    }
    if (simpleItem.fireRate && typeof simpleItem.fireRate === 'object') {
      simpleItem.fireRate = simpleItem.fireRate.base;
    }
    for (const field of getSettingItemParameterFields()) {
      if (simpleItem[field] && typeof simpleItem[field] === 'object') {
        simpleItem[field] = simpleItem[field].base;
      }
    }
    
    if (item.equipped && item.itemType === 'weapon') {
      equippedWeapons.push(simpleItem);
    } else {
      equipment.items.push(simpleItem);
    }
  });
  
  return { equipment, equippedWeapons };
};

/**
 * Преобразует нормализованные эффекты обратно в массив
 */
export const denormalizeEffects = (effectsDict = {}) =>
  effectsDictToLegacyArray(effectsDict);

/**
 * Основная функция денормализации для сохранения в БД
 */
export const denormalizeForSave = (storeState = {}) => {
  const { equipment, equippedWeapons } = denormalizeItems(storeState.items || {});
  
  return {
    attributes: denormalizeAttributes(storeState.attributes || {}),
    skills: denormalizeSkills(storeState.skills || {}),
    equipment,
    equippedWeapons,
    activeTimedEffects: denormalizeEffects(storeState.effects || {}),
    rewardedSkills: Array.isArray(storeState.rewardedSkills) ? storeState.rewardedSkills : [],
  };
};

/**
 * Alias for denormalizeForSave to match naming convention
 */
export const denormalizeCharacterState = (storeState = {}) => {
  return denormalizeForSave(storeState);
};

// ---------------------------------------------------------------------------
// Версионированные миграции сохранения персонажа
// ---------------------------------------------------------------------------
//
// Механизм конвертации старых сохранений в новый формат, чтобы не «плодить
// fallback» в loadCharacter. Каждая миграция — чистая функция (state) => state',
// которая переводит сохранение РОВНО на одну версию вперёд.
//
// Правила (владелец):
//   - Индекс миграции в массиве = версия, ИЗ которой она переводит (MIGRATIONS[v0] -> v1).
//   - Миграция должна быть чистой и идемпотентной: повторный прогон не ломает данные.
//   - Никогда не удаляй старые миграции — только добавляй новые в конец.
//   - Новое поле в сохранении = новая миграция, а НЕ `|| fallback` в loadCharacter.

/**
 * Последовательно применяет миграции, пока состояние не достигнет
 * CURRENT_SCHEMA_VERSION. Сохранения с неизвестной/будущей версией
 * не трогаются (вернём как есть), чтобы не повредить данные.
 *
 * Активный пакет регистрирует setting-owned шаг через registerStateMigration
 * (реестр stateExtensions). Шаг компонуется с переходом на зарезервированном
 * индексе, не добавляя элементов и не сдвигая последующие версии схемы.
 */
export function migrateCharacterState(data) {
  if (!data || typeof data !== 'object') return data;

  let state = { ...data };
  const fromVersion = Number.isInteger(state.schemaVersion)
    ? state.schemaVersion
    : LEGACY_SCHEMA_VERSION;

  if (fromVersion >= CURRENT_SCHEMA_VERSION) {
    return state;
  }

  const chain = migrationsWithExtensions();
  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = chain[version];
    if (typeof migrate !== 'function') {
      // Нет миграции для этой версии — не знаем, как преобразовать. Не ломаем данные.
      break;
    }
    state = migrate(state) || state;
    version += 1;
    state.schemaVersion = version;
  }

  return state;
}

// Цепочка движковых переходов с сеттинговыми шагами, скомпонованными
// внутри зарезервированного перехода. Registration не добавляет версии и
// потому не сдвигает последующие миграции или CURRENT_SCHEMA_VERSION.
const migrationsWithExtensions = () => {
  const chain = [...MIGRATIONS];
  const extensionsByIndex = new Map();
  for (const { migration, index } of getRegisteredStateMigrations()) {
    if (index >= chain.length) {
      throw new Error(`[migrations] Нет зарезервированного перехода v${index} -> v${index + 1}`);
    }
    const extensions = extensionsByIndex.get(index) || [];
    extensions.push(migration);
    extensionsByIndex.set(index, extensions);
  }

  for (const [index, extensions] of extensionsByIndex) {
    const engineMigration = chain[index];
    chain[index] = (input) => {
      let state = engineMigration ? engineMigration(input) || input : input;
      for (const migration of extensions) state = migration(state) || state;
      return state;
    };
  }
  return chain;
};

/**
 * Реестр миграций по версиям.
 * MIGRATIONS[0] — переход v0 -> v1, MIGRATIONS[1] — v1 -> v2, и т.д.
 */

// Миграции setting-owned полей регистрируются активным пакетом через
// registerStateMigration (src/store/stateExtensions.js) и компонуются с
// зарезервированным переходом без изменения CURRENT_SCHEMA_VERSION.

const MIGRATIONS = [
  // v0 -> v1: reserved for the active package's weapon effect migration.
  (state) => state,
  // v1 -> v2: reserved for an active package's legacy reward journal.
  (state) => state,
  // v2 -> v3: reserved for an active package's equipment-rule migration.
  (state) => state,

  // v3 -> v4: damageType из строки в массив (поддержка комбинированного урона).
  // Миграция преобразует все damageType (строка) в массивы в предметах.
  // Также пересчитывает моды для оружия, чтобы применить новые damageTypeOverride.
  // Идемпотентна: если уже массив — не трогает.
  (state) => {
    const migrateDamageType = (item) => {
      if (!item || typeof item !== 'object') return item;

      // Мигрируем damageType и damage_type
      const migrateField = (value) => {
        if (!value) return value;

        // Если уже массив — не трогаем
        if (Array.isArray(value)) return value;

        // Если JSON-строка массива — парсим
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
          } catch {
            // Это обычная строка, оборачиваем в массив
            return [value];
          }
        }

        // Обёртываем строку в массив
        return [value];
      };

      const out = { ...item };

      if (out.damageType !== undefined) {
        out.damageType = migrateField(out.damageType);
      }
      if (out.damage_type !== undefined) {
        out.damage_type = migrateField(out.damage_type);
      }

      return out;
    };

    // Пересчитываем моды для оружия (применяем новые damageTypeOverride из каталога)
    const recalculateWeaponMods = (item) => {
      if (!item || item.itemType !== 'weapon' || !item.appliedMods) return item;

      try {
        let updatedItem = { ...item };
        const appliedMods = item.appliedMods || {};

        Object.entries(appliedMods).forEach(([slot, modId]) => {
          const mod = catalogGetWeaponModById(modId);
          if (!mod || !mod.damageTypeOverride) return;

          const { op, value } = mod.damageTypeOverride;

          // Получаем текущий damageType
          let currentType = updatedItem.damageType;
          if (typeof currentType === 'string') {
            try {
              currentType = JSON.parse(currentType);
            } catch {
              currentType = [currentType];
            }
          }
          if (!Array.isArray(currentType)) {
            currentType = currentType ? [currentType] : ['physical'];
          }

          if (op === 'set') {
            updatedItem.damageType = Array.isArray(value) ? value : [value];
          } else if (op === 'add') {
            const typesToAdd = Array.isArray(value) ? value : [value];
            for (const t of typesToAdd) {
              if (!currentType.includes(t)) {
                currentType.push(t);
              }
            }
            updatedItem.damageType = currentType;
          }
        });

        return updatedItem;
      } catch (error) {
        // Если пересчёт модов не удался (например, каталог не загружен),
        // возвращаем предмет с мигрированным damageType, но без пересчёта модов.
        // Моды пересчитаются при следующем открытии модалки модов.
        debugLog('migration.v4.weaponModsRecalculationFailed', { message: error?.message });
        return item;
      }
    };

    return {
      ...state,
      items: state.items
        ? Object.fromEntries(
            Object.entries(state.items).map(([id, item]) => {
              const migrated = migrateDamageType(item);
              return [id, recalculateWeaponMods(migrated)];
            })
          )
        : state.items,
      equipment: state.equipment
        ? { ...state.equipment, items: (state.equipment.items || []).map(item => recalculateWeaponMods(migrateDamageType(item))) }
        : state.equipment,
      equippedWeapons: Array.isArray(state.equippedWeapons)
        ? state.equippedWeapons.map(item => recalculateWeaponMods(migrateDamageType(item)))
        : state.equippedWeapons,
    };
  },

  // v4 -> v5: старый сейв, где комплект потерял id/name ({items} без метаданных).
  // Комплект по сути нужен только для выдачи снаряжения; если предметы на месте,
  // а какой именно был комплект — неизвестно, проставляем заглушку: id: null,
  // name: «Комплект снаряжения». UI при нажатии на заглушку покажет список
  // комплектов, а выбор конкретного предложит сброс (т.к. персонаж locked).
  (state) => {
    const next = { ...state };
    const equipment = next.equipment;
    if (!equipment || typeof equipment !== 'object') return next;
    // Уже есть id — не трогаем.
    if (equipment.id) return next;
    // Есть предметы (снаряжение получено), но id нет — ставим заглушку.
    const savedItems = Array.isArray(equipment.items) ? equipment.items : [];
    if (savedItems.length === 0) return next;
    next.equipment = {
      ...equipment,
      id: null,
      name: null, // name подставит UI (i18n-ключ заглушки)
    };
    return next;
  },

  // v5 -> v6: reserved for a package-owned origin migration.
  (state) => state,

  // v6 -> v7: reserved for package-owned item identity migration.
  (state) => state,

  // v7 -> v8: reserved for a package-owned equipment-quality migration.
  (state) => state,

  // v8 -> v9: normalize legacy numeric item statistics to parameter objects.
  (state) => {
    const toParam = (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (typeof value === 'number') return { base: value, modifiers: [], total: value };
      if (typeof value === 'object') return value;
      const n = Number(value);
      return Number.isNaN(n) ? value : { base: n, modifiers: [], total: n };
    };
    const migrateItem = (item) => {
      if (!item || typeof item !== 'object') return item;
      const out = { ...item };
      if ('damage' in out) out.damage = toParam(out.damage);
      if ('fireRate' in out) out.fireRate = toParam(out.fireRate);
      for (const field of getSettingItemParameterFields()) {
        if (field in out) out[field] = toParam(out[field]);
      }
      return out;
    };

    let changed = false;
    const next = { ...state };
    if (Array.isArray(next.equipment?.items)) {
      next.equipment = { ...next.equipment, items: next.equipment.items.map(migrateItem) };
      changed = true;
    }
    if (Array.isArray(next.equippedWeapons)) {
      next.equippedWeapons = next.equippedWeapons.map(migrateItem);
      changed = true;
    }
    return changed ? next : state;
  },

  // v9 -> v10: reserved for a package-owned legacy character transition.
  (state) => state,

  // v10 -> v11: reserved for package-owned legacy save repair.
  (state) => state,

  // v11 -> v12: reserved for a package-owned character-build migration.
  (state) => state,

  // v12 -> v13: reserved for a package-owned legacy trait migration.
  (state) => state,

  // v13 -> v14: reserved for a package-owned legacy equipment migration.
  (state) => state,

  // v14 -> v15: каноническое состояние универсальных рисков текущей
  // реальной сцены. Конкретные rule id добавляются по первому событию;
  // миграция не подменяется load-time fallback в CharacterContext.
  (state) => ({
    ...state,
    sceneRiskStates: {},
  }),

  // v15 -> v16: осложнения больше не накапливаются до конца сцены. Поле
  // хранит только модификатор для одной следующей новой категории события.
  (state) => {
    if (
      !state.sceneRiskStates
      || typeof state.sceneRiskStates !== 'object'
      || Array.isArray(state.sceneRiskStates)
    ) {
      throw new Error('[migrations] v15 sceneRiskStates must be an object');
    }
    const sceneRiskStates = Object.fromEntries(
      Object.entries(state.sceneRiskStates).map(([ruleId, sceneState]) => {
        if (
          !sceneState
          || typeof sceneState !== 'object'
          || Array.isArray(sceneState)
          || !Number.isInteger(sceneState.difficultyModifier)
          || sceneState.difficultyModifier < 0
        ) {
          throw new Error(`[migrations] Invalid v15 scene-risk state for rule "${ruleId}"`);
        }
        const { difficultyModifier, ...unchanged } = sceneState;
        return [ruleId, {
          ...unchanged,
          pendingDifficultyModifier: difficultyModifier,
        }];
      }),
    );
    return { ...state, sceneRiskStates };
  },

  // v16 -> v17: лишние ранги перка сверх catalog maxRanks снимаются,
  // слот освобождается; сейв перка сжимается до { id, rank }.
  // Запись без id не сжимаем — её нужно показать в алерте.
  (state) => {
    if (!Array.isArray(state.selectedPerks)) return state;
    const { selectedPerks, removed } = trimSelectedPerksToMaxRanks(state.selectedPerks, getPerks());
    if (removed.length === 0) {
      return { ...state, selectedPerks };
    }
    return {
      ...state,
      selectedPerks,
      pendingPerkDuplicateNotice: true,
    };
  },

  // v17 -> v18: reserved for a package-owned perk ID migration.
  (state) => state,

  // v18 -> v19: «худой» сейв — предметы хранят только состояние экземпляра,
  // имя/цену/вес/статы/моды достаёт resolveItem по id (domain/saveSlimming.js).
  // Само ужимание НЕ делается здесь: оно требует каталога (а миграция чистая),
  // поэтому выполняется на экспорте (slimSaveData), а восстановление — на
  // импорте (restoreSaveData в deserializeState). Тут только бамп версии и
  // никакого изменения данных: старые «жирные» сейвы полностью совместимы —
  // restore дообогатит их теми же каталожными данными, а повторный экспорт
  // приведёт к «худому» виду. Идемпотентна.
  (state) => state,

  // v19 -> v20: reserved schema transition for package-owned slot data.
  // Serialization and restoration are handled by the active package; this
  // engine transition leaves the state unchanged.
  (state) => state,

  // v20 -> v21: reserved for an active package's equipment ID migration.
  (state) => state,

  // v21 -> v22: reserved for an active package's slot conversion migration.
  (state) => state,

  // v22 -> v23: слот зарезервирован за сеттинговым расширением состояния —
  // переход регистрируется модулем (registerStateMigration в stateExtensions).
  // Движковых изменений в этой версии нет. Если ни одно расширение переход
  // не зарегистрировало, состояние останется v22 без потери данных.
  (state) => state,

  // v23 -> v24: знание каталога в сейве — опциональное поле
  // folder { id, name } | null (патч 212). Миграция идентична: поле пишется
  // и сверяется слоем БД (domain/characterFolders.js), преобразований нет;
  // отсутствие поля = корневой список.
  (state) => state,

  // v24 -> v25: reserved for a package-owned condition-state migration.
  // The engine keeps the schema slot; an active package may compose its step.
  (state) => state,

  // v25 -> v26: reserved for a package-owned equipment migration.
  (state) => state,

];
/**
 * Мерж комплекта снаряжения при сохранении снапшота.
 *
 * Проблема: denormalizeForSave отдаёт equipment как { items: [...] } — БЕЗ
 * метаданных (id/name/weight/price). preferFilled отдавал предпочтение стору,
 * и метаданные выбранного комплекта терялись → после перезагрузки комплект
 * не отображался, а клик по нему «предлагал сбросить».
 *
 * Правило: метаданные — из снапшота (контекст хранит выбранный комплект),
 * items — из стора (там ВСЕ предметы: комплект + купленные/лут), чтобы ничего
 * не терять. Если комплект не выбран — возвращаем {items} (или null, если
 * предметов нет).
 */
export const mergeEquipmentWithStore = (snapshotEquipment, storeEquipment) => {
  const storeItems = Array.isArray(storeEquipment?.items) ? storeEquipment.items : [];
  if (!snapshotEquipment) {
    return storeItems.length > 0 ? { items: storeItems } : null;
  }
  return { ...snapshotEquipment, items: storeItems };
};

/**
 * Мерж списков оружия при сохранении снапшота: снапшот — источник метаданных
 * (встроенные кулаки у людей и т.п.), стор — источник «живых» предметов.
 * Объединяем по id без дублей.
 */
export const mergeEquippedWeapons = (snapshotWeapons, storeWeapons) => {
  const snapshotList = Array.isArray(snapshotWeapons) ? snapshotWeapons : [];
  const storeList = Array.isArray(storeWeapons) ? storeWeapons : [];
  const seen = new Set();
  const merged = [];
  [...snapshotList, ...storeList].forEach((w) => {
    if (!w) return;
    const id = w.id || w.weaponId || w.uniqueId;
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(w);
  });
  return merged;
};
