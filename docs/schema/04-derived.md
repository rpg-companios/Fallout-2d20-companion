# Схема: Derived (производные характеристики)

Считаются от атрибутов / уровня / экипировки / эффектов. В Zustand хранятся
как `Parameter = {base, modifiers, total}` ✅, считаются в
`calculateDerivedStats` (`src/store/resolvers.js`); базовые формулы — в
`domain/characterCreation.js`.

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
- **ghoul: радиация ЛЕЧИТ** (вместо урона) — ☐ см. D-1.

## Тип-специфика
- robot `carryWeight` = от корпуса. ✅
- ghoul: радиация лечит ☐ D-1 — см. ниже.
- mutant/cyborg: производные стандартные. ✅

## Решения

### ✅ D-2 (Parameter shape для derived)
Закрыто. Все derived в `calculateDerivedStats` уже имеют форму
`{ base, modifiers, total }` (`src/store/resolvers.js:130-191`).
Timed-эффекты добавляются как `modifier` с `source: 'timedEffects'`.

### ☐ D-1 (механика «радиация лечит гуля»)
Не реализовано. В `GhoulModal` есть метка `effects: ['radiation_healing', ...]`,
но кода под флаг `radiation_healing` нет. Нужно решение:
- сколько HP даёт каждое попадание радиации (1:1? фиксированно?);
- лечит до `maxHP` или может превышать («over-heal»);
- влияет ли на радиационный счётчик персонажа.

Отдельная задача — реализация в `domain/effects.js` (там уже есть
инфраструктура `applyConsumableToEffects` / timed-effect tracking).
