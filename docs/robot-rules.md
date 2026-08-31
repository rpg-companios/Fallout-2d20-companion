# Robot Equipment Rules — Iron Rules (WHITELIST PRINCIPLE)

## 1. Character Type Flag
- Origin has `characterType` = `robot` → `ARMOR_POLICIES.ROBOT_ONLY`
- `mutant` → `RAIDER_ONLY`, `human/ghoul/cyborg` → `STANDARD`
- Determined via `domain/origins.js isRobotCharacter()`

## 2. Architecture: Domain vs Private Case
- **Domain = engine, general rules**: `domain/allowlist.js` — `isItemInAllowlist(item, allowlist)` — поддержка слага/категории/id белого списка. Общая движковая функция.
- **Private case = что именно может носить робот**: `modules/fallout/data/allowlist/robotOnly.js` — просто список id и/или категорий: `robotOnly:{ robotArmor, robotPlating, robotFrame, robotLims, robotWeapons, fancyHat, ... }`. Хочешь пиджак — добавляешь его id. Бандану — бандану. Мега-случай "робот в силовой броне" — через трейт/ориджин инжект в robotOnly (owner-only).
- `domain/equipEquip.js` — применяет общее правило политики (ROBOT_ONLY/RAIDER_ONLY/STANDARD) через движок белого списка, но сами списки — вне домена.

## 3. What Robots Can Wear — WHITELIST
**Owner principle: robotOnly describes WHAT robot CAN wear. Forbidden = not allowed. Same for mutantOnly.**

### Allowlist structure (simple, no inventing)
```js
robotOnly = {
  robotArmor: true,
  robotPlating: true,
  robotFrame: true,
  robotLims: true,
  robotWeapons: true,
  fancyHat: true,
  headwear_casual_hat: true,
  // jacket: true, bandana: true — просто добавить id
}
```
Engine in `domain/allowlist.js` maps categories via `CATEGORY_ALIASES` (robotPlating→plating/prefix robot_plating_, etc.) and checks direct id/itemType/prefix.

### Armor / Clothing / Power Armor (standard slots)
- ROBOT_ONLY: allowed ONLY if item in robotOnly allowlist (via `isItemInAllowlist`), else `robotCannotWearStandardArmor`
- RAIDER_ONLY: allowed ONLY if in mutantOnly allowlist
- STANDARD: allowed if NOT in robot/mutant allowlists
- If power armor not in robotOnly, no equip flag/check — cannot wear. Want robot in PA? Inject `powerArmorFrame` or its id into robotOnly via trait/origin.
- Implementation: `canEquipArmor()`, `canEquipClothing()`, `canEquipPowerArmor()` in `domain/equipEquip.js` use `isRobotAllowed()` / `isMutantAllowed()` which call `isItemInAllowlist()` with private lists from `modules/fallout/data/allowlist/`

### Power Armor pieces
- `canEquipPowerArmorPiece(equipped, piece, character)` — needs frame + not broken + whitelist (if robot, piece/frame must be in robotOnly)

### Weapons
- Robot weapons (`robot_weapon_*` / `robot_arm_*` / `isRobotWeapon` / `robotOnly`) as limbs: always allowed for ROBOT_ONLY
- Standard weapons from inventory (human weapons like 10mm pistol): allowed for ROBOT_ONLY ONLY if arm has `canHoldWeapons=true`
  - Without such arm: equip button hidden, alert `manipulatorRequired`
  - With such arm: `findFreeWeaponHand()` finds first free hand, `canEquipWeaponToSlot()` checks weight/two-handed
- Non-robots cannot use robot weapons: `equip.error.robotOnlyWeapon`
- Implementation: `canEquipWeapon()` allows robot weapons always, standard weapons allowed for robots (gated by arm check in InventoryScreen)

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
