# Reference data (справочные данные из сторонних проектов)

Каталог чистых **данных** для сверки/багфикса. Без механик, без кода —
только записи об оружии, броне, препаратах, перках, модах, эффектах и т.п.

Каждая запись помечена полем `source` (источник) и `sourceUrl`. Формат —
JSON по категориям, машино-читаемый, чтобы можно было сравнивать
скриптом.

## Источники

| source | Проект | Язык данных | Что взято |
|---|---|---|---|
| `pipboy` | [Alexander12039409/fallout-2d20-pipboy](https://github.com/Alexander12039409/fallout-2d20-pipboy) | RU | оружие, моды оружия, броня, расходники, перки |
| `lonestar` | [iggyiggy127/lone-star-character-creator](https://github.com/iggyiggy127/lone-star-character-creator) | EN | оружие, броня, расходники, аммо, разное, перки |
| `pipboy3000` | [vittoema96/vittoema96.github.io](https://github.com/vittoema96/vittoema96.github.io) | EN | оружие, броня, aid, моды, перки, трейты, эффекты |
| `focharactersheet` | [focharactersheet.vercel.app](https://focharactersheet.vercel.app) | EN | оружие, броня, расходники, моды (оружие+броня), перки, журналы. Данные извлечены из сохранённого JS-бандла архива `fallout 2char.zip` (коммит `b03a6da` на `main`) |

## Файлы

### Pip-Boy (`pipboy`, RU)
- `weapons.json` — оружие
- `weapon_mods.json` — моды оружия
- `armor.json` — броня
- `consumables.json` — расходники/препараты/еда/напитки
- `perks.json` — перки (с требованиями в виде строки `requirements_ru`)

### Lone Star (`lonestar`, EN)
- `lonestar_weapons.json` — оружие (в т.ч. `mods` вложенные)
- `lonestar_armor.json` — броня (в т.ч. `mods` вложенные)
- `lonestar_consumables.json` — еда/расходники
- `lonestar_ammo.json` — боеприпасы
- `lonestar_misc.json` — книги/журналы/разное
- `lonestar_perks.json` — перки (требования в виде объекта `requirements_en`:
  `S`/`E`/`P`/`C`/`I`/`A`/`L` = STR/END/PER/CHA/INT/AGI/LCK)

### Pip-Boy 3000 (`pipboy3000`, EN)
- `pipboy3000_weapons.json` — оружие (все категории в одном файле, поле `category_file`)
- `pipboy3000_armor.json` — броня/одежда/робо-части (`category_file`)
- `pipboy3000_aid.json` — еда/напитки/медs/разное (`category_file`)
- `pipboy3000_mods.json` — моды (все виды: оружие и броня, `category_file`)
- `pipboy3000_perks.json` — перки
- `pipboy3000_traits.json` — трейты
- `pipboy3000_companionPerks.json` — перки компаньонов
- `pipboy3000_legendaryEffects.json` — легендарные эффекты

### focharactersheet (`focharactersheet`, EN)
- `focharactersheet_perks.json` — перки (требования в виде объекта `requirements_en`
  с полными названиями атрибутов: `Luck`, `Endurance`, `Perception`, ...)
- `focharactersheet_weapons.json` — оружие (`effects_en`, `qualities_en` массивами)
- `focharactersheet_armor.json` — броня (DR-объект, `locations`, `mods`)
- `focharactersheet_consumables.json` — еда/напитки/медs (`heal`, `effects`, `addictive`)
- `focharactersheet_weapon_mods.json` — моды оружия (`area`, `prefix`)
- `focharactersheet_armor_mods.json` — моды брони (`type`, `DR`)
- `focharactersheet_magazines.json` — журналы/книги/холотейпы (одноразовые бонусы)

> **Примечание.** `focharactersheet_perks.json` независимо подтверждает, что
> требование УДЧ/`Luck` для перков `Demolition Expert` (PER 6 + LCK 6),
> `Better Criticals` (LCK 9), `Fortune Finder` (LCK 5), `Bloody Mess` (LCK 6),
> `Toughness` (END 6 + LCK 6), `Refractor` (PER 6 + LCK 7), `Ricochet` (LCK 10),
> `Mysterious Stranger` (LCK 7), `Pharma Farma` (LCK 6), `Can Do!` (LCK 5),
> `Daring Nature` (LCK 7) — то есть совпадает с исправлениями патча 182.

## Формат записи

```json
{
  "source": "lonestar",
  "sourceUrl": "https://github.com/iggyiggy127/lone-star-character-creator",
  "name_en": "Demolition Expert",
  "requirements_en": { "P": 6, "L": 6 },
  "description_en": "..."
}
```

Поля с суффиксом `_ru`/`_en` указывают язык содержимого. Числовые значения
могут быть строками (как в исходном CSV), т.к. это данные «как есть» —
сверка нормализует их отдельно.

## Как использовать

1. Не подключать к рантайму. Это справочные данные для сверки.
2. Скрипт сверки (отдельно) читает `modules/fallout/data/...` и эти файлы,
   сопоставляет по имени/ID и выдаёт расхождения. Пока скрипта нет —
   данные собраны для последующего сравнения по указанию.
