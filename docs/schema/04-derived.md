# Схема: Derived (производные характеристики)

Считаются от атрибутов / уровня / экипировки / эффектов. В Zustand хранятся
как `Parameter = {base, modifiers, total}` ✅, считаются в
`calculateDerivedStats` в setting capability `modules/fallout/logic/derivedStats.js`;
формулы создания и SPECIAL-значения — в `modules/fallout/logic/characterCreation.js`.

## Производные и формулы

| величина | формула (база) | зависит от | особое | статус |
|---|---|---|---|---|
| `maxHealth` | `END + LCK + (level-1)` | END, LCK, level | + timed-эффекты (`getTimedMaxHpBonus`) | ✅ |
| `initiative` | `PER + AGI` | PER, AGI | | ✅ |
| `defense` | `AGI ≥ 9 ? 2 : 1` | AGI | | ✅ |
| `meleeBonus` | STR-ступени (7→+1, 9→+2, 11→+3) + `trait.meleeBonusDelta` | STR, trait | | ✅ |
| `carryWeight` (human) | `(trait.carryWeightFixed ?? 150) + STR × (trait.carryWeightStrengthMultiplier ?? 10) + mods брони` | STR, trait, броня | STR влияет | ✅ |
| `carryWeight` (robot) | `corpus.carryWeight + mods брони` | корпус, броня | STR **не** влияет | ✅ |
| `damageResistance` | physical / energy / radiation | броня + timed-эффекты (`getTimedDamageResistanceBonus`) | | ✅ |

## Источники модификаторов
- **атрибуты** (см. 03) → пересчёт `base`. ✅
- **trait / origin**: `meleeBonusDelta`, `carryWeightFixed`,
  `carryWeightStrengthMultiplier`, `luckMaxDelta`. ✅
- **экипировка**: `carryWeightModifier`, DR от брони. ✅
- **timed-эффекты** (химия): `maxHP`, DR. ✅
- **ghoul: радиация повышает счётчик как обычно; перк добавляет лечение** — ✅ D-1.

## Тип-специфика
- robot `carryWeight` = от корпуса. ✅
- ghoul: perk-enabled healing on positive radiation gains ✅ D-1.
- mutant/cyborg: производные стандартные. ✅

## Решения

### ✅ D-2 (Parameter shape для derived)
Закрыто. Все derived в `calculateDerivedStats` уже имеют форму
`{ base, modifiers, total }` (`src/store/resolvers.js:130-191`).
Timed-эффекты добавляются как `modifier` с `source: 'timedEffects'`.

### ✅ D-1 (перковое лечение от радиации)
Реализовано в Fallout capability: положительный прирост радиации лечит 1 ОЗ за
каждые 4 / 3 / 2 полученные единицы по рангу перка; сам счётчик радиации при
этом увеличивается как обычно, а лечение ограничено `maxHP`. Расходники включают
лечение в свой расчёт до финального ограничения ОЗ; ручные изменения счётчика
обрабатывает `consumables.getRadiationGainHealing`.

Fallout-specific расчёт расходников принадлежит `modules/fallout/consumables/vitalChanges.js`;
общие timed-effect lifecycle операции остаются в `domain/effects.js`, а payload-интерпретация —
в `modules/fallout/consumables/effectApplication.js`.
