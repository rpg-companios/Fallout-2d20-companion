# Схема: Origins (происхождения)

Файл данных: `data/origins/origins.json` (17 ориджинов).
i18n имён: `i18n/*/data/system/origins.json` (через `tOrigin(id)`).
Картинки: `components/screens/CharacterScreen/logic/originsData.js` (ORIGIN_IMAGES).

## Текущее состояние (факт)
Поля сейчас: `id, displayNameKey, traitIds, equipmentKitIds, bodyPlan, armorPolicy,
isRobot, isMutant, canWearStandardArmor, canWearRobotArmor, canWearMutantArmor`.

Тип персонажа сейчас РАЗМАЗАН по булевым: `isRobot`, `isMutant` + `armorPolicy` + `canWear*`.
Нет единого `characterType`. Картинка добавляется отдельно в originsData.js (не в JSON).

## Целевая модель v1.5

### Главное поле — тип персонажа 🆕🔁
```jsonc
"characterType": "human" | "mutant" | "robot" | "cyborg" | "ghoul"
```
Заменяет `isRobot`/`isMutant` (их можно вычислять из characterType для обратной совместимости
на переходный период). Тип определяет НАБОР правил (см. ниже).

### Маппинг текущих ориджинов → characterType (по данным)
| origin id | сейчас | → characterType |
|---|---|---|
| brotherhood, ncr, minuteman, childOfAtom, vaultDweller, survivor, brotherhoodOutcast, shadow, savage | humanoid | **human** |
| superMutant | isMutant | **mutant** |
| ghoul | humanoid | **ghoul** |
| synth | humanoid | **cyborg** ❓ (подтвердить) |
| robobrain, securitron, assaultron, misterHandy, protectron | isRobot | **robot** |

✅ РЕШЕНО: shadow → **mutant**, synth → **cyborg**, savage → **human**.
❓ РЕШЕНИЕ-4 (открыто): `securitron` body_plan=protectron — норм или своя схема слотов? (позже)

### Итоговый маппинг characterType (с учётом решений)
- human: brotherhood, ncr, minuteman, childOfAtom, vaultDweller, survivor, brotherhoodOutcast, savage
- mutant: superMutant, shadow
- ghoul: ghoul
- cyborg: synth
- robot: robobrain, securitron, assaultron, misterHandy, protectron

### Поля ориджина (целевые)
```jsonc
{
  "id": "superMutant",                 // ✅ стабильный id
  "displayNameKey": "origins.superMutant.name", // ✅ i18n
  "characterType": "mutant",           // 🆕 тип → набор правил
  "image": "super_mutant.png",         // 🔁 перенести в JSON (сейчас в originsData.js) ❓
  "traitIds": [...],                   // ✅
  "equipmentKitIds": [...],            // ✅
  "bodyPlan": "humanoid",              // ✅ (для роботов = протектрон/штурмотрон/...)
  // правила брони — см. ниже, возможно выводятся из characterType
  "armorPolicy": "...",                // ✅ пока оставить, потом, возможно, из типа
}
```

## Правила ПО ТИПУ персонажа (то, что ты описал)

| Тип | Атрибуты | Броня | Иммунитеты | Особое |
|---|---|---|---|---|
| **human** | стандартные (4, лимиты 4–10) | standard | — | почти всё готово |
| **mutant** | STR/END +2, лимиты 6–12; CHA/INT max 6 | raider/mutant only | radiation, poison | superMutant, shadow |
| **robot** | ✅ как у людей (4, лимиты 4–10) | robot only (броня/обшивка/рама) | disease, radiation, poison | вес от корпуса; запрет химии; слоты-конечности |
| **ghoul** | стандартные | standard | radiation (иммун) + **радиация ЛЕЧИТ HP** | вместо урона от радиации — восстановление HP |
| **cyborg** (synth) | стандартные (пока) | standard (пока) | ❓ позже | «плюшки» — ❓ позже, не блокирует |

✅ РЕШЕНО:
- robot атрибуты = как у людей.
- ghoul: радиация ЛЕЧИТ (вместо урона → восстановление HP). Деталь формулы — уточнить при derived/effects.
- cyborg: пока стандартные правила; уникальные плюшки добавим позже (не блокирует старт).

### Политика брони — ГИБРИД (рекомендация архитектора, принять/изменить)
`characterType` задаёт ДЕФОЛТ политики брони; опциональное поле переопределяет для исключений.
Три булевых (`canWearStandardArmor/RobotArmor/MutantArmor`) → схлопываются в одну политику.
```jsonc
"armorPolicy": "standard" | "raiderOnly" | "robotOnly"   // по умолчанию из characterType
// дефолты по типу:
//   human  → standard
//   mutant → raiderOnly
//   robot  → robotOnly
//   ghoul  → standard
//   cyborg → standard
// На ориджине пишем armorPolicy ТОЛЬКО если отличается от дефолта типа.
```
❓ РЕШЕНИЕ-8: подтвердить гибрид (дефолт из типа + поле-исключение).

## Иммунитеты по типу (из T-1)
`characterType` задаёт БАЗОВЫЕ иммунитеты автоматически (origin может добавить свои):
- robot → disease, radiation, poison
- mutant → radiation, poison
- ghoul → radiation (+ радиация ЛЕЧИТ, см. derived/effects)
- human, cyborg → нет базовых (cyborg — плюшки позже)
Это убирает нужду в `trait.isRobot` (был только ради робо-иммунитетов) и ручных списках.
Поле `origin.immunities: [...]` — опциональное дополнение к базовым по типу.

## Где это читается в коде (для будущей миграции)
- `domain/bodyplan.js` — resolveBodyPlan (origin.robotBodyPlan / origin.bodyPlan / id-map)
- `domain/robotEquip.js` — isRobotCharacter = origin.isRobot
- `domain/immunities.js` — ROBOT_IMMUNITIES + trait.immunities
- `domain/characterCreation.js` — стартовые атрибуты/лимиты
- `components/.../originsData.js` — image + equipmentKits enrich
- `components/CharacterContext.js` — resolveOrigin

## Что НЕ делаем на этом шаге
Только фиксируем контракт origins + получаем РЕШЕНИЯ 1–8. Код не трогаем,
пока схема не утверждена.
