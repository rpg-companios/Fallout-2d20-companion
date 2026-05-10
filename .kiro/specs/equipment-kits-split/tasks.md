# Implementation Plan: equipment-kits-split

## Overview

Разделить монолитный `i18n/ru-RU/data/system/equipmentKits.json` на локаль-независимые файлы данных (`data/equipmentKits/*.json`) и обновить i18n файлы до формата только с названиями. Обновить `equipmentCatalog.js` для мержа обоих источников и убрать прямой импорт из i18n в `originsData.js`.

## Tasks

- [x] 1. Создать файлы данных `data/equipmentKits/`
  - Создать директорию `data/equipmentKits/`
  - Создать `data/equipmentKits/list.json` — массив `[{ originId, kitIds }]` для всех origins из `data/origins/origins.json`
  - Создать `data/equipmentKits/brotherhood.json` — `{ brotherhood_initiate: { items }, brotherhood_scribe: { items } }` (без поля `name`)
  - Создать `data/equipmentKits/ncr.json` — `{ ncr_infantry, ncr_caravaneer, ncr_marksman }`
  - Создать `data/equipmentKits/minuteman.json` — `{ minuteman_shooter, minuteman_skirmisher }`
  - Создать `data/equipmentKits/childOfAtom.json` — `{ atom_missionary, atom_zealot }`
  - Создать `data/equipmentKits/vaultDweller.json` — `{ vault_security, vault_resident }`
  - Создать `data/equipmentKits/wastelander.json` — `{ wastelander_mercenary, wastelander_settler, wastelander_wanderer, wastelander_raider, wastelander_trader }` (используется для `ghoul` и `survivor`)
  - Создать `data/equipmentKits/superMutant.json` — `{ supermutant_bruiser, supermutant_skirmisher }`
  - Создать `data/equipmentKits/brotherhoodOutcast.json` — `{ outcast_former_knight, outcast_former_scribe }`
  - Создать `data/equipmentKits/robobrain.json` — `{ robobrain_hypnotron }`
  - Создать `data/equipmentKits/misterHandy.json` — `{ mister_handy_assistant, mister_handy_brave, mister_handy_nanny, mister_handy_medic, mister_handy_farmer }`
  - Создать `data/equipmentKits/default.json` — `{ default_caps_only }`
  - Данные `items` для каждого kit берутся из `equipmentKitGroups` в `i18n/ru-RU/data/system/equipmentKits.json` без изменений
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 6.1, 6.2, 6.3_

  - [x] 1.1 Написать property test: Property 3 — формат KitData файлов
    - **Property 3: Формат KitData файлов**
    - Для каждого kit ID в любом `data/equipmentKits/*.json` (кроме `list.json`) объект должен содержать поле `items` (array) и не содержать поле `name`
    - **Validates: Requirements 1.6**

  - [x] 1.2 Написать property test: Property 1 — полнота kit IDs в data файлах
    - **Property 1: Полнота kit IDs в data файлах**
    - Для любого kit ID из `equipmentKitIds` любого origin в `data/origins/origins.json` этот kit ID должен присутствовать ровно в одном файле из `data/equipmentKits/*.json` (исключая `list.json`)
    - **Validates: Requirements 6.1, 6.3**

  - [x] 1.3 Написать property test: Property 2 — целостность items при разделении
    - **Property 2: Целостность items при разделении**
    - Для каждого kit ID поле `items` в новых `data/equipmentKits/*.json` должно быть структурно идентично полю `items` в старом `equipmentKitGroups` из `i18n/ru-RU/data/system/equipmentKits.json`
    - **Validates: Requirements 1.7, 6.2**

- [x] 2. Обновить i18n файлы до формата только с названиями
  - Заменить содержимое `i18n/ru-RU/data/system/equipmentKits.json` на объект `{ [kitId]: { "name": string } }` — только названия, без секций `origins` и `equipmentKitGroups`
  - Заменить содержимое `i18n/en-EN/data/system/equipmentKits.json` аналогично
  - Убедиться, что в обоих файлах присутствует запись для каждого kit ID из `data/origins/origins.json` (включая `default_caps_only`)
  - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 2.1 Написать property test: Property 4 — полнота KitNames в i18n
    - **Property 4: Полнота KitNames в i18n**
    - Для каждого уникального kit ID из `equipmentKitIds` всех origins в `data/origins/origins.json` этот kit ID должен присутствовать в `i18n/ru-RU/data/system/equipmentKits.json` и `i18n/en-EN/data/system/equipmentKits.json`
    - **Validates: Requirements 2.3**

- [x] 3. Checkpoint — убедиться что все data и i18n файлы корректны
  - Убедиться что все тесты проходят, задать вопросы пользователю при необходимости.

- [x] 4. Обновить `i18n/equipmentCatalog.js`
  - Добавить импорты всех `data/equipmentKits/*.json` файлов (кроме `list.json`)
  - Объединить все импорты в константу `ALL_KIT_DATA = { ...dataKitsBrotherhood, ...dataKitsNcr, ... }`
  - В функции `getEquipmentCatalog()` добавить построение `equipmentKits`:
    ```js
    const kitNames = i18n.equipmentKits || {};
    const equipmentKits = Object.fromEntries(
      Object.entries(ALL_KIT_DATA).map(([kitId, kitData]) => [
        kitId,
        { name: kitNames[kitId]?.name || kitId, ...kitData },
      ])
    );
    ```
  - Добавить `equipmentKits` в возвращаемый объект `getEquipmentCatalog()`
  - Форма `equipmentKits` должна быть `{ [kitId]: { name: string, items: [...] } }` — обратная совместимость с текущим `equipmentKitGroups`
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.1 Написать property test: Property 5 — форма equipmentKits в getEquipmentCatalog()
    - **Property 5: Форма equipmentKits в getEquipmentCatalog()**
    - Для каждого kit ID в `data/equipmentKits/*.json` результат `getEquipmentCatalog().equipmentKits[kitId]` должен содержать поле `name` типа string и поле `items` типа array
    - **Validates: Requirements 3.2, 3.3**

- [x] 5. Обновить `components/screens/CharacterScreen/logic/originsData.js`
  - Удалить строку `import equipmentKitsData from '../../../../i18n/ru-RU/data/system/equipmentKits.json'`
  - Удалить строку `const equipmentKitGroups = equipmentKitsData.equipmentKitGroups || {}`
  - Добавить импорт `import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog'`
  - Заменить на `const { equipmentKits: equipmentKitGroups } = getEquipmentCatalog()`
  - Логика построения `ORIGINS` не меняется — `equipmentKitGroups` сохраняет ту же форму `{ [kitId]: { name, items } }`
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.1 Написать property test: Property 6 — корректность ORIGINS после рефакторинга
    - **Property 6: Корректность ORIGINS после рефакторинга**
    - Для каждого origin в массиве `ORIGINS` из `originsData.js` каждый элемент `equipmentKits` должен иметь `Array.isArray(items) === true`, и набор kit IDs должен совпадать с `equipmentKitIds` соответствующего origin из `data/origins/origins.json`
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 5.2 Написать интеграционный тест: resolveKitItems совместимость
    - Вызвать `resolveKitItems(kit)` с kit из нового источника (`getEquipmentCatalog().equipmentKits[kitId]`) и убедиться, что результат содержит поле `items` с массивом разрешённых предметов
    - Проверить для нескольких kit ID (например, `brotherhood_initiate`, `wastelander_mercenary`, `default_caps_only`)
    - _Requirements: 5.1, 5.2_

- [x] 6. Финальный checkpoint — убедиться что все тесты проходят
  - Убедиться что все тесты проходят, задать вопросы пользователю при необходимости.

## Notes

- Задачи с `*` опциональны и могут быть пропущены для быстрого MVP
- `domain/kitResolver.js` не требует изменений — он получает kit с полем `items` в том же формате
- `wastelander.json` используется для origins `ghoul` и `survivor` — данные хранятся без дублирования
- Fallback при отсутствии kit ID в i18n: `name = kitId` (уже реализован паттерн в `mergeById`)
- Property тесты используют библиотеку `fast-check`
