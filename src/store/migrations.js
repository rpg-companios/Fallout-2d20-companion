// src/store/migrations.js
// Минимальные миграционные функции для перехода к нормализованному формату

import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from './saveSchema';
import { resolveMutuallyExclusiveQualities } from '../../domain/weaponQualityConflicts';
import { catalogGetWeaponModById } from '../../db/catalogSource';
import { generateItemId } from '../../domain/itemIdentity';
import { getUniqQualityName } from '../../domain/registry';
import { composeNameWithUniqQualities } from '../../domain/uniqQuality';


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
 */

// --- v0 -> v1: разделение эффектов (effect_) и качеств (quality_) в экипировке ---
// В старых сохранениях экипированное оружие хранило качества вперемешку
// (quality_burst и пр. — теперь это effect_*) и/или поле damageEffects
// (голые строки). Миграция разводит их по effects/qualities с прямыми id,
// точно как в data-миграции (патчи 09/11). Идемпотентна.
const _EFFECT_OLD_IDS = new Set([
  'quality_burst', 'quality_breaking', 'quality_persistent', 'quality_piercing_x',
  'quality_radioactive', 'quality_spread', 'quality_stun', 'quality_vicious',
  'quality_freeze', 'quality_arc',
]);
const _ID_RENAME_V0V1 = {
  quality_burst: 'effect_burst', quality_breaking: 'effect_breaking',
  quality_persistent: 'effect_persistent', quality_piercing_x: 'effect_piercing_x',
  quality_radioactive: 'effect_radioactive', quality_spread: 'effect_spread',
  quality_stun: 'effect_stun', quality_vicious: 'effect_vicious',
  quality_freeze: 'effect_freeze', quality_arc: 'effect_arc',
  quality_supressed: 'quality_suppressed',
};
const _BARE_TO_EFFECT = {
  burst: 'effect_burst', piercing: 'effect_piercing_x', persistent: 'effect_persistent',
  spread: 'effect_spread', vicious: 'effect_vicious', stun: 'effect_stun',
  radioactive: 'effect_radioactive', breaking: 'effect_breaking', arc: 'effect_arc',
  freeze: 'effect_freeze',
};
const _isEffectId = (id) => String(id).startsWith('effect_');
const _remapIdV0V1 = (old) => (old === 'quality_silent' ? 'quality_suppressed' : (_ID_RENAME_V0V1[old] || old));

const _migrateEquippedEntryV0V1 = (entry) => {
  if (!entry || typeof entry !== 'object') return entry;
  const effectsMap = new Map();
  (entry.effects || []).forEach((e) => {
    const id = (e && e.effectId) || e;
    if (id) effectsMap.set(id, e && e.value != null ? { effectId: id, value: e.value } : { effectId: id });
  });
  const qualities = [];
  (entry.qualities || []).forEach((q) => {
    const oldId = (q && q.qualityId) || q;
    const id = _remapIdV0V1(oldId);
    if (_isEffectId(id)) effectsMap.set(id, q && q.value != null ? { effectId: id, value: q.value } : { effectId: id });
    else if (id) qualities.push(q && q.value != null ? { qualityId: id, value: q.value } : { qualityId: id });
  });
  (entry.damageEffects || []).forEach((name) => {
    const id = _BARE_TO_EFFECT[name] || name;
    if (id) effectsMap.set(id, { effectId: id });
  });
  const out = { ...entry };
  out.effects = [...effectsMap.values()];
  out.qualities = qualities;
  delete out.damageEffects;
  delete out.damage_effects;
  return out;
};

const MIGRATIONS = [
  // v0 -> v1: разделить эффекты/качества в экипированном оружии.
  (state) => {
    const next = { ...state };
    if (Array.isArray(next.equippedWeapons)) {
      next.equippedWeapons = next.equippedWeapons.map(_migrateEquippedEntryV0V1);
    }
    return next;
  },
  // v1 -> v2: existing saved characters have already received their initial
  // tagged-skill rewards, so seed their reward journal to prevent duplication.
  (state) => {
    const next = { ...state };
    if (!Array.isArray(next.rewardedSkills)) {
      next.rewardedSkills = next.skillsSaved
        ? [...new Set([...(next.selectedSkills || []), ...(next.extraTaggedSkills || [])])]
        : [];
    }
    return next;
  },
  // v2 -> v3: a weapon cannot retain both members of an opposite-quality pair.
  // The final saved order is authoritative, so the last conflicting quality wins.
  (state) => {
    const normalizeWeapon = (item) => {
      if (!item || typeof item !== 'object') return item;
      const raw = item.qualities;
      if (Array.isArray(raw)) return { ...item, qualities: resolveMutuallyExclusiveQualities(raw) };
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return { ...item, qualities: JSON.stringify(resolveMutuallyExclusiveQualities(parsed)) };
        } catch (_) {}
      }
      return item;
    };
    return {
      ...state,
      equipment: state.equipment
        ? { ...state.equipment, items: (state.equipment.items || []).map(normalizeWeapon) }
        : state.equipment,
      equippedWeapons: Array.isArray(state.equippedWeapons)
        ? state.equippedWeapons.map(normalizeWeapon)
        : state.equippedWeapons,
    };
  },

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
        console.warn('Migration v4: failed to recalculate weapon mods', error);
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

  // v5 -> v6: ориджин «savage» переименован в «tribal» (каноническое англ.
  // название — Tribal; savage был заглушкой). Старые сейвы с origin.id
  // 'savage' переводятся на 'tribal', иначе персонаж потеряет ориджин.
  (state) => {
    const next = { ...state };
    const origin = next.origin;
    if (!origin) return next;
    const originId = typeof origin === 'string' ? origin : origin?.id;
    if (originId === 'savage') {
      next.origin = typeof origin === 'string'
        ? 'tribal'
        : { ...origin, id: 'tribal' };
    }
    return next;
  },

  // v6 -> v7: «Опасная бритва» — вариант выкидного ножа (trueItemId +
  // replaceOriginalNameTo): для программы это нож (истинный id), стек
  // разделяется именем (baseName). Старые сейвы (патч 63) хранили бритву
  // отдельным предметом weapon_straight_razor — переводим на истинный id
  // и пересобираем id/stackKey по правилу «id + моды + имя».
  (state) => {
    const next = { ...state };
    const collections = [];
    if (Array.isArray(next.equipment?.items)) collections.push(next.equipment.items);
    if (Array.isArray(next.equippedWeapons)) collections.push(next.equippedWeapons);
    if (collections.length === 0) return state;

    // Отрезаем префиксы установленных модов от сохранённого имени:
    // «Зазубренное лезвие Опасная бритва» → «Опасная бритва».
    const stripModPrefixes = (name, appliedMods) => {
      if (!name) return name;
      let out = String(name);
      for (const modId of Object.values(appliedMods || {})) {
        const mod = catalogGetWeaponModById(modId);
        const prefix = mod?.prefix;
        if (prefix && out.startsWith(`${prefix} `)) out = out.slice(prefix.length + 1);
      }
      return out.trim();
    };

    let changed = false;
    for (const collection of collections) {
      for (let i = 0; i < collection.length; i += 1) {
        const item = collection[i];
        if (!item || item.weaponId !== 'weapon_straight_razor') continue;
        changed = true;
        const baseName = stripModPrefixes(item.name, item.appliedMods) || '';
        const rewritten = {
          ...item,
          weaponId: 'weapon_switchblade',
          ...(baseName ? { baseName } : {}),
        };
        const newId = generateItemId(rewritten.weaponId, rewritten.appliedMods || {}, rewritten.baseName || '');
        collection[i] = { ...rewritten, id: newId, stackKey: newId };
      }
    }
    return changed ? next : state;
  },

  // v7 -> v8: качество «Элегантная» у формальной одежды/шляпы Председателей
  // (патч 67). Старые сейвы (комплект с патча 63) хранят одежду без качества —
  // если персонаж из семьи Председателей, одежда/шляпа получают
  // uniqQualities ['elegant'], пересобираются id/stackKey (учитывают качество)
  // и имя («Элегантная Формальная одежда»).
  (state) => {
    const next = { ...state };
    const trait = next.trait;
    const isChairmen = Boolean(
      trait
      && (trait.id === 'treefamilies-chairmen'
        || (Array.isArray(trait.ids) && trait.ids.includes('treefamilies-chairmen'))),
    );
    if (!isChairmen) return state;
    const collections = [];
    if (Array.isArray(next.equipment?.items)) collections.push(next.equipment.items);
    if (Array.isArray(next.equippedWeapons)) collections.push(next.equippedWeapons);
    if (collections.length === 0) return state;

    const ELEGANT_CLOTHING_IDS = new Set(['clothing_fancy_clothes', 'headwear_fancy_hat']);
    const qualityName = getUniqQualityName('elegant');
    let changed = false;
    for (const collection of collections) {
      for (let i = 0; i < collection.length; i += 1) {
        const item = collection[i];
        if (!item) continue;
        const baseId = item.weaponId || item.id || item.clothingId || item.itemId;
        if (!ELEGANT_CLOTHING_IDS.has(baseId)) continue;
        if (Array.isArray(item.uniqQualities) && item.uniqQualities.includes('elegant')) continue;
        changed = true;
        // Имя уже начинается с качества (было выдано после 67, но поле
        // потеряно) — не дублируем; иначе собираем «Элегантная» + имя.
        const name = qualityName && item.name && item.name.startsWith(`${qualityName} `)
          ? item.name
          : composeNameWithUniqQualities(item.name || baseId, ['elegant'], getUniqQualityName);
        const newId = generateItemId(baseId, {}, undefined, undefined, ['elegant']);
        collection[i] = {
          ...item,
          uniqQualities: ['elegant'],
          name: name || item.name,
          id: newId,
          stackKey: newId,
        };
      }
    }
    return changed ? next : state;
  },

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
