# Requirements Document

## Introduction

Рефакторинг структуры данных комплектов снаряжения (equipment kits): разделение монолитного файла `i18n/ru-RU/data/system/equipmentKits.json` (1835 строк) на несколько специализированных файлов. Цель — разделить локаль-независимые игровые данные (состав комплектов) и локаль-зависимые строки (названия), а также устранить дублирование маппинга origin → kit IDs, который уже присутствует в `data/origins/origins.json`.

## Glossary

- **EquipmentKit**: Набор предметов, оружия и брони, выдаваемый персонажу при выборе происхождения (origin).
- **KitGroup**: Объект, описывающий один комплект: его `id`, `name` и массив `items`.
- **KitResolver**: Модуль `domain/kitResolver.js`, отвечающий за разрешение содержимого комплекта в конкретные игровые объекты.
- **EquipmentCatalog**: Модуль `i18n/equipmentCatalog.js`, агрегирующий все локаль-зависимые и локаль-независимые данные снаряжения.
- **OriginsData**: Модуль `components/screens/CharacterScreen/logic/originsData.js`, строящий список происхождений с привязанными комплектами.
- **KitNames**: Локаль-зависимый словарь вида `{ [kitId]: string }`, содержащий только отображаемые названия комплектов.
- **KitData**: Локаль-независимый файл, содержащий состав одного или нескольких комплектов (массив `items` для каждого kit ID).
- **Origin**: Происхождение персонажа, определённое в `data/origins/origins.json`.

## Requirements

### Requirement 1: Перенос данных комплектов в локаль-независимые файлы

**User Story:** As a developer, I want kit item data stored in locale-independent files, so that game mechanics are not duplicated across language files.

#### Acceptance Criteria

1. THE System SHALL создать директорию `data/equipmentKits/`.
2. THE System SHALL создать файл `data/equipmentKits/list.json`, содержащий массив объектов вида `{ "originId": string, "kitIds": string[] }` для каждого происхождения из `data/origins/origins.json`.
3. THE System SHALL создать отдельный файл `data/equipmentKits/{originId}.json` для каждого происхождения, у которого есть уникальные комплекты (не `default_caps_only`).
4. WHEN несколько происхождений используют одинаковый набор комплектов (например, `ghoul` и `survivor` оба используют `wastelander_*`), THE System SHALL хранить эти комплекты в одном общем файле (например, `data/equipmentKits/wastelander.json`).
5. THE System SHALL создать файл `data/equipmentKits/default.json`, содержащий комплект `default_caps_only`.
6. EACH файл `data/equipmentKits/{name}.json` SHALL содержать объект вида `{ [kitId]: { items: [...] } }` — без поля `name` (названия хранятся в i18n).
7. THE System SHALL сохранить структуру каждого элемента `items` без изменений (поля `type`, `weaponId`, `armorId`, `clothingId`, `itemId`, `itemType`, `ammo`, `modIds`, `quantity`, `roll`, `tableId`, `group` и т.д.).

### Requirement 2: Сокращение i18n файлов до названий комплектов

**User Story:** As a developer, I want i18n files to contain only translatable strings, so that adding a new language does not require duplicating game mechanics data.

#### Acceptance Criteria

1. THE System SHALL заменить содержимое `i18n/ru-RU/data/system/equipmentKits.json` на объект вида `{ [kitId]: { "name": string } }`.
2. THE System SHALL заменить содержимое `i18n/en-EN/data/system/equipmentKits.json` на объект вида `{ [kitId]: { "name": string } }`.
3. THE KitNames файл SHALL содержать запись для каждого kit ID, присутствующего в `data/origins/origins.json` (включая `default_caps_only`).
4. IF kit ID отсутствует в i18n файле, THEN THE EquipmentCatalog SHALL использовать kit ID в качестве fallback-названия.
5. THE System SHALL удалить секцию `origins` из обоих i18n файлов (маппинг origin → kit IDs уже есть в `data/origins/origins.json`).

### Requirement 3: Обновление EquipmentCatalog для загрузки новой структуры

**User Story:** As a developer, I want the EquipmentCatalog to load kit data from the new split files, so that the rest of the application continues to work without changes.

#### Acceptance Criteria

1. THE EquipmentCatalog SHALL импортировать все файлы `data/equipmentKits/*.json` и объединять их в единый объект `equipmentKitGroups`.
2. WHEN `getEquipmentCatalog()` вызывается, THE EquipmentCatalog SHALL возвращать поле `equipmentKits`, содержащее объект `{ [kitId]: { name: string, items: [...] } }` — то есть объединение KitNames (из i18n) и KitData (из data/).
3. THE EquipmentCatalog SHALL сохранить обратную совместимость: форма возвращаемого объекта `equipmentKits` SHALL быть идентична текущей форме `equipmentKitGroups` из старого файла.
4. IF kit ID присутствует в KitData, но отсутствует в KitNames текущей локали, THEN THE EquipmentCatalog SHALL использовать kit ID как `name`.

### Requirement 4: Обновление OriginsData для работы с новой структурой

**User Story:** As a developer, I want originsData.js to load kit contents from the new data files, so that the direct import from the i18n file is removed.

#### Acceptance Criteria

1. THE OriginsData SHALL прекратить прямой импорт `equipmentKitsData` из `i18n/ru-RU/data/system/equipmentKits.json`.
2. THE OriginsData SHALL получать данные комплектов через `getEquipmentCatalog()` или через прямой импорт из `data/equipmentKits/`.
3. WHEN строится массив `ORIGINS`, THE OriginsData SHALL для каждого origin брать `equipmentKitIds` из `data/origins/origins.json` и разрешать содержимое каждого kit через объединённый `equipmentKitGroups`.
4. THE OriginsData SHALL сохранить текущую логику фильтрации: `equipmentKits` для origin включает только те kit, у которых `Array.isArray(kit.items)`.

### Requirement 5: Сохранение работоспособности KitResolver

**User Story:** As a developer, I want kitResolver.js to continue resolving kit items correctly after the refactoring, so that no runtime behavior changes.

#### Acceptance Criteria

1. THE KitResolver SHALL продолжать получать объект kit с полем `items` в том же формате, что и до рефакторинга.
2. WHEN `resolveKitItems(kit)` вызывается, THE KitResolver SHALL возвращать результат, идентичный результату до рефакторинга для одинакового входного kit.
3. THE KitResolver SHALL не требовать изменений в логике разрешения предметов.

### Requirement 6: Целостность данных при разделении

**User Story:** As a developer, I want the split to preserve all kit data without loss, so that no kit content is accidentally dropped.

#### Acceptance Criteria

1. THE System SHALL обеспечить, что совокупность всех `data/equipmentKits/*.json` содержит ровно те же kit IDs, что перечислены в `equipmentKitIds` всех origins в `data/origins/origins.json`.
2. THE System SHALL обеспечить, что для каждого kit ID поле `items` в новых файлах идентично полю `items` в старом `equipmentKitGroups`.
3. IF kit ID встречается в нескольких origins (например, `wastelander_*` у `ghoul` и `survivor`), THEN THE System SHALL хранить данные этого kit ровно в одном файле (без дублирования).
