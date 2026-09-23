// ПРИЁМОЧНЫЙ (патч 316): формулы производных параметров живут в сеттинге
// (modules/fallout/logic/derivedStats.js), движок читает через дверь реестра.
// Золотые константы — предохранитель переезда МК-3: правила НЕ менялись.
import { describe, expect, it } from 'vitest';

import {
  calculateInitiative,
  calculateDefense,
  calculateMeleeBonusValue,
  calculateMeleeBonus,
  calculateMaxHealth,
  calculateCarryWeight,
  calculateRobotCarryWeight,
  calculateDerivedStats,
} from '../../modules/fallout/logic/derivedStats.js';
import { getDerivedStatsLogic } from '../../domain/registry.js';

// Примитивы едят legacy-массив [{ name, value }] (как в правилах и на входе сборки).
const mkAttributes = (values) =>
  Object.entries(values).map(([name, value]) => ({ name, value }));

// calculateDerivedStats ест normalized-словарь стора: { id: { id, base } }.
const mkDict = (values) =>
  Object.fromEntries(
    Object.entries(values).map(([id, base]) => [id, { id, base, modifiers: [], total: base }]),
  );

const HUMAN = mkAttributes({ STR: 5, PER: 6, END: 5, CHA: 4, INT: 4, AGI: 7, LCK: 4 });
const HUMAN_DICT = mkDict({ STR: 5, PER: 6, END: 5, CHA: 4, INT: 4, AGI: 7, LCK: 4 });

describe('МК-3: формулы производных переехали в модуль (золотые константы)', () => {
  it('инициатива = PER + AGI', () => {
    expect(calculateInitiative(HUMAN)).toBe(13);
  });

  it('защита = 1, а при ЛОВ 9+ — 2', () => {
    expect(calculateDefense(HUMAN)).toBe(1);
    expect(calculateDefense(mkAttributes({ AGI: 9 }))).toBe(2);
  });

  it('бонус ближнего боя: пороги СИЛ 7/9/11 и трейт-дельта', () => {
    expect(calculateMeleeBonusValue(HUMAN, null)).toBe(0);
    expect(calculateMeleeBonus(mkAttributes({ STR: 7 }), null)).toBe('+1 {CD}');
    expect(calculateMeleeBonus(mkAttributes({ STR: 9 }), null)).toBe('+2 {CD}');
    expect(calculateMeleeBonus(mkAttributes({ STR: 11 }), null)).toBe('+3 {CD}');
    // Отрицательная дельта не уводит строку в минус: сумма <= 0 печатается как '0'.
    expect(calculateMeleeBonus(mkAttributes({ STR: 5 }), { modifiers: { meleeBonusDelta: -1 } })).toBe('0');
    expect(calculateMeleeBonus(mkAttributes({ STR: 9 }), { modifiers: { meleeBonusDelta: 1 } })).toBe('+3 {CD}');
  });

  it('макс. ОЗ = END + LCK + (уровень − 1)', () => {
    expect(calculateMaxHealth(HUMAN, 1)).toBe(9);
    expect(calculateMaxHealth(HUMAN, 3)).toBe(11);
  });

  it('грузоподъёмность людей: 150 + 10×СИЛ + трейт + снаряжение', () => {
    expect(calculateCarryWeight(HUMAN, null, {})).toBe(200);
    expect(
      calculateCarryWeight(HUMAN, { modifiers: { carryWeight: 20, carryWeightFixed: 100 } }, {}),
    ).toBe(170);
    expect(
      calculateCarryWeight(HUMAN, null, {
        equippedArmor: { torso: { armor: { carryWeightModifier: 5 } } },
        equippedRobotSlots: { head: { plating: { carryWeightModifier: 7 } } },
      }),
    ).toBe(212);
  });

  it('грузоподъёмность роботов: корпус + броня; СИЛ/перки не влияют', () => {
    const slots = {
      body: { limb: { carryWeight: 120 } },
      head: { armor: { carryWeightModifier: 5 } },
      chassis: { limb: { carryWeight: 999 } }, // body найден первым — chassis не читается
    };
    expect(calculateRobotCarryWeight(slots, null)).toBe(125);
    expect(calculateRobotCarryWeight({}, null)).toBe(150);
    expect(calculateRobotCarryWeight({}, { modifiers: { carryWeightFixed: 90 } })).toBe(90);
  });

  it('calculateDerivedStats: сборка без эффектов', () => {
    const stats = calculateDerivedStats(HUMAN_DICT, {}, null, 1, {});
    expect(stats.maxHealth.base).toBe(9);
    expect(stats.maxHealth.total).toBe(9);
    expect(stats.initiative.total).toBe(13);
    expect(stats.defense.total).toBe(1);
    expect(stats.meleeBonus.total).toBe(0);
    expect(stats.carryWeight.total).toBe(200);
    expect(stats.damageResistance.physical.total).toBe(0);
  });

  it('timed-эффекты: +2 ОЗ и +2 защиты попадают в modifiers', () => {
    const effects = {
      stim_buff: {
        id: 'stim_buff',
        active: true,
        effectKind: 'positive',
        maxHpModifier: { value: 2, op: '+' },
        defenseModifier: { value: 2, op: '+' },
      },
    };
    const stats = calculateDerivedStats(HUMAN_DICT, effects, null, 1, {});
    expect(stats.maxHealth.base).toBe(9);
    expect(stats.maxHealth.total).toBe(11);
    expect(stats.defense.total).toBe(3);
    expect(stats.maxHealth.modifiers).toEqual([{ source: 'timedEffects', value: 2, operation: '+' }]);
  });

  it('перки: Живучесть/Ходка и сопротивляемость; Ходка не действует на роботов', () => {
    const perkBonuses = {
      maxHealthBonus: 2,
      carryWeightBonus: 20,
      damageResistance: { physical: 1, energy: 2 },
    };
    const human = calculateDerivedStats(HUMAN_DICT, { perkBonuses }, null, 1, { isRobot: false });
    expect(human.maxHealth.total).toBe(11);
    expect(human.carryWeight.total).toBe(220);
    expect(human.damageResistance.physical.total).toBe(1);
    expect(human.damageResistance.energy.total).toBe(2);

    const robot = calculateDerivedStats(HUMAN_DICT, { perkBonuses }, null, 1, {
      isRobot: true,
      robotSlots: { body: { limb: { carryWeight: 120 } } },
    });
    expect(robot.carryWeight.total).toBe(120); // strongBack проигнорирован
  });

  it('каркас СБ: СИЛ = set 11 → груз 260 и бонус ближнего боя +3', () => {
    const stats = calculateDerivedStats(HUMAN_DICT, {}, null, 1, { powerArmorFrameId: 'power_armor_frame' });
    expect(stats.carryWeight.base).toBe(260);
    expect(stats.meleeBonus.total).toBe(3);
    // Натуральные атрибуты не тронуты — база ОЗ считается до подмены? Нет: подмена
    // касается СИЛ (каркас), END/LCK неизменны → ОЗ то же.
    expect(stats.maxHealth.total).toBe(9);
  });

  it('дверь реестра отдаёт ТУ ЖЕ логику, что импортирует модуль', () => {
    const logic = getDerivedStatsLogic();
    expect(logic.calculateDerivedStats).toBe(calculateDerivedStats);
    expect(logic.calculateMaxHealth).toBe(calculateMaxHealth);
    expect(logic.calculateRobotCarryWeight).toBe(calculateRobotCarryWeight);
  });
});
