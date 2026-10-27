// modules/fallout/logic/derivedStats.js
// ФОРМУЛЫ ПРОИЗВОДНЫХ ПАРАМЕТРОВ сеттинга Fallout (МК-3, патч 316).
//
// Сюда переехали БЕЗ изменения правил:
//   • примитивы — из domain/characterCreation.js:
//     calculateInitiative, calculateDefense, calculateMeleeBonusValue,
//     calculateMeleeBonus, calculateMaxHealth, calculateCarryWeight,
//     calculateRobotCarryWeight;
//   • сборка с эффектами, перк-бонусами и каркасом СБ — из src/store/resolvers.js:
//     PA_FRAME_CATALOG, calculateDerivedStats, applyEffectToStats.
//
// Правила едут ВМЕСТЕ с сеттингом: кросс-игровое ядро про ОЗ/инициативу не знает.
// Универсальные механизмы остаются в движке и приходят импортом из чистого дома
// src/store/resolvers.js (0 импортов — циклы с реестром невозможны), timed-эффекты —
// из domain/effects.js, старый словарь эффектов — из src/store/effectsSync.js.
//
// Потребители:
//   • модуль (экраны) — прямой импорт из этого файла;
//   • движок (store и пр.) — ТОЛЬКО через дверь: domain/registry.js → getDerivedStatsLogic().

import {
  getAttributeValue,
  calculateAttributeTotal,
  getEquipmentCarryWeightModifier,
  applyFrameAttributeModifiers,
} from '../../../src/store/resolvers.js';

import {
  getTimedMaxHpBonus,
  getTimedDamageResistanceBonus,
  getTimedDefenseBonus,
} from '../../../domain/effects.js';

import { effectsDictToLegacyArray } from '../../../src/store/effectsSync.js';

// Каркас силовой брони: каталог данных сеттинга (ранее читался из store — нарушение границы).
import dataPowerArmor from '../data/equipment/powerArmor.json';

const toNumber = (value) => Number(value) || 0;

// Надетый каркас СБ (frame.pieces[0]) — единственный источник подмены атрибутов.
export const PA_FRAME_CATALOG = dataPowerArmor?.frame?.pieces?.[0] || null;

// ---------------------------------------------------------------------------
// Примитивы формул
// ---------------------------------------------------------------------------

export const calculateInitiative = (attributes) => {
    const perception = getAttributeValue(attributes, 'PER');
    const agility = getAttributeValue(attributes, 'AGI');
    return perception + agility;
};

export const calculateDefense = (attributes) => {
    const agility = getAttributeValue(attributes, 'AGI');
    return agility >= 9 ? 2 : 1;
};

export const calculateMeleeBonusValue = (attributes, trait) => {
    const strength = getAttributeValue(attributes, 'STR');
    let baseBonus = 0;
    if (strength >= 11) baseBonus = 3;
    else if (strength >= 9) baseBonus = 2;
    else if (strength >= 7) baseBonus = 1;

    const traitBonus = Number(trait?.modifiers?.meleeBonusDelta || 0);
    return baseBonus + traitBonus;
};

export const calculateMeleeBonus = (attributes, trait) => {
    const totalBonus = calculateMeleeBonusValue(attributes, trait);
    return totalBonus > 0 ? `+${totalBonus} {CD}` : '0';
};

export const calculateMaxHealth = (attributes, level = 1) => {
    const endurance = getAttributeValue(attributes, 'END');
    const luck = getAttributeValue(attributes, 'LCK');
    return endurance + luck + (level > 1 ? level - 1 : 0);
};

export const calculateCarryWeight = (attributes, trait, equipmentState = {}) => {
    const strength = getAttributeValue(attributes, 'STR');
    const baseCarryWeight = trait?.modifiers?.carryWeightFixed ?? 150;
    const strengthMultiplier = trait?.modifiers?.carryWeightStrengthMultiplier ?? 10;
    const strengthBonus = strengthMultiplier * strength;
    const traitCarryWeightModifier = trait?.modifiers?.carryWeight || 0;
    return baseCarryWeight + strengthBonus + traitCarryWeightModifier + getEquipmentCarryWeightModifier(equipmentState);
};

/**
 * Robot carry-weight rule.
 *
 * Roboты считают переносимый вес ИНАЧЕ, чем люди:
 *   carryWeight = базаТела + сумма(carryWeightModifier со всех слоёв брони)
 * где базаТела — `carryWeight` установленного корпуса (слот body/chassis/thruster),
 * с фоллбэком на trait.carryWeightFixed (по умолчанию 150).
 *
 * STR, перки и химия НЕ влияют на переносимый вес робота — только корпус и броня.
 *
 * @param {object} robotSlots - { [slotKey]: { limb, armor, plating, frame } }
 * @param {object} trait
 * @returns {number}
 */
export const calculateRobotCarryWeight = (robotSlots = {}, trait = null) => {
    const fallbackBase = trait?.modifiers?.carryWeightFixed ?? 150;

    // База от корпуса: ищем слот тела (body / chassis / thruster) с limb.carryWeight.
    let bodyBase = null;
    if (robotSlots && typeof robotSlots === 'object') {
        for (const [slotKey, slotData] of Object.entries(robotSlots)) {
            const key = String(slotKey).toLowerCase();
            const isBodySlot = key === 'body' || key === 'chassis' || key === 'thruster';
            const limbCarry = slotData?.limb?.carryWeight;
            if (isBodySlot && limbCarry != null && Number.isFinite(Number(limbCarry))) {
                bodyBase = toNumber(limbCarry);
                break;
            }
        }
    }

    const base = bodyBase != null ? bodyBase : fallbackBase;

    // Модификаторы только от брони/обшивки/рамы робо-слотов (без снаряжения людей).
    const armorModifier = getEquipmentCarryWeightModifier({ equippedRobotSlots: robotSlots });

    return base + armorModifier;
};

// ---------------------------------------------------------------------------
// Сборка производных: атрибуты + каркас СБ + timed-эффекты + перки
// ---------------------------------------------------------------------------

// Силовая броня: модификаторы надетого каркаса (СИЛ=set 11 и др. — данные) применяются
// К БАЗЕ атрибутов до расчёта производных (carryWeight/melee и пр.). Натуральные
// атрибуты в сторе при этом не трогаются. docs/architecture/power-armor-plan.md §5.6

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
