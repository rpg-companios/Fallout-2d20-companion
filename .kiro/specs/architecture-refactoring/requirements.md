# Требования: Поэтапный архитектурный рефакторинг

## Введение

Проект — мобильное RPG-приложение-компаньон (React Native / Expo) для настольной игры по вселенной Fallout. Приложение управляет персонажами, инвентарём, снаряжением, перками и чертами.

Текущая проблема: бизнес-логика, данные и UI перемешаны. Логика расчётов живёт в `components/screens/*/logic/`, данные — в `i18n/` (вместо `data/`), а `CharacterContext` является одновременно хранилищем состояния, слоем данных и оркестратором бизнес-логики.

Цель рефакторинга — поэтапно, без остановки разработки фич, привести проект к целевой архитектуре из `TODOFIRST.md`: разделить UI, domain-логику, данные и состояние.

---

## Требования

### Требование 1: Выделение domain-слоя для персонажа

**User Story:** Как разработчик, я хочу, чтобы вся игровая логика персонажа жила в `domain/character/`, чтобы её можно было тестировать и переиспользовать независимо от UI.

#### Acceptance Criteria

1. WHEN разработчик ищет логику расчёта атрибутов, инициативы, защиты, здоровья, переноса веса THEN она SHALL находиться в `domain/character/characterRules.js`, а не в `components/screens/CharacterScreen/logic/`.
2. WHEN разработчик ищет логику расчёта очков навыков и их валидации THEN она SHALL находиться в `domain/character/skillRules.js`.
3. WHEN разработчик ищет утилиты нормализации ключей атрибутов THEN они SHALL находиться в `domain/character/attributeKeyUtils.js`.
4. IF функция перемещена в `domain/` THEN все существующие импорты SHALL быть обновлены так, чтобы приложение продолжало работать.
5. WHEN функции domain-слоя вызываются THEN они SHALL быть чистыми функциями без зависимостей от React или UI-компонентов.

---

### Требование 2: Выделение domain-слоя для черт (traits)

**User Story:** Как разработчик, я хочу, чтобы логика черт персонажа жила в `domain/traits/`, чтобы правила применения черт были отделены от UI-модалок.

#### Acceptance Criteria

1. WHEN разработчик ищет данные черт THEN они SHALL находиться в `domain/traits/traitsData.js` (или `data/traits/`), а не в `components/screens/CharacterScreen/logic/traitsData.js`.
2. WHEN разработчик ищет функции применения/снятия эффектов черты THEN они SHALL находиться в `domain/traits/traitRules.js`.
3. IF черта имеет модификаторы атрибутов, навыков или лимитов THEN `domain/traits/traitRules.js` SHALL предоставлять функции для их вычисления.
4. WHEN UI-модалки черт (например `VaultDwellerModal.js`) отображают данные THEN они SHALL получать данные через props или context, а не вычислять их самостоятельно.

---

### Требование 3: Выделение domain-слоя для перков

**User Story:** Как разработчик, я хочу, чтобы логика перков жила в `domain/perks/`, чтобы проверки требований и применение эффектов перков были независимы от UI.

#### Acceptance Criteria

1. WHEN разработчик ищет функции проверки требований перков THEN они SHALL находиться в `domain/perks/perksRules.js`, а не в `components/screens/CharacterScreen/logic/perksLogic.js`.
2. WHEN разработчик ищет функцию аннотирования перков (доступен/недоступен) THEN она SHALL находиться в `domain/perks/perksRules.js`.
3. IF перк имеет эффекты на атрибуты или навыки THEN `domain/perks/perksRules.js` SHALL предоставлять функцию применения этих эффектов.
4. WHEN `CharacterContext` использует логику перков THEN он SHALL импортировать её из `domain/perks/`, а не из `components/`.

---

### Требование 4: Выделение domain-слоя для снаряжения и модификаций

**User Story:** Как разработчик, я хочу, чтобы логика модификации оружия и брони жила в `domain/equipment/`, чтобы экраны снаряжения не содержали бизнес-расчётов.

#### Acceptance Criteria

1. WHEN разработчик ищет утилиты модификации оружия THEN они SHALL находиться в `domain/equipment/weaponModificationRules.js`, а не в `components/screens/WeaponsAndArmorScreen/weaponModificationUtils.js`.
2. WHEN разработчик ищет утилиты модификации брони THEN они SHALL находиться в `domain/equipment/armorModificationRules.js`.
3. WHEN разработчик ищет резолвер комплектов снаряжения THEN он SHALL находиться в `domain/equipment/kitResolver.js`, а не в `components/screens/WeaponsAndArmorScreen/kitResolver.js`.
4. IF логика перемещена в `domain/equipment/` THEN экраны SHALL импортировать её оттуда, а не содержать собственные копии.

---

### Требование 5: Выделение domain-слоя для эффектов

**User Story:** Как разработчик, я хочу, чтобы логика временных эффектов (сцены, расходники) жила в `domain/effects/`, чтобы она не зависела от `assets/scripts/`.

#### Acceptance Criteria

1. WHEN разработчик ищет логику применения эффектов расходников THEN она SHALL находиться в `domain/effects/sceneEffects.js`, а не в `assets/scripts/sceneEffects.js`.
2. WHEN разработчик ищет логику продвижения сцен и истечения эффектов THEN она SHALL находиться в `domain/effects/sceneEffects.js`.
3. IF файл перемещён THEN все импорты SHALL быть обновлены.

---

### Требование 6: Организация данных в `data/`

**User Story:** Как разработчик и геймдизайнер, я хочу, чтобы все игровые данные (JSON) лежали в `data/`, а не в `i18n/`, чтобы чётко разделить контент и переводы.

#### Acceptance Criteria

1. WHEN разработчик ищет данные комплектов снаряжения THEN они SHALL находиться в `data/equipmentKits/`, а не в `i18n/ru-RU/equipmentKits.json`.
2. WHEN разработчик ищет данные происхождений (origins) THEN они SHALL находиться в `data/origins/`.
3. WHEN разработчик ищет данные черт THEN они SHALL находиться в `data/traits/` с именованием `<originName-traitName-id>.json`.
4. IF данные перемещены из `i18n/` в `data/` THEN переводы (названия, описания) SHALL остаться в `i18n/<locale>/`, ссылаясь на данные через ключи (`id`, `displayNameKey`).
5. WHEN файл данных создаётся THEN его имя SHALL следовать соглашению `<originName-traitName-id>.json` в `kebab-case`.

---

### Требование 7: Рефакторинг `CharacterContext` в тонкий state-слой

**User Story:** Как разработчик, я хочу, чтобы `CharacterContext` был тонким слоем состояния, который делегирует логику в `domain/` и `application/`, а не содержал её сам.

#### Acceptance Criteria

1. WHEN `CharacterContext` вычисляет производные значения (здоровье, инициатива, защита) THEN он SHALL вызывать функции из `domain/character/`, а не содержать inline-расчёты.
2. WHEN `CharacterContext` применяет эффекты черт или перков THEN он SHALL делегировать это в `application/character/`.
3. IF в `CharacterContext` остаётся бизнес-логика THEN она SHALL быть помечена TODO с указанием целевого модуля.
4. WHEN `CharacterContext` сохраняет/загружает персонажа THEN эта логика SHALL быть вынесена в `application/character/characterService.js` или аналогичный use-case.

---

### Требование 8: Сохранение обратной совместимости при каждом шаге

**User Story:** Как разработчик, я хочу, чтобы каждый шаг рефакторинга не ломал работающее приложение, чтобы можно было продолжать разработку фич параллельно.

#### Acceptance Criteria

1. WHEN файл перемещается или переименовывается THEN все импорты SHALL быть обновлены в том же коммите/задаче.
2. WHEN логика дублируется на переходный период THEN старый файл SHALL содержать re-export из нового местоположения с комментарием `// @deprecated: use domain/...`.
3. IF рефакторинг затрагивает `CharacterContext` THEN приложение SHALL запускаться и все экраны SHALL отображаться корректно после изменений.
4. WHEN выполняется любой шаг рефакторинга THEN разработчик SHALL провести ручной smoke-check основных сценариев (создание персонажа, выбор черты, экипировка).

---

### Требование 9: Организация стилей

**User Story:** Как разработчик, я хочу, чтобы стили были организованы по фичам в `styles/`, а не разбросаны по компонентам, чтобы их было легко находить и изменять.

#### Acceptance Criteria

1. WHEN разработчик ищет стили экрана персонажа THEN они SHALL находиться в `styles/character/`.
2. WHEN разработчик ищет стили инвентаря THEN они SHALL находиться в `styles/inventory/`.
3. WHEN разработчик ищет стили снаряжения/оружия THEN они SHALL находиться в `styles/weapons/`.
4. IF стили перемещены THEN компоненты SHALL импортировать их из нового местоположения.

---

### Требование 10: Единый формат модификаторов эффектов

**User Story:** Как разработчик, я хочу, чтобы все игровые эффекты (от черт, перков, предметов, модов) использовали единый формат модификатора, чтобы логика применения была предсказуемой.

#### Acceptance Criteria

1. WHEN эффект создаётся в любом источнике (trait/perk/item/mod) THEN он SHALL содержать поля: `source`, `target`, `operation`, `value`, `conditions`, `priority`.
2. WHEN эффекты применяются к персонажу THEN они SHALL применяться в фиксированном порядке: базовые значения → происхождение/черты → снаряжение/моды → перки → временные эффекты → ограничения.
3. IF новый тип эффекта добавляется THEN он SHALL использовать существующий формат без введения новых несовместимых структур.
