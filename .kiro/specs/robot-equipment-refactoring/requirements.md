# Requirements Document

## Introduction

This feature implements a comprehensive robot equipment system with dynamic weapon slots, limb-based equipment management, and three-layer armor protection. The system replaces the current fixed two-weapon slot limitation with a dynamic array that supports unlimited weapons for both humans and robots. Robots will have a dedicated slot system for limbs (arms, legs, head, body) with integrated weapon and armor management, while humans will receive a built-in unarmed attack weapon that cannot be removed.

## Requirements

### Requirement 1: Dynamic Weapon System

**User Story:** As a player, I want to equip multiple weapons on my character without artificial slot limitations, so that I can fully utilize my character's combat capabilities.

#### Acceptance Criteria

1. WHEN the character context initializes THEN `equippedWeapons` SHALL be a dynamic array without null values
2. WHEN a human character is created THEN the system SHALL automatically add an unarmed weapon ("Кулаки") that cannot be removed
3. WHEN a weapon is equipped THEN it SHALL be added to the `equippedWeapons` array
4. WHEN a weapon is unequipped THEN it SHALL be removed from the `equippedWeapons` array
5. WHEN loading saved characters with old format `[null, null]` THEN the system SHALL migrate to the new dynamic array format by removing null values
6. WHEN displaying weapons in WeaponsAndArmorScreen THEN all weapons in the array SHALL be rendered as weapon cards

### Requirement 2: Robot Slot System

**User Story:** As a robot character, I want a dedicated equipment system with limb slots that automatically populate from my equipment kit, so that my equipment reflects my robotic nature.

#### Acceptance Criteria

1. WHEN a robot character is created THEN the system SHALL initialize `equippedRobotSlots` with keys: `head`, `body`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`
2. WHEN a Mister Handy robot is created THEN the system SHALL initialize slots with keys: `head`, `body`, `arm1`, `arm2`, `arm3`, `thruster`
3. WHEN a Robobrain robot is created THEN the system SHALL initialize slots with keys: `head`, `body`, `leftArm`, `rightArm`, `chassis`
4. WHEN a robot slot is initialized THEN each slot SHALL contain: `limb`, `armor`, `plating`, `frame`, `heldWeapon` (all initially null)
5. WHEN a robot character is created THEN the system SHALL determine robot type by checking `origin.isRobot`, `trait.modifiers.isRobot`, or `trait.modifiers.robotBodyPlan`
6. WHEN a human character is created THEN `equippedRobotSlots` SHALL remain undefined

### Requirement 3: Equipment Kit Auto-Population

**User Story:** As a robot character being created, I want my limbs, weapons, and armor to be automatically equipped from my equipment kit, so that I'm ready to play immediately.

#### Acceptance Criteria

1. WHEN a robot character selects an equipment kit THEN the system SHALL parse all items from the kit JSON
2. WHEN the kit contains limb items (`robotArm`, `robotHead`, `robotBody`, `robotLeg`) THEN they SHALL be placed in appropriate slot `limb` fields
3. WHEN the kit contains weapon items with `requiresWeaponId` THEN they SHALL be placed in the `heldWeapon` field of the matching limb slot
4. WHEN the kit contains weapon items with `slot` property THEN they SHALL be placed in the specified slot's `heldWeapon` field
5. WHEN the kit contains weapon items with `replacesArm: true` THEN they SHALL replace the limb in that slot
6. WHEN the kit contains armor items (`plating`, `armor`, `frame`) THEN they SHALL be placed in the corresponding layer field of all applicable slots
7. WHEN the kit contains module items THEN they SHALL be added to `equippedRobotModules` array
8. WHEN the kit contains consumable items (chems, food, repair kits, caps) THEN they SHALL be added to `equipment.items` inventory
9. WHEN limbs are not specified in the kit THEN default limbs for that `robotBodyPlan` SHALL be auto-added from the catalog
10. WHEN all kit items are processed THEN the system SHALL build the `equippedWeapons` array from all weapon sources (builtin, manipulator, held)

### Requirement 4: Robot Weapon Sources

**User Story:** As a robot character, I want my equipped weapons to reflect all my weapon sources including built-in weapons, manipulators, and held weapons, so that I can see all my combat options.

#### Acceptance Criteria

1. WHEN a limb has `builtinWeaponId` THEN that weapon SHALL be added to `equippedWeapons`
2. WHEN a limb is a manipulator with `builtinManipulator: true` and no `heldWeapon` THEN the manipulator SHALL be added to `equippedWeapons` as a weapon
3. WHEN a slot has a `heldWeapon` THEN it SHALL be added to `equippedWeapons`
4. WHEN a weapon is added to `equippedWeapons` from a robot slot THEN it SHALL include a `sourceSlot` identifier for UI display
5. WHEN a robot head has a built-in weapon (e.g., Assaultron laser) THEN it SHALL be added to `equippedWeapons`

### Requirement 5: Three-Layer Armor System

**User Story:** As a robot character, I want to equip multiple armor layers (plating, armor, frame) on each body part, so that I can maximize my protection.

#### Acceptance Criteria

1. WHEN a robot slot is initialized THEN it SHALL support three armor layers: `plating`, `armor`, `frame`
2. WHEN plating is equipped THEN it SHALL be incompatible with `armor` and `frame` layers
3. WHEN armor is equipped THEN it SHALL be compatible with `frame` layer
4. WHEN frame is equipped THEN it SHALL be compatible with `armor` layer
5. WHEN calculating damage resistance THEN values from all equipped layers SHALL be summed
6. WHEN calculating carry weight modifier THEN values from all equipped layers SHALL be summed
7. WHEN incompatible layers are detected THEN the system SHALL prevent equipping or show an error

### Requirement 6: Robot UI - WeaponsAndArmorScreen

**User Story:** As a robot character viewing my equipment screen, I want to see my limb slots with their weapons and armor, so that I can understand my current configuration.

#### Acceptance Criteria

1. WHEN a robot views WeaponsAndArmorScreen THEN the armor section SHALL render `RobotSlot` components for each slot
2. WHEN a RobotSlot is rendered THEN it SHALL display: slot name, limb name, armor layer indicators (plating/armor/frame with values)
3. WHEN a RobotSlot is rendered THEN it SHALL show a "Модернизировать конечность" button
4. WHEN a RobotSlot has a weapon (builtin or held) THEN it SHALL show weapon damage info with a link to the weapon card
5. WHEN "Модернизировать конечность" is clicked THEN a modal SHALL open showing compatible limbs from the catalog
6. WHEN a RobotSlot is rendered THEN it SHALL show three buttons: "Улучшить броню", "Улучшить обшивку", "Улучшить раму"
7. WHEN an armor layer button is clicked THEN a modal SHALL open showing compatible armor items for that layer and slot
8. WHEN the weapons section is rendered THEN it SHALL display all weapons from `equippedWeapons` as WeaponCard components
9. WHEN a WeaponCard is rendered for a robot THEN it SHALL show the source slot label (e.g., "R Arm", "Head")

### Requirement 7: Robot UI - InventoryScreen

**User Story:** As a robot character managing my inventory, I want to equip weapons to specific limb slots and see only relevant equipment options, so that I can manage my loadout effectively.

#### Acceptance Criteria

1. WHEN a robot views InventoryScreen THEN limb items SHALL be hidden unless they were manually removed from a slot
2. WHEN a robot clicks "Экипировать" on a standard weapon THEN a dialog SHALL appear to select which manipulator slot to use
3. WHEN a robot clicks "Экипировать" on a robot-only weapon THEN it SHALL check compatibility with available limbs
4. WHEN a robot clicks "Снять" on a held weapon THEN it SHALL be removed from the slot's `heldWeapon` and added to inventory
5. WHEN a robot clicks "Снять" on a built-in or manipulator weapon THEN the button SHALL be disabled
6. WHEN a robot equips a weapon THEN the system SHALL verify the manipulator can hold it (weight, two-handed restrictions)

### Requirement 8: Limb Replacement System

**User Story:** As a robot character, I want to replace my limbs with upgraded versions from the catalog, so that I can improve my capabilities.

#### Acceptance Criteria

1. WHEN the limb replacement modal opens THEN it SHALL display limbs filtered by `itemType` matching the slot type
2. WHEN the limb replacement modal opens THEN it SHALL display limbs filtered by `compatibleBodyPlans` or `defaultForBodyPlan` matching the robot's body plan
3. WHEN a new limb is selected THEN the old limb SHALL be moved to inventory
4. WHEN a new limb is equipped THEN any weapons from the old limb SHALL be re-evaluated (built-in weapons removed, held weapons kept if compatible)
5. WHEN a new limb is equipped THEN the `equippedWeapons` array SHALL be rebuilt to reflect the change

### Requirement 9: Inventory Loot Modal Enhancement

**User Story:** As a player receiving loot, I want to specify the quantity of items I'm adding to my inventory, so that I can efficiently manage bulk loot from multiple enemies.

#### Acceptance Criteria

1. WHEN the AddItemModal is opened for loot THEN it SHALL display a quantity input field
2. WHEN an item is selected THEN the modal SHALL show +/- buttons and a manual input field for quantity
3. WHEN the user confirms the selection THEN the specified quantity SHALL be added to inventory
4. WHEN the quantity input is displayed THEN it SHALL default to 1
5. WHEN the user manually enters a quantity THEN it SHALL accept any positive integer
6. WHEN the UI is rendered THEN it SHALL match the style of the SellItemModal quantity controls

### Requirement 10: Character Context State Management

**User Story:** As the system, I want to properly serialize and deserialize robot equipment state, so that robot characters can be saved and loaded correctly.

#### Acceptance Criteria

1. WHEN a robot character is saved THEN `equippedRobotSlots` SHALL be serialized to JSON
2. WHEN a robot character is saved THEN `equippedRobotModules` SHALL be serialized to JSON
3. WHEN a robot character is loaded THEN `equippedRobotSlots` SHALL be deserialized from JSON
4. WHEN a robot character is loaded THEN `equippedRobotModules` SHALL be deserialized from JSON
5. WHEN a character is reset THEN `equippedRobotSlots` and `equippedRobotModules` SHALL be cleared
6. WHEN `buildSnapshot` is called THEN it SHALL include `equippedRobotSlots` and `equippedRobotModules`

### Requirement 11: Equipment Kit JSON Structure

**User Story:** As a game designer, I want equipment kits to explicitly define all robot limbs and their weapons, so that robot configurations are clear and maintainable.

#### Acceptance Criteria

1. WHEN a robot equipment kit is defined THEN it SHALL include limb items with `itemType: "robotArm" | "robotHead" | "robotBody" | "robotLeg"`
2. WHEN a limb item is defined THEN it MAY include `builtinWeaponId` for integrated weapons
3. WHEN a limb item is defined THEN it MAY include `canHoldWeapons`, `maxHandelWeaponWeight`, `excludeTwoHanded` for manipulators
4. WHEN a weapon item is defined THEN it MAY include `requiresWeaponId` to specify which limb must hold it
5. WHEN a weapon item is defined THEN it MAY include `slot: "left" | "right"` to specify placement
6. WHEN a weapon item is defined THEN it MAY include `replacesArm: true` to indicate it replaces the limb
7. WHEN armor items are defined THEN they SHALL include `layer: "plating" | "armor" | "frame"`
8. WHEN armor items are defined THEN they SHALL include `robotLocation` to specify which slots they protect

### Requirement 12: Domain Layer Functions

**User Story:** As a developer, I want pure functions for robot equipment logic, so that the system is testable and maintainable.

#### Acceptance Criteria

1. WHEN `domain/robotEquip.js` is created THEN it SHALL export `isRobotCharacter(character)` function
2. WHEN `isRobotCharacter` is called THEN it SHALL check `origin.isRobot`, `trait.modifiers.isRobot`, and `trait.modifiers.robotBodyPlan`
3. WHEN `domain/robotEquip.js` is created THEN it SHALL export `initRobotSlots(bodyPlan, kitId, catalog, randomSeed)` function
4. WHEN `initRobotSlots` is called THEN it SHALL return `{ slots, weapons, inventoryItems, modules }`
5. WHEN `domain/robotEquip.js` is created THEN it SHALL export `getBuiltinWeaponsFromSlots(slots)` function
6. WHEN `domain/robotEquip.js` is created THEN it SHALL export `canReplaceLimb(slot, newLimb, character)` function
7. WHEN `domain/robotEquip.js` is created THEN it SHALL export `applyLimbReplacement(slots, slotKey, newLimb)` function
8. WHEN `domain/robotEquip.js` is created THEN it SHALL export `canEquipWeaponToSlot(weapon, slot, character)` function
9. WHEN `domain/robotEquip.js` is created THEN it SHALL export `canEquipRobotArmor(armorItem, slot, character)` function

### Requirement 13: Unarmed Human Weapon

**User Story:** As a human character, I want a built-in unarmed attack option that is always available, so that I can fight even without weapons.

#### Acceptance Criteria

1. WHEN a human character is created THEN an unarmed weapon with `id: "unarmed_human"` SHALL be added to `equippedWeapons`
2. WHEN the unarmed weapon is defined THEN it SHALL have stats matching boxing gloves (damage: 2, weaponType: "Unarmed", mainSkill: "UNARMED")
3. WHEN the unarmed weapon is defined THEN it SHALL have name "Кулаки" in Russian locale
4. WHEN the unarmed weapon is displayed THEN it SHALL appear in WeaponsAndArmorScreen as a weapon card
5. WHEN a user attempts to unequip the unarmed weapon THEN the action SHALL be prevented
6. WHEN the unarmed weapon card is rendered THEN the "Снять" button SHALL be hidden or disabled

### Requirement 14: Future Consideration - Limb Inventory Management

**User Story:** As a developer, I want to document the decision to defer limb inventory management, so that it can be addressed in a future iteration.

#### Acceptance Criteria

1. WHEN this spec is completed THEN a separate design document SHALL be created for limb inventory management
2. WHEN the design document is created THEN it SHALL address: showing removed limbs in inventory, equipping limbs from inventory, and the "снять конечность" button in WeaponsAndArmorScreen
3. WHEN the current implementation is complete THEN limbs SHALL remain hidden in inventory unless explicitly addressed in the future document
