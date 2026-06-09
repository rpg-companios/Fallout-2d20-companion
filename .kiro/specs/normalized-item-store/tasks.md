# Implementation Plan

## Overview

The implementation will follow a test-driven approach, building incrementally from foundational infrastructure to full integration. Each step builds on the previous, with early validation through unit tests.

**Key Principles:**
1. Start with pure, testable resolvers and utilities (no React dependencies)
2. Implement Zustand Store with middleware (persist for localStorage, devtools for debugging)
3. Add migrations for backward compatibility with existing saved data
4. Integrate with CharacterContext step-by-step (new API side-by-side with deprecated)
5. Update screens to use Zustand Store selectors (gradual migration)

---

- [x] 0. Install dependencies and project setup
 - Install Zustand and configure project structure
 - _Requirements: 8.3_

- [x] 0.1 Install Zustand
  - Run `npm install zustand @zustand/persist` to add Zustand as a project dependency
  - Verify installation with `npx expo start` (should not show import errors)
  - _Requirements: 8.3_

- [x] 0.2 Create directory structure
  - Create `src/store/` directory
  - Create `src/store/resolvers.js` for parameter calculation utilities
  - Create `src/store/migrations.js` for data migration functions
  - Create `src/types/characterStore.d.ts` for TypeScript interfaces (if using TS)
  - _Requirements: 2.1, 2.2_

---

- [x] 1. Implement resolvers and derived stats (pure functions)
 - Create utilities for calculating parameter totals and derived stats
 - _Requirements: 2.1, 2.2, 3.4, 6.1, 6.2, 6.3_

- [x] 1.1 Implement attribute resolvers
  - Write `calculateAttributeTotal(attribute)` — calculates `base + Σ(modifiers)`
  - Write `calculateSkillTotal(skill)` — calculates `base + Σ(modifiers)` for skills
  - Write `normalizeItemParameters(item)` — calculates `total` for all item parameters
  - _Requirements: 2.1, 2.2_

- [x] 1.2 Implement derived stats calculator
  - Write `calculateDerivedStats(attributes, effects, trait)` — calculates `maxHealth`, `initiative`, `defense`, `meleeBonus`, `carryWeight`
  - Write `applyEffectToStats(stats, effect)` — applies effect parameters to stats
  - _Requirements: 3.4, 6.1, 6.2, 6.3_

- [x] 1.3 Create TypeScript type definitions (if applicable)
  - Define `Parameter<T>`, `ParameterModifier`, `Attribute`, `Skill`, `Item`, `Effect` types
  - Export types for use in store and components
  - _Requirements: 2.1, 2.2_

---

- [x] 2. Create Zustand Store with persistence
 - Build the core store with actions for attributes, items, and effects
 - Integrate with localStorage for persistence
 - _Requirements: 1.1, 1.2, 4.1, 4.2_

- [x] 2.1 Create initial Zustand store structure
  - Write `src/store/characterStore.js` with basic structure
  - Define initial state: `{ attributes: {}, skills: {}, items: {}, effects: {} }`
  - Implement `create()` with `zustand/middleware` for devtools
  - _Requirements: 1.1, 4.1_

- [x] 2.2 Implement attribute actions
  - Write `updateAttribute(attrId, delta)` — updates `base` and recalculates `total`
  - Write `addAttributeModifier(attrId, source, value, operation)`
  - Write `removeAttributeModifier(attrId, source)`
  - Implement `recalculateAll()` to trigger dependent calculations
  - _Requirements: 1.1, 3.1_

- [x] 2.3 Implement item actions
  - Write `updateItem(itemId, patch)` — updates item and recalculates parameters
  - Write `equipItem(itemId)` — sets `equipped = true`
  - Write `unequipItem(itemId)` — sets `equipped = false`
  - _Requirements: 1.1, 3.1, 3.2, 5.1, 5.2_

- [x] 2.4 Implement effect actions
  - Write `addEffect(effect)` — adds active effect to store
  - Write `expireEffect(effectId)` — sets `active = false`
  - Write `pruneExpiredEffects()` — called periodically to remove expired effects
  - _Requirements: 1.1, 3.3, 5.3_

- [x] 2.5 Add localStorage persistence
  - Integrate `persist` middleware with partial state serialization
  - Define `partialize()` to save only `attributes`, `skills`, `items`, `effects`
  - Configure storage key (`character-store`)
  - _Requirements: 4.1, 4.2_

---

- [ ] 3. Implement migrations for existing data (single one-time conversion)
 - Convert old data format to normalized state on first load only
 - No backward compatibility or denormalization needed
 - _Requirements: 4.1, 4.2_

- [x] 3.1 Add schema_version to saved data
  - Update serializeState to include `schemaVersion: 1`
  - Update deserializeState to read `schemaVersion`
  - _Requirements: 4.1_

- [x] 3.2 Create `normalizeCharacterState(data)` function
  - Convert `attributes: [{name, value}]` → `attributes: {id: {base, modifiers[], total}}`
  - Convert `skills: [{name, value}]` → `skills: {id: {base, modifiers[], total}}`
  - Convert `equipment.items + equippedWeapons` → `items: {id: normalizedItem}`
  - Convert `activeTimedEffects` → `effects: {id: normalizedEffect}`
  - Return `{ ...normalizedState, schemaVersion: 1 }`
  - _Requirements: 4.1_

- [x] 3.3 Test migration with sample data
  - Create test data in old format (attributes[], skills[], equipment, equippedWeapons, activeTimedEffects)
  - Run `normalizeCharacterState()` → verify normalized state structure
  - Verify schemaVersion is set to 1
  - Verify all parameters have base/modifiers/total structure
  - _Requirements: 4.1, 4.2_

---

- [x] 4. Integrate Zustand Store with CharacterContext


 - Migrate CharacterContext to use Zustand Store while keeping old API as deprecated
 - _Requirements: 4.3, 4.4, 8.3_

- [x] 4.1 Import Zustand Store into CharacterContext




  - Import `useCharacterStore` from `src/store/characterStore.js`
  - Create wrapper hooks: `useCharacterAttribute`, `useCharacterItem`, `useCharacterEffect`
  - _Requirements: 4.3, 4.4_

- [ ] 4.2 Update `commitAttributeChanges` and `handleSelectKit` to use Zustand Store
  - Replace `setAttributes(newAttributes)` with `updateAttribute(attrId, delta)`
  - Update `handleSelectKit` in CharacterScreen to call `addNewItem(item)` for each item in `kit.items`
  - Add deprecation warning in console for old API
  - _Requirements: 4.3_

- [ ] 4.3 Update item management functions
  - Replace `setEquippedWeapons(prev => [...prev, newWeapon])` with `equipItem(itemId)`
  - Replace `setModifiedItems()` with `updateItem(itemId, patch)`
  - Add deprecation warnings (console.warn)
  - _Requirements: 4.3, 4.4_

- [x] 4.3.1 Add `addNewItem(item)` action to Zustand Store




  - Write `addNewItem(item)` action that normalizes item ID and adds to `items` dictionary with `equipped: false`
  - Handle uniqueId generation if not present
  - Generate `stackKey` for stacking identical items (same weaponId + same appliedMods)
  - Generate `id` based on weaponId + appliedMods: `weaponId` (no mods) or `weaponId_mods_mod1_mod2` (with mods)
  - Apply mods to parameters: `damage.modifiers.push({source: 'mod_modId', value: modValue, operation: modOp})`
  - _Requirements: 4.3, 4.4, 2.1, 2.2_

- [ ] 4.4 Add migration on load
  - In `loadCharacter()`, call `normalizeCharacterState(data)` to convert old format
  - Populate Zustand Store with normalized state
  - _Requirements: 4.1_

- [ ] 4.5 Add migration on save
  - In `saveCharacter()`, call `denormalizeCharacterState()` to convert to old format
  - Save denormalized state to database (for compatibility with old format)
  - _Requirements: 4.2_

---

- [ ] 5. Create screen selectors and update InventoryScreen
 - Implement selectors to get filtered/derived data from Zustand Store
 - Update InventoryScreen to use Zustand Store instead of local state
 - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 5.1 Create utility functions for selecting data
  - Write `selectItemsByEquipped(state, equipped)` — filter items by `equipped` status
  - Write `selectItemsByType(state, itemType)` — filter by `itemType`
  - Write `selectAttributeTotal(state, attrId)` — get total value for attribute
  - Write `selectSkillTotal(state, skillId)` — get total value for skill
  - _Requirements: 7.1, 7.4_

- [ ] 5.2 Update InventoryScreen to use Zustand Store
  - Replace `equipment?.items` with `useSelector(state => selectItemsByEquipped(state, false))`
  - Replace `equippedWeapons` with `useSelector(state => selectItemsByEquipped(state, true))`
  - Update `handleEquipWeapon` to call `equipItem(itemId)` instead of `setEquippedWeapons`
  - Update `handleUnequipWeapon` to call `unequipItem(itemId)` instead of removing from array
  - Update `handleAddItem` (from modals) to call `addNewItem(item)` instead of `updateInventoryItems`
  - Update `handleConfirmBuy` (BuyItemModal) to call `addNewItem(item)` instead of `handleAddItem`
  - _Requirements: 1.2, 3.2, 7.4_

- [ ] 5.3 Update CharacterScreen to use Zustand Store for attributes/skills
  - Replace `attributes` with `useSelector(state => Object.values(state.attributes))`
  - Replace `skills` with `useSelector(state => Object.values(state.skills))`
  - Update `handleChangeAttribute` to call `updateAttribute(attrId, delta)`
  - _Requirements: 1.1, 3.1, 7.4_

---

- [ ] 6. Update WeaponsAndArmorScreen
 - Update WeaponsAndArmorScreen to use Zustand Store for items
 - Verify real-time updates when items are modified in InventoryScreen
 - _Requirements: 6.4, 7.2_

- [ ] 6.1 Update WeaponsAndArmorScreen to use Zustand Store
  - Replace `equippedWeapons` with `useSelector(state => selectItemsByEquipped(state, true))`
  - Replace `equippedArmor` with `useSelector(state => getEquippedArmor(state))`
  - Update `handleApplyModification` to call `updateItem(itemId, modifiedItem)`
  - _Requirements: 6.4, 7.2_

- [ ] 6.2 Test real-time updates
  - Equip weapon in InventoryScreen → verify it appears in WeaponsAndArmorScreen
  - Modify weapon in WeaponsAndArmorScreen → verify damage/fireRate change in real-time
  - _Requirements: 6.4_

---

- [ ] 7. Update effects integration
 - Implement full effects flow with automatic parameter recalculation
 - Verify effects apply/retract parameters correctly
 - _Requirements: 5.1, 5.2, 5.3_

- [ ] 7.1 Implement effects application
  - Update `applyConsumableFull` to call `addEffect(effect)` instead of `setActiveTimedEffects`
  - Update `advanceScene` to call `expireEffect(effectId)` instead of `setActiveTimedEffects`
  - Implement `triggerDependentCalculations()` in Zustand Store
  - _Requirements: 5.1, 5.2_

- [ ] 7.2 Update resolvers for effects
  - Update `calculateDerivedStats` to use `getTimedMaxHpBonus(effects)` from Zustand Store
  - Update `calculateDerivedStats` to use `getTimedDamageResistanceBonus(effects)` from Zustand Store
  - _Requirements: 5.3_

- [ ] 7.3 Test effects flow
  - Apply stimpak → verify maxHp bonus is added to derived stats
  - Wait for effect to expire → verify maxHp bonus is removed
  - Apply perk with attribute bonus → verify attribute total updates
  - _Requirements: 5.1, 5.2, 5.3_

---

- [ ] 8. Final integration and testing
 - Full end-to-end testing of all flows
 - Performance optimization if needed
 - Deprecation of old API
 - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_

- [ ] 8.1 End-to-end testing
  - Create character → save/load → verify normalized state
  - Equip weapon → modify weapon → verify real-time updates
  - Apply perk → verify attribute and derived stats updates
  - Apply timed effect → wait for expiration → verify parameter changes
  - _Requirements: 8.1, 8.2_

- [ ] 8.2 Performance optimization
  - Profile Zustand Store with React DevTools
  - Optimize selectors if needed (use `useSelector` with memoization)
  - Verify 60 FPS with 1000+ items
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] 8.3 Deprecate old API
  - Remove deprecated `setAttributes`, `setEquippedWeapons`, `setModifiedItems` from CharacterContext
  - Remove deprecated `modifiedItems` Map
  - Update all components to use new API
  - _Requirements: 4.3, 4.4_

---

- [ ] 9. Cleanup and documentation
 - Remove old code that's no longer needed
 - Document the new architecture
 - _Requirements: 8.3_

- [ ] 9.1 Remove deprecated files and code
  - Delete `components/CharacterContext.js` after migration is complete (backup first)
  - Remove `domain/attributeKeyUtils.js` if it's only used for character attributes (now in store)
  - Remove `domain/equipEquip.js` if all equip logic is migrated to store actions
  - Remove old migration scripts if they're no longer needed
  - _Requirements: 8.3_

- [ ] 9.2 Documentation
  - Add comment headers to `characterStore.js` explaining the architecture
  - Document action functions with JSDoc
  - Add `docs/architecture/normalized-store.md` with visual diagrams
  - _Requirements: 8.3_