# Armor Mods Integration Guide

This PR is intentionally scoped to simplify GitHub integration of armor mod work.

## What to merge first
1. Data files (`i18n/*/armor_mods.json`, `i18n/*/uniq_armor_mods.json`, `i18n/*/armor_effects.json`).
2. Catalog normalizer (`i18n/equipmentNormalizer.js`) and catalog wiring (`i18n/equipmentCatalog.js`).
3. UI files for modals and screen integration.

## Required runtime fields on equipped items
- Armor item:
  - `appliedArmorModId` (optional)
  - `appliedUniqueArmorModId` (optional)
- Clothing item:
  - `appliedClothingModId` (optional)

## Backward compatibility
The normalizer keeps support for legacy item names and shapes (`Name`/`name`/`Название`).

## Quick verification checklist
- Open Weapons & Armor screen.
- Equip armor only: row `Улучшение Брони` appears.
- Equip clothing only: row `Улучшение Одежды` appears.
- Press `+` and apply a mod.
- Confirm resistance values update in slot card.

