# Схема: Traits (черты)

Файл данных: `data/traits/traits.json` (24 черты).
Структура черты: `{ id, originId, displayNameKey, descriptionKey, modifiers: {...} }`.
Мульти-черта: ориджин-черта со `subTraitIds` (ncr, survivor) собирает под-черты.

## Все модификаторы сейчас (факт) — сгруппированы по влиянию

### A. Атрибуты
| ключ | пример | назначение |
|---|---|---|
| `attributes` | `{STR:{baseBonus:2,min:6,max:12}}` | бонус + лимиты атрибута (🔁 объектная форма — см. #6) |
| `attributePointsBonus` | `2` | доп. очки распределения |

### B. Навыки
| ключ | пример | назначение |
|---|---|---|
| `forcedSkills` | `["energy_weapons","science"]` | обязательные теги |
| `extraSkills` | `1` | +N доп. тегов на выбор |
| `skillModifiers` | `{survival:2}` | +N к конкретному навыку |
| `skillMaxValue` | `4` | потолок значения навыка |

### C. Перки
| `extraPerks` | `1` | +N перк-слотов |

### D. Производные / ресурсы
| `carryWeightFixed` | `225` | фикс. переносимый вес |
| `carryWeightStrengthMultiplier` | `0` | множитель STR для веса (0 = STR не влияет) |
| `luckMaxDelta` | `-1` | сдвиг максимума удачи |
| `meleeBonusDelta` | `1` | сдвиг бонуса ближнего боя |

### E. Иммунитеты / сопротивления / эффекты
| `immunities` | `["radiation","poison"]` | иммунитеты |
| `radiationResistance` | `1` | сопротивление радиации |
| `effects` | `["radiation_healing","slow_aging",...]` | именованные эффекты-флаги |

### F. Броня
| `armorConstraint` | `"mutantOnly"` | 🔁 → переедет в armorRules (см. 01b) |

### G. Робот-специфика (🔁 дублирует origin!)
| `isRobot` | `true` | дубль origin.isRobot |
| `robotBodyPlan` | `"misterHandy"` | дубль origin.bodyPlan |
| `robotType` | `"misterHandy"` | дубль |
| `robotRules` | `{canSelfUseConsumables:false,...}` | правила робота (химия/броня) |

### H. Структура / прочее
| `isMultiTrait` | `true` | это ориджин-черта с под-чертами |
| `subTraitIds` | `[...]` | id под-черт |
| `ncrInfantryWeaponIds` | `[...]` | спец-механика NCR (бонус урона) |

## Проблемы (то, что унифицируем)
1. 🔁 `attributes` объектная форма мешает «эффект»+«лимит» (см. modifiers-vision.md).
2. 🔁 Робот-поля в чертах ДУБЛИРУЮТ origin (isRobot/robotBodyPlan/robotType).
   Решение: робот-сущность определяется ОРИДЖИНОМ (characterType=robot, bodyPlan на origin);
   черта НЕ должна заново объявлять «я робот».
3. 🔁 `armorConstraint` → armorRules (origin), см. 01b.
4. 🔁 `robotRules` (canSelfUseConsumables, canEquip...) — это правила ТИПА robot,
   логичнее на уровне characterType/origin, не в каждой робо-черте.
5. `effects` — пока флаги-строки; в будущем → модификаторы (modifiers-vision.md).

## Решения нужны
❓ T-1: робот-поля (isRobot/robotBodyPlan/robotType/robotRules) — убрать из черт и
   определять из origin.characterType/bodyPlan? (рекомендую ДА — убирает дубль)
❓ T-2: `ncrInfantryWeaponIds` — частная механика. Оставить как есть или обобщить
   («черта даёт бонус урона к списку оружия»)?
❓ T-3: `skillModifiers` ключи — это canonical (`survival`) или локализованные? унифицировать ключи навыков.
❓ T-4: формат `attributes` оставляем (как в #6) до системы модификаторов, или
   сразу разложить на `attributeBonus` + `attributeLimits`?

## Решения (утверждено владельцем)

✅ T-1: Робот-поля УБРАТЬ из черт. Робот определяется ОРИДЖИНОМ:
   - `origin.characterType: "robot"` → автоматически даёт набор робо-иммунитетов
     (disease/radiation/poison). Раньше для этого был `isRobot` — больше не нужен.
   - `origin.bodyPlan` — одно поле (убрать дубли robotBodyPlan/robotType).
   - Иммунитеты — на ОРИДЖИНЕ (тип даёт базовые; origin может дополнить).
   - `robotRules` (canSelfUseConsumables и т.п.) → правила ТИПА robot (origin/тип), не в чертах.

✅ T-4: Разложить на ДВА независимых вида модификатора (это РАЗНЫЕ механики!):
   - **бонус к значению**: `attributeBonus: { STR: 2 }` (+/- к атрибуту)
   - **модификатор лимитов (дельта)**: `attributeLimits: { STR: { min: 6, max: 12 } }`
   Важное правило (от владельца): перк типа «Интенсивные тренировки» даёт +1 ОЧКО
   (распределяемый бонус), но игрок НЕ может выйти за лимит, ЕСЛИ нет отдельного
   модификатора лимита. «Прибавить значение» и «расширить потолок» — независимы.
   → текущая объектная форма `attributes.STR={baseBonus,min,max}` мигрирует в эти два поля.

✅ T-2: `ncrInfantryWeaponIds` обобщён в универсальное поле `weaponDamageBonus`
   (см. `docs/schema/06-modifiers.md` § 1.7). Движок суммирует бонусы из всех
   активных источников (parent trait + sub-traits NCR/Survivor + будущие перки/chem)
   через `getWeaponDamageBonusFromSources` из `domain/traits.js`.
✅ T-3: все skill-ключи в данных и коде — canonical UPPER_SNAKE_CASE. Защита от
   регрессии: `domain/contract.skills.test.js`.

## Что НЕ делаем сейчас
Только контракт черт. Реализация — после origins.


## Effects как метки для UI

Часть черт не несёт числовой механики — они дают **подпись в UI** (например, на
экране оружия и брони, в активных эффектах). Для них используется единая шина
`modifiers.effects: string[]`. Каждая строка — id флага, по которому UI ищет:
- локализованный текст в i18n (`labels.<effect_id>`),
- опционально — UI-правила (например `no_consumables_food_rest` → скрыть кнопку
  «применить препарат»).

Часть флагов **в будущем** станет настоящей механикой
(см. `07-trait-debt.md`): `radiation_absorption`, `stealth_boy_addiction`,
`self_destruct`, `built_in_laser` и др. Сейчас они — метки.

## Контракт `skillPickChoice` (новое поле)

Для черт вроде `ncr-good-soul` («отметьте 2 навыка из 5») — задекларировано
поле:

```jsonc
"modifiers": {
  "skillPickChoice": {
    "count": 2,
    "from": ["SPEECH", "MEDICINE", "REPAIR", "SCIENCE", "BARTER"]
  }
}
```

Семантика: игрок выбирает `count` навыков из списка `from` (canonical
SKILL keys); UI-пикер пока в долге (`07-trait-debt.md`). До его появления
поле читается как «приоритетные кандидаты в extra-tagged» — это вытесняет
хардкод `GOOD_SOUL_SKILL_KEYS` из `CharacterScreen.js` (вынос — отдельной
правкой UI).
