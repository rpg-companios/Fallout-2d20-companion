# Changelog

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
