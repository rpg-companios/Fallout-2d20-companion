# План реализации: Разделение i18n/data и domain-механик

- [x] 1. Разбить `data/equipment/mods.json` на отдельные файлы





  - Создать `data/equipment/weapon_mods.json` — массив из `mods.json[weaponMods]`
  - Создать `data/equipment/armor_mods.json` — массив из `mods.json[armorMods]`, дополнить механикой из `i18n/ru-RU/data/armor_mods.json` (statModifiers, complexity, requiredPerk, costModifier, weightModifier, specialEffects) по id
  - Создать `data/equipment/uniq_armor_mods.json` — аналогично из `mods.json[uniqArmorMods]` + `i18n/ru-RU/data/uniq_armor_mods.json`
  - Удалить `data/equipment/mods.json`
  - Обновить импорт `dataMods` в `i18n/equipmentCatalog.js` на три отдельных импорта
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Создать `data/equipment/armor_effects.json` и очистить i18n




  - Создать `data/equipment/armor_effects.json` — содержимое из `i18n/ru-RU/data/armor_effects.json` (type, damageType/target, value)
  - Очистить `i18n/ru-RU/data/armor_effects.json` и `i18n/en-EN/data/armor_effects.json` — оставить только `{ id: description }` для каждого эффекта
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Создать `data/equipment/clothes.json` и очистить i18n





  - Создать `data/equipment/clothes.json` — структура `{ clothes: [{ type, clothingType, allowsArmor, items: [{ id, protectedAreas, physicalDamageRating, energyDamageRating, radiationDamageRating, weight, cost, rarity, specialEffects, itemType, clothingType, allowsArmor }] }] }` из `i18n/ru-RU/data/Clothes.json`
  - Очистить `i18n/ru-RU/data/Clothes.json` и `i18n/en-EN/data/Clothes.json` — оставить только `id + name + specialEffects[].description` для каждого предмета
  - Обновить `equipmentCatalog.js`: одежда теперь собирается через mergeById(dataClothes, i18n.clothes)
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Очистить `qualities.json` от поля `effect`





  - Удалить поле `effect` из каждого объекта в `i18n/ru-RU/data/qualities.json`
  - Удалить поле `effect` из каждого объекта в `i18n/en-EN/data/qualities.json`
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Создать подпапки в `i18n/ru-RU/data/` и переместить файлы





  - Создать структуру папок: `equipment/weapons/`, `equipment/armor/`, `equipment/ammo/`, `equipment/robot/`, `consumables/`, `system/`
  - Переместить в `equipment/weapons/`: `weapons.json`, `weapon_mods.json`, `mods_overrides.json`
  - Переместить в `equipment/armor/`: `armor.json`, `armor_mods.json`, `uniq_armor_mods.json`, `armor_effects.json`, `Clothes.json` → `clothes.json`
  - Переместить в `equipment/ammo/`: `ammo_types.json`, `ammoData.json`
  - Создать `equipment/items.json` из `miscellaneous.json` (только предметы, id + name)
  - Переместить в `equipment/robot/`: все файлы из `robot/`
  - Переместить в `consumables/`: `chems.json`, `drinks.json`
  - Переместить в `system/`: `qualities.json`, `effects.json`, `equipmentKits.json`
  - Удалить старые файлы с верхнего уровня `i18n/ru-RU/data/`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_



- [x] 6. Зеркалировать структуру для `i18n/en-EN/data/`



  - Повторить шаг 5 для `i18n/en-EN/data/` — создать те же подпапки и переместить файлы
  - _Requirements: 5.1–5.7_

- [x] 7. Обновить все импорты в `i18n/equipmentCatalog.js`





  - Заменить все пути импортов ru-RU и en-EN на новые пути с подпапками
  - Добавить импорты новых data-файлов (`dataWeaponMods`, `dataArmorMods`, `dataUniqArmorMods`, `dataArmorEffects`, `dataClothes`)
  - Обновить логику сборки: `armorMods: mergeById(dataArmorMods, i18n.armorMods)`, `clothes` через mergeById
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 8. Прогнать тесты и убедиться что всё работает





  - Запустить `npx vitest run` — все тесты должны пройти
  - Проверить что `getEquipmentCatalog()` возвращает корректные armorMods с механикой и i18n-названиями
  - _Requirements: 6.4_
