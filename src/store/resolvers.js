// src/store/resolvers.js
// Parameter calculation utilities - pure functions for calculating totals

// --- Attribute Resolvers ---
export const calculateAttributeTotal = (attribute) => {
  if (!attribute) return 0;

  const { base, modifiers = [] } = attribute;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// --- Skill Resolvers ---
export const calculateSkillTotal = (skill) => {
  if (!skill) return 0;

  const { base, modifiers = [] } = skill;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// --- Item Resolvers ---
export const calculateItemParameterTotal = (parameter) => {
  if (!parameter) return 0;

  const { base, modifiers = [] } = parameter;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// Пример применения к предмету
export const normalizeItemParameters = (item) => {
  if (!item) return item;

  const normalized = { ...item };

  // Пересчет параметров оружия
  if (normalized.damage) {
    normalized.damage.total = calculateItemParameterTotal(normalized.damage);
  }

  if (normalized.fireRate) {
    normalized.fireRate.total = calculateItemParameterTotal(normalized.fireRate);
  }

  // Пересчет защиты брони
  if (normalized.physicalDamageRating) {
    normalized.physicalDamageRating.total = calculateItemParameterTotal(
      normalized.physicalDamageRating
    );
  }

  if (normalized.energyDamageRating) {
    normalized.energyDamageRating.total = calculateItemParameterTotal(
      normalized.energyDamageRating
    );
  }

  if (normalized.radiationDamageRating) {
    normalized.radiationDamageRating.total = calculateItemParameterTotal(
      normalized.radiationDamageRating
    );
  }

  return normalized;
};

// --- Derived Stats Resolvers ---

import {
  getAttributeValue,
  calculateMaxHealth,
  calculateInitiative,
  calculateDefense,
  calculateMeleeBonusValue,
  calculateCarryWeight,
} from '../../domain/characterCreation.js';

import {
  getTimedMaxHpBonus,
  getTimedDamageResistanceBonus,
} from '../../domain/effects.js';

/**
 * Calculate derived stats from attributes, effects, and trait
 * @param {Object} attributes - Normalized attributes object
 * @param {Object} effects - Normalized effects object
 * @param {Object} trait - Character trait object
 * @param {number} level - Character level
 * @param {Object} equipmentState - Equipment state for carry weight calculation
 * @returns {Object} Derived stats with base, modifiers, and total
 */
export const calculateDerivedStats = (attributes, effects, trait, level = 1, equipmentState = {}) => {
  // Convert normalized attributes to array format for compatibility
  const attributesArray = Object.values(attributes).map(attr => ({
    name: attr.id,
    value: attr.base,
  }));

  // Convert normalized effects to array format for compatibility
  const effectsArray = Object.values(effects).filter(effect => effect.active);

  const stats = {
    maxHealth: { base: 0, modifiers: [], total: 0 },
    initiative: { base: 0, modifiers: [], total: 0 },
    defense: { base: 0, modifiers: [], total: 0 },
    meleeBonus: { base: 0, modifiers: [], total: 0 },
    carryWeight: { base: 0, modifiers: [], total: 0 },
  };

  // Max Health: END + LCK + level
  stats.maxHealth.base = calculateMaxHealth(attributesArray, level);
  
  // Timed effects: getTimedMaxHpBonus
  const hpBonus = getTimedMaxHpBonus(effectsArray);
  if (hpBonus !== 0) {
    stats.maxHealth.modifiers.push({
      source: 'timedEffects',
      value: hpBonus,
      operation: '+',
    });
  }
  
  stats.maxHealth.total = calculateAttributeTotal(stats.maxHealth);
  
  // Initiative: PER + AGI
  stats.initiative.base = calculateInitiative(attributesArray);
  stats.initiative.total = calculateAttributeTotal(stats.initiative);
  
  // Defense: AGI >= 9 ? 2 : 1
  stats.defense.base = calculateDefense(attributesArray);
  stats.defense.total = calculateAttributeTotal(stats.defense);
  
  // Melee Bonus: STR-based
  stats.meleeBonus.base = calculateMeleeBonusValue(attributesArray, trait);
  stats.meleeBonus.total = calculateAttributeTotal(stats.meleeBonus);
  
  // Carry Weight: STR-based + trait + equipment
  stats.carryWeight.base = calculateCarryWeight(attributesArray, trait, equipmentState);
  stats.carryWeight.total = calculateAttributeTotal(stats.carryWeight);
  
  return stats;
};

/**
 * Apply effect parameters to stats
 * @param {Object} stats - Current derived stats
 * @param {Object} effect - Effect to apply
 * @returns {Object} Updated stats with effect modifiers
 */
export const applyEffectToStats = (stats, effect) => {
  const updatedStats = { ...stats };
  
  if (effect.maxHpModifier) {
    const mod = effect.maxHpModifier;
    updatedStats.maxHealth.modifiers = [
      ...(updatedStats.maxHealth.modifiers || []),
      {
        source: effect.id,
        value: Number(mod.value) || 0,
        operation: mod.op || '+',
      },
    ];
    updatedStats.maxHealth.total = calculateAttributeTotal(updatedStats.maxHealth);
  }
  
  if (effect.damageResistanceModifier) {
    // Initialize damage resistance if not present
    if (!updatedStats.damageResistance) {
      updatedStats.damageResistance = {
        physical: { base: 0, modifiers: [], total: 0 },
        energy: { base: 0, modifiers: [], total: 0 },
        radiation: { base: 0, modifiers: [], total: 0 },
      };
    }
    
    const mod = effect.damageResistanceModifier;
    const type = mod.type || 'physical';
    
    if (updatedStats.damageResistance[type]) {
      updatedStats.damageResistance[type].modifiers = [
        ...(updatedStats.damageResistance[type].modifiers || []),
        {
          source: effect.id,
          value: Number(mod.value) || 0,
          operation: mod.op || '+',
        },
      ];
      updatedStats.damageResistance[type].total = calculateAttributeTotal(
        updatedStats.damageResistance[type]
      );
    }
  }
  
  return updatedStats;
};
