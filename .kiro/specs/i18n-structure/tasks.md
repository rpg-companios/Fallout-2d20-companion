# План реализации: Реструктуризация i18n

- [x] 1. Переместить переводы экранов в `screens/` и обновить импорты





  - Создать `i18n/ru-RU/screens/character/screen.json` (содержимое из `CharacterScreen.json`)
  - Создать `i18n/en-EN/screens/character/screen.json` (содержимое из `en-EN/CharacterScreen.json`)
  - Создать `i18n/ru-RU/screens/weaponsAndArmor/screen.json` (содержимое из `WeaponsAndArmorScreen.json`)
  - Создать `i18n/en-EN/screens/weaponsAndArmor/screen.json`
  - Создать `i18n/ru-RU/screens/home/screen.json` (содержимое из `HomeScreen.json`)
  - Создать `i18n/en-EN/screens/home/screen.json`
  - Обновить импорты в `characterScreenI18n.js` и `domain/characterCreation.js`
  - Обновить импорты в `weaponsAndArmorScreenI18n.js`
  - Обновить импорты в `homeScreenI18n.js`
  - Удалить старые файлы: `ru-RU/CharacterScreen.json`, `en-EN/CharacterScreen.json`, `ru-RU/WeaponsAndArmorScreen.json`, `en-EN/WeaponsAndArmorScreen.json`, `ru-RU/HomeScreen.json`, `en-EN/HomeScreen.json`
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 3.1, 3.3_

- [x] 2. Переместить переводы данных в `data/` и обновить импорты





  - Создать папки `i18n/ru-RU/data/`, `i18n/ru-RU/data/robot/`, `i18n/en-EN/data/`, `i18n/en-EN/data/robot/`
  - Переместить все файлы данных (weapons, armor, mods, ammo, chems, drinks, qualities, clothes, misc, effects, equipmentKits, ammoData, mods_overrides) в `data/` для обоих локалей
  - Переместить robot-файлы (`robotWeapons.json` → `data/robot/weapons.json`, `robotArmor.json` → `data/robot/armor.json`, `robotModules.json` → `data/robot/modules.json`, `robotItems.json` → `data/robot/items.json`, `robotPartsUpgrade.json` → `data/robot/partsUpgrade.json`) для обоих локалей
  - Обновить все 38 импортов в `i18n/equipmentCatalog.js`
  - Удалить старые файлы с верхнего уровня `i18n/ru-RU/` и `i18n/en-EN/`
  - _Requirements: 2.1–2.10, 3.2, 3.4_

- [x] 3. Прогнать тесты и убедиться что всё работает





  - Запустить `npx vitest run` — все тесты должны пройти
  - Убедиться что `domain/contract.test.js` проходит (он косвенно проверяет импорты через `equipmentCatalog.js`)
  - _Requirements: 4.1, 4.2, 4.3_
