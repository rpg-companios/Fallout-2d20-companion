# Design Document: External Data Import

## Overview

Импорт игровых данных из внешнего проекта Fallout-2d20-helper в существующую структуру приложения. Данные уже скопированы в `_external_data/*.ts`. Задача — преобразовать их в JSON-формат, соответствующий текущей архитектуре, и создать соответствующие i18n-записи.

Подход: ручное создание JSON-файлов на основе TypeScript-источников, без автоматических скриптов. Каждая категория данных обрабатывается отдельно.

## Architecture

Приложение использует двухслойную архитектуру данных:

```
data/                          ← структурные данные (механики, числа)
  equipment/
    armor.json                 ← существует
    weapons.json               ← существует
    clothes.json               ← существует
    powerArmor.json            ← НОВЫЙ
    items.json                 ← НОВЫЙ (general goods)
    weapon_qualities.json      ← НОВЫЙ (справочник качеств)
  consumables/
    chems.json                 ← существует
    drinks.json                ← существует
    food.json                  ← НОВЫЙ
  perks/
    perks.json                 ← НОВЫЙ
  origins/
    origins.json               ← существует
  traits/
    traits.json                ← существует

i18n/{locale}/data/            ← локализованные тексты
  equipment/
    armor/armor.json           ← существует
    armor/clothes.json         ← существует
    armor/powerArmor.json      ← НОВЫЙ
    weapons/weapons.json       ← существует
    items.json                 ← существует (расширить)
    weapon_qualities.json      ← НОВЫЙ (или расширить system/qualities.json)
  consumables/
    chems.json                 ← существует
    drinks.json                ← существует
    food.json                  ← НОВЫЙ
  perks/
    perks.json                 ← НОВЫЙ
  system/
    qualities.json             ← существует (расширить при необходимости)
```

## Components and Interfaces

### 1. Оружие (Weapons)

Источник: `_external_data/weapons.ts`

Ключевое отличие от текущей структуры — поле `qualities`. Текущий `weapons.json` его не имеет. Нужно добавить.

Маппинг полей:
```
external.name        → id (snake_case) + i18n name
external.value       → cost
external.rarity      → rarity
external.weight      → weight
external.skill       → mainSkill (smallGuns→SMALL_GUNS, bigGuns→BIG_GUNS, etc.)
external.damage      → damage
external.damageType  → damageType (НОВОЕ поле)
external.fireRate    → fireRate
external.range       → range (close→C, medium→M, long→L)
external.qualities   → qualities (НОВОЕ поле, массив {qualityId, value?})
external.ammo        → ammoId (маппинг названий на id)
```

Новая структура элемента в `weapons.json`:
```json
{
  "id": "weapon_assault_rifle",
  "itemType": "weapon",
  "damage": 5,
  "damageType": "physical",
  "fireRate": 2,
  "weight": "6.5",
  "cost": 144,
  "rarity": 2,
  "ammoId": "ammo_5_56mm",
  "range": "M",
  "imageName": "Assault Rifle",
  "mainAttr": "AGI",
  "mainSkill": "SMALL_GUNS",
  "hasStockVariant": false,
  "qualities": [
    { "qualityId": "quality_two-handed" }
  ]
}
```

Справочник качеств `data/equipment/weapon_qualities.json`:
```json
[
  { "id": "quality_burst", "nameKey": "qualities.burst.name", "descriptionKey": "qualities.burst.description" },
  { "id": "quality_piercing_x", "nameKey": "qualities.piercingX.name", "descriptionKey": "qualities.piercingX.description", "hasValue": true }
]
```

Качества уже частично описаны в `i18n/en-EN/data/system/qualities.json` — нужно только добавить `thrown` и `silent` если отсутствуют.

### 2. Броня (Armor)

Источник: `_external_data/armor.ts` — массив `armor` (обычная), `powerArmor`, `robotArmor`

Обычная броня: данные уже совпадают с текущей структурой. Нужно только проверить, нет ли новых типов в external, которых нет в `armor.json`.

**Силовая броня** — новый файл `data/equipment/powerArmor.json`:
```json
[
  {
    "id": "power_armor_frame",
    "itemType": "powerArmor",
    "set": "frame",
    "protectedAreas": ["Head", "Body", "Hand", "Leg"],
    "physicalDamageRating": 0,
    "energyDamageRating": 0,
    "radiationDamageRating": 0,
    "hp": 0,
    "weight": 4500,
    "cost": 75,
    "rarity": 4
  }
]
```

Маппинг `location` → `protectedAreas`:
- `head` → `["Head"]`
- `torso` → `["Body"]`
- `armLeft` → `["Hand"]`
- `legLeft` → `["Leg"]`
- `all` → `["Head", "Body", "Hand", "Leg"]`

### 3. Химикаты (Chems)

Источник: `_external_data/chems.ts`

Структура уже совпадает с `data/consumables/chems.json`. Все химикаты из external уже присутствуют в текущих данных — дополнительного импорта не требуется. Нужно только проверить полноту i18n-записей.

### 4. Еда (Food)

Источник: `_external_data/food.ts` — элементы с `type: 'food'`

Новый файл `data/consumables/food.json`:
```json
[
  {
    "id": "food_fancy_lads_snack_cakes",
    "itemType": "food",
    "weight": 0.5,
    "cost": 18,
    "rarity": 0,
    "hpHealed": 3,
    "irradiated": true,
    "effectKey": ""
  }
]
```

### 5. Напитки (Drinks)

Источник: `_external_data/food.ts` — элементы с `type: 'drink'`

Расширить существующий `data/consumables/drinks.json`. Текущий файл содержит только `drink_nuka_cola`.

Маппинг:
```
external.name    → id (drink_ + snake_case) + i18n name
external.value   → cost
external.hpHealed → hpHealed (НОВОЕ поле для drinks)
external.irradiated → irradiated (НОВОЕ поле)
external.effectKey → effectKey
```

### 6. Перки (Perks)

Источник: `_external_data/perks.ts`

Новый файл `data/perks/perks.json`:
```json
[
  {
    "id": "animalFriend",
    "nameKey": "perks.animalFriend.name",
    "effectKey": "perks.animalFriend.effect",
    "maxRanks": 2,
    "prerequisites": {
      "special": { "CHA": 6 },
      "level": 1,
      "levelIncreasePerRank": 5
    }
  }
]
```

Маппинг атрибутов SPECIAL (external → internal):
- `charisma` → `CHA`
- `strength` → `STR`
- `perception` → `PER`
- `endurance` → `END`
- `agility` → `AGI`
- `intelligence` → `INT`
- `luck` → `LCK`

### 7. Одежда (Clothing)

Источник: `_external_data/clothing.ts`

Большинство предметов уже есть в `data/equipment/clothes.json`. Нужно добавить только отсутствующие.

Маппинг `locations` → `protectedAreas`:
- `['torso', 'armLeft', 'armRight', 'legLeft', 'legRight']` → `["Body", "Hand", "Leg"]`
- `['head']` → `["Head"]`
- `['head', 'torso', ...]` → `["Head", "Body", "Hand", "Leg"]`

### 8. Общие предметы (General Goods / Items)

Источник: `_external_data/generalGoods.ts`

Новый файл `data/equipment/items.json` (расширить существующий или создать структуру):
```json
[
  {
    "id": "item_bobby_pin",
    "itemType": "item",
    "weight": 0.1,
    "cost": 1,
    "rarity": 0,
    "category": "Tool/Utility",
    "effectKey": "items.bobbyPin.effect"
  }
]
```

## Data Models

### weapon_qualities.json (data/equipment/)
```typescript
interface WeaponQuality {
  id: string;           // "quality_burst"
  nameKey: string;      // i18n key
  descriptionKey: string;
  hasValue?: boolean;   // true для piercing X, crank X и т.д.
}
```

### powerArmor.json (data/equipment/)
```typescript
interface PowerArmorPiece {
  id: string;
  itemType: "powerArmor";
  set: string;          // "frame", "t45", "t51", "t60", "x01", "raiderPower"
  protectedAreas: string[];
  physicalDamageRating: number;
  energyDamageRating: number;
  radiationDamageRating: number;
  hp: number;
  weight: number;
  cost: number;
  rarity: number;
}
```

### food.json (data/consumables/)
```typescript
interface FoodItem {
  id: string;
  itemType: "food";
  weight: number;
  cost: number;
  rarity: number;
  hpHealed: number;
  irradiated: boolean;
  effectKey?: string;
}
```

### perks.json (data/perks/)
```typescript
interface PerkPrerequisites {
  special?: Partial<Record<string, number>>;  // { "STR": 5, "INT": 6 }
  level?: number;
  levelIncreasePerRank?: number;
  perks?: string[];
  excludedPerks?: string[];
  notForRobots?: boolean;
}

interface Perk {
  id: string;
  nameKey: string;
  effectKey: string;
  maxRanks: number;
  prerequisites: PerkPrerequisites;
}
```

### items.json (data/equipment/)
```typescript
interface GeneralItem {
  id: string;
  itemType: "item";
  weight: number;
  cost: number;
  rarity: number;
  category: "Tool/Utility" | "Materials";
  effectKey?: string;
}
```

## i18n Structure

Для каждого нового файла данных создаётся зеркальный файл в `i18n/en-EN/data/` и `i18n/ru-RU/data/` с одинаковым английским содержимым.

### Новые i18n файлы:

| Данные | en-EN | ru-RU |
|--------|-------|-------|
| Силовая броня | `i18n/en-EN/data/equipment/armor/powerArmor.json` | `i18n/ru-RU/data/equipment/armor/powerArmor.json` |
| Еда | `i18n/en-EN/data/consumables/food.json` | `i18n/ru-RU/data/consumables/food.json` |
| Перки | `i18n/en-EN/data/perks/perks.json` | `i18n/ru-RU/data/perks/perks.json` |
| Предметы | расширить `i18n/en-EN/data/equipment/items.json` | расширить `i18n/ru-RU/data/equipment/items.json` |

### Формат i18n для перков:
```json
[
  {
    "id": "animalFriend",
    "name": "Animal Friend",
    "effect": "Rank 1: Animals become friendly. Rank 2: Animals can be commanded."
  }
]
```

### Формат i18n для еды:
```json
[
  {
    "id": "food_fancy_lads_snack_cakes",
    "name": "Fancy Lads Snack Cakes",
    "effectLabel": ""
  }
]
```

### Формат i18n для силовой брони:
```json
{
  "powerArmor": [
    {
      "categoryKey": "raiderPower",
      "items": [
        { "id": "power_armor_raider_helmet", "name": "Raider Power Armor Helmet" }
      ]
    }
  ]
}
```

## Error Handling

- Дублирующиеся `id` пропускаются при импорте
- Отсутствующие i18n-ключи логируются как предупреждения, не как ошибки
- Поля с неизвестными значениями (например, неизвестный `qualityId`) сохраняются как есть

## Testing Strategy

- После добавления каждой категории данных — проверить, что JSON валиден
- Проверить, что все `id` в структурных данных имеют соответствующие записи в i18n
- Проверить, что новые поля (`qualities`, `damageType`, `hpHealed`, `irradiated`) не ломают существующую логику приложения
