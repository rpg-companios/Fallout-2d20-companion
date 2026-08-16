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

// Export for use in characterStore.js
export const calculateParameterTotal = (base, modifiers = []) => {
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

const coerceToParameter = (value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') {
    return { base: value, modifiers: [], total: value };
  }
  if (typeof value === 'object') return value;
  return value;
};

// Пример применения к предмету
export const normalizeItemParameters = (item) => {
  if (!item) return item;

  const normalized = { ...item };

  if (normalized.damage !== undefined) {
    normalized.damage = coerceToParameter(normalized.damage);
    normalized.damage.total = calculateItemParameterTotal(normalized.damage);
  }

  if (normalized.fireRate !== undefined) {
    normalized.fireRate = coerceToParameter(normalized.fireRate);
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
  calculateRobotCarryWeight,
} from '../../domain/characterCreation.js';

import {
  getTimedMaxHpBonus,
  getTimedDamageResistanceBonus,
  getTimedDefenseBonus,
} from '../../domain/effects.js';

import { effectsDictToLegacyArray } from './effectsSync.js';

// Силовая броня: модификаторы надетого каркаса (СИЛ=set 11 и др. — данные) применяются
// К БАЗЕ атрибутов до расчёта производных (carryWeight/melee и пр.). Натуральные
// атрибуты в сторе при этом не трогаются. docs/architecture/power-armor-plan.md §5.6
import { applyFrameAttributeModifiers } from '../../domain/powerArmor.js';
import dataPowerArmor from '../../modules/fallout/data/equipment/powerArmor.json';

const PA_FRAME_CATALOG = dataPowerArmor?.frame?.pieces?.[0] || null;

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

  // Надетый каркас силовой брони подменяет атрибуты (set/add) для производных.
  const attributesEffective = applyFrameAttributeModifiers(
    attributesArray,
    equipmentState?.powerArmorFrameId ? PA_FRAME_CATALOG : null,
  );

  const effectsArray = effectsDictToLegacyArray(effects);

  const stats = {
    maxHealth: { base: 0, modifiers: [], total: 0 },
    initiative: { base: 0, modifiers: [], total: 0 },
    defense: { base: 0, modifiers: [], total: 0 },
    meleeBonus: { base: 0, modifiers: [], total: 0 },
    carryWeight: { base: 0, modifiers: [], total: 0 },
    damageResistance: {
      physical: { base: 0, modifiers: [], total: 0 },
      energy: { base: 0, modifiers: [], total: 0 },
      radiation: { base: 0, modifiers: [], total: 0 },
    },
  };

  // Max Health: END + LCK + level
  stats.maxHealth.base = calculateMaxHealth(attributesEffective, level);
  
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

  const drBonus = getTimedDamageResistanceBonus(effectsArray);
  ['physical', 'energy', 'radiation'].forEach((type) => {
    const bonus = drBonus[type] || 0;
    if (bonus !== 0) {
      stats.damageResistance[type].modifiers.push({
        source: 'timedEffects',
        value: bonus,
        operation: '+',
      });
      stats.damageResistance[type].total = calculateAttributeTotal(stats.damageResistance[type]);
    }
  });
  
  // Initiative: PER + AGI
  stats.initiative.base = calculateInitiative(attributesEffective);
  stats.initiative.total = calculateAttributeTotal(stats.initiative);
  
  // Defense: AGI >= 9 ? 2 : 1 (+ бонусы timed-эффектов, напр. Стелс-бой +2)
  stats.defense.base = calculateDefense(attributesEffective);
  const defenseBonus = getTimedDefenseBonus(effectsArray);
  if (defenseBonus !== 0) {
    stats.defense.modifiers.push({
      source: 'timedEffects',
      value: defenseBonus,
      operation: '+',
    });
  }
  stats.defense.total = calculateAttributeTotal(stats.defense);
  
  // Melee Bonus: STR-based
  stats.meleeBonus.base = calculateMeleeBonusValue(attributesEffective, trait);
  stats.meleeBonus.total = calculateAttributeTotal(stats.meleeBonus);
  
  // Carry Weight:
  //  - Roboты: база от корпуса + модификаторы брони (STR/перки/химия не влияют)
  //  - Остальные: STR-based + trait + снаряжение
  const robotSlots = equipmentState.robotSlots || equipmentState.equippedRobotSlots || null;
  if (equipmentState.isRobot) {
    stats.carryWeight.base = calculateRobotCarryWeight(robotSlots || {}, trait);
  } else {
    stats.carryWeight.base = calculateCarryWeight(attributesEffective, trait, equipmentState);
  }
  stats.carryWeight.total = calculateAttributeTotal(stats.carryWeight);

  // --- Перк-бонусы (perkBonuses) ---
  // perkBonuses попадает сюда через аргумент effects ({ ...effects, perkBonuses })
  const perkBonuses = effects?.perkBonuses || {};

  // maxHealthBonus (lifeGiver)
  const maxHealthFromPerks = Number(perkBonuses.maxHealthBonus) || 0;
  if (maxHealthFromPerks !== 0) {
    stats.maxHealth.modifiers.push({
      source: 'perks',
      value: maxHealthFromPerks,
      operation: '+',
    });
    stats.maxHealth.total = calculateAttributeTotal(stats.maxHealth);
  }

  // carryWeightBonus (strongBack)
  const carryFromPerks = Number(perkBonuses.carryWeightBonus) || 0;
  if (carryFromPerks !== 0 && !equipmentState.isRobot) {
    stats.carryWeight.modifiers.push({
      source: 'perks',
      value: carryFromPerks,
      operation: '+',
    });
    stats.carryWeight.total = calculateAttributeTotal(stats.carryWeight);
  }

  // damageResistance (toughness / refractor / radResistant / barbarian)
  const drFromPerks = perkBonuses.damageResistance || {};
  ['physical', 'energy', 'radiation'].forEach((type) => {
    const bonus = Number(drFromPerks[type]) || 0;
    if (bonus !== 0) {
      stats.damageResistance[type].modifiers.push({
        source: 'perks',
        value: bonus,
        operation: '+',
      });
      stats.damageResistance[type].total = calculateAttributeTotal(stats.damageResistance[type]);
    }
  });

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

  if (effect.defenseModifier) {
    const mod = effect.defenseModifier;
    if (!updatedStats.defense) {
      updatedStats.defense = { base: 0, modifiers: [], total: 0 };
    }
    updatedStats.defense.modifiers = [
      ...(updatedStats.defense.modifiers || []),
      {
        source: effect.id,
        value: Number(mod.value) || 0,
        operation: mod.op || '+',
      },
    ];
    updatedStats.defense.total = calculateAttributeTotal(updatedStats.defense);
  }
  
  return updatedStats;
};
