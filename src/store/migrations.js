// src/store/migrations.js
// Минимальные миграционные функции для перехода к нормализованному формату

import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from './saveSchema';

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
 * - химия: 'chem_stimpak'
 * - и т.д.)
 */
export const normalizeItems = (equipment = {}, equippedWeapons = []) => {
  const result = {};
  
  // Helper функция для копирования только нужных полей предмета
  const copyItemFields = (item) => {
    const fieldsToCopy = [
      'id', 'name', 'itemType', 'equipped', 'uniqueId', 'weaponId', 
      'code', 'Name', 'quantity', 'stackKey', 'appliedMods',
      'equipInstanceId', 'armorCategoryKey', 'stackKey', 'price'
    ];
    
    const copied = {};
    fieldsToCopy.forEach(field => {
      if (item[field] !== undefined) {
        copied[field] = item[field];
      }
    });
    return copied;
  };
  
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
    if (item.physicalDamageRating !== undefined) {
      normalizedItem.physicalDamageRating = typeof item.physicalDamageRating === 'number' 
        ? { base: item.physicalDamageRating, modifiers: [], total: item.physicalDamageRating }
        : item.physicalDamageRating;
    }
    if (item.energyDamageRating !== undefined) {
      normalizedItem.energyDamageRating = typeof item.energyDamageRating === 'number' 
        ? { base: item.energyDamageRating, modifiers: [], total: item.energyDamageRating }
        : item.energyDamageRating;
    }
    if (item.radiationDamageRating !== undefined) {
      normalizedItem.radiationDamageRating = typeof item.radiationDamageRating === 'number' 
        ? { base: item.radiationDamageRating, modifiers: [], total: item.radiationDamageRating }
        : item.radiationDamageRating;
    }
    
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
      if (item.physicalDamageRating !== undefined) {
        normalizedItem.physicalDamageRating = typeof item.physicalDamageRating === 'number' 
          ? { base: item.physicalDamageRating, modifiers: [], total: item.physicalDamageRating }
          : item.physicalDamageRating;
      }
      if (item.energyDamageRating !== undefined) {
        normalizedItem.energyDamageRating = typeof item.energyDamageRating === 'number' 
          ? { base: item.energyDamageRating, modifiers: [], total: item.energyDamageRating }
          : item.energyDamageRating;
      }
      if (item.radiationDamageRating !== undefined) {
        normalizedItem.radiationDamageRating = typeof item.radiationDamageRating === 'number' 
          ? { base: item.radiationDamageRating, modifiers: [], total: item.radiationDamageRating }
          : item.radiationDamageRating;
      }
      
      result[itemId] = normalizedItem;
    }
  });
  
  return result;
};

/**
 * Преобразует эффекты из старого формата в словарь
 */
export const normalizeEffects = (activeTimedEffects = []) => {
  const result = {};
  
  activeTimedEffects.forEach(effect => {
    if (!effect?.id) return;
    
    result[effect.id] = {
      id: effect.id,
      name: effect.effectLabel || effect.effectName || 'Unnamed Effect',
      effectName: effect.effectName,
      effectLabel: effect.effectLabel,
      effectKind: effect.effectKind,
      type: effect.effectKind || 'positive',
      active: true,
      parameters: [],
      maxHpModifier: effect.maxHpModifier,
      damageResistanceModifier: effect.damageResistanceModifier,
      createdAt: effect.createdAt,
      expiresAt: effect.expiresAt,
      durationMs: effect.durationMs,
      scenesLeft: effect.scenesLeft || 0,
      sourceName: effect.sourceName,
    };
  });
  
  return result;
};

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
    if (simpleItem.physicalDamageRating && typeof simpleItem.physicalDamageRating === 'object') {
      simpleItem.physicalDamageRating = simpleItem.physicalDamageRating.base;
    }
    if (simpleItem.energyDamageRating && typeof simpleItem.energyDamageRating === 'object') {
      simpleItem.energyDamageRating = simpleItem.energyDamageRating.base;
    }
    if (simpleItem.radiationDamageRating && typeof simpleItem.radiationDamageRating === 'object') {
      simpleItem.radiationDamageRating = simpleItem.radiationDamageRating.base;
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
export const denormalizeEffects = (effectsDict = {}) => {
  return Object.values(effectsDict)
    .filter(effect => effect.active)
    .map(effect => ({
      id: effect.id,
      effectName: effect.effectName ?? effect.name,
      effectLabel: effect.effectLabel ?? effect.name,
      effectKind: effect.effectKind ?? effect.type,
      maxHpModifier: effect.maxHpModifier,
      damageResistanceModifier: effect.damageResistanceModifier,
      createdAt: effect.createdAt,
      expiresAt: effect.expiresAt,
      durationMs: effect.durationMs,
      scenesLeft: effect.scenesLeft || 0,
      sourceName: effect.sourceName,
    }));
};

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

  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
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

/**
 * Реестр миграций по версиям.
 * MIGRATIONS[0] — переход v0 -> v1, MIGRATIONS[1] — v1 -> v2, и т.д.
 * Сейчас версия 0 (текущий формат), поэтому реестр пуст. Новые миграции
 * добавляются сюда по мере изменения формата.
 */
const MIGRATIONS = [];