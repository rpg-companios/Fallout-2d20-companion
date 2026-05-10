# Дизайн: Разделение i18n/data и domain-механик

## Обзор

Миграция состоит из трёх частей:
1. Разбить `data/equipment/mods.json` на отдельные файлы по типу
2. Вынести механику из i18n-файлов в `data/`
3. Реорганизовать `i18n/<locale>/data/` по подпапкам категорий

Логика кода в `equipmentCatalog.js` меняется минимально — добавляются новые импорты и mergeById-вызовы для ранее монолитных файлов.

---

## Архитектура

### Текущее состояние `data/equipment/`

```
data/equipment/
  weapons.json        ← механика оружия
  armor.json          ← механика брони
  mods.json           ← { weaponMods: [...], armorMods: [...], uniqArmorMods: [...] }
  ammo.json           ← механика патронов
  robotparts.json     ← механика частей роботов
```

### Целевое состояние `data/equipment/`

```
data/equipment/
  weapons.json        ← без изменений
  armor.json          ← без изменений
  weapon_mods.json    ← НОВЫЙ: содержимое mods.json[weaponMods]
  armor_mods.json     ← НОВЫЙ: механика из i18n/armor_mods.json (statModifiers, complexity, etc.)
  uniq_armor_mods.json← НОВЫЙ: механика из i18n/uniq_armor_mods.json
  armor_effects.json  ← НОВЫЙ: механика из i18n/armor_effects.json (type, damageType, value)
  clothes.json        ← НОВЫЙ: механика из i18n/Clothes.json (stats, weight, cost, rarity)
  ammo.json           ← без изменений
  robotparts.json     ← без изменений
  (mods.json удаляется)
```

### Текущее состояние `i18n/<locale>/data/`

```
i18n/<locale>/data/
  weapons.json
  weapon_mods.json
  armor.json
  armor_mods.json       ← содержит механику (statModifiers, complexity, etc.)
  uniq_armor_mods.json  ← содержит механику
  armor_effects.json    ← содержит механику (type, damageType, value)
  armor.json
  Clothes.json          ← содержит механику (stats, weight, cost, rarity)
  ammo_types.json
  ammoData.json         ← содержит механику (weight, price, rarity, find_formula)
  qualities.json        ← содержит поле effect (механика)
  effects.json          ← UI-строки (чистые переводы, остаются)
  equipmentKits.json    ← конфигурация + переводы названий
  miscellaneous.json    ← переводы + данные предметов
  mods_overrides.json   ← конфигурация слотов
  chems.json            ← чистые переводы (id + name + labels)
  drinks.json           ← чистые переводы
  robot/
    weapons.json
    armor.json
    modules.json
    items.json
    partsUpgrade.json
```

### Целевое состояние `i18n/<locale>/data/`

```
i18n/<locale>/data/
  equipment/
    weapons/
      weapons.json          ← id + name + rangeName + flavour + stockNames
      weapon_mods.json      ← id + name + prefix + effectDescription
      mods_overrides.json   ← конфигурация слотов (locale-specific, остаётся здесь)
    armor/
      armor.json            ← id + name
      armor_mods.json       ← id + name (только)
      uniq_armor_mods.json  ← id + name (только)
      armor_effects.json    ← id + description (только)
      clothes.json          ← id + name + specialEffects[].description
    ammo/
      ammo_types.json       ← id + name
      ammoData.json         ← id + name (механика уходит в data/)
    items.json              ← miscellaneous items: id + name
    robot/
      weapons.json
      armor.json
      modules.json
      items.json
      partsUpgrade.json
  consumables/
    chems.json              ← id + name + positiveEffectLabel + negativeEffectLabel
    drinks.json             ← id + name + positiveEffectLabel + negativeEffectLabel
  system/
    qualities.json          ← id + name (поле effect удаляется из locale-файлов)
    effects.json            ← UI-строки duration/events/display
    equipmentKits.json      ← названия наборов и фракций (конфигурация остаётся)
```

---

## Компоненты и интерфейсы

### 1. Разбивка `data/equipment/mods.json`

Текущий файл имеет структуру:
```json
{
  "weaponMods": [...],
  "armorMods": [...],
  "uniqArmorMods": [...]
}
```

Разбивается на три файла:
- `data/equipment/weapon_mods.json` — массив `[...]` из `weaponMods`
- `data/equipment/armor_mods.json` — массив `[...]` из `armorMods` + механика из i18n
- `data/equipment/uniq_armor_mods.json` — массив `[...]` из `uniqArmorMods` + механика из i18n

Механика из `i18n/<locale>/data/armor_mods.json` (statModifiers, complexity, requiredPerk, costModifier, weightModifier, specialEffects) объединяется с данными из `mods.json[armorMods]` по `id`.

### 2. Новые data-файлы для механики брони

**`data/equipment/armor_effects.json`** — из `i18n/<locale>/data/armor_effects.json`:
```json
{
  "effect_explosive_resistance_2": { "type": "resistance", "damageType": "explosive", "value": 2 },
  ...
}
```

**`data/equipment/clothes.json`** — из `i18n/<locale>/data/Clothes.json`, только механика:
```json
{
  "clothes": [
    {
      "type": "suits",
      "clothingType": "suit",
      "allowsArmor": true,
      "items": [
        {
          "id": "clothing_harness",
          "protectedAreas": ["Body", "Hand", "Leg"],
          "physicalDamageRating": 0,
          "energyDamageRating": 0,
          "radiationDamageRating": 0,
          "weight": 0.5,
          "cost": 5,
          "rarity": 0,
          "specialEffects": [],
          "itemType": "clothing",
          "clothingType": "suit",
          "allowsArmor": true
        }
      ]
    }
  ]
}
```

### 3. Очищенные i18n-файлы

**`i18n/<locale>/data/equipment/armor/armor_mods.json`** — только переводы:
```json
[
  { "id": "mod_std_laminate", "name": "Ламинированная" },
  { "id": "mod_std_rubberized", "name": "Прорезиненная" },
  ...
]
```

**`i18n/<locale>/data/equipment/armor/armor_effects.json`** — только описания:
```json
{
  "effect_explosive_resistance_2": { "description": "+2 к сопротивлению всем повреждениям против взрывного оружия." },
  ...
}
```

**`i18n/<locale>/data/equipment/armor/clothes.json`** — только переводы:
```json
[
  {
    "id": "clothing_harness",
    "name": "Портупея"
  },
  {
    "id": "clothing_lab_coat",
    "name": "Лабораторный халат",
    "specialEffects": [
      { "description": "Один раз за сцену вы можете перебросить 1d20 при проверке Интеллекта." }
    ]
  }
]
```

**`i18n/<locale>/data/system/qualities.json`** — только id + name, без поля `effect`:
```json
[
  { "id": "quality_burst", "name": "Очередь" },
  { "id": "quality_vicious", "name": "Порочный" },
  ...
]
```

**`i18n/<locale>/data/equipment/ammo/ammoData.json`** — только переводы:
```json
[
  { "name": ".38" },
  { "name": "10-мм" },
  ...
]
```
Механика ammoData (weight, price, rarity, find_formula) остаётся в `data/equipment/ammo.json` (уже там есть `ammo.json` — нужно проверить совместимость).

### 4. Обновление `equipmentCatalog.js`

Новые импорты (добавляются):
```js
// data/ — новые файлы механики
import dataWeaponMods from '../data/equipment/weapon_mods.json';
import dataArmorMods from '../data/equipment/armor_mods.json';
import dataUniqArmorMods from '../data/equipment/uniq_armor_mods.json';
import dataArmorEffects from '../data/equipment/armor_effects.json';
import dataClothes from '../data/equipment/clothes.json';

// i18n — новые пути по подпапкам
import ruWeapons from './ru-RU/data/equipment/weapons/weapons.json';
import ruWeaponMods from './ru-RU/data/equipment/weapons/weapon_mods.json';
import ruModsOverrides from './ru-RU/data/equipment/weapons/mods_overrides.json';
import ruArmor from './ru-RU/data/equipment/armor/armor.json';
import ruArmorMods from './ru-RU/data/equipment/armor/armor_mods.json';
import ruUniqArmorMods from './ru-RU/data/equipment/armor/uniq_armor_mods.json';
import ruArmorEffects from './ru-RU/data/equipment/armor/armor_effects.json';
import ruClothes from './ru-RU/data/equipment/armor/clothes.json';
import ruAmmoTypes from './ru-RU/data/equipment/ammo/ammo_types.json';
import ruAmmoData from './ru-RU/data/equipment/ammo/ammoData.json';
import ruMiscItems from './ru-RU/data/equipment/items.json';
import ruChems from './ru-RU/data/consumables/chems.json';
import ruDrinks from './ru-RU/data/consumables/drinks.json';
import ruQualities from './ru-RU/data/system/qualities.json';
import ruEffects from './ru-RU/data/system/effects.json';
import ruEquipmentKits from './ru-RU/data/system/equipmentKits.json';
// robot
import ruRobotWeapons from './ru-RU/data/equipment/robot/weapons.json';
import ruRobotArmor from './ru-RU/data/equipment/robot/armor.json';
import ruRobotModules from './ru-RU/data/equipment/robot/modules.json';
import ruRobotItems from './ru-RU/data/equipment/robot/items.json';
import ruRobotPartsUpgrade from './ru-RU/data/equipment/robot/partsUpgrade.json';
```

Старый импорт `dataMods` заменяется:
```js
// было
import dataMods from '../data/equipment/mods.json';
// ...
weaponMods: mergeById(dataMods.weaponMods, i18n.weaponMods),
armorMods: dataMods.armorMods,

// станет
import dataWeaponMods from '../data/equipment/weapon_mods.json';
import dataArmorMods from '../data/equipment/armor_mods.json';
// ...
weaponMods: mergeById(dataWeaponMods, i18n.weaponMods),
armorMods: mergeById(dataArmorMods, i18n.armorMods),
```

---

## Модели данных

### Что остаётся в i18n (только строки)

| Поле | Тип | Пример |
|---|---|---|
| `name` | string | "Ламинированная" |
| `prefix` | string | "Rapid" |
| `effectDescription` | string | "Урон -1 БК, скорострельность +2" |
| `description` | string | "+2 к сопротивлению..." |
| `positiveEffectLabel` | string | "Восстанавливает 4 HP" |
| `negativeEffectLabel` | string | "Зависимость: Стимулятор" |
| `flavour` | string | флейвор-текст оружия |
| `rangeName` | string | "Близкая" |

### Что уходит из i18n в data/

| Поле | Куда |
|---|---|
| `statModifiers` | `data/equipment/armor_mods.json` |
| `complexity` | `data/equipment/armor_mods.json` |
| `requiredPerk` | `data/equipment/armor_mods.json` |
| `requiredSkill` | `data/equipment/armor_mods.json` |
| `costModifier` | `data/equipment/armor_mods.json` |
| `weightModifier` | `data/equipment/armor_mods.json` |
| `specialEffects[].id/value` | `data/equipment/armor_mods.json` |
| `type/damageType/value` (armor_effects) | `data/equipment/armor_effects.json` |
| `physicalDamageRating` | `data/equipment/clothes.json` |
| `energyDamageRating` | `data/equipment/clothes.json` |
| `radiationDamageRating` | `data/equipment/clothes.json` |
| `weight/cost/rarity` (clothes) | `data/equipment/clothes.json` |
| `protectedAreas` (clothes) | `data/equipment/clothes.json` |
| `effect` (qualities) | удаляется из locale-файлов, остаётся только в en-EN как эталон |

---

## Обработка ошибок

- Если после перемещения файл не найден — Vite/Metro выдаст ошибку на этапе импорта
- `mergeById` уже логирует предупреждение если нет i18n-записи для id — это поможет найти пропущенные переводы
- Тесты в `domain/contract.test.js` проверяют импорты через `equipmentCatalog.js` и упадут если что-то сломается

---

## Стратегия тестирования

- После каждого шага запускать `npx vitest run` — тесты должны оставаться зелёными
- `domain/contract.test.js` косвенно проверяет все импорты equipmentCatalog
- Проверить что `getEquipmentCatalog()` возвращает корректные данные для armorMods и clothes после mergeById

---

## Порядок выполнения

1. Разбить `data/equipment/mods.json` → `weapon_mods.json` + `armor_mods.json` + `uniq_armor_mods.json`, обновить импорты
2. Создать `data/equipment/armor_effects.json` и `data/equipment/clothes.json` из i18n-данных
3. Очистить `i18n/<locale>/data/armor_mods.json`, `uniq_armor_mods.json`, `armor_effects.json`, `Clothes.json` — оставить только строки
4. Очистить `i18n/<locale>/data/qualities.json` — убрать поле `effect`
5. Создать подпапки в `i18n/<locale>/data/` и переместить файлы
6. Обновить все импорты в `equipmentCatalog.js`
7. Удалить старые файлы
8. Прогнать тесты
