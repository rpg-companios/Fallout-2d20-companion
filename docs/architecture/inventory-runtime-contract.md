# Inventory runtime contract

`components/screens/InventoryScreen/InventoryScreen.js` remains engine-owned. It owns the stable inventory table and cross-setting flow (rows, currency controls, buying/selling, generic equipment actions) and does not get replaced wholesale by a setting. Setting-specific mechanics and presentations are optional capabilities; custom catalog/user-item behavior remains a separate, deferred audit area.

A setting contributes behavior through the active runtime's `services.inventory` object:

```js
services: {
  inventory: {
    itemTypeIds: {},
    itemParameterFields: [],
    itemInstanceFields: [],
    itemSaveStateFields: [],
    features: {
      // Optional capabilities; omit a key when the setting does not support it.
    },
  },
}
```

The engine must not assume every setting has repair, tracked durability, salvage, crafting, powered armor, robot equipment, loot bonuses, or equipment filters. If an optional capability is absent, its controls and data are absent too. The engine treats setting-owned item-type IDs and instance payload keys as opaque values.

## Current optional capabilities

| Capability | Contract | Current Fallout contribution |
|---|---|---|
| `crafting` | `{ Modal }` | Fallout recipe UI and rules |
| `repair` | `{ Modal, isAffordable(id), isPieceAffordable(id), getJuryRiggingRanks() }` | Book repair and jury-rigging rules |
| `durability` | `{ selectSettings(state), initializeAcquisition(item, options), getPresentation(item, settings) }` | Tracked durability for eligible items |
| `powerArmor` | Catalog access, `getStackKey(item)`, `initializeAcquisition(item, options)`, row presentation/data/rendering, and optional `createActions(set, get)` | Fallout power-armor/fusion-core rules, acquisition, state workflows, and specialized rows |
| `robotEquipment` | Robot classification, body/weapon inventory queries, slot/equipment operations, settings selector, and optional inventory-row status/actions | Fallout robot inventory/equipment behavior, including the Mk II upgrade row action |
| `equipmentEligibility` | `canEquipArmor/Weapon/Clothing`, `resolveProtectionLayer`, `blocksArmorOverlay` | Fallout fit restrictions and denial-reason identifiers |
| `itemModifiers` | Setting-owned `applyWeapon(base, modifiers)` and `enrichWeapon(item, catalog, options)` | Fallout weapon modification and enrichment rules |
| `modifierStorage` | Optional catalog modifier IDs, additional `{ targetId, modifierId, slotId }` roles, record ID/creation, and unmatched-link policy | Fallout armor fields and nested robot-slot weapon targets |
| `armorMods` | Eligibility, presentation, and application functions for a setting's armor modifiers | Fallout armor-mod semantics and DR fields |
| `salvage` | `{ salvageItem(id), getButton(item, state), buildReport(result) }` | Scrap/recycling rules and button state |
| `itemRarity` | `{ getForItem(id) }` | Fallout rarity display |
| `perkDisplay` | `{ getForId({id}) }` | Fallout perk names in inventory notices |
| `lootBonuses` | `{ roll(perkBonuses, itemType, item?), sum(events) }` | Fallout perk-driven extra loot/currency |
| `weaponPresentation` | Optional weapon labels/sorting/mod descriptions/ammo presentation plus `getDisplayItem(item, perkBonuses)` | Fallout-specific weapon presentation |
| `consumables` | `{ rerollRadiation(item, rolls) }` | Fallout radiation reroll choice |
| `equipmentFilter` | Modal plus option/count/tree functions and an optional `formatResultsFound(count)` label formatter | Fallout catalog filters |

`durability.initializeAcquisition` returns `null` when it does not handle an item; otherwise it returns the individual item instances to add. `durability.getPresentation` returns `null` when there is no durability row to show, otherwise `{ current, maximum }`. Package-owned selectors keep setting preference keys out of engine code.

The optional `powerArmor.createActions(set, get)` factory binds setting-owned workflows to the host store. The shared screen requests optional catalog items and inventory rows through the same feature and delegates specialized row rendering to the capability; it does not construct power-armor catalog rows or labels itself. Power-armor and robot runtime payloads live in setting extensions; the package projects them onto the existing save keys.

## Catalog and item-shape hooks

A setting publishes its localized equipment projection and locale-independent mechanics data through `services.catalogs.equipment.getLocalized(locale)` and `getMechanics()`. The legacy database query facade is optional `services.catalogs.equipment.databaseRows`; setting-owned row projections are dispatched through it. The engine's `i18n/equipmentCatalog.js` and `db/catalogSource.js` are compatibility adapters only; they do not build setting catalog schemas or row formats.

The optional `services.inventory` object may provide:

- `findCatalogEntry(catalog, id, itemType)` and `catalogItemTypeCandidates` for setting-owned catalog lookup;
- `inferItemTypeFromId(id)`, `inferItemTypeFromItem(item)`, `classifyItem(item)`, and `itemTypeIds` for legacy interpretation and generic UI roles;
- `getCatalogItemId(instance)` / `getItemCatalogId(item)` to interpret setting-owned identifiers;
- `itemParameterFields` and `itemInstanceFields` to declare opaque catalog-stat and instance-state keys;
- `itemSaveStateFields` to declare which setting-owned instance fields survive the compact save projection;
- `resolveModifiedItem(item, catalog)` and `expandCatalogItems(entries, baseEntries)` for setting-owned derived items and catalog variants;
- `describeItemBasics(item, locale)`, type/category label/icon hooks, and random-loot/catalog presentation helpers;
- `getProtectionKind(item)`, `getArmorCategoryKey(item, catalog)`, and `isArmorLikeItem(item)` where applicable.

The engine's item resolver performs no setting catalog-category switch. Item parameter normalization and item-instance projection use only generic shared fields plus the active setting's declared key lists. Catalog lookup misses remain misses; the engine does not fall through into a different setting's categories. `expandCatalogItems` is setting-owned because variant inheritance and modifier semantics differ by game system.

The generic `AddItemModal` remains engine-owned and treats the returned category tree as opaque. The setting supplies category hierarchy, type labels/icons, weapon-group definitions, filter labels, searchable items, and catalog lookup. A legacy SQLite weapon-group bridge and the custom user-equipment overlay remain in the outstanding inventory/API audit; the latter is intentionally not being changed before the repository split.

The separate optional `services.consumables` capability may expose `getItemStoreFields(item)` and `isConsumableItem(item)`. The first returns setting-owned instance payload fields; the engine copies that object opaquely so persisted payload fields remain unchanged. The second lets the shared inventory screen ask the active setting whether an item can be applied.

All inventory UI dictionaries (including shared table and trade-modals labels) are supplied by the active package. The engine does not merge a Fallout dictionary as fallback; a missing translation remains visible.

Setting-owned character resources use the generic store dispatch `applySettingResourceMutation(resourceId, valueOrUpdater, options)`, backed by `services.characterResources.applyMutation({ resourceId, valueOrUpdater, options, get, set })`; the setting declares resource ID, extension field, clamping, and side effects. The existing Fallout radiation save key remains flat and is emitted by the Fallout save capability.

`services.characterSave` owns the persistent projection of setting extensions. Its optional `mapItemContainers(data, mapItem)` callback walks setting-specific nested item containers, while `slimSettingContainers(data)` applies setting-owned compact container encodings after generic item projection. `getSnapshotFields(state)` emits legacy top-level save keys. These callbacks let the shared save engine remain unaware of setting container names while preserving existing files.

The feature registry is additive: new settings may omit any or all current capabilities and may add further keys without changing the stable inventory-table contract. Only the selected package supplies this object.
