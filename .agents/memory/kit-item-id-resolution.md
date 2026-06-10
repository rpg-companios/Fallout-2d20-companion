---
name: Kit inventory item ID resolution
description: Rules for how kit items get their canonical ID when added to the Zustand store, and common data pitfalls.
---

## Rule
`addNewItem` (characterStore.js) resolves a canonical ID from the first truthy field:
  `weaponId → id → code → itemId → armorId → clothingId`

`normalizeItems` in migrations.js uses the same chain when loading from DB.

`resolveAmmoObject` (kitResolver.js) must include `id: ammoId` in its return object or ammo items will be silently dropped.

## Why
Kit JSON items use different ID fields depending on item type:
- Weapons: `weaponId`
- Armor: `armorId`
- Clothing: `clothingId`
- Consumables/misc: `itemId`
- Ammo (resolved): no id field before fix → silently dropped

If catalog lookup fails (ID not in catalog), the resolved item has no `id` field, only the original `armorId`/`clothingId`/`itemId`. Without the fallback chain, `addNewItem` warns and returns without storing the item.

## How to apply
When kit JSONs reference armor/clothing/misc items, verify the ID exists in the catalog:
- Armor catalog: `i18n/en-EN/data/equipment/armor/armor.json` (and ru-RU equivalent)
- Clothing catalog: `i18n/en-EN/data/equipment/armor/clothes.json`
- Consumables: `data/consumables/chems.json`, `drinks.json`, `food.json`

Known fixed data bug: `armor_vault_chest_001` in vaultDweller.json was replaced with `armor_vault_fullbody_001` (the correct catalog ID for vault security full-body armor).
