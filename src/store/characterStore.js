// src/store/characterStore.js
// Zustand store for normalized character data with persistence

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { 
  calculateAttributeTotal, 
  calculateSkillTotal, 
  normalizeItemParameters,
  calculateDerivedStats,
  calculateParameterTotal
} from './resolvers.js';

import { normalizeForStore, denormalizeForSave } from './migrations.js';

// Helper function to generate unique IDs
const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

// Helper to get weapon mod by ID
const getWeaponModById = (modId) => {
  // This will be implemented when weapon mods data is available
  return null;
};

/**
 * Generate unique item ID based on weaponId and applied mods
 * - No mods: weaponId (e.g., 'weapon_10mm_pistol')
 * - With mods: weaponId_mods_mod1_mod2 (e.g., 'weapon_10mm_pistol_mods_mod_004_mod_017')
 */
const generateItemId = (weaponId, appliedMods = {}) => {
  if (!weaponId) return generateId();
  
  const modIds = Object.entries(appliedMods)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([slot, modId]) => modId)
    .join('_');
  
  return modIds ? `${weaponId}_mods_${modIds}` : weaponId;
};

/**
 * Generate stackKey for stacking identical items
 * - No mods: weaponId
 * - With mods: weaponId_mods_mod1_mod2
 */
const generateStackKey = (weaponId, appliedMods = {}) => {
  if (!weaponId) return generateId();
  
  const modIds = Object.entries(appliedMods)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([slot, modId]) => modId)
    .join('_');
  
  return modIds ? `${weaponId}_mods_${modIds}` : weaponId;
};

/**
 * Normalize a parameter value to Parameter<T> format
 * @param {*} value - Raw parameter value (number or object)
 * @param {Object} modifier - Optional modifier from mod
 * @returns {Object} Normalized parameter object with {base, modifiers, total}
 */
const normalizeParameter = (value, modifier = null) => {
  if (value === undefined || value === null) return undefined;
  
  const baseValue = typeof value === 'number' ? value : value?.base ?? 0;
  
  const parameter = {
    base: baseValue,
    modifiers: [],
    total: baseValue,
  };
  
  // Apply modifier if present
  if (modifier && modifier.value !== undefined) {
    const modValue = Number(modifier.value) || 0;
    parameter.modifiers.push({
      source: `mod_${modifier.id || 'unknown'}`,
      value: modValue,
      operation: modifier.op || '+',
    });
    // Recalculate total
    parameter.total = calculateParameterTotal(baseValue, parameter.modifiers);
  }
  
  return parameter;
};

/**
 * Apply mod modifiers to item parameters
 * @param {Object} item - Item with normalized parameters
 * @param {Object} appliedMods - Map of slot -> modId
 * @returns {Object} Item with updated parameters
 */
const applyModModifiers = (item, appliedMods = {}) => {
  if (!item || Object.keys(appliedMods).length === 0) return item;
  
  const updatedItem = { ...item };
  
  // For each mod, apply its modifiers to the item parameters
  Object.entries(appliedMods).forEach(([slot, modId]) => {
    const mod = getWeaponModById(modId);
    if (!mod) return;
    
    // Apply damage modifier
    if (mod.damageModifier && updatedItem.damage) {
      const modValue = Number(mod.damageModifier.value) || 0;
      updatedItem.damage.modifiers.push({
        source: `mod_${modId}`,
        value: modValue,
        operation: mod.damageModifier.op || '+',
      });
    }
    
    // Apply fireRate modifier
    if (mod.fireRateModifier && updatedItem.fireRate) {
      const modValue = Number(mod.fireRateModifier.value) || 0;
      updatedItem.fireRate.modifiers.push({
        source: `mod_${modId}`,
        value: modValue,
        operation: mod.fireRateModifier.op || '+',
      });
    }
    
    // Apply range modifier (if mod has range changes)
    if (mod.rangeModifier && updatedItem.range) {
      const modValue = Number(mod.rangeModifier.value) || 0;
      updatedItem.range.modifiers.push({
        source: `mod_${modId}`,
        value: modValue,
        operation: mod.rangeModifier.op || '+',
      });
    }
    
    // Apply damageType modifier (if mod changes damage type)
    if (mod.damageType && updatedItem.damageType) {
      // Damage type is a string, handled as base value
      updatedItem.damageType.base = mod.damageType;
      updatedItem.damageType.total = mod.damageType;
    }
  });
  
  return updatedItem;
};

// Helper to get trait, level, and equipment state from context (to be provided by components)
const getCharacterContext = () => {
  // These would come from the CharacterContext or props in real usage
  // For now, return defaults
  return {
    trait: null,
    level: 1,
    equipmentState: {},
  };
};

// Main store creation
const useCharacterStore = create(devtools(
  persist(
    (set, get) => ({
      // --- Initial State ---
      attributes: {},
      skills: {},
      items: {},
      effects: {},
      derivedStats: {}, // Calculated derived stats
      
      // Status flags (not part of persistence)
      isEffectsProcessing: false,
      
      // --- Actions: Attributes ---
      
      /**
       * Update an attribute's base value
       * @param {string} attrId - Attribute ID (e.g., 'STR', 'END')
       * @param {number} delta - Change to apply to base value
       */
      updateAttribute: (attrId, delta) => {
        const state = get();
        const attributes = { ...state.attributes };
        
        if (!attributes[attrId]) {
          console.warn(`Attribute ${attrId} not found`);
          return;
        }
        
        // Create a copy of the attribute and update base value
        const updatedAttribute = {
          ...attributes[attrId],
          base: (attributes[attrId].base || 0) + delta,
        };
        
        // Recalculate total
        updatedAttribute.total = calculateAttributeTotal(updatedAttribute);
        attributes[attrId] = updatedAttribute;
        
        set({ attributes });
        get().recalculateDerivedStats();
      },
      
      /**
       * Add a modifier to an attribute
       * @param {string} attrId - Attribute ID
       * @param {string} source - Source of the modifier (effect, perk, etc.)
       * @param {number} value - Modifier value
       * @param {string} operation - Operation: '+' (add) or '-' (subtract)
       */
      addAttributeModifier: (attrId, source, value, operation = '+') => {
        const state = get();
        const attributes = { ...state.attributes };
        
        if (!attributes[attrId]) {
          console.warn(`Attribute ${attrId} not found`);
          return;
        }
        
        // Create a copy of the attribute
        const updatedAttribute = { ...attributes[attrId] };
        
        // Add the new modifier
        updatedAttribute.modifiers = [
          ...(updatedAttribute.modifiers || []),
          { source, value, operation }
        ];
        
        // Recalculate total
        updatedAttribute.total = calculateAttributeTotal(updatedAttribute);
        attributes[attrId] = updatedAttribute;
        
        set({ attributes });
        get().recalculateDerivedStats();
      },
      
      /**
       * Remove a modifier from an attribute
       * @param {string} attrId - Attribute ID
       * @param {string} source - Source ID to remove
       */
      removeAttributeModifier: (attrId, source) => {
        const state = get();
        const attributes = { ...state.attributes };
        
        if (!attributes[attrId]) {
          console.warn(`Attribute ${attrId} not found`);
          return;
        }
        
        // Create a copy of the attribute
        const updatedAttribute = { ...attributes[attrId] };
        
        // Remove modifiers with matching source
        updatedAttribute.modifiers = (updatedAttribute.modifiers || [])
          .filter(mod => mod.source !== source);
        
        // Recalculate total
        updatedAttribute.total = calculateAttributeTotal(updatedAttribute);
        attributes[attrId] = updatedAttribute;
        
        set({ attributes });
        get().recalculateDerivedStats();
      },
      
      // --- Actions: Items ---
      
      /**
       * Update an item with partial changes
       * @param {string} itemId - Item ID
       * @param {object} patch - Partial item data to merge
       */
      updateItem: (itemId, patch) => {
        const state = get();
        const items = { ...state.items };
        
        if (!items[itemId]) {
          console.warn(`Item ${itemId} not found`);
          return;
        }
        
        // Merge the patch with existing item data
        const updatedItem = { ...items[itemId], ...patch };
        
        // Normalize item parameters (recalculate totals)
        const normalizedItem = normalizeItemParameters(updatedItem);
        items[itemId] = normalizedItem;
        
        set({ items });
        get().recalculateDerivedStats();
      },
      
      /**
       * Equip an item (set equipped = true)
       * @param {string} itemId - Item ID
       */
      equipItem: (itemId) => {
        const state = get();
        const items = { ...state.items };
        
        if (!items[itemId]) {
          console.warn(`Item ${itemId} not found`);
          return;
        }
        
        // Create a copy of the item and set equipped to true
        const updatedItem = { ...items[itemId], equipped: true };
        items[itemId] = updatedItem;
        
        set({ items });
        get().recalculateDerivedStats();
      },
      
      /**
       * Unequip an item (set equipped = false)
       * @param {string} itemId - Item ID
       */
      unequipItem: (itemId) => {
        const state = get();
        const items = { ...state.items };
        
        if (!items[itemId]) {
          console.warn(`Item ${itemId} not found`);
          return;
        }
        
        // Create a copy of the item and set equipped to false
        const updatedItem = { ...items[itemId], equipped: false };
        items[itemId] = updatedItem;
        
        set({ items });
        get().recalculateDerivedStats();
      },
      
      /**
       * Add a new item to the store
       * Normalizes item ID and adds to items dictionary with equipped: false
       * Handles uniqueId generation if not present
       * Generates stackKey for stacking identical items (same weaponId + same appliedMods)
       * Generates id based on weaponId + appliedMods: weaponId (no mods) or weaponId_mods_mod1_mod2 (with mods)
       * Applies mods to parameters: damage.modifiers.push({source: 'mod_modId', value: modValue, operation: modOp})
       * 
       * @param {Object} item - Item data to add
       * @param {string} item.weaponId - Base weapon ID (e.g., 'weapon_10mm_pistol')
       * @param {Object} item.appliedMods - Map of slot -> modId (e.g., {Receiver: 'mod_004'})
       * @param {boolean} [item.equipped=false] - Whether item is equipped (default: false)
       * @param {number} [item.quantity=1] - Stack quantity (default: 1)
       */
      addNewItem: (item) => {
        const state = get();
        const items = { ...state.items };
        
        if (!item) {
          console.warn('addNewItem: item is null or undefined');
          return;
        }
        
        // Get weaponId from item
        const weaponId = item.weaponId || item.id || item.code;
        
        if (!weaponId) {
          console.warn('addNewItem: item missing weaponId, id, or code field');
          return;
        }
        
        // Get applied mods
        const appliedMods = item.appliedMods || {};
        
        // Generate unique ID for this item instance
        const itemId = item.uniqueId || generateItemId(weaponId, appliedMods);
        
        // Generate stackKey for stacking identical items
        const stackKey = generateStackKey(weaponId, appliedMods);
        
        // Normalize item data with parameters
        const normalizedItem = {
          id: itemId,
          weaponId: weaponId,
          name: item.name || item.weaponName || item.Name || weaponId,
          itemType: item.itemType || 'weapon',
          equipped: item.equipped || false,
          quantity: item.quantity || 1,
          stackKey: stackKey,
          appliedMods: appliedMods,
          
          // Normalize parameters (damage, fireRate, etc.)
          damage: normalizeParameter(item.damage, item.damageModifier),
          fireRate: normalizeParameter(item.fireRate, item.fireRateModifier),
          range: normalizeParameter(item.range, item.rangeModifier),
          damageType: normalizeParameter(item.damageType, item.damageTypeModifier),
          
          // Armor parameters
          physicalDamageRating: normalizeParameter(
            item.physicalDamageRating, 
            item.physicalDamageRatingModifier
          ),
          energyDamageRating: normalizeParameter(
            item.energyDamageRating, 
            item.energyDamageRatingModifier
          ),
          radiationDamageRating: normalizeParameter(
            item.radiationDamageRating, 
            item.radiationDamageRatingModifier
          ),
          
          // Copy other fields
          code: item.code,
          cost: item.cost,
          rarity: item.rarity,
          weight: item.weight,
          ammoId: item.ammoId,
          qualities: item.qualities,
          imageName: item.imageName,
        };
        
        // Apply mod modifiers to parameters
        const finalItem = applyModModifiers(normalizedItem, appliedMods);
        
        // Add item to store
        items[itemId] = normalizeItemParameters(finalItem);
        
        set({ items });
        get().recalculateDerivedStats();
        
        return itemId;
      },
      
      // --- Actions: Effects ---
      
      /**
       * Add an effect to the store
       * @param {object} effect - Effect data (without id if new)
       */
      addEffect: (effect) => {
        const state = get();
        const effects = { ...state.effects };
        
        // Generate ID if not provided
        const effectId = effect.id || generateId();
        
        // Add effect to store with active flag
        effects[effectId] = {
          ...effect,
          id: effectId,
          active: true,
          createdAt: effect.createdAt || Date.now(),
        };
        
        set({ effects });
        get().recalculateDerivedStats();
      },
      
      /**
       * Mark an effect as expired (set active = false)
       * @param {string} effectId - Effect ID
       */
      expireEffect: (effectId) => {
        const state = get();
        const effects = { ...state.effects };
        
        if (!effects[effectId]) {
          console.warn(`Effect ${effectId} not found`);
          return;
        }
        
        // Mark effect as inactive
        effects[effectId] = {
          ...effects[effectId],
          active: false,
        };
        
        set({ effects });
        get().recalculateDerivedStats();
      },
      
      /**
       * Remove expired effects from the store
       */
      pruneExpiredEffects: () => {
        const state = get();
        const effects = { ...state.effects };
        
        // Filter out effects that are not active
        const activeEffects = {};
        Object.entries(effects).forEach(([id, effect]) => {
          if (effect.active) {
            activeEffects[id] = effect;
          }
        });
        
        if (Object.keys(activeEffects).length !== Object.keys(effects).length) {
          set({ effects: activeEffects });
          get().recalculateDerivedStats();
        }
      },
      
      // --- Helper Actions ---
      
      /**
       * Trigger recalculation of all parameter totals
       */
      recalculateAll: () => {
        const state = get();
        const { attributes, skills, items } = state;
        
        // Recalculate all attributes
        const updatedAttributes = { ...attributes };
        Object.keys(updatedAttributes).forEach(attrId => {
          const attribute = updatedAttributes[attrId];
          if (attribute) {
            updatedAttributes[attrId] = {
              ...attribute,
              total: calculateAttributeTotal(attribute),
            };
          }
        });
        
        // Recalculate all skills
        const updatedSkills = { ...skills };
        Object.keys(updatedSkills).forEach(skillId => {
          const skill = updatedSkills[skillId];
          if (skill) {
            updatedSkills[skillId] = {
              ...skill,
              total: calculateSkillTotal(skill),
            };
          }
        });
        
        // Recalculate all items
        const updatedItems = { ...items };
        Object.keys(updatedItems).forEach(itemId => {
          const item = updatedItems[itemId];
          if (item) {
            updatedItems[itemId] = normalizeItemParameters(item);
          }
        });
        
        set({
          attributes: updatedAttributes,
          skills: updatedSkills,
          items: updatedItems,
        });
        
        get().recalculateDerivedStats();
      },
      
      /**
       * Recalculate derived stats based on current state
       * This should be called when trait, level, or equipment changes
       * @param {Object} options - Optional: { trait, level, equipmentState }
       */
      recalculateDerivedStats: (options = {}) => {
        const state = get();
        const { attributes, effects } = state;
        
        // Merge provided options with defaults
        const context = {
          ...getCharacterContext(),
          ...options,
        };
        
        // Calculate derived stats
        const derivedStats = calculateDerivedStats(
          attributes,
          effects,
          context.trait,
          context.level,
          context.equipmentState
        );
        
        set({ derivedStats });
      },
      
      /**
       * Set character context for derived stats calculation
       * @param {Object} context - { trait, level, equipmentState }
       */
      setCharacterContext: (context) => {
        // Store context for derived stats calculation
        // This would typically be called by CharacterContext
        set({ 
          _characterContext: {
            trait: context.trait || null,
            level: context.level || 1,
            equipmentState: context.equipmentState || {},
          }
        });
        get().recalculateDerivedStats(context);
      },
      
      // --- Migration Actions ---
      
      /**
       * Загрузить данные в store из старого формата (массивов)
       * Используется при начальной загрузке из базы данных
       */
      loadFromLegacyData: (legacyData) => {
        const normalizedState = normalizeForStore(legacyData);
        set(normalizedState);
        get().recalculateAll();
      },
      
      /**
       * Экспортировать данные в старый формат для сохранения в БД
       */
      exportToLegacyData: () => {
        const state = get();
        return denormalizeForSave(state);
      },
      
    }),
    {
      name: 'character-store',
      partialize: (state) => ({
        attributes: state.attributes,
        skills: state.skills,
        items: state.items,
        effects: state.effects,
        schemaVersion: 1,
      }),
      // On rehydrate, ensure all totals are recalculated
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.recalculateAll();
        }
      },
    }
  ),
  {
    name: 'CharacterStore',
    // Only enable devtools in development
    enabled: process.env.NODE_ENV !== 'production',
  }
));

export default useCharacterStore;