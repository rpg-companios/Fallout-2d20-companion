# Схема: Modifiers (модификаторы) — универсальный каталог

> Этот документ — **каталог всех известных модификаторов**: что каждый делает, где живёт,
> как применяется, и реализован ли он на сегодня. Цель — любой человек/агент может
> заглянуть сюда, понять существующие модификаторы и спроектировать новый (или повторно
> использовать готовый) по тому же шаблону.

## 0. Что такое модификатор

Модификатор — это декларативное поле в данных, описывающее правило. Движок (в `domain/`)
читает его и применяет к персонажу. Все модификаторы:

- **camelCase** в ключах (правило проекта).
- Лежат в `modifiers: { ... }` объекта источника.
- Имеют **одну** точку истины: либо поле на трейте, либо на ориджине, либо на перке,
  и т.д. Дубликаты между источниками — недопустимы (см. T-1 в `02-traits.md`).
- Имеют **описанный приоритет** при коллизии (что перебивает что).
- Числовые операторы — **только additive** (`+`, `-`). Мультипликативных (`*`, `/`)
  пока нет; если появится — вводить осознанно вместе с правилом приоритета (см. § 2).

Источники модификаторов (все живут в `modifiers: { ... }`):

| Источник | Где живёт | Когда применяется |
|---|---|---|
| `Origin` | `data/origins/origins.json` | на персонаже всегда (если origin выбран) |
| `Trait` | `data/traits/traits.json` | после выбора трейта |
| `Perk` | `data/perks/perks.json` | после выбора перка (см. § 3 — пока без `modifiers`) |
| `Consumable effect` (chem/food/drink) | `data/consumables/*.json` | во время действия эффекта |
| `Item` (броня/оружие) | `data/equipment/{armor,weapons,robot}.json` | пока предмет экипирован |

Все модификаторы выше **одинаковы по форме** (`{key: value}`), но **различаются по
приоритету** при слиянии (см. § 2 «Приоритеты»).

### Легенда статусов

В каждом поле ниже стоит маркер реализации:

- ✅ — **реализовано** в `domain/*` и **используется** в данных.
- 🟡 — **реализовано**, но в текущих данных не встречается (зарезервировано).
- ⚠️ — **описано в данных** или встречается, но **движок не читает** (TODO: имплементация).
- 🗑 — **legacy** форма; в данных может встречаться, но в новых записях запрещено,
  будет мигрировано.

## 1. Каталог модификаторов

Формат записи каждого поля:
- **Тип** значения.
- **Источники** — где разрешено: origin / trait / perk / chem / item.
- **Поведение** — как движок применяет.
- **Оператор** — additive по умолчанию (числа складываются), если не сказано иное.
- **Пример** — `"key": value` с пояснением.
- **Статус** — маркер реализации.

### 1.1. Атрибуты

#### `attributeBonus` ✅
- **Тип:** `{ [ATTR]: number }` где `ATTR ∈ {STR,END,PER,AGI,INT,CHA,LCK}`. Число может быть отрицательным.
- **Источники:** trait, perk (целевое), chem-effect (целевое).
- **Поведение:** +N к базовому значению атрибута. Бонус и лимит независимы — трейт
  может дать бонус без лимита.
- **Оператор:** additive (все источники складываются).
- **Пример:**
  ```jsonc
  "attributeBonus": { "STR": 2, "END": 2 }  // +2 к STR и +2 к END
  ```
- **Статус:** ✅ читается из trait (`getTraitAttributeBonus`); 🟡 для perk/chem — поле допустимо, но активных источников нет.

#### `attributeLimits` ✅
- **Тип:** `{ [ATTR]: { min?: number, max?: number } }`.
- **Источники:** trait, perk (целевое).
- **Поведение:** расширяет нижнюю/верхнюю границу атрибута. `min`/`max` можно задать
  независимо (`{ max: 6 }` — только верхняя граница).
- **Оператор:** при нескольких источниках — пока N/A (только один источник существует);
  правило когда появится: «самый широкий» = `min` из всех `min`, `max` из всех `max`.
- **Пример:**
  ```jsonc
  "attributeLimits": { "STR": { "min": 6, "max": 12 }, "CHA": { "max": 6 } }
  ```
- **Статус:** ✅ trait.

#### `attributePointsBonus` ⚠️
- **Тип:** `number`.
- **Источники:** trait, perk (целевое — критично для перка «Интенсивные тренировки»).
- **Поведение:** +N очков распределения сверх базовых 12.
- **Оператор:** additive из всех активных источников.
- **Пример:**
  ```jsonc
  "attributePointsBonus": 1  // +1 очко атрибута к 12 базовым
  ```
- **Статус:** ✅ читается из **trait** (`getRemainingAttributePoints`).
  ⚠️ Из **perk** — НЕ читается через универсальный путь: для перка «Интенсивные
  тренировки» сейчас работает хардкод по русскому имени в
  `components/screens/PerksAndTraitsScreen/PerksAndTraitsScreen.js`, который к тому же
  пытается прочитать `perk.modifiers?.attributeBonus`, которого в данных перка нет
  (срабатывает fallback `|| 1`). Это **долг**: перевести на чтение
  `perk.modifiers.attributePointsBonus` через общий агрегатор (см. § 3 ниже).

### 1.2. Навыки

#### `forcedSkills` ✅
- **Тип:** `string[]` — canonical SKILL keys (UPPER_SNAKE_CASE из `ALL_SKILL_KEYS`).
- **Источники:** trait.
- **Поведение:** перечисленные навыки становятся теговыми со стартовым значением 2,
  помечены как extra-tagged (особый цвет в UI).
- **Оператор:** union списков.
- **Пример:**
  ```jsonc
  "forcedSkills": ["SURVIVAL"]  // гарантированный extra-tagged навык
  ```
- **Статус:** ✅.

#### `extraSkills` ✅
- **Тип:** `number`.
- **Источники:** trait.
- **Поведение:** +N дополнительных тегов на выбор игрока (сверх базовых 3).
- **Оператор:** additive из всех активных источников.
- **Пример:**
  ```jsonc
  "extraSkills": 1
  ```
- **Статус:** ✅.

#### `skillModifiers` ⚠️
- **Тип:** `{ [SKILL]: number }` — canonical SKILL keys.
- **Источники:** trait, perk, chem-effect.
- **Поведение:** **+N к рангу навыка** (постоянный модификатор поверх распределения
  игрока). Семантика: персонаж может **раскачать** навык на +N выше, чем дал бы
  только distribution. Лимит навыка (`skillMaxValue`) при этом не сдвигается.
- **Оператор:** additive из всех активных источников.
- **Пример (перк, гарантированный +2 к Energy Weapons):**
  ```jsonc
  "skillModifiers": { "ENERGY_WEAPONS": 2 }
  ```
- **Статус:** ⚠️ движок **сейчас не читает** это поле в расчёте навыка
  (`canChangeSkillValue` / `validateSkills` смотрят только `skillMaxValue`).
  В данных используется в **0** местах — у Ghoul оно было дублем (`forcedSkills`
  уже даёт +2 через теговую механику), снято в коммите cleanup. Поле описано как
  **контракт**: ровно через него будут реализованы перки/chem'ы, дающие +N к
  конкретному навыку. Реализация — через общий агрегатор (§ 3).

#### `skillPickChoice` 🟡
- **Тип:** `{ count: number, from: string[] | "any" }`.
- **Источники:** trait (`ncr-good-soul`), perk, chem-effect.
- **Поведение:** игрок выбирает `count` навыков из `from` (canonical UPPER_SNAKE_CASE
  или `"any"` = весь `ALL_SKILL_KEYS`). Результат запоминается на инстансе трейта/перка
  и используется как **extra-tagged**-набор (даёт стартовые +2 и подсветку).
- **Пример (NCR Good Soul, 2 из 5):**
  ```jsonc
  "skillPickChoice": {
    "count": 2,
    "from": ["SPEECH", "MEDICINE", "REPAIR", "SCIENCE", "BARTER"]
  }
  ```
- **Пример (перк «1 из любого боевого»):**
  ```jsonc
  "skillPickChoice": { "count": 1, "from": ["SMALL_GUNS", "ENERGY_WEAPONS", "BIG_GUNS"] }
  ```
- **Статус:** 🟡 поле есть в данных (`ncr-good-soul`); UI-пикер пока в долге
  (см. `07-trait-debt.md`). До появления пикера хардкод
  `GOOD_SOUL_SKILL_KEYS` в `CharacterScreen.js` читается как fallback,
  но источник истины — это поле.

#### `skillMaxValue` ✅
- **Тип:** `number` (по умолчанию 6).
- **Источники:** trait.
- **Поведение:** общий верхний потолок для всех навыков; на 1 уровне дополнительно ≤ 3.
- **Оператор:** при нескольких источниках — берётся максимум (расширяет, не сужает).
- **Пример:**
  ```jsonc
  "skillMaxValue": 4  // Shadow: потолок навыков = 4
  ```
- **Статус:** ✅.

### 1.3. Перки

#### `extraPerks` / `extraPerkSlots` ✅
- **Тип:** `number`.
- **Источники:** trait.
- **Поведение:** +N перк-слотов на выбор.
- **Оператор:** additive.
- **Статус:** ✅.

### 1.4. Carry weight (переносимый вес)

#### `carryWeightFixed` ✅
- **Тип:** `number` (по умолчанию 150).
- **Источники:** trait (human + robot).
- **Поведение:** базовый лимит переносимого веса до применения формулы STR.
  - Для **human**: итог = `carryWeightFixed + STR × carryWeightStrengthMultiplier + armor_mods`.
  - Для **robot**: итог = `(body.carryWeight ?? carryWeightFixed) + armor_mods` (STR не влияет).
- **Пример:**
  ```jsonc
  "carryWeightFixed": 150
  ```
- **Статус:** ✅ читается в `domain/equipEquip.js` и `calculateCarryWeight`.

#### `carryWeightStrengthMultiplier` ✅
- **Тип:** `number` (по умолчанию 10).
- **Источники:** trait (human).
- **Поведение:** множитель STR в формуле веса для людей:
  `weight = base + STR × multiplier + armor_mods`.
- **Пример:**
  ```jsonc
  "carryWeightStrengthMultiplier": 0   // супермутант: STR не влияет
  ```
- **Статус:** ✅.

#### `carryWeightLimit` 🗑
- **Тип:** `number`.
- **Источники:** ранее trait+body для роботов.
- **Статус:** 🗑 legacy. В новых данных не использовать — заменено на пару
  `carryWeightFixed` (trait) + `carryWeight` на корпусе робота (`data/equipment/robot/robotbody.json`).

#### `carryWeightModifier` *(на предметах)* ✅
- **Тип:** `number` (может быть отрицательным).
- **Где:** armor, clothing, plating/frame/robot armor (catalog).
- **Поведение:** +N к итоговому carry weight за надетый предмет.
- **Оператор:** additive по слотам.
- **Статус:** ✅.

### 1.5. Производные / ресурсы

#### `luckMaxDelta` ✅
- **Тип:** `number` (может быть отрицательным).
- **Источники:** trait, perk (целевое).
- **Поведение:** сдвиг максимума очков удачи.
- **Оператор:** additive.
- **Статус:** ✅ trait.

#### `meleeBonusDelta` ✅
- **Тип:** `number` (может быть отрицательным).
- **Источники:** trait, perk (целевое).
- **Поведение:** +N к бонусу ближнего боя (сверх STR-ступеней 7→+1, 9→+2, 11→+3).
- **Оператор:** additive.
- **Статус:** ✅ trait.

### 1.6. Иммунитеты / сопротивления / эффекты

#### `immunities` ✅
- **Тип:** `string[]` (значения: `'disease'`, `'radiation'`, `'poison'`, …).
- **Источники:** trait, origin.
- **Поведение:** явный список иммунитетов. Не type-derived (см. отклонение в `01-origins.md`).
- **Оператор:** union множеств; повторы не дублируются.
- **Пример:**
  ```jsonc
  "immunities": ["radiation", "poison"]
  ```
- **Статус:** ✅.

#### `radiationResistance` ✅
- **Тип:** `number`.
- **Источники:** trait, perk (целевое).
- **Поведение:** сопротивление радиации (снижение урона, не иммунитет).
- **Оператор:** additive.
- **Статус:** ✅ trait.

#### `effects` ⚠️
- **Тип:** `string[]` — именованные флаги (например `'radiation_healing'`,
  `'stealth_boy_addiction'`, `'no_aging'`).
- **Источники:** trait, perk (целевое), chem-effect.
- **Поведение:** именованный эффект-флаг. Семантика определяется самим флагом
  (реализуется в `domain/effects.js`).
- **Статус:** ⚠️ список флагов растёт без аудита. Часть флагов имеют реализацию
  (`radiation_healing` — ☐ см. D-1 в `04-derived.md`), часть — заглушки. **TODO:**
  отдельный аудит всех флагов + единый реестр.

### 1.7. Универсальные модификаторы (трейт / перк / химия)

Эти модификаторы **применимы в любом источнике** (трейт, перк, эффект химии) и
движок суммирует их из всех активных источников.

#### `weaponDamageBonus` 🟡
- **Тип:** `Array<{ weaponIds?: string[], weaponId?: string, skillKey?: string, bonus: number }>`.
- **Источники:** trait, perk, consumable effect.
- **Поведение:** запись матчит оружие по `weaponIds[]`, `weaponId` или `skillKey`
  (UPPER_SNAKE_CASE). При совпадении прибавляет `bonus`. Несколько записей
  суммируются. Движок суммирует из всех источников через
  `getWeaponDamageBonusFromSources` (по тестам в `domain/weaponDamageBonus.test.js`).
- **Пример:**
  ```jsonc
  "weaponDamageBonus": [
    { "weaponIds": ["weapon_10mm_pistol"], "bonus": 1 },
    { "skillKey": "BIG_GUNS", "bonus": -1 }
  ]
  ```
- **Статус:** 🟡 функция `getWeaponDamageBonus` / `getWeaponDamageBonusFromSources` —
  ожидается тестами, **но реализации в `domain/traits.js` нет**, тесты падают.
  В данных используется только `ncrInfantryWeaponIds` (legacy). **TODO:**
  реализовать функции + мигрировать `ncrInfantryWeaponIds` → `weaponDamageBonus`.

#### `ncrInfantryWeaponIds` 🗑
- **Тип:** `string[]`.
- **Источники:** trait (`ncr-infantryman`).
- **Поведение:** прибавляет +1 к урону для перечисленных оружий (читается напрямую
  в `WeaponsAndArmorScreen.js`).
- **Статус:** 🗑 legacy. План: заменить на `weaponDamageBonus`.

### 1.8. Структурные (метаданные трейта)

#### `isMultiTrait` ✅
- **Тип:** `boolean`.
- **Источники:** trait.
- **Поведение:** маркер «это контейнер с под-чертами» (NCR, Survivor, Savage).

#### `subTraitIds` ✅
- **Тип:** `string[]`.
- **Источники:** trait (multi-trait).
- **Поведение:** список id под-черт для выбора.

#### `goodSoulSkills` 🟡
- **Тип:** `string[]` — canonical SKILL keys.
- **Источники:** trait (`ncr-good-soul`).
- **Поведение:** список навыков, которые Good Soul даёт на выбор. Источник истины
  для `goodSoulGroup`.
- **Статус:** 🟡 описано в контракте; в текущих данных у `ncr-good-soul`
  это поле отсутствует, в коде используется хардкод-массив
  `GOOD_SOUL_SKILL_KEYS` в `CharacterScreen.js`. **TODO:** перенести в данные
  и читать из `findTraitById('ncr-good-soul').modifiers.goodSoulSkills`.

### 1.9. Робото-специфика (только для трейтов роботов)

#### `armorConstraint` ✅
- **Тип:** `string` — например `"mutantOnly"`.
- **Источники:** trait (например, super mutant).
- **Поведение:** ограничивает, какую броню можно надевать.
- **Статус:** ✅.

#### `robotBodyPlan` ✅
- **Тип:** `string` — id плана тела (`"protectron"`, `"assaultron"`, …).
- **Источники:** trait (робот).
- **Поведение:** задаёт схему слотов робота.

#### `robotRules` ✅
- **Тип:** `object` — настройки правил робота.
- **Источники:** trait.

#### `robotType` ✅
- **Тип:** `string`.
- **Источники:** trait.

### 1.10. Legacy-формы (запрещены в новых данных)

#### `attributes` 🗑
- **Тип:** `{ [ATTR]: number | object }` — старая форма, смешивавшая бонус и лимиты.
- **Статус:** 🗑 legacy. Заменено на пару `attributeBonus` + `attributeLimits`.

## 2. Приоритеты при коллизии

Если один и тот же атрибут модифицируется несколькими источниками одновременно:

| Сценарий | Приоритет |
|---|---|
| **Атрибуты** (`attributeBonus`, `attributeLimits`) | additive — все источники складываются (если не противоречат) |
| **Иммунитеты** | additive (union множеств) — повторы не дублируются |
| **Иммунитеты по типу** | ❌ НЕ применяется (отклонение от `01-origins.md`); только явные списки |
| **Carry weight base (робот)** | `body.carryWeight` → `trait.carryWeightFixed` → 150 |
| **Carry weight base (human)** | `trait.carryWeightFixed (=150) + STR × multiplier + additive item mods` |
| **Carry weight modifier (предмет)** | additive per slot |
| **`weaponDamageBonus`** | additive — все активные источники суммируются |
| **`skillModifiers`** | additive — все активные источники суммируются |
| **`attributePointsBonus`** | additive (trait + все активные перки) |
| **`skillMaxValue`** | берётся максимум (расширяет потолок, не сужает) |
| **`forcedSkills` / `subTraitIds` / `goodSoulSkills`** | union |

## 3. Шаблон: как добавить новый модификатор и единый агрегатор

### 3.1. Шаги для нового поля

1. **Опиши в § 1.x** этого документа:
   имя ключа (camelCase), тип, источники, поведение, оператор, пример, статус.
2. **Добавь в данные** (`data/traits/...`, `data/perks/...`, ...) — фикстуры.
3. **Реализуй в `domain/`** — чистая функция-читатель/агрегатор.
4. **Добавь тест** в `domain/*.test.js`.
5. **Используй в UI / резолверах** через хелпер, не напрямую.

### 3.2. Единый агрегатор (контракт; реализация TBD)

Целевая архитектура: один-единственный «слой чтения», который принимает массив
**активных источников** персонажа и возвращает объединённую таблицу модификаторов.

```js
// domain/modifiers.js (планируется)
export function aggregateModifiers(sources) {
  // sources: [originMods, traitMods, ...activePerkMods, ...activeChemMods]
  // returns: { attributeBonus, attributeLimits, attributePointsBonus,
  //            skillModifiers, skillMaxValue, weaponDamageBonus,
  //            immunities, effects, ... } — уже сложенные по правилам § 2
}
```

Все «потребители» (расчёт атрибутов, навыков, потолков, очков распределения,
бонусов урона) идут через этот агрегатор. **Никаких** прямых обращений к
`trait.modifiers.X` / `perk.modifiers.X` в коде вне `domain/modifiers.js`.

Текущее состояние: агрегатора нет, есть фрагментарные читатели (`getTraitAttributeBonus`,
`getRemainingAttributePoints` и т.п.), каждый смотрит только в `trait`. Перки
не интегрированы (см. ⚠️ у `attributePointsBonus`). **TODO:** ввести агрегатор
одним рефактором + миграция читателей.

### 3.3. Как перку дать +N к навыку (готовый рецепт)

После реализации § 3.2 — это будет одна запись в `data/perks/perks.json`:

```jsonc
{
  "id": "gunNut",
  "nameKey": "perks.gunNut.name",
  "maxRanks": 4,
  "prerequisites": { "special": { "INT": 5 }, "level": 1 },
  "effectKey": "perks.gunNut.effect",
  "modifiers": {
    // на каждый ранг — +1 к Repair и +1 к Science; agg() умножит на rank
    "skillModifiers": { "REPAIR": 1, "SCIENCE": 1 }
  }
}
```

И в `data/perks/perks.json` для «Интенсивных тренировок»:

```jsonc
{
  "id": "intenseTraining",
  "nameKey": "perks.intenseTraining.name",
  "maxRanks": 10,
  "prerequisites": { "level": 2, "levelIncreasePerRank": 2 },
  "effectKey": "perks.intenseTraining.effect",
  "modifiers": { "attributePointsBonus": 1 }
}
```

После этого хардкод по русскому имени `"ИНТЕНСИВНЫЕ ТРЕНИРОВКИ"` в
`PerksAndTraitsScreen.js` удаляется.

## 4. Связь с будущей системой модификаторов

Этот каталог — **контракт уровня данных**. Долгосрочная архитектурная цель
(см. `docs/architecture/modifiers-vision.md`) — единая runtime-система с
`source` / `target` / `kind` / `priority` и полным трассированием. До неё этот
документ — единственный источник истины: любое поле в `modifiers: { ... }`
любого источника должно быть описано здесь.
