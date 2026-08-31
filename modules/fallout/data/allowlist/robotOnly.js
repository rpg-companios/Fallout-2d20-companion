// modules/fallout/data/allowlist/robotOnly.js
// Частный случай: что может носить робот (ROBOT_ONLY).
// Просто список id и/или категорий: robotOnly:{ robotArmor, robotPlating, robotFrame, robotLims, robotWeapons, fancyHat, ... }
// Хочешь пиджак — добавляешь его id сюда. Бандану — сюда.

export const robotOnly = Object.freeze({
  // Категории (мапятся в движке на itemTypes/префиксы)
  robotArmor: true,
  robotPlating: true,
  robotFrame: true,
  robotLims: true,
  robotWeapons: true,

  // Конкретные предметы — только реальные id, без дублей (fancyHat == headwear_fancy_hat)
  headwear_casual_hat: true,
  headwear_fancy_hat: true,
  headwear_bos_scribe_hat: true,
  headwear_bos_scribe_hat_2: true,
  headwear_bos_field_scribe_hat: true,
});

// Структурированный вариант для движка
export const ROBOT_ONLY_STRUCTURED = Object.freeze({
  itemTypes: Object.freeze([
    'plating',
    'frame',
    'robotArmor',
    'robotFrame',
    'robotArm',
    'robotHead',
    'robotBody',
    'robotLeg',
    'robotLegs',
    'robotPart',
    'module',
  ]),
  prefixes: Object.freeze([
    'robot_weapon_',
    'robot_arm_',
    'robot_plating_',
    'robot_frame_',
    'robot_head_',
    'robot_body_',
    'robot_legs_',
    'robot_leg_',
  ]),
  ids: Object.freeze([
    'headwear_casual_hat',
    'headwear_fancy_hat',
    'headwear_bos_scribe_hat',
    'headwear_bos_scribe_hat_2',
    'headwear_bos_field_scribe_hat',
  ]),
});
