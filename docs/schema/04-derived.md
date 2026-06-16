# Схема: Derived (производные характеристики)

Считаются ОТ атрибутов/уровня/экипировки/эффектов. В Zustand хранятся как Parameter
(`{base, modifiers, total}`), считаются в `calculateDerivedStats` (src/store/resolvers.js),
формулы — в `domain/characterCreation.js`.

## Производные (факт) и формулы
| величина | формула (база) | зависит от | особое |
|---|---|---|---|
| maxHealth | END + LCK + (level-1) | END, LCK, level | + timed-эффекты |
| initiative | PER + AGI | PER, AGI | |
| defense | AGI ≥ 9 ? 2 : 1 | AGI | |
| meleeBonus | STR-ступени (7→+1,9→+2,11→+3) + trait.meleeBonusDelta | STR, trait | |
| carryWeight (human) | base(trait.carryWeightFixed=150) + STR×mult(10) + mods брони | STR, trait, броня | STR влияет |
| carryWeight (robot) | corpus.carryWeight + mods брони | корпус, броня | STR НЕ влияет (✅ сделано) |
| damageResistance | physical/energy/radiation | броня + timed-эффекты | |

## Что на них влияет (источники модификаторов)
- атрибуты (см. 03) → пересчёт base.
- trait/origin: meleeBonusDelta, carryWeightFixed, carryWeightStrengthMultiplier, luckMaxDelta.
- экипировка: carryWeightModifier, DR от брони.
- timed-эффекты (химия): maxHP, DR (уже в коде через getTimed*).
- **ghoul: радиация ЛЕЧИТ** (вместо урона) → влияет на health-ресурс ❓ D-1 формула.

## Тип-специфика
- robot carryWeight = от корпуса (✅).
- ghoul health vs радиация ❓ D-1: радиация добавляет HP? до maxHP? есть ли «перелечивание»?
- mutant/cyborg: производные пока стандартные.

## Решения
❓ D-1: точная механика «радиация лечит гуля» (сколько HP, ограничения).
❓ D-2: должны ли ВСЕ производные стать Parameter с источниками-модификаторами
   (под будущую систему) или пока формулы как есть? (рекомендую: оставить формулы,
   мигрировать вместе с большой системой модификаторов).

## Что НЕ делаем сейчас
Контракт. Формулы менять не нужно (работают). Документ — ориентир.
