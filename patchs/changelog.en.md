# Changelog

## 70 — Engine/setting split: food, drinks and weapon mods move to the module entirely

- OWNER RULE: setting data lives in the module; the engine (data/) stays empty. First batch: food (76), drinks (22), weapon mods (203) — FULL records (all stats + isMeat/isAlcohol flags + applies_to_ids with weapon_10mm_smg) moved to modules/fallout/data/{food,drinks,weapon_mods}.json; data/consumables/* and data/equipment/weapon_mods.json are empty arrays.
- Translations moved too: food/drinks/mods names and flavours moved from i18n/{ru-RU,en-EN}/data/... into the module i18n (sections food/drinks/weaponMods). Engine locale dictionaries for these categories are empty.
- The catalog (equipmentCatalog) reads the module for these categories: mergeById(module-data, module-i18n); getEquipmentData.weaponMods — from the module.
- Next stages (on command): weapons/armor/clothes, loot tables, perks, etc.
- Tests: module-data-move.test.js (3) — full records in the module, data/ empty, the catalog serves flags and names from the module.

## 69 — Omerta and White Glove kits (full contents) + auto-reroll + modal choice

- OMERTA kit: dashing Formal clothes (quality dashing), choice "Combat Knife or Knuckles", Gomorrah casino chip (50 caps), personal trinket (oddity), 2 rolls on the chems table, 1 roll on the drinks table with auto-reroll until alcohol.
- WHITE GLOVE SOCIETY kit: refined Formal clothes (quality refined), the Society Mask (new headwear item), choice "Walking Cane or Combat Knife", flamer with 12+6 CD fuel, personal trinket, 3 rolls on the food table (the "reroll until meat" is postponed — data/loot/food.json has no meat entries yet; the owner will fix the table), choice "Sawed-off (double-barrel + sawed-off barrel) with 6+3 CD shells" or "10mm SMG with 16+4 CD rounds".
- New module items: 10mm SMG — a SEPARATE weapon (its own stat block, book stats: damage 4, fire rate 3, weight 10, cost 129, Inaccurate, 10mm ammo) that accepts THE SAME mod set as the SMG — explicitly: weapon_10mm_smg was added to applies_to_ids of all 14 SMG mods (no variants/magic); the Society Mask (weight 0.5, cost 15, rarity 2); Gomorrah chip (value 50). Module clothes: clothes.json section + catalog merge.
- Auto-reroll (rerollUntil) in kits: `{ "rerollUntil": { "isAlcohol": true } }` / `{ "isMeat": true }` — per-roll reroll with an attempt limit (guard for empty tables).
- Data enriched: drinks — isAlcohol (8 alcoholic / 14 non-alcoholic); food — isMeat (40 meat / 36 non-meat; meat = flesh and meat dishes: eggs/omelettes, dog food, Cram, mirelurk paste, "Canned Meat", "Pork n' Beans" and "Salisbury Steak" (packaged) are NOT meat).
- OWNER RULE: picking a family always opens the kit modal with all contents (the family kit is expanded; choices like "knife or knuckles" are made by the player; confirming grants the kit).
- Technical: kit auto-grant no longer emits raw choice entries — picking a family opens the kit modal.
- Tests: family-kits.test.js (7) — new items, full contents of both kits (incl. rerolls: alcohol/meat, dirty water in the chems table), rerollUntil guard.

## 68 — "Elegant" quality in old saves (migration v7→v8) + kit-modal field loss fix

- CAUSE: clothes granted by the Chairmen kit BEFORE patch 67 have no `uniqQualities` in the save — inventory and the Equipment screen show them as «Формальная одежда» (only new grants have the quality).
- Migration v7→v8: if the character is a Chairmen (trait id/ids contains treefamilies-chairmen), the formal clothes and hat without a quality get `uniqQualities: ['elegant']`, the name («Элегантная Формальная одежда/шляпа») and rebuilt id/stackKey (`clothing_fancy_clothes_uniq_elegant` — stacks with new grants). Already with the quality — not duplicated; other families — untouched.
- FIX: the manual kit modal (EquipmentKitModal → toInventoryItems, weapon branch) dropped `baseName` and `uniqQualities` — the razor/"Дерзкая …" would lose name and stack when picked via the modal. Fields are carried explicitly now.
- Tests: full grant path (resolveKitItems → addNewItem: clothes with elegant in the store), migration v7→v8 (3 cases: Chairmen, non-Chairmen, already with the quality).

## 67 — Equipment screen knows the variant name; "Elegant" quality for the Chairmen

- FIX: the Equipment screen (WeaponsAndArmorScreen) did not know about the name replacement — for it the razor was the "Складной нож": storeItemToWeaponDisplay sets `id = weaponId` (the true knife id), findLocalizedWeapon found the knife in the catalog and overwrote the name. Items with their own identity (variant `baseName` or uniq qualities `uniqQualities`) now show their stored name: «Опасная бритва», «Дерзкая …»; the modded name composes from the replaced one («Зазубренное лезвие Опасная бритва»). Regular weapons — as before (catalog, i18n).
- CONTENT: quality `elegant` («Элегантная» / "Elegant") in the module uniq-qualities catalog; the Chairmen kit grants the formal clothes and hat with this quality — «Элегантная Формальная одежда», «Элегантная Формальная шляпа». The quality does nothing yet — only the name (and the stack: elegant ≠ no quality).
- Tests: equipment-screen render with an equipped razor (name «Опасная бритва», not «Складной нож»), Chairmen kit (clothes/hat with elegant in the name).

## 66 — Fix build syntax errors (Metro/Babel)

- `domain/traits.js`: name collision after the registry refactor (patch 62) — the local `getTraitI18n(id)` (trait name/description by id) clashed with the registry import `getTraitI18n(locale)` (locale dictionary). The local one is renamed to `getTraitI18nById`; modals updated (GenericTraitModal, SurvivorModal, TribalModal, TreeFamiliesModal). Only Metro caught it at build time (`Identifier has already been declared`); vitest tolerated it.
- `WeaponModificationModal.js`: mixed `||` and `??` without parens in `baseWeaponName` (patch 64) — a Babel syntax error (`Nullish coalescing operator requires parens`). Wrapped in parens.
- PROCESS: `CI=1 npx expo export --platform web` is now mandatory before shipping a patch (Metro catches what vitest misses).

## 65 — Uniq qualities: attachable equipment modifiers

- MODEL (owner): item "свойства" are called **uniq qualities** (like uniq_armor_mods). A quality is an attachable modifier: it has an id (tracking/mechanics) and a name (i18n); the name joins the item name: "Дерзкая" + "Формальная шляпа" = "Дерзкая Формальная шляпа". Quality effects (like mods) are reserved for the future.
- A quality is NOT hardwired into the item: it attaches to the instance (store field `uniqQualities`, like `appliedMods` — a list of ids). Attachment: via data (kit entry: `"uniqQualities": ["dashing"]`), in the future via crafting or manually. The mechanism is generic for any equipment: clothes, hats, armor, special outfits, weapons, ammo.
- Stack: quality is a stack parameter (law: two 100% identical items are one stack). Formula: id + durability + mods + qualities + name — `clothing_fancy_clothes_uniq_dashing` ≠ `..._uniq_elegant` with the same base id ("elegant" and "dashing" clothes are different stacks). The key uses quality ids (not names) — locale-independent; attachment order does not matter.
- Catalog: `data/equipment/uniq_qualities.json` (base, empty) + `modules/fallout/data/uniq_qualities.json` (module — the owner adds definitions here) + names in module i18n (`uniqQualities`). Registry: getUniqQualities/getUniqQualityName.
- Name composition: domain/uniqQuality.js — pure function (ready for crafting/manual attachment).
- Tests: uniq-quality.test.js (10) — catalog, name composition, stack keys, addNewItem, kit attachment (hat and weapon).

## 64 — Item variants (trueItemId + modifiers): the Straight Razor is not a standalone item

- MODEL (owner): the razor is NOT a clone and NOT separate weaponry. It is a **variant** of the switchblade; the record reads as modifiers:
  `{ "id": "weapon_straight_razor", "trueItemId": "weapon_switchblade", "modifiers": { "replaceOriginalNameTo": "weapon_straight_razor" } }`
  — "true item id" (mechanics: stats, qualities, mods — all from the knife) and "replace the original name" (the name comes from the i18n key: Опасная бритва / Straight Razor; no name hardcoded in data — i18n only).
- Future: `modifiers` supports pointwise stat tweaks — `{ "fireRateModifier": { "op": "+", "value": 1 } }` (fields damage/fireRate/weight/cost/rarity, ops + − × ÷). A fast revolver = revolver + name + one tweak, no copied stat block.
- Engine: `expandTrueItems` in domain/packMerge.js expands the record into a full one (deep merge with the true item + modifiers); the variant name comes from the catalog i18n. `domain/itemIdentity.js` — single source for id/stack-key logic.
- Inventory: the item lives under the TRUE id (to the program it is the knife — knife mods work without any aliases; no catalogSource machinery needed). Stack key is a plain concatenation: id + durability + mods + name, no markers (`weapon_switchblade_dur_50_mods_mod_113_опасная_бритва`). STACK LAW: two 100% identical items are one stack; any differing parameter (durability, mods, name) splits them: the razor and the knife are separate stacks, two razors stack together, a sword at 50 and 100 durability are separate stacks.
- Random durability (randomWeaponQualityEnabled/rollWeaponDurability): removed the forced "never stack" (unique key per instance) — two instances with equal durability now stack (bought guns are all 100, one stack).
- Modded name composes from the replaced name: "Зазубренное лезвие Опасная бритва" (mechanically the knife).
- Migration v6→v7: old saves with weapon_straight_razor (patch 63) → true id + baseName (name stripped of mod prefixes), id/stackKey rebuilt.
- Tests: item-variant.test.js (13) — record, expansion (ru/en), pointwise modifiers, grant under the true id, stack keys, addNewItem, migration.

## 63 — Family kits (Three Families) + "kit from trait" mechanic

- The Chairmen kit (treefamilies_chairmen): formal clothes and hat (existing clothing_fancy_clothes/headwear_fancy_hat), 9mm pistol with 12+4 CD rounds, Straight Razor (clone of the switchblade, id weapon_straight_razor, switchblade stats), Tops Casino Chip (CasinoTopsChip, value 100), personal trinket (oddity table roll), Marked Deck (item_marked_cards, 5 caps).
- Omerta and White Glove kits are temporary stubs (100 caps); their contents will be added per your data.
- OWNER RULE: the kit depends on the chosen family — the trait carries equipmentKitId; picking the family auto-selects its kit (applyKitById → resolveKitItems → handleSelectKit).
- The catalog (equipmentCatalog) now merges module data: weapons/generalGoods/equipmentKits from modules/fallout plus module i18n.
- Tests: Chairmen kit resolution, catalog with new items, equipmentKitId on family traits.

## 62 — "Three Families" origin (first content in the module) + registry refactor

- New origin TreeFamilies / Strip Families: multi-trait — the character picks ONE of the three Strip families:
  - The Chairmen: once per scene, re-roll 1d20 on a Charisma-based skill test (effect hook chairmen_reroll_cha);
  - Omerta: chems administered to others gain/increase Addiction (effect hook omerta_addiction_boost);
  - White Glove Society: food cooked at a Cooking Station heals +1 HP, butchering gives +1 meat, CHA complication range +1 with outsiders (hooks white_glove_*).
  Crafting/loot mechanics are future work (hooks are ready).
- OWNER RULE: new content goes into the module modules/fallout/ (origins.json, traits.json, i18n/) instead of data/.
- Registry refactor: getOrigins/getTraits merge the module over the base (by id, module wins); added getOriginI18n/getTraitI18n (base + module, deep merge). origins.js/traits.js read i18n through the registry.
- Asset: assets/origins/3families.png (copy of survivor per owner's instruction).
- TreeFamiliesModal — pick one of three families.
- Tests: treefamilies-origin.test.js (8).

## 61 — Engine data registry (step 1 toward modules)

- Added `domain/registry.js` — a single entry point for reading setting data (origins, traits, bodyplans, catalog). It still returns the same `data/` files; behavior is unchanged.
- Domain modules (origins/traits/characterCreation/bodyplan) now read through the registry instead of importing JSON directly.
- This is the foundation for `.posm` modules: once a module exists, the registry will merge its data (deepMerge by id) without touching consumers.
- Tests: registry.test.js.

## 60 — Fix weapon duplication when equipping to a robot

- Fixed: adding 1 weapon and equipping it to a robot's hand duplicated it (stayed in the inventory + a copy in the hand).
- Cause: different stackKey formats — store uses `weapon_10mm_pistol`, UI uses `weapon:weapon_10mm_pistol:mods:none`; lookup by the UI key failed to find the store item, so it was not removed.
- Fix: `findUnequippedStoreItemByStackKey` now normalizes the UI key (extracts the catalog id) and finds the item among unequipped ones.

## 59 — Tribal modal: Cancel button

- Added a "Cancel" button to the first screen of the Tribal trait modal (mode selection: "2 traits" / "1 trait + 1 perk") — closes the modal without changes if the user opened it by accident.
- Previously there was no way to exit the modal without making a choice. Now behaves like the other modals.

## 58 — Tribal origin + rules-pack foundation

- Added the Tribal origin: multi-select — 2 traits (Tribal or Survivor) OR 1 trait (Tribal/Survivor/NCR) + 1 additional perk. Traits: Mother Wasteland (fluff), Nomad (Science skill cannot be tagged — bannedTagSkills mechanic), Rite of Passage (mechanic: when spending a Luck Point, roll 1 {/CD}; on an effect the point is not spent + "The spirits favor you" alert), Old World Tools (fluff), Chosen One (fluff). Kit is temporarily the standard one (100 caps).
- Rules-pack foundation (stage 0, not yet wired into behavior): domain/packMerge.js (deepMerge, applyOverridesById, findUnknownOverrideIds), src/store/packStore.js (pack loading/storage, persist).

## 48 — Securitron origin

- The Securitron origin is now fully implemented: the "Mark I Securitron" trait (immunity to poison and radiation, 150 lbs carry weight not affected by Strength or perks, no chems/food/drink/rest benefits, repairs only).
- Own body plan `securitron`: head / body / left arm / right arm / wheel, 1-3-1 layout, hit location table 1-2 / 3-11 / 12-14 / 15-17 / 18-20.
- New robot parts: head, body (150 lbs), manipulator arm with built-in unarmed attack, wheel — stats modeled after the Protectron, ru/en translations included.
- `securitron_standard` equipment kit: automatic laser gun (laser gun with automatic barrel, integrated into the left arm, 14 + 7 CD fusion cell shots), submachine gun (integrated into the right arm, 8 + 4 CD rounds of .45 ammunition), missile launcher and grenade launcher (inoperable until the Mk II OS — inert inventory items flagged `requiresMkII`), factory armor for the torso/head/arms, printer (new robot item, equipped by default, cannot be unequipped).
- The RU prefix of mod `mod_053` now follows the EN convention ("Automatic") so the built-in weapon displays as "Automatic Laser Gun".
- Robot logic now supports the `wheel` slot (limb installation, armor distribution, armor picker, slot labels) and shows a limb's built-in weapon alongside the weapon held in that hand.
- Palm weapons (automatic laser gun and submachine gun) are now integrated into the arm slots (left/right) with applied mods, cannot be unequipped; attack cards show the source arm.
- The kit grenade launcher is the M79 Grenade Launcher.
- New robot item "Mk II OS Driver" (unique, only applicable to a Securitron): an "Apply" button in the inventory consumes the driver and activates the inoperable weapons. Until installed, the missile launcher and grenade launcher appear in the attack list as disabled cards labelled "Requires Mk II OS" (and in the inventory).
- The Mk II OS flag lives in the robot store slice and survives save/load.
- Securitron palms are free: the built-in weapons (laser gun in the left arm, submachine gun in the right) now sit INSIDE the limbs (limb built-in weapons), while the manipulator palms can hold any other weapon or items — regular weapons equip into a hand via the inventory, and the attack card shows the source arm.
- Attack order on the equipment screen: unarmed/melee first (all origins), then built-in weapons, then inoperable Mk II weapons, then weapons equipped from the inventory.
- Securitron head and wheel cells are now 1/3 width (like a cell in a row of three), centered in the row.
- Weapons equipped from the inventory go into the first FREE hand (the second weapon goes to the other hand) instead of always the first by position.
- Robot weapons now live in the store slots (single source of truth): built-in weapons (manipulator, laser gun, SMG) and weapons held in the palms (equipped from the inventory) are stored in the robot slot state instead of the React context. Screens read attacks from the slots — this fixes the bug where built-in weapons disappeared from the attack list after saving/reloading a character (only Mk II weapons remained).
- Fixed an inventory screen crash: isRobot was used in a useMemo before its declaration (TDZ "Cannot access 'isRobot' before initialization"). Added render smoke tests for InventoryScreen/WeaponsAndArmorScreen — this class of errors is now caught by tests.
- New rule for changing origin/trait/kit: before attributes/skills are allocated (locked=false) switching is free, no warnings; the kit resets together with the origin. After locked, changing origin/trait does a full reset with confirmation; changing the kit resets inventory, skills and skill rewards (attributes are kept). Browsing lists is always free (the "trait already selected" block was removed).
- Interface setting "Weapon cards display" (new "Interface Settings" section): Cards (default) / Spoilers / Tabs. Spoilers: each card sits in a collapsible header, 2/3 width, closed by default. Tabs: beveled top-left corner tabs below the limbs, active tab shows the 2/3-width card, << >> arrows switch the active tab, swiping left/right over the whole tabs scene (tab row + card) also switches it, and tapping a tab switches it too.
- Fixed: the chosen equipment kit was not remembered between sessions (after reload the kit was not shown, clicking it "offered to reset"). Cause: snapshot merge preferred store items and lost the kit metadata (id/name). Now metadata comes from the snapshot, items from the store (bought/loot items are kept); the reset confirmation only appears when a kit is actually selected (has id).
- Systemic save fix (the "lost ids" bug class): the snapshot no longer overwrites the chosen kit metadata or built-in weapons. Kit metadata (id/name) comes from the snapshot, items from the store (bought/loot are kept); built-in weapons (fists for humans) are merged by id with the store without duplicates. origin/trait are already stored by id (serializeState) — this bug class is closed at the root.
- Save migration v4→v5: for old saves where the kit lost its id/name ({items} without metadata), a placeholder "Equipment Kit" is set — the items are intact, but which kit was chosen is unknown. Tapping the placeholder opens the kit list; picking a specific kit offers a reset (character is locked).
- The "Mk II OS installed" flag is now stored in the character snapshot and restored on load (previously Mk II weapons became inoperable again after reload).

---

## 47 — Multiple damage types support

- Added support for combined damage types for weapons (e.g., energy + physical).
- Plasma weapons now deal both damage types: energy and physical.
- Weapon modifications can change damage type (replace or add).
- Added save migration (v3 → v4) to convert string damage types to arrays.
- Fixed syntax error in weapon modification modal.
- Fixed range name translation in weapon list (previously displayed English names).

---

## 46 — Character folders

- Added character folders for organizing saved characters.
- Added folder creation, opening, deletion, and character counts.
- Characters can be moved between folders using drag and drop.
- Added a "Move to character list" drop zone when viewing a folder.
- Fixed moving a character from a folder back to the root list when dropped over the back zone.
- The "Character folders" setting is persisted between launches.
- When the setting is disabled, the "Create folder" button is fully hidden and characters use the freed grid space.
- Existing folders and character assignments are preserved when the setting is disabled.
- Added Russian and English localization for the folder interface.

---

## 45 — Save migration on application updates

- Added a unified versioned migration system for character saves.
- Save-format changes are represented as sequential migrations between schema versions.
- Migrations run both when loading a character from SQLite and when rehydrating state from AsyncStorage.
- Added a single source of truth for the current schema version and documentation for adding future migrations.
- Legacy saves no longer require manual conversion after an application update.

---

## 44 — Grip and stock conflict

- Weapon grips and stocks are now mutually exclusive modifications.
- Installing a grip automatically removes the stock, and installing a stock removes the grip.
- The Russian name of the slot was corrected from «Приклад» to «Ложе».

---

## 42 — Legacy-save correction

- Fixed legacy saves in which a weapon could contain mutually exclusive qualities at the same time.
- After loading a save, only one quality from each conflicting pair remains.

---

## 41 — Mutually exclusive weapon qualities

- Fixed the application of mutually exclusive weapon qualities.
- Accurate replaces Inaccurate, and vice versa.
- Reliable replaces Unreliable, and vice versa.

---

## 40 — Tagged-skill rewards

- Fixed duplicate rewards for tagged skills.
- Saving the same tagged skills again no longer adds the rewards a second time.
- If a character receives a new tagged skill later, only that new skill receives its reward.

---

## 39 — Ammo type in inventory

- Weapons in the inventory now display their compatible ammo type.
- For example: `Ammo: 10mm Round` or `Ammo: Energy Cell`.

---

## 38 — Configurable weapon durability

- Added a Settings dialog.
- Added an optional random weapon durability mechanic.
- When enabled, weapons acquired as loot receive random durability from 1 to 100.
- Purchased weapons always start at 100% durability.
- Added a setting for durability loss per 10 shots.
- Unreliable weapons wear twice as fast, while Reliable weapons wear half as fast.
- Weapon durability is displayed on the equipment screen.
- Weapons at zero durability cannot be used until repaired.
- Weapons can be repaired for free through the inventory.

---

## 37 — English weapon and random-loot localization

- Fixed Russian fragments that had accidentally appeared in English weapon names, descriptions, and ranges.
- Random-loot item names now switch correctly with the application language.
- The item previously shown as «Косметичка» is displayed as `Cosmetics Bag` in English.

---

## 36 — English perk localization

- Fixed the English localization of all 94 perks.
- Perk names and descriptions are now displayed in English when the English locale is selected.
