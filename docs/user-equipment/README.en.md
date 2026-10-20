# User-Created Equipment for Fallout 2d20

[Русская версия](README.md)

Format version: **`schemaVersion: 1`**. This guide applies to the active `fallout` setting and to the four user-data files below.

## Ready-to-edit JSON templates

Each file contains working example records. Import a template as-is, then replace or remove the examples and add your own data. These are standard JSON files with no comments.

- [Weapons — `usrdataWeapon.json`](templates/usrdataWeapon.json)
- [Armor — `usrdataArmor.json`](templates/usrdataArmor.json)
- [Weapon mods — `usrdataWeaponMods.json`](templates/usrdataWeaponMods.json)
- [Armor mods — `usrdataArmorMods.json`](templates/usrdataArmorMods.json)

Import a file using the matching data type in the app settings. To start another data set, copy the relevant template and edit the copy.

## Common file structure

```json
{
  "schemaVersion": 1,
  "settingId": "fallout",
  "kind": "weapons",
  "items": []
}
```

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | integer | Required; currently `1`. |
| `settingId` | string | Must match the active setting ID. In this project it is `fallout`. |
| `kind` | string | `weapons`, `armor`, `weaponMods`, or `armorMods`. It must match the file's data type. |
| `items` | array | Records of one kind. An empty array is allowed. |

File names are case-sensitive and must follow the app's convention: `usrdataWeapon.json`, `usrdataArmor.json`, `usrdataWeaponMods.json`, and `usrdataArmorMods.json`. Do not rename them when syncing.

## Common record fields

| Field | Type | Rule |
|---|---|---|
| `id` | string | Required. Latin letters, digits, `_`, and `-`; the first character must be a letter or digit; maximum 96 characters. Must be unique within its file. |
| `names` | object | Required: non-empty `ru-RU` and `en-EN` values. These are the record's display names in the app. |
| `itemType` | string | Optional for `weapons`/`armor`; if present, it must be `weapon`/`armor` respectively. |
| `_updatedAt` | number | Internal sync field. Do not add it manually. |

Unknown record fields are rejected. Names from the source JSON are stored separately for each locale. If a display name conflicts with an existing one, the app adds ` (ver.)` to the conflicting display name; the source file is not rewritten.

Importing a record with the same source `id` updates that record. Records omitted from a later file are not automatically deleted. If a user ID conflicts with a catalog ID, the app assigns a deterministic ID such as `<id>__usr_<suffix>`; the resulting ID and names remain stable across devices.

## Linked variants with `trueItemId`

`trueItemId` creates a separate, named item based on an existing item. It is **not** an installable mod.

```json
{
  "id": "usr_weapon_variant",
  "names": { "ru-RU": "Мой вариант", "en-EN": "My Variant" },
  "trueItemId": "weapon_44_pistol",
  "modifiers": {
    "damageModifier": { "op": "+", "value": 2 }
  }
}
```

- `trueItemId` is the ID of a base item in the active catalog. Variants can also refer to other records in the same user-data file; cyclic chains are not allowed.
- Unspecified characteristics and quality/effect lists are inherited from the base item. An explicitly provided field replaces the inherited field.
- A variant must have its own `id` and names in both languages.
- Do not copy inherited characteristics unless needed. In particular, omit `range`/`ammoId` to inherit them. An explicitly supplied empty string (`""`) is an empty value, not “inherit from the base item.”
- Numeric changes go under `modifiers`. Weapons and armor support `qualityChanges` and `effectChanges`; accepted IDs are listed below.

## Numeric operations

Every numeric modifier has this shape:

```json
{ "op": "+", "value": 2 }
```

Supported operations: `+`, `-`, `*`, `/`. `set` is not supported in user-data files. `value` must be a finite JSON number; division by zero is not allowed. The result cannot be negative. If the target characteristic is an integer, a fractional result is rejected rather than rounded.

| Example | Result |
|---|---|
| `{ "op": "+", "value": 2 }` | add 2 |
| `{ "op": "-", "value": 1 }` | subtract 1 |
| `{ "op": "*", "value": 1.5 }` | multiply by 1.5 |
| `{ "op": "/", "value": 2 }` | divide by 2; the result must be an integer for an integer field |

Weight may be fractional. Damage, fire rate, cost, rarity, damage ratings, `ammoPerShot`, and range are integer characteristics. Weapon range is an ordered scale: `C` / `M` / `L` / `E` (indices 0–3); an empty string is allowed for a weapon without a range. Range changes are clamped to the ends of the scale.

## Weapons — `kind: "weapons"`

### Standalone weapons

Without `trueItemId`, provide all primary characteristics:

| Field | Type | Requirement |
|---|---|---|
| `damage`, `fireRate`, `weight`, `cost`, `rarity` | number | Required and non-negative; integer fields must be whole numbers. Weight may be fractional. |
| `ammoId` | string | Required. Ammunition ID from the catalog; `""` is allowed for a weapon with no ammunition. |
| `range` | string | Required. Usually `C`, `M`, `L`, or `E`; `""` is allowed. |
| `mainAttr` | string | Required; values in the current catalog: `AGI`, `PER`, `STR`. |
| `mainSkill` | string | Required; a skill ID from the list below. |
| `weaponType` | string | Required; a value from the list below. |
| `damageType` | string or array | Required; one or more damage types from the list below. |
| `qualities`, `effects` | array | Optional; IDs from the qualities and effects catalogs. |
| `range_index` | integer | Optional; from `0` to `3`. When present, it is used as the range index. |
| `ammoPerShot` | number | Optional; a non-negative integer. |
| `imageName`, `hasStockVariant`, `withoutMods`, `stockNames` | — | Optional additional item fields. |

`mainSkill`: `BIG_GUNS`, `ENERGY_WEAPONS`, `EXPLOSIVES`, `MELEE_WEAPONS`, `SMALL_GUNS`, `THROWING`, `UNARMED`.

`weaponType`: `Energy`, `Explosive`, `Heavy`, `Light`, `Melee`, `Thrown`, `Unarmed`.

Damage types in the current catalog: `physical`, `energy`, `radiation`, `special`, `poison`. These values come from setting data; use the app catalog as the source of truth if they change.

### Modifiers for linked weapons

Under `modifiers`, numeric changes are allowed for `damage`, `fireRate`, `weight`, `cost`, `rarity`, `ammoPerShot`, `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, and `rangeModifier`. For example:

```json
"modifiers": {
  "damageModifier": { "op": "/", "value": 2 },
  "weightModifier": { "op": "*", "value": 1.5 },
  "qualityChanges": [
    { "op": "gain", "qualityId": "quality_accurate" }
  ],
  "effectChanges": [
    { "op": "lose", "effectId": "effect_vicious" }
  ]
}
```

`qualityChanges` and `effectChanges` are arrays of objects with `op: "gain" | "lose"` and an existing ID. A `value` may be supplied for a ranked quality.

## Armor — `kind: "armor"`

Without `trueItemId`, the following are required: `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, `weight`, `cost`, `rarity`, a non-empty `protectedAreas`, and an existing `armorCategoryKey`.

Current category keys: `raiderArmor`, `leatherArmor`, `metalArmor`, `combatArmor`, `synthArmor`, `vaultSecurityArmor`.

Allowed areas: `Body`, `Head`, `Hand`, `Leg`. If present, `specialEffects` must be an array of objects such as `{ "id": "<armor-effect-id>", "value": 1 }`; the ID must appear in the “Armor effects” list below.

For a linked variant, use numeric changes for `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, `weight`, `cost`, and `rarity`. `qualityChanges` and `effectChanges` are checked against the same ID catalogs as weapons.

## Weapon mods — `kind: "weaponMods"`

Required fields: `id`, `names`, `modType: "weapon"`, `slot`, and an `applies_to_ids` array.

| Field | Description |
|---|---|
| `slot` | A slot present in the catalog. Current values: `Barrel`, `Camera`, `Canister`, `Capacitor`, `Concentrate`, `Container`, `Dish`, `Frame`, `Fuel`, `Grip`, `Launcher`, `Magazine`, `Muzzle`, `Nozzle`, `Receiver`, `Sight`, `Stock`, `Tank`, `Unique`, `Winch`. In addition to the slot existing, verify that it is compatible with the specified weapon. |
| `applies_to_ids` | Array of weapon IDs this mod can be applied to. If the mod refers to a user-created weapon in `usrdataWeapon.json`, import the weapon first. |
| `damageModifier`, `fireRateModifier`, `rangeModifier`, `weightModifier`, `costModifier` | Numeric operations on the corresponding weapon field. `weightModifier` may produce a fractional weight; integer fields are checked after the operation. |
| `qualityChanges`, `effectChanges` | Arrays of quality/effect changes by ID. |
| `damageTypeOverride` | Optional: `{ "op": "set" | "add", "value": "energy" }` (`value` may be an array of damage types). |
| `damageType` | Optional: one allowed damage type. |
| `ammoOverride` | Optional: an ammunition ID from the catalog. |
| `ammoPerShotDelta` | Optional: an integer addition to ammunition consumed per shot. |
| `cost`, `weight`, `complexity` | Optional cost, weight, and complexity of the mod itself. Cost and complexity are non-negative integers; weight may be fractional. |
| `perk1`, `perk2`, `skill`, `rarity`, `materials`, `prefix` | Optional display/crafting details. Copy the accepted format from existing mod records in the setting. |

## Armor mods — `kind: "armorMods"`

Required fields: `id`, `names`, `modType` (`"armor"` or `"armorUnique"`), `modCategory`, and a non-empty `protectedAreas` array.

| Field | Description |
|---|---|
| `protectedAreas` | One or more areas: `Body`, `Head`, `Hand`, `Leg`. |
| `modCategory` | A category from the existing armor-mod catalog; compatibility depends on the item's `armorCategoryKey`. Current category IDs: `standardMods`, `combatUniqueMods`, `costumeUniqueMods`, `leatherUniqueMods`, `metalUniqueMods`, `raiderUniqueMods`, `synthUniqueMods`, `vaultSuitUniqueMods`. |
| `costModifier`, `weightModifier` | Numeric operations on armor cost and weight. Weight may become fractional. |
| `statModifiers` | Object with optional `physicalDamageRating`, `energyDamageRating`, and `radiationDamageRating` keys; values are numeric operations. The resulting damage rating must be an integer. |
| `specialEffects` | Array of `{ "id": "<armor-effect-id>", "value": 1 }`; IDs are checked against the armor-effects catalog. |
| `complexity` | Optional non-negative integer complexity. |
| `requiredPerk`, `requiredSkill` | Optional installation/crafting requirements. Values are not translated and must follow the format used by the app's data. |

## Allowed quality and effect IDs

These lists come from the current Fallout catalogs. On import, quality IDs and combat-effect IDs are checked against `qualities.json` / `damageEffects.json`; armor `specialEffects` are checked against keys in `armor_effects.json`. Names below are taken from the app's `ru-RU` and `en-EN` dictionaries.

### Weapon qualities (`qualityChanges`, `qualities`)

ID source: `modules/fallout/i18n/<locale>/data/system/qualities.json`.

| ID | ru-RU | en-EN |
|---|---|---|
| `quality_accurate` | Точное | Accurate |
| `quality_blast` | Врыв | Blast |
| `quality_close_quarters` | Вплотную | Close Quarters |
| `quality_concealed` | Скрытное | Concealed |
| `quality_debilitating` | Изнуряющий | Debilitating |
| `quality_gatling` | Гатлинг | Gatling |
| `quality_inaccurate` | Неточное | Inaccurate |
| `quality_mine` | Мина | Mine |
| `quality_night_vision` | Ночное Видение | Night Vision |
| `quality_parry` | Паррирование | Parry |
| `quality_recon` | Разведовательный | Recon |
| `quality_reliable` | Надежное | Reliable |
| `quality_suppressed` | Тихое | Suppressed |
| `quality_two-handed` | Двуручное | Two-Handed |
| `quality_unreliable` | Ненадежное | Unreliable |
| `quality_re-roll_hit_location` | Перевыбрать конечность | Re-roll Hit Location |
| `quality_bayonet` | Штык | Bayonet |
| `quality_crank_x` | Ствол X | Crank X |
| `quality_shredder` | Крушащий | Shredder |
| `quality_disarm` | Обезоруживающий | Disarm |
| `quality_sneak_attack` | Скрытная атака | Sneak Attack |
| `quality_targetting_computer` | Компьютер наведения | Targetting Computer |
| `quality_slow_load` | Медленная перезарядка | Slow Load |
| `quality_recoil_x` | Отдача X | Recoil X |
| `quality_ammo-hungry_x` | Пожиратель патронов | Ammo-Hungry |
| `quality_surge` | Импульс | Surge |
| `quality_bombard` | Бомбарда | Bombard |
| `quality_thrown` | Метательное | Thrown |
| `quality_underwater` | Подводное | Underwater |
| `quality_tranq_x` | Усмирение X | Tranquilizer X |
| `quality_delay_x` | Задержка X | Delay X |
| `quality_placed` | Закладываемое | Placed |

### Combat effects (`effectChanges`, `effects`)

ID source: `modules/fallout/i18n/<locale>/data/system/damageEffects.json`.

| ID | ru-RU | en-EN |
|---|---|---|
| `effect_arc` | Дуга | Arc |
| `effect_breaking` | Разрушающий | Breaking |
| `effect_burst` | Очередь | Burst |
| `effect_freeze` | Замораживающий | Freeze |
| `effect_persistent` | Устойчивый | Persistent |
| `effect_piercing_x` | Проникающий | Piercing |
| `effect_radioactive` | Радиоактивный | Radioactive |
| `effect_spread` | Разброс | Spread |
| `effect_stun` | Оглушающий | Stun |
| `effect_vicious` | Порочный | Vicious |

### Armor effects (`specialEffects`)

Mechanics source: `modules/fallout/data/equipment/armor_effects.json`; localized descriptions: `modules/fallout/i18n/<locale>/data/equipment/armor/armor_effects.json`.

| ID | ru-RU | en-EN |
|---|---|---|
| `effect_explosive_resistance_2` | +2 к сопротивлению взрывным повреждениям. | +2 resistance to explosive damage. |
| `effect_explosive_resistance_4` | +4 к сопротивлению взрывным повреждениям. | +4 resistance to explosive damage. |
| `effect_ignore_energy_persistent` | Игнорировать стойкие энергетические повреждения. | Ignore persistent energy damage. |
| `effect_chems_duration_double` | Удвоить длительность действия химикатов. | Double the duration of chems effects. |
| `effect_stun_immunity` | Иммунитет к оглушению (порог 2). | Immunity to stun (threshold 2). |
| `effect_unarmed_melee_damage_1` | +1 к урону безоружного ближнего боя. | +1 to unarmed melee damage. |
| `effect_melee_damage_resistance_2` | +2 к сопротивлению урону ближнего боя. | +2 resistance to melee damage. |
| `effect_aimed_ranged_damage_1` | +1 к урону прицельной стрельбы. | +1 to aimed ranged damage. |
| `effect_ap_bonus_damage_melee` | +4 к бонусному урону ближнего боя за AP. | +4 AP bonus damage for melee. |
| `effect_melee_piercing_1` | Атаки ближнего боя получают качество «Пробивание 1». | Melee attacks gain the Piercing 1 quality. |
| `effect_fall_damage_resistance` | +2 к сопротивлению урону от падения. | +2 resistance to fall damage. |
| `effect_sneak_reroll` | Один раз за сцену перебросить проверку скрытности. | Once per scene, reroll a Sneak check. |

## Reference IDs

- `trueItemId`: ID of a weapon or armor item in the active catalog. Fallout mechanics sources: `modules/fallout/data/equipment/weapons.json`, `modules/fallout/data/equipment/robot/weapons.json`, and `modules/fallout/data/equipment/armor.json`.
- `ammoId` / `ammoOverride`: ID from `modules/fallout/data/equipment/ammo.json`; an empty string is allowed for standalone weapons.
- `applies_to_ids`: weapon IDs from the catalog. If the ID refers to a user-created weapon, import `usrdataWeapon.json` first.
- `armorCategoryKey`: key from `modules/fallout/data/equipment/armor.json`.
- `slot`: slot from the weapon-mod catalog; it must be compatible with the target weapon.
- `modCategory`: category from `armor_mods.json` / `uniq_armor_mods.json`; the app also checks whether the armor category allows it.

Do not invent localized names or IDs for qualities/effects. Adding IDs to these catalogs is a setting-data change, not a user JSON change.

## Local storage and Google Drive

Local records are stored by `settingId` in `src/store/userEquipmentStore.js`; the catalog reads them through `domain/userEquipment.js` and `i18n/equipmentCatalog.js`. Google Drive copies live beside save files in the hidden `appDataFolder/<settingId>`; no separate shared or visible folder is created. Full sync restores and merges user JSON before processing character saves. See also [data flows](../agents/data-flows.md#14-пользовательское-снаряжение).
