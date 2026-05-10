# План реализации: Поэтапный архитектурный рефакторинг

- [x] 1. Создать domain/effects.js (перенос из assets/scripts/sceneEffects.js)






  - Создать файл `domain/effects.js` с полным содержимым `assets/scripts/sceneEffects.js`
  - Заменить содержимое `assets/scripts/sceneEffects.js` на re-export из `domain/effects.js`
  - Обновить импорт в `components/CharacterContext.js`
  - _Requirements: 5.1, 5.2, 5.3, 8.1, 8.2_

- [x] 2. Создать domain/perks.js (перенос из CharacterScreen/logic/perksLogic.js)





  - Создать файл `domain/perks.js` с полным содержимым `CharacterScreen/logic/perksLogic.js`
  - Заменить содержимое `CharacterScreen/logic/perksLogic.js` на re-export из `domain/perks.js`
  - Обновить импорт в `components/CharacterContext.js`
  - _Requirements: 3.1, 3.2, 3.4, 8.1, 8.2_

- [x] 3. Создать domain/characterCreation.js (перенос логики персонажа)




- [x] 3.1 Создать domain/characterCreation.js из characterLogic.js и attributeKeyUtils.js


  - Создать `domain/characterCreation.js` — объединить содержимое `CharacterScreen/logic/characterLogic.js` и `CharacterScreen/logic/attributeKeyUtils.js`
  - Экспортировать все функции и константы: `ALL_SKILLS`, `BASE_ATTRIBUTE_VALUE`, `MIN_ATTRIBUTE`, `MAX_ATTRIBUTE`, `DISTRIBUTION_POINTS`, `createInitialAttributes`, `getRemainingAttributePoints`, `getSkillPoints`, `calculateSkillPointsUsed`, `getLuckPoints`, `canChangeAttribute`, `canChangeSkillValue`, `getAttributeLimits`, `validateSkills`, `calculateInitiative`, `calculateDefense`, `calculateMeleeBonus`, `calculateMaxHealth`, `calculateCarryWeight`, `isMultiTraitOrigin`, `getAttributeValue`, `getCanonicalAttributeKey`, `normalizeAttributeMap`
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 8.1_


- [x] 3.2 Заменить старые файлы на re-export и обновить импорты

  - Заменить `CharacterScreen/logic/characterLogic.js` на re-export из `domain/characterCreation.js`
  - Заменить `CharacterScreen/logic/attributeKeyUtils.js` на re-export из `domain/characterCreation.js`
  - Обновить все импорты в `CharacterContext.js`, `AttributesSection.js`, `CharacterScreen.js` и модалках черт
  - _Requirements: 1.4, 8.1, 8.2, 8.3_

- [x] 4. Создать domain/modsEquip.js (перенос логики модификаций)





- [x] 4.1 Создать domain/modsEquip.js из weaponModificationUtils.js и armorModificationUtils.js


  - Создать `domain/modsEquip.js` — объединить содержимое `WeaponsAndArmorScreen/weaponModificationUtils.js` и `WeaponsAndArmorScreen/armorModificationUtils.js`
  - Экспортировать все функции: `getModifiedWeaponName`, `applyModification`, `removeModificationEffects`, `applyModificationToSlot`, `getAvailableModifications`, `declinePrefix`, и аналоги для брони
  - Весь код логики пишется только на английском: переменные, комментарии, идентификаторы — без кириллицы
  - Все строки, отображаемые пользователю (названия, описания, сообщения), берутся исключительно через i18n-ключи; никакого хардкода русских строк в логике
  - _Requirements: 4.1, 4.2, 8.1_



- [-] 4.2 Заменить старые файлы на re-export и обновить импорты



  - Заменить `WeaponsAndArmorScreen/weaponModificationUtils.js` на re-export из `domain/modsEquip.js`
  - Заменить `WeaponsAndArmorScreen/armorModificationUtils.js` на re-export из `domain/modsEquip.js`
  - Обновить импорты в `WeaponModificationModal.js` и `ArmorModificationModal.js`
  - Проверить, что в перенесённых файлах не осталось кириллицы вне i18n-вызовов; если есть — вынести в i18n до завершения этапа
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 4.4, 8.1, 8.2_

- [x] 5. Создать data/origins/origins.json и data/traits/traits.json






- [x] 5.1 Создать data/origins/origins.json

  - Создать файл `data/origins/origins.json` — перенести данные происхождений из `CharacterScreen/logic/originsData.js` в JSON-формат
  - Каждое происхождение: `id`, `displayNameKey`, `isRobot`, `canWearStandardArmor`, `canWearRobotArmor`, `canWearMutantArmor`, `traitIds`, `equipmentKitIds`
  - Поле `id` и все ключи — латиница; отображаемые названия хранятся только как i18n-ключи (`displayNameKey`), не как кириллические строки
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 6.2, 6.4, 6.5_


- [x] 5.2 Создать data/traits/traits.json

  - Создать файл `data/traits/traits.json` — перенести данные черт из `CharacterScreen/logic/traitsData.js` в JSON-формат
  - Каждая черта: `id`, `originId`, `displayNameKey`, `descriptionKey`, `modifiers` (attributes, skillMaxValue, extraSkills, immunities, armorConstraint, carryWeightModifier и т.д.)
  - Поля `id`, `originId` и все технические ключи — латиница; кириллица допустима только в значениях i18n-файлов, но не в data-файлах
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 2.1, 6.3, 6.4, 6.5_

- [x] 6. Создать domain/equipEquip.js с логикой надевания снаряжения





  - Создать `domain/equipEquip.js`
  - Реализовать `canEquipArmor(armorItem, character)` — читает `origin.canWearStandardArmor`, `origin.canWearRobotArmor`, `origin.canWearMutantArmor` и `trait.modifiers.armorConstraint`, возвращает `{ allowed: bool, reason: string | null }`
  - Реализовать `canEquipWeapon(weaponItem, character)` — аналогично для оружия
  - Реализовать `filterAvailableArmor(allArmor, character)` — фильтрует список брони
  - Реализовать `getCarryWeightLimit(character)` — фиксированный лимит для роботов, `150 + STR * multiplier` для людей
  - Поле `reason` в возвращаемых объектах — i18n-ключ, не кириллическая строка; вся логика и идентификаторы — только латиница
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 4.3, 7.2, 10.1, 10.2_

- [x] 7. Создать domain/traits.js и обновить CharacterContext







- [x] 7.1 Создать domain/traits.js

  - Создать `domain/traits.js` — логика применения черт
  - Реализовать `getTraitModifiers(trait)` — возвращает все модификаторы черты (атрибуты, навыки, лимиты, иммунитеты)
  - Реализовать `getTraitDisplayDescription(trait)` — перенести из `traitsData.js`; функция возвращает i18n-ключ или вызывает t(), но не хардкоженную кириллическую строку
  - Реализовать `loadTraitsData()` — загружает `data/traits/traits.json`
  - Реализовать `loadOriginsData()` — загружает `data/origins/origins.json`
  - Заменить `CharacterScreen/logic/traitsData.js` на re-export из `domain/traits.js`
  - Весь код файла — на английском; кириллица недопустима нигде, кроме комментариев к задаче
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 2.1, 2.2, 2.3, 8.2_

- [x] 7.2 Обновить CharacterContext — делегировать в domain/
  - Обновить все импорты в `CharacterContext.js`: заменить импорты из `components/screens/CharacterScreen/logic/` на импорты из `domain/`
  - Убедиться что все расчёты (calculateMaxHealth, calculateCarryWeight, calculateInitiative и т.д.) вызывают функции из `domain/characterCreation.js`
  - Убедиться что логика перков вызывает функции из `domain/perks.js`
  - Проверить весь `CharacterContext.js` на отсутствие кириллицы вне i18n-вызовов; при обнаружении — вынести строки в i18n в рамках этого же этапа
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 7.1, 7.2, 7.4, 8.3_

- [x] 8. Организовать стили в styles/
- [x] 8.1 Создать файлы стилей для экранов
  - Создать `styles/CharacterScreen.styles.js` — перенести StyleSheet из `CharacterScreen.js` и `AttributesSection.js`
  - Создать `styles/WeaponsAndArmorScreen.styles.js` — перенести StyleSheet из `WeaponsAndArmorScreen.js`
  - Создать `styles/InventoryScreen.styles.js` — перенести StyleSheet из `InventoryScreen.js`
  - Создать `styles/PerksAndTraitsScreen.styles.js` — перенести StyleSheet из `PerksAndTraitsScreen.js`
  - Создать `styles/HomeScreen.styles.js` — перенести StyleSheet из `HomeScreen.js`
  - Имена стилей и переменных — только латиница
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 8.2 Создать файлы стилей для модалок
  - Создать `styles/OriginModal.styles.js`, `styles/TraitSkillModal.styles.js`, `styles/EquipmentKitModal.styles.js`
  - Создать `styles/WeaponModificationModal.styles.js`, `styles/ArmorModificationModal.styles.js`
  - Создать `styles/AddItemModal.styles.js`, `styles/PerkSelectModal.styles.js`
  - Обновить импорты в соответствующих компонентах
  - Имена стилей и переменных — только латиница
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 9. Перенести данные снаряжения из i18n/ в data/equipment/





- [x] 9.1 Создать data/equipment/weapons.json и data/equipment/armor.json

  - Создать `data/equipment/weapons.json` — перенести данные оружия из `i18n/ru-RU/weapons.json` (только данные, без переводов)
  - Создать `data/equipment/armor.json` — перенести данные брони из `i18n/ru-RU/armor.json`
  - Переводы (названия, описания) оставить в `i18n/` по ключам
  - Все технические поля (`id`, `type`, `slot`, `damage` и т.д.) — латиница; кириллица остаётся только в i18n-файлах переводов
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 6.1, 6.4_


- [x] 9.2 Создать data/equipment/mods.json и data/equipment/robotparts.json

  - Создать `data/equipment/mods.json` — перенести данные модов из `i18n/ru-RU/weapon_mods.json` и `i18n/ru-RU/armor_mods.json`
  - Создать `data/equipment/robotparts.json` — перенести данные из `i18n/ru-RU/robotItems.json`, `robotModules.json`, `robotPartsUpgrade.json`
  - Обновить `i18n/equipmentCatalog.js` — читать из `data/equipment/` вместо `i18n/`
  - Все технические поля — латиница; кириллица только в i18n-файлах переводов
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 6.1, 6.4_

- [ ] 10. Переместить kitResolver в domain/
  - Создать `domain/kitResolver.js` — перенести содержимое `WeaponsAndArmorScreen/kitResolver.js`
  - Заменить `WeaponsAndArmorScreen/kitResolver.js` на re-export из `domain/kitResolver.js`
  - Обновить импорты в `WeaponsAndArmorScreen.js` и `EquipmentKitModal.js`
  - Весь код `domain/kitResolver.js` — на английском; если в исходнике есть хардкод кириллицы, вынести в i18n в рамках этого этапа
  - **Если остаётся кириллица для совместимости с БД** — задокументировать в `docs/cyrillic-db-compat.md`: файл, строки, причина, план миграции
  - _Requirements: 4.3, 4.4, 8.1_
