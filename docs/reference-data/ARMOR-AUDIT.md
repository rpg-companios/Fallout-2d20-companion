# Armor catalog audit (броня + моды брони)

Сверка нашей брони и модов брони (`modules/fallout/data/equipment/armor.json`,
`armor_mods.json`, `uniq_armor_mods.json`) с внешними источниками из
`docs/reference-data/`. Проверка не меняет данные — только сводит и сравнивает.

## 1. Броня (категории и части)

**Наши данные**
- `equipment/armor.json` — **6 категорий**, **56 частей**.

| Категория | allowedMod | allowedUniqueMod | Tier'ы | Частей | Зоны |
|---|---|---|---|---|---|
| `raiderArmor` | standardMods | raiderUniqueMods | standard/sturdy/heavy | 9 | Body, Hand, Leg |
| `leatherArmor` | standardMods | leatherUniqueMods | standard/sturdy/heavy | 9 | Body, Hand, Leg |
| `metalArmor` | standardMods | metalUniqueMods | standard/sturdy/heavy | 12 | Body, Hand, Head, Leg |
| `combatArmor` | standardMods | combatUniqueMods | standard/sturdy/heavy | 12 | Body, Hand, Head, Leg |
| `synthArmor` | standardMods | synthUniqueMods | standard/sturdy/heavy | 12 | Body, Hand, Head, Leg |
| `vaultSecurityArmor` | standardMods | vaultUniqueMods | standard | 2 | Body+Hand+Leg (fullbody), Head |

- Все 56 частей структурно полны (id, itemType, protectedAreas, phys/energy/rad DR,
  weight, cost, rarity, imageName).
- Данные (`armor.json`) и i18n-группы (`i18n/…/armor/armor.json`) сливаются по id
  без потерь: `data_без_i18n = []`, `i18n_без_data = []` во всех 6 категориях.

**Источники сравнения:**
| Источник | Категорий | Комментарий |
|---|---|---|
| pipboy (RU) `armor.json` | 13 типов | Из них нашей «броне» соответствуют 6: Рейдерская, Кожаная, Металлическая, Боевая, Синтов, Охранник Волт-Тек. Остальное — силовая/одежда/головные уборы/роботы/собаки (вне скоупа «броня») |
| pipboy3000 `pipboy3000_armor.json` | 14 категорий | `CATEGORY` на каждой записи и `AVAILABLE_MODS` |
| lonestar `lonestar_armor.json` | 156 записей | EN-справочник |
| focharactersheet `focharactersheet_armor.json` | 145 записей | EN-справочник |

**Вывод по броне:** набор категорий **полный и соответствует** RU-pipboy
(6 «боевых» категорий брони + одежда/силовая/головные уборы/роботы вынесены
отдельно). Структура всех частей корректна.

## 2. Моды брони

**Наши данные**
- `armor_mods.json` — **15** стандартных модов (`modCategory: standardMods`).
- `uniq_armor_mods.json` — **22** уникальных мода.
- Итого: **37** модов; i18n EN/RU по **15 + 22** (полные совпадения id).

**Распределение стандартных модов по зонам** (`protectedAreas`):
| Зоны | Моды |
|---|---|
| Body+Hand+Head+Leg | laminate, rubberized, microcarbon |
| Body | soft_padding, asbestos_lining, dense, biocomponents_mesh, pneumatic |
| Hand | melee, parrying, balanced, aerodynamic, lightweight_arms |
| Leg | soft_padding_legs, soundproofed |

**Уникальные моды по категориям:**
| Категория (modCategory) | Моды | Кол-во |
|---|---|---|
| `raiderUniqueMods` | Welded, Hardened, Reinforced, Bolstered | 4 |
| `leatherUniqueMods` | Boiled, Stitched, Tanned, Shadowed, Studded | 5 |
| `metalUniqueMods` | Painted, Enameled, Shadowed, Alloy, Polished | 5 |
| `combatUniqueMods` | Reinforced, Shadowed, Fiberglass, Polymer | 4 |
| `synthUniqueMods` | Laminated, Rubberized, Microcarbon, Nanofiber | 4 |
| `vaultUniqueMods` | — (нет модов) | 0 |

**Проверки целостности (`domain/modsEquip.js` — `getAvailableArmorMods`):**
- Привязка модов идёт не к предмету, а к **категории** (`armorCategoryKey` →
  `allowedModCategories`/`allowedUniqueModCategories`) + пересечение
  `protectedAreas` части и мода.
- **0 сирот**: каждый из 37 модов пересекается хотя бы с одной частью
  разрешённого семейства.
- **0 битых ссылок**: все `specialEffects` резолвятся в `armor_effects.json`
  (12 эффектов), все ключи `statModifiers` корректны.
- **0 рассинхронов** между категорией и модами (кроме `vaultUniqueMods`, см. ниже).

## 3. Замечания (не баги)

1. **`vaultUniqueMods` пуст.** `vaultSecurityArmor` разрешает категорию
   `vaultUniqueMods`, но модов в ней нет. Это соответствует авторитетному
   источнику: в `pipboy3000_armor.json` у `vaultTecSecurity` записи имеют
   `AVAILABLE_MODS: []` — броня охранника Волт-Тек модов не имеет. Пустое
   разрешение фактически корректно (можно оставить или зачистить — на
   отображение не влияет, т.к. UI читает `modCategory`+`protectedAreas`).

2. **Разница имён уникальных модов с pipboy3000** (возможная разница
   моделирования/перевода, не ошибка):
   - Рейдерская: у нас `Reinforced/Bolstered`, в reference `Tempered/Annealed`.
   - Кожаная: у нас `Stitched/Tanned`, в reference `Treated/Banded`.
   - Синтов: у нас `Rubberized`, в reference `Resin`.

3. **`targetArmorCategories: null`** у 12 стандартных модов (у 3 — `["all"]`).
   Поле UI не читает (используется `modCategory`+`protectedAreas`), поэтому не
   критично; при желании можно нормализовать к `["all"]`.

## 4. Статус

**Проверено — данные чистые.** В отличие от оружия (где были 17 «осиротевших»
модов, неверные слоты Arc Welder, ошибка привязки Acid Soaker), **каталог брони
не имеет багов привязки**: 0 сирот, полная i18n, все части структурно полны,
все эффекты/модификаторы корректны. `npm test` — 64/64 passed.

> Решение о содержательных правках (добавление/переименование модов, зачистка
> `vaultUniqueMods`) — по указанию. Это только сводка для сравнения.
