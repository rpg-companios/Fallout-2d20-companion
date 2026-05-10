# План реализации: Очистка данных и i18n

- [x] 1. Мигрировать `data/equipment/mods.json` на camelCase и обновить `domain/modsEquip.js`





  - Переименовать ключи в `weaponMods` и `armorMods`: `Slot`→`slot`, `Complexity`→`complexity`, `Perk 1`→`perk1`, `Perk 2`→`perk2`, `Skill`→`skill`, `Rarity`→`rarity`, `Materials`→`materials`, `Cost`→`cost`, `Weight`→`weight`
  - В `domain/modsEquip.js` убрать обращения к `weapon.Название`, `weapon.Урон`, `weapon['Скорость стрельбы']` — использовать только `name`, `damage`, `fireRate`
  - Убрать кириллические fallback в `getWeaponName`, `getModPrefix`
  - _Requirements: 2.3, 2.4_

- [x] 2. Создать `data/equipment/ammo.json` и очистить `i18n/*/ammo_types.json`





  - Создать `data/equipment/ammo.json` с полями `id`, `rarity`, `cost` (перенести из `i18n/ru-RU/ammo_types.json`)
  - Оставить в `i18n/ru-RU/ammo_types.json` и `i18n/en-EN/ammo_types.json` только `id` + `name`
  - Добавить `ammo` в `getEquipmentData()` в `equipmentCatalog.js`
  - _Requirements: 1.1, 5.1_

- [x] 3. Создать `data/consumables/` и очистить `i18n/*/chems.json`, `i18n/*/drinks.json`






  - Создать `data/consumables/chems.json`: перенести `id`, `itemType`, `weight`, `cost`, `rarity`, `positiveEffect`, `negativeEffect`, `positiveEffectDuration`, `negativeEffectDuration`, `addictionLevel`
  - Создать `data/consumables/drinks.json`: добавить `id` к каждому напитку, перенести stats-поля
  - Оставить в `i18n/ru-RU/chems.json` только `id`, `name`, `positiveEffectLabel`, `negativeEffectLabel`
  - Оставить в `i18n/ru-RU/drinks.json` только `id`, `name`, `positiveEffectLabel`, `negativeEffectLabel`
  - Применить те же изменения к `i18n/en-EN/chems.json` и `i18n/en-EN/drinks.json`
  - _Requirements: 1.2, 3.3_

- [x] 4. Очистить `i18n/*/weapon_mods.json` и `i18n/*/qualities.json`





  - В `i18n/ru-RU/weapon_mods.json` и `i18n/en-EN/weapon_mods.json`: переименовать `Name`→`name`, `Prefix`→`prefix`, `EffectDescription`→`effectDescription`; удалить все stats-поля (`Slot`, `Complexity`, `Perk 1`, `Perk 2`, `Skill`, `Rarity`, `Materials`, `Cost`, `Weight`, `applies_to_ids`, `effectsLegacy`, `damageModifier`, `fireRateModifier`, `qualityChanges`)
  - В `i18n/ru-RU/qualities.json` и `i18n/en-EN/qualities.json`: переименовать `Name`→`name`, `Effect`→`effect`, `Opposite`→`opposite`
  - _Requirements: 3.1, 3.2_

- [x] 5. Очистить `i18n/*/robotWeapons.json`, `robotModules.json`, `robotArmor.json`, `robotItems.json`





  - В `robotWeapons.json`: удалить `Name`, `Название` и все stats-поля; оставить `id`, `name`
  - В `robotModules.json`: удалить `Name`, `Название` и все stats-поля; оставить `id`, `name`
  - В `robotArmor.json`: удалить `Name`, `Название` и все stats-поля; оставить `id`, `name`; тип группы (`"Броня роботов"`) заменить на i18n-ключ
  - В `robotItems.json`: удалить `Name` и все stats-поля; оставить `id`, `name`
  - Применить те же изменения к зеркальным файлам в `i18n/en-EN/`
  - _Requirements: 3.4, 3.5, 3.6, 3.7_

- [x] 6. Очистить `i18n/*/weapons.json` — убрать stats, оставить только переводы





  - Удалить из каждого объекта: `weaponType`, `damage`, `damageEffects`, `damageType`, `fireRate`, `qualities`, `weight`, `cost`, `rarity`, `ammoId`, `range`, `mainAttr`, `mainSkill`, `imageName`
  - Оставить: `id`, `name`, `rangeName`, `flavour`, `stockNames`
  - Применить к `i18n/ru-RU/weapons.json` и `i18n/en-EN/weapons.json`
  - _Requirements: 1.1, 5.1_

- [x] 7. Мигрировать `data/traits/traits.json` — убрать `cyrillicName`, перевести навыки на latin id





  - Удалить поле `cyrillicName` из всех черт
  - Заменить кириллические строки в `forcedSkills`: `"Энергооружие"`→`"energy_weapons"`, `"Наука"`→`"science"`, `"Ремонт"`→`"repair"`, `"Стрелковое оружие"`→`"small_guns"`, `"Выживание"`→`"survival"`
  - Заменить кириллические ключи в `skillModifiers`: `"Выживание"`→`"survival"`
  - _Requirements: 2.2, 8.1, 8.2_

- [x] 8. Обновить `domain/traits.js` — убрать `cyrillicName` lookup





  - В `findTraitByName`: убрать ветку `t.cyrillicName === name`, искать только по `id`
  - Написать unit-тест: `findTraitByName('brotherhood-chain-that-binds')` находит черту, `findTraitByName('Цепь, которая связывает')` возвращает `undefined`
  - _Requirements: 8.3_

- [x] 9. Обновить `i18n/equipmentNormalizer.js` — убрать legacy-поля и кириллику





  - Удалить `AREA_LABELS_RU`, `normalizeProtectedArea`, `toLegacyArmor`
  - Упростить `flattenArmorCatalog`: убрать создание `Name`/`Название`/`Физ.СУ`/`Энрг.СУ`/`Рад.СУ`/`protected_area`
  - Упростить `normalizeClothesCatalog`: убрать создание `Name`/`Название`
  - Упростить `normalizeWeaponsCatalog`: убрать fallback на `Name`/`Название`, убрать `'Стрелковое оружие'` из `WEAPON_TYPE_ALIASES`
  - Упростить `buildArmorIndex`: убрать lookup по `Name`/`Название`, только по `id`
  - _Requirements: 2.5, 4.1, 6.1, 6.2, 6.3, 7.2, 7.5_

- [x] 10. Обновить `i18n/equipmentCatalog.js` — убрать legacy-поля, добавить мерж data+i18n





  - В `validateConsumablesContract`: убрать создание `Name`/`Название`, фильтровать по `name`
  - Добавить мерж `data/equipment/ammo.json` + `i18n/*/ammo_types.json` по `id` перед передачей в catalog
  - Добавить мерж `data/consumables/` + `i18n/*/chems.json`, `drinks.json` по `id`
  - Добавить мерж `data/equipment/mods.json` + `i18n/*/weapon_mods.json` по `id` (stats из data, name/prefix/effectDescription из i18n)
  - _Requirements: 6.4, 6.5, 7.3_

- [x] 11. Обновить `db/seed.js` под новую схему полей





  - В `seedWeaponMods`: читать `m.name`, `m.prefix`, `m.slot`, `m.complexity`, `m.perk1`, `m.perk2`, `m.skill`, `m.rarity`, `m.materials`, `m.cost`, `m.weight`, `m.effectDescription`
  - В `seedQualities`: читать `q.name`, `q.effect`, `q.opposite`
  - В `seedItems`: читать `item.physicalDamageRating`, `item.energyDamageRating`, `item.radiationDamageRating`, `item.cost`, `item.weight`, `item.rarity`, `item.name` (убрать кириллические ключи)
  - В `seedWeapons`: убрать fallback на `w.Name`, `w['Weapon Type']`, `w['Damage Rating']` и т.п.
  - Увеличить `SCHEMA_VERSION` в `db/schema.js` на 1
  - _Requirements: 2.3, 3.1, 3.2_

- [x] 12. Обновить `domain/kitResolver.js` — убрать кириллические поля из возвращаемых объектов





  - Убрать все присвоения `Название`, `Цена`, `Редкость` из `resolveAmmoObject`, `resolveItemById`, `resolveWeaponItem`, `resolveNonWeaponItem`
  - Использовать только `name`, `cost`, `rarity`
  - _Requirements: 2.8_

- [x] 13. Удалить устаревшие файлы и обновить документацию





  - Удалить `components/screens/WeaponsAndArmorScreen/kitResolver.js` (дублирует `domain/kitResolver.js`)
  - Проверить использование `i18n/ru-RU/light_weapon_mods.json` и `i18n/en-EN/light_weapon_mods.json`; удалить если не используются
  - Обновить `docs/cyrillic-db-compat.md`: пометить решённые пункты или удалить файл
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 14. Написать contract-тесты для проверки итоговой схемы






  - Тест: ни один файл в `data/` не содержит кириллических ключей
  - Тест: ни один файл в `i18n/*/` не содержит ключей `Name` или `Название`
  - Тест: `data/equipment/mods.json` не содержит ключей `Slot`, `Complexity`, `Perk 1`
  - Тест: `getEquipmentCatalog()` возвращает оружие с непустым `name`
  - Тест: `resolveKitItems()` возвращает предметы с `name`, без `Название`
  - _Requirements: 2.1, 2.2, 2.3, 6.5_
