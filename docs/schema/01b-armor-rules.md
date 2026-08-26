# Схема: Правила ношения брони (allow/deny rules)

Модель от владельца (заменяет старые `armorPolicy` / `canWear*` булевы).
Броня — ГИБКАЯ система правил, а не один флаг политики.

## Факты из данных
- Категории брони (`data/equipment/armor.json`, top-level keys):
  `raiderArmor, leatherArmor, metalArmor, combatArmor, synthArmor, vaultSecurityArmor`.
  Каждая имеет tiers: `standard, sturdy, heavy`.
- Power armor: отдельный файл `data/equipment/powerArmor.json`.
- Робо-броня: `data/equipment/robot/armor.json`, обшивка/рама: `armor_plating.json`, `frames.json`.
- Текущий движок: `domain/equipEquip.js` (policy: humanoid_full / supermutant_raider_only / robot_only;
  читает теги `armorItem.robotOnly` / `mutantOnly`).

## Целевая модель: правила брони (УТВЕРЖДЕНО владельцем)

Правила живут **в origin** (`origin.armorRules`). Логика:
- **Нет `armorRules`** → дефолт: разрешена ВСЯ броня, КРОМЕ робо-брони.
- **Есть `armorRules`** → разрешено строго то, что в правилах (whitelist, тонкая настройка).

`allow` = whitelist: «этому персонажу можно носить вот это» — всё, или конкретные
категории, или конкретные id. Это НЕ «открыть поверх запрета», а прямое перечисление
разрешённого. Сложные deny/приоритеты НЕ нужны.

```jsonc
// origin.armorRules (опционально)
"armorRules": {
  "source": "human" | "robot",     // источник брони (людская / робо)
  "value": "all"                    // что разрешено:
        // "all"                      — вся броня этого источника
        // ["leatherArmor"]           — только эти КАТЕГОРИИ
        // ["armor_leather_chest_001"]— только эти id
}
```
❓ может ли быть НЕСКОЛЬКО правил (массив)? напр. робо-броня + декоративные шляпы.
   Предлагаю: `armorRules` — массив объектов выше. Подтвердить.

### Примеры
```jsonc
// human (НЕТ armorRules) → дефолт: вся броня кроме робо
// superMutant
"armorRules": [{ "source": "human", "value": ["raiderArmor"] }]
// robot
"armorRules": [{ "source": "robot", "value": "all" }]
// персонаж-снайпер «только лёгкая броня»
"armorRules": [{ "source": "human", "value": ["leatherArmor"] }]
```

### Что схлопывается
- `canWearStandardArmor/RobotArmor/MutantArmor` (3 булевых) → armorRules (или дефолт).
- `armorPolicy` (enum) → armorRules (или дефолт).
- `trait.modifiers.armorConstraint: 'mutantOnly'` → правило, переносимое в origin/трейт.

## Решено
✅ A: правила живут в origin; нет правил → вся броня кроме робо.
✅ B: allow = whitelist (тонкая настройка), сложные deny/приоритеты не нужны.

## Открытые (можно позже, не блокируют traits)
❓ armorRules — массив правил (несколько источников) или одно? (предложен массив)
❓ C: робо-«источник» включает обшивку/раму или это отдельные слои?
❓ D: декоративные шляпы роботам — отдельное правило или частный случай в коде?
❓ E: power armor — категория human-брони или отдельный источник?

## Что НЕ делаем сейчас
Только контракт. Код `equipEquip.js` переведём на правила позже, отдельным шагом,
когда схема брони утверждена (вопросы A–E закрыты).
