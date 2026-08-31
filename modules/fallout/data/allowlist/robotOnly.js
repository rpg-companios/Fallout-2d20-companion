// modules/fallout/data/allowlist/robotOnly.js
// Частный случай: что может носить робот (ROBOT_ONLY).
// Просто список id и/или категорий, без выдумывания что к чему.
// Хочешь пиджак — добавляешь его id сюда. Бандану — сюда.
// Мега-случай "робот в силовой броне" — через трейт/ориджин инжект в этот список (owner-only).

// Вариант как хочет владелец: robotOnly:{ robotArmor, robotPlating, robotFrame, robotLims, robotWeapons, fancyHat, ... }
// Реализовано как объект где ключи — категории/id, значение true — разрешено.
// Движок в domain/allowlist.js умеет проверять такие ключи через CATEGORY_ALIASES и прямое совпадение id/itemType.

export const robotOnly = Object.freeze({
  // Категории (мапятся в движке на itemTypes/префиксы)
  robotArmor: true,
  robotPlating: true,
  robotFrame: true,
  robotLims: true,
  robotWeapons: true,

  // Конкретные предметы (id)
  fancyHat: true, // мапится на headwear_fancy_hat
  casualHat: true,
  // Будущие примеры:
  // jacket: true, // если добавишь clothing_jacket с id jacket или маппингом
  // bandana: true,
  // powerArmorFrame: true, // мега-случай — разрешить силовую броню

  // Прямые id для совместимости (можно добавлять напрямую)
  headwear_casual_hat: true,
  headwear_fancy_hat: true,
  headwear_bos_scribe_hat: true,
  headwear_bos_scribe_hat_2: true,
  headwear_bos_field_scribe_hat: true,
});

// Структурированный вариант для движка (itemTypes/ids/prefixes) — генерируется из простого объекта выше
// Но можно править напрямую этот объект, если нужен тонкий контроль.
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
