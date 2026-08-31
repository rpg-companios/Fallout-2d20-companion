# Robot Equipment Rules — Iron Rules

## 1. Character Type Flag
- Origin has `characterType` = `robot` → `ARMOR_POLICIES.ROBOT_ONLY`
- Determined via `domain/origins.js isRobotCharacter()`
- All equip checks read this flag, no hardcoding by origin id.

## 2. What Robots Can Wear (based on flag)
### Armor
- Only items with `robotOnly: true` OR `robotArmorType` defined
- Standard armor blocked: `equip.error.robotCannotWearStandardArmor`
- Mutant armor blocked
- Implementation: `domain/equipEquip.js canEquipArmor()` — whitelist robot armor

### Clothing
- Only decorative hats allowed:
  - `headwear_casual_hat`
  - `headwear_fancy_hat`
  - `headwear_bos_scribe_hat`
- All other clothing blocked: `equip.error.robotCannotWearClothing`
- Implementation: `canEquipClothing()` + `isRobotDecorativeHat()`

### Power Armor
- Robots CANNOT wear power armor at all (frame or pieces)
- Frame check: `canEquipArmor()` blocks because power armor is not robotOnly
- Piece check: must also block if character is robot, even if frame somehow equipped
- Implementation: `equipPowerArmorPackage()` checks `canEquipArmor()`, plus `canEquipPowerArmorPiece()` should check robot flag

### Weapons
- Robot weapons (`robot_weapon_*` / `robot_arm_*` / `isRobotWeapon=true`) as limbs: always allowed for ROBOT_ONLY
- Standard weapons (human weapons like 10mm pistol): allowed for ROBOT_ONLY ONLY if robot has arm with `canHoldWeapons=true`
  - Without such arm: equip button hidden, alert `manipulatorRequired`
  - With such arm: `findFreeWeaponHand()` finds first free hand, `canEquipWeaponToSlot()` checks weight/two-handed
- Non-robots cannot use robot weapons: `equip.error.robotOnlyWeapon`
- Implementation: `canEquipWeapon()` allows standard for robots (gated by arm check in InventoryScreen), `findFreeWeaponHand()` + `canEquipWeaponToSlot()` in `domain/robotEquip.js`

## 3. Kits — Consumables Not Equipped
- Kits resolve items via `kitResolver`, then `EquipmentKitModal` flattens and `CharacterScreen.handleSelectKit` adds to store via `addNewItem`
- Bug was: `equipped: isRobot ? true : false` for ALL robot kit items → chems like Rad-X, Psycho, Repair Kit showed as equipped
- Fix: Only equippable types can be equipped for robots:
  ```js
  ROBOT_EQUIPPABLE = Set(['weapon','armor','clothing','outfit','powerArmor','robotArmor','robotFrame','plating','frame'])
  shouldEquip = isRobot ? ROBOT_EQUIPPABLE.has(itemType) : false
  ```
- Consumables (chem, food, drinks, ammo, junk, misc, loot) → `equipped=false`, in inventory as consumable
- Repair Kit is `chem` with `robotOnly:true`, `hp+6 instant` → consumable, not equipped

## 4. Robot Arms & Weapon Equipping
- BodyPlan defines slots: `leftArm`, `rightArm`, `arm1` etc, each with `canHoldWeapons`, `weaponSlots`
- Arm catalog `robotarms.json`:
  - `canHoldWeapons: true` → arm can hold a weapon from inventory
  - `builtinWeaponId` → arm has built-in weapon (e.g. `robot_arm_assaultron` → `robot_weapon_claw` 3 dmg, `robot_arm_mister_handy` → manipulator 2 dmg)
  - Arms that are weapons themselves (e.g. `robot_weapon_construction_claw`) have `itemType: robotArm` + `builtinWeaponId` same id
- Inventory equip flow for robots:
  - `findFreeWeaponHand(slots, occupiedSourceSlots)` → first free arm with `canHoldWeapons=true` and no `heldWeapon`
  - `canEquipWeaponToSlot()` checks weight and two-handed
  - If no arm with `canHoldWeapons` → alert `manipulatorRequired`, no equip button
- If arm can hold weapon, robot can equip weapon via inventory. If not, cannot.
- Unarmed attack:
  - Humans: `unarmed_human` via `getBuiltinBaseWeapon()`
  - Robots: via arm's `builtinWeaponId` (manipulator 2 dmg, claw 3 dmg, construction claw 4 dmg) or via `builtinManipulator` flag
  - Assaultron default arm: `robot_weapon_claw` (3 dmg physical Unarmed) — as specified by owner
  - Construction claws kit: two `robot_weapon_construction_claw` as separate arm-weapons replacing arms

## 5. BodyPlan Defaults
- `bodyplans.json` has `defaults` (limb ids per slot) and `defaultPlating` (plating id per slot)
- Ability to specify defaults must exist, but current instances empty: `defaultPlating: {}` for all robots
- Standard plating not rendered in kit modal UI, only non-standard items shown
- Auto-install of standard plating from data via `getDefaultPlating()`, not via enricher script
- Rule: 1 item = 1 slot, 3 arm slots = 3 limbs, 1 thruster = 1 movement limb

## 6. Kit Change Without Full Reset
- Player with old assaultron (caps kit) should be able to choose new kit without resetting whole character
- `resetKitAndRewards({keepSkills:true})` → `resetKitOnly()`:
  - Clears equipment, equippedWeapons, robotSlots, robotModules, equippedArmor, caps, items (via `resetCharacterStore` keeping attributes/skills)
  - Keeps attributes, skills, selectedSkills, extraTaggedSkills, forcedSelectedSkills, skillsSaved
- Used in `CharacterScreen.handleSelectKit` and origin change before locked

## 7. No Fallbacks, No Legacy
- No normalizers, no legacy code support
- App based strictly on data, if data missing create/change it
- All doubts resolved via user survey
