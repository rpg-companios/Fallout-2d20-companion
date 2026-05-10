# Требования: Очистка данных и i18n

## Введение

Проект содержит смешение данных и переводов: часть игровых данных (механика, статы) хранится в `i18n/` вместо `data/`, в JSON-файлах данных присутствует кириллица (ключи `Название`, `Name`, `cyrillicName`, значения `forcedSkills`, `skillModifiers`), а в коде используются несовместимые соглашения об именовании (`Name`, `Название`, `name` — все три одновременно).

Цель — привести всё к единому стандарту:
- `data/` содержит только locale-независимые игровые данные с английскими ключами в camelCase
- `i18n/<locale>/` содержит только переводы (названия, описания, флейвор-текст)
- Никакой кириллицы в ключах и значениях-идентификаторах в `data/` и коде
- Единственное поле для отображаемого имени — `name` (camelCase)

---

## Требования

### Требование 1: Миграция игровых данных из i18n в data

**User Story:** Как разработчик, я хочу, чтобы все locale-независимые игровые данные лежали в `data/`, а не в `i18n/`, чтобы чётко разделить контент и переводы.

#### Acceptance Criteria

1. WHEN разработчик ищет данные патронов (ammo) THEN они SHALL находиться в `data/equipment/ammo.json`, а не только в `i18n/ru-RU/ammo_types.json`.
2. WHEN разработчик ищет данные расходников (chems, drinks) THEN механические поля (id, itemType, weight, cost, rarity, effects) SHALL находиться в `data/consumables/`, а переводимые поля (name, effectLabel) — в `i18n/<locale>/`.
3. WHEN разработчик ищет данные одежды (clothes) THEN механические поля SHALL находиться в `data/equipment/clothes.json`.
4. WHEN разработчик ищет данные комплектов снаряжения (equipmentKits) THEN структурные данные (id, weaponIds, armorIds, itemIds) SHALL находиться в `data/equipmentKits/`, а названия — в `i18n/<locale>/`.
5. WHEN разработчик ищет данные модов оружия и брони THEN они SHALL находиться в `data/equipment/mods.json` (уже существует), а переводимые поля — в `i18n/<locale>/`.
6. IF файл данных уже существует в `data/` THEN дублирующие данные из `i18n/` SHALL быть удалены, оставив только переводы.

---

### Требование 2: Устранение кириллических ключей в данных и коде

**User Story:** Как разработчик, я хочу, чтобы все ключи объектов в `data/`, `domain/` и `i18n/` были на английском в camelCase, чтобы код был предсказуемым и не зависел от кодировки.

#### Acceptance Criteria

1. WHEN объект снаряжения создаётся или читается THEN он SHALL содержать только поле `name` (не `Name`, не `Название`) для отображаемого имени.
2. WHEN файл `data/traits/traits.json` читается THEN поле `cyrillicName` SHALL быть удалено, а `forcedSkills` и `skillModifiers` SHALL использовать латинские id навыков (например `"energy_weapons"` вместо `"Энергооружие"`).
3. WHEN файл `data/equipment/mods.json` читается THEN поля `Slot`, `Complexity`, `Perk 1`, `Perk 2`, `Skill`, `Rarity`, `Materials`, `Cost`, `Weight` SHALL быть переименованы в camelCase (`slot`, `complexity`, `perk1`, `perk2`, `skill`, `rarity`, `materials`, `cost`, `weight`).
4. WHEN `domain/modsEquip.js` обращается к полям объекта THEN он SHALL использовать только camelCase-ключи (`name`, `prefix`, `damage`, `fireRate`), без кириллических fallback-ов.
5. WHEN `i18n/equipmentNormalizer.js` нормализует броню THEN он SHALL не создавать поле `Название`, только `name`.
6. WHEN `i18n/equipmentCatalog.js` строит каталог THEN он SHALL не создавать поле `Название`, только `name`.
7. WHEN `components/CharacterContext.js` определяет id предмета THEN он SHALL не обращаться к `item.Название`.
8. WHEN `domain/kitResolver.js` создаёт объекты предметов THEN он SHALL использовать только `name`, `cost`, `rarity` (без `Название`, `Цена`, `Редкость`).

---

### Требование 3: Унификация именования полей в JSON-файлах i18n

**User Story:** Как разработчик, я хочу, чтобы все JSON-файлы переводов использовали единый стиль ключей, чтобы не было смешения `Name`/`name`/`Название`.

#### Acceptance Criteria

1. WHEN файл `i18n/ru-RU/weapon_mods.json` читается THEN поле `Name` SHALL быть переименовано в `name`, поле `Prefix` — в `prefix`.
2. WHEN файл `i18n/ru-RU/qualities.json` читается THEN поле `Name` SHALL быть переименовано в `name`, поле `Effect` — в `effect`.
3. WHEN файл `i18n/ru-RU/drinks.json` читается THEN все PascalCase/кириллические ключи (`Name`, `Weight`, `Cost`, `Rarity`, `Positive effect`, `Negative effect` и т.д.) SHALL быть переименованы в camelCase.
4. WHEN файл `i18n/ru-RU/robotWeapons.json` читается THEN дублирующие поля `Name` и `Название` SHALL быть удалены, оставив только `name`.
5. WHEN файл `i18n/ru-RU/robotModules.json` читается THEN дублирующие поля `Name` и `Название` SHALL быть удалены, оставив только `name`.
6. WHEN файл `i18n/ru-RU/robotArmor.json` читается THEN дублирующие поля `Name` и `Название` SHALL быть удалены, оставив только `name`.
7. WHEN файл `i18n/ru-RU/robotItems.json` читается THEN дублирующие поля `Name` SHALL быть удалены, оставив только `name`.
8. IF файл в `i18n/en-EN/` является зеркалом `ru-RU/` THEN он SHALL содержать переведённые значения, а не кириллицу.

---

### Требование 4: Перенос перевода зон брони в i18n

**User Story:** Как разработчик, я хочу, чтобы перевод зон защиты брони (`Head`, `Body`, `Hand`, `Leg`) происходил на уровне UI через i18n, а не хардкодился в нормализаторе.

#### Acceptance Criteria

1. WHEN `i18n/equipmentNormalizer.js` обрабатывает зоны брони THEN он SHALL не содержать `AREA_LABELS_RU` с кириллическими строками.
2. WHEN UI отображает зоны брони THEN он SHALL получать переведённые названия через i18n-ключи (например `armor.areas.head`, `armor.areas.body`).
3. WHEN данные брони хранятся в `data/` THEN поле `protectedAreas` SHALL содержать английские ключи (`Head`, `Body`, `Hand`, `Leg`).
4. IF нормализатор возвращает строку зон THEN она SHALL быть locale-независимой (английские ключи) или формироваться через i18n на уровне вызывающего кода.

---

### Требование 5: Удаление устаревших и неиспользуемых файлов

**User Story:** Как разработчик, я хочу, чтобы в проекте не было мёртвого кода и дублирующих файлов, чтобы не путаться в источниках данных.

#### Acceptance Criteria

1. WHEN данные полностью мигрированы из `i18n/<locale>/` в `data/` THEN исходные файлы в `i18n/` SHALL содержать только переводимые поля.
2. WHEN файл `i18n/ru-RU/light_weapon_mods.json` проверяется THEN он SHALL быть либо мигрирован в `data/` и `i18n/`, либо удалён если не используется.
3. WHEN файл `docs/cyrillic-db-compat.md` проверяется THEN каждый пункт, описывающий устранённую проблему, SHALL быть помечен как решённый или удалён из документа.
4. WHEN `components/screens/WeaponsAndArmorScreen/kitResolver.js` проверяется THEN он SHALL быть либо удалён (если дублирует `domain/kitResolver.js`), либо содержать только UI-специфичную логику.
5. IF файл данных в `i18n/` полностью заменён файлом в `data/` THEN файл в `i18n/` SHALL быть удалён или содержать только переводы.

---

### Требование 6: Обновление нормализаторов и каталога под новую схему

**User Story:** Как разработчик, я хочу, чтобы `equipmentNormalizer.js` и `equipmentCatalog.js` работали с единой схемой данных, не поддерживая legacy-поля.

#### Acceptance Criteria

1. WHEN `normalizeWeaponsCatalog` вызывается THEN она SHALL читать только `name` (не `Name`, не `Название`) из i18n-файлов.
2. WHEN `flattenArmorCatalog` вызывается THEN она SHALL не создавать поля `Name` и `Название`.
3. WHEN `normalizeClothesCatalog` вызывается THEN она SHALL не создавать поля `Name` и `Название`.
4. WHEN `validateConsumablesContract` в `equipmentCatalog.js` вызывается THEN она SHALL не создавать поля `Name` и `Название`.
5. IF нормализатор получает объект без поля `name` THEN он SHALL логировать предупреждение и использовать пустую строку как fallback, а не пытаться читать `Name` или `Название`.

---

### Требование 7: Аудит и упрощение нормализаторов

**User Story:** Как разработчик, я хочу понять, нужны ли `equipmentNormalizer.js` и `validateConsumablesContract` после унификации схемы данных, чтобы не поддерживать лишний код.

#### Acceptance Criteria

1. WHEN все i18n-файлы используют единый camelCase-формат с полем `name` THEN `normalizeWeaponsCatalog` SHALL быть проверена на предмет того, остаётся ли в ней логика помимо маппинга legacy-полей.
2. WHEN `flattenArmorCatalog`, `normalizeClothesCatalog`, `groupArmorForPicker` проверяются THEN каждая функция SHALL быть либо упрощена (убраны legacy-ветки), либо удалена если её единственная цель — поддержка старых ключей.
3. WHEN `validateConsumablesContract` проверяется THEN она SHALL быть удалена или упрощена до простой валидации типа, без создания `Name`/`Название`.
4. IF нормализатор после очистки содержит только одну-две строки маппинга THEN он SHALL быть заинлайнен в место вызова или удалён.
5. WHEN `WEAPON_TYPE_ALIASES` в нормализаторе проверяется THEN алиасы для кириллических строк (`'Стрелковое оружие': 'Light'`) SHALL быть удалены после миграции данных.

---

### Требование 8: Единый маппинг навыков через латинские id

**User Story:** Как разработчик, я хочу, чтобы все ссылки на навыки в данных использовали латинские id, а не кириллические строки, чтобы логика черт и перков не зависела от локали.

#### Acceptance Criteria

1. WHEN `data/traits/traits.json` содержит `forcedSkills` THEN значения SHALL быть латинскими id (`"energy_weapons"`, `"science"`, `"repair"`), а не кириллическими строками.
2. WHEN `data/traits/traits.json` содержит `skillModifiers` THEN ключи SHALL быть латинскими id навыков.
3. WHEN `domain/traits.js` ищет черту по имени THEN функция `findTraitByName` SHALL искать только по `id`, а не по `cyrillicName`.
4. WHEN i18n-файлы содержат названия навыков THEN они SHALL использоваться только для отображения, а не как идентификаторы в логике.
5. IF существует маппинг кириллических имён навыков на латинские id THEN он SHALL находиться в одном месте в `domain/` как временный адаптер до полной миграции БД.
