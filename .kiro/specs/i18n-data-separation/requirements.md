# Требования: Разделение i18n/data и domain-механик

## Введение

После реструктуризации i18n файлы переводов данных переехали в `i18n/<locale>/data/`, но внутри этой папки нет деления по категориям предметов. Кроме того, ряд файлов содержит игровую механику (statModifiers, complexity, specialEffects, costModifier, weightModifier), которой место в `data/` или `domain/`, а не в i18n.

Конкретные проблемы:
- `i18n/<locale>/data/armor_mods.json` и `uniq_armor_mods.json` содержат полную механику модов брони
- `i18n/<locale>/data/armor_effects.json` содержит механику эффектов (type, damageType, value) — это не переводы
- `i18n/<locale>/data/qualities.json` содержит поле `effect` с описанием механики — смешаны перевод и механика
- `i18n/<locale>/data/Clothes.json` содержит полные данные предметов (stats, weight, cost, rarity) — механика в i18n
- `data/equipment/mods.json` содержит и weaponMods, и armorMods в одном файле — нужно разделить
- `i18n/<locale>/data/` не разделена по категориям: снаряжение, расходники, системные данные лежат вперемешку

Цель — чётко разделить:
- **i18n**: только строки для отображения (name, description, prefix, flavourText)
- **data/**: locale-независимая механика (stats, modifiers, complexity, effects)
- **domain/**: логика применения механик

---

## Требования

### Требование 1: `data/equipment/mods.json` разделяется на два файла

**User Story:** Как разработчик, я хочу, чтобы механика оружейных модов и механика модов брони хранились в отдельных файлах, чтобы каждый тип модов можно было найти рядом со своим типом снаряжения.

#### Acceptance Criteria

1. WHEN разработчик ищет механику оружейных модов THEN она SHALL находиться в `data/equipment/weapon_mods.json`
2. WHEN разработчик ищет механику стандартных модов брони THEN она SHALL находиться в `data/equipment/armor_mods.json`
3. WHEN разработчик ищет механику уникальных модов брони THEN она SHALL находиться в `data/equipment/uniq_armor_mods.json`
4. WHEN `data/equipment/mods.json` разделён THEN старый файл SHALL быть удалён
5. WHEN `equipmentCatalog.js` или другой код импортирует моды THEN он SHALL использовать новые пути

---

### Требование 2: Механика бронемодов и эффектов переезжает из i18n в `data/`

**User Story:** Как разработчик, я хочу, чтобы механика модов брони и эффектов брони хранилась в `data/equipment/`, а i18n содержал только name и description.

#### Acceptance Criteria

1. WHEN разработчик ищет механику стандартных модов брони (statModifiers, complexity, requiredPerk, costModifier, weightModifier, specialEffects) THEN она SHALL находиться в `data/equipment/armor_mods.json`
2. WHEN разработчик ищет механику уникальных модов брони THEN она SHALL находиться в `data/equipment/uniq_armor_mods.json`
3. WHEN разработчик ищет механику эффектов брони (type, damageType/target, value) THEN она SHALL находиться в `data/equipment/armor_effects.json`
4. WHEN разработчик ищет перевод названия мода брони THEN он SHALL находиться в `i18n/<locale>/data/equipment/armor/armor_mods.json` с полями только `id` и `name`
5. WHEN разработчик ищет текстовое описание эффекта брони THEN оно SHALL находиться в `i18n/<locale>/data/equipment/armor/armor_effects.json` с полями `id` и `description`
6. WHEN `equipmentCatalog.js` собирает данные мода брони THEN он SHALL объединять data-механику с i18n-названием через mergeById

---

### Требование 3: Механика одежды переезжает из i18n в `data/`

**User Story:** Как разработчик, я хочу, чтобы статы одежды (physicalDamageRating, energyDamageRating, radiationDamageRating, weight, cost, rarity, protectedAreas) хранились в `data/`, а i18n содержал только name и описания specialEffects.

#### Acceptance Criteria

1. WHEN разработчик ищет механику предметов одежды THEN она SHALL находиться в `data/equipment/clothes.json`
2. WHEN разработчик ищет переводы одежды THEN они SHALL находиться в `i18n/<locale>/data/equipment/armor/clothes.json` с полями `id`, `name`, и опционально `specialEffects[].description`
3. WHEN `equipmentCatalog.js` собирает данные одежды THEN он SHALL объединять data-механику с i18n-названиями через mergeById

---

### Требование 4: Qualities разделяются на механику и перевод

**User Story:** Как разработчик, я хочу, чтобы поле `effect` в qualities (механика на английском) не дублировалось в каждом локале, а хранилось в одном месте.

#### Acceptance Criteria

1. WHEN разработчик ищет перевод названия качества THEN он SHALL находиться в `i18n/<locale>/data/system/qualities.json` с полями только `id` и `name`
2. IF поле `effect` одинаково во всех локалях THEN оно SHALL храниться только в `data/system/qualities.json` (или остаться в en-EN как эталон), не дублируясь в каждом локале
3. WHEN `equipmentCatalog.js` загружает qualities THEN он SHALL брать их из `i18n/<locale>/data/system/qualities.json`

---

### Требование 5: Деление `i18n/<locale>/data/` по категориям с подпапками

**User Story:** Как разработчик, я хочу, чтобы файлы переводов в `i18n/<locale>/data/` были разделены по подпапкам (weapons, armor, consumables, system), чтобы моды лежали рядом со своим типом снаряжения.

#### Acceptance Criteria

1. WHEN разработчик открывает `i18n/<locale>/data/` THEN он SHALL видеть подпапки: `equipment/weapons/`, `equipment/armor/`, `equipment/ammo/`, `consumables/`, `system/`
2. WHEN разработчик ищет переводы оружия и оружейных модов THEN они SHALL находиться в `i18n/<locale>/data/equipment/weapons/`
3. WHEN разработчик ищет переводы брони, модов брони и одежды THEN они SHALL находиться в `i18n/<locale>/data/equipment/armor/`
4. WHEN разработчик ищет переводы патронов THEN они SHALL находиться в `i18n/<locale>/data/equipment/ammo/`
5. WHEN разработчик ищет переводы расходников (chems, drinks) THEN они SHALL находиться в `i18n/<locale>/data/consumables/`
6. WHEN разработчик ищет системные переводы (qualities, effects, equipmentKits, miscellaneous) THEN они SHALL находиться в `i18n/<locale>/data/system/`
7. WHEN разработчик ищет переводы разного снаряжения (miscellaneous items) THEN они SHALL находиться в `i18n/<locale>/data/equipment/items.json`
8. IF добавляется новый тип данных THEN его переводы SHALL создаваться в соответствующей подпапке

Целевая структура `i18n/<locale>/data/`:
```
data/
  equipment/
    weapons/
      weapons.json          ← id + name
      weapon_mods.json      ← id + name + prefix + effectDescription
      mods_overrides.json   ← конфигурация слотов (locale-specific) //А нужна ли???
      weapon_qualities.json          ← id + name
      weapon_effects.json            ← UI-строки (duration, events, display)
      equipment_kits.json
    armor/
      armor.json            ← id + name
      armor_mods.json       ← id + name
      uniq_armor_mods.json  ← id + name
      armor_effects.json    ← id + description
      clothes.json          ← id + name + specialEffects[].description
    ammo/
      ammo_types.json       ← id + name
      ammo_data.json         ← 
    items/
      items.json              ← miscellaneous items (id + name)
    robot/
      weapons.json
      armor.json
      modules.json
      items.json
      parts_upgrade.json
  consumables/
    chems.json              ← id + name + description
    drinks.json             ← id + name + description

```

Целевая структура `data/equipment/` (после разделения mods.json):
```
data/equipment/
  weapons.json              ← уже есть
  weapon_mods.json          ← НОВЫЙ: из mods.json[weaponMods]
  armor.json                ← уже есть
  armor_mods.json           ← НОВЫЙ: механика из i18n/armor_mods.json
  uniq_armor_mods.json      ← НОВЫЙ: механика из i18n/uniq_armor_mods.json
  armor_effects.json        ← НОВЫЙ: механика из i18n/armor_effects.json
  clothes.json              ← НОВЫЙ: механика из i18n/Clothes.json
  ammo.json                 ← уже есть
  robotparts.json           ← уже есть
  (mods.json удаляется)
```

---

### Требование 6: Обновление импортов и equipmentCatalog

**User Story:** Как разработчик, я хочу, чтобы `equipmentCatalog.js` импортировал данные из новых путей и корректно объединял data-механику с i18n-переводами.

#### Acceptance Criteria

1. WHEN `equipmentCatalog.js` загружает оружейные моды THEN он SHALL импортировать механику из `data/equipment/weapon_mods.json` и переводы из `i18n/<locale>/data/equipment/weapons/weapon_mods.json`
2. WHEN `equipmentCatalog.js` загружает моды брони THEN он SHALL импортировать механику из `data/equipment/armor_mods.json` и переводы из `i18n/<locale>/data/equipment/armor/armor_mods.json`
3. WHEN `equipmentCatalog.js` загружает одежду THEN он SHALL импортировать механику из `data/equipment/clothes.json` и переводы из `i18n/<locale>/data/equipment/armor/clothes.json`
4. WHEN `equipmentCatalog.js` загружает qualities THEN он SHALL импортировать их из `i18n/<locale>/data/system/qualities.json`
5. WHEN все импорты обновлены THEN `npx vitest run` SHALL проходить без ошибок
