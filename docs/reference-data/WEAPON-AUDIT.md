# Weapon catalog audit (оружие + моды + патроны)

Оценка полноты справочника оружия в `modules/fallout/data/equipment/`
относительно внешних источников из `docs/reference-data/`.
Проверка не меняет данные — только сводит и сравнивает.

## 1. Оружие

**Наши данные**
- `equipment/weapons.json` — **121** оружие
- `equipment/robot/weapons.json` — **19** робо-орудий
- Итого: **140** (все имена из `i18n/en-EN/`)

**Распределение по типу** (`weaponType`)
| Тип | Кол-во |
|---|---|
| Light | 42 |
| Energy | 26 |
| Melee | 19 |
| Heavy | 12 |
| Explosive | 11 |
| Unarmed | 6 |
| Thrown | 4 |
| None | 1 |

**Источники сравнения:**
| Источник | Оружий |
|---|---|
| pipboy (RU) | 63 |
| lonestar (EN) | 127 |
| focharactersheet (EN) | 134 |
| pipboy3000 (EN) | 136 |

**Вывод по оружию:** набор **почти полный** относительно базовой книги —
это один из самых больших списков среди всех источников (140 против
121–136 у EN-справочников, причём у нас есть и робо-орудия). Категории
(Стрелковое/Энергетическое/Тяжёлое/Холодное/Рукопашное/Взрывчатка/Метательное)
закрыты.

**Реальные пропуски — 23 оружия** (присутствуют и в focharactersheet, и в
lonestar, отсутствуют у нас). Это в основном контент из дополнений/сеттингов,
а не базовая книга:

Ближний бой (13): `Assaultron Blade`, `Assaultron Head`, `Auto-Axe`,
`Ballistic Fist`, `Cattle Prod`, `Chainsaw`, `Death Tambo`, `Displacer Glove`,
`Guitar Sword`, `Mr Handy Buzz Blade`, `Multi-Purpose Axe`, `Proton Axe`,
`War Drum`.

Взрывчатка (10): `Cryo Mine`, `Cryogenic Grenade`, `Detonator`, `Dynamite`,
`Dynamite Bundle`, `Flash Bang`, `Frag Grenade MIRV`, `Plastic Explosives`,
`Powder Charge`, `Smoke Grenade`.

**Замечание по робо-орудиям:** у pipboy3000 есть доп. варианты Mr Handy,
которых у нас нет (`MrHandyBuzzBlade`, `MrHandyCircularSaw`, `MrHandyFlamethrower`,
`MrHandyLaserEmitter`, `MrHandyPliers`, `MrHandyAutomaticPistol`) — ~6 шт.

## 2. Моды оружия

**Наши данные:** `equipment/weapon_mods.json` — **204** мода.

Распределение по слотам:
| Слот | Кол-во |
|---|---|
| Unique (мясное, своё на оружие) | 48 |
| Barrel | 32 |
| Receiver | 25 |
| Sight | 25 |
| Capacitor | 18 |
| Muzzle | 17 |
| Stock | 12 |
| Magazine | 8 |
| Grip | 4 |
| Nozzle / Tank / Container / Winch / Dish / Fuel / Concentrate / Canister / Launcher / Frame | по 1–3 |

**Источники сравнения:**
| Источник | Модов |
|---|---|
| focharactersheet (weapon mods) | 233 |
| pipboy3000 (mods, incl. robot) | 304 |

**Покрытие модами (важный момент):**
- Моды привязаны к **59 из 121** основного оружия; **62 оружия — без модов**.
- Мясное оружие закрыто «слотом Unique»: `sword` 4, `baseball bat` 5,
  `knuckles` 4, `pipe wrench` 4, `boxing glove` 3 и т.д.
- **Дырка** — часть дальнобойного/энергетического оружия без модов:
  `battle rifle`, серия `black powder`, `9mm pistol`, `12.7mm smg`,
  `anti-materiel rifle`, `alien*`, `tesla*`, `arc welder`, `auto grenade launcher`
  и др.
- **17 модов** ссылаются на оружие, которого нет в нашем каталоге
  (`applies_to_ids` указывает на несуществующие `weapon_*`) — это «осиротевшие» записи.

**Вывод по модам:** 204 мода — хорошая база, но **неполная** относительно
источников (233 / 304). Главное — часть дальнобойного оружия не имеет модов,
и есть «осиротевшие» моды.

## 3. Патроны

**Наши данные:** `equipment/ammo.json` — **42** типа патронов.

- Оружий с `ammoId`: **80** (стрелковое/энергетическое/тяжёлое и т.п.).
- Оружий без патронов: **41** (мясное/рукопашное/взрывчатка/бросок) — это верно.
- **Все** ссылки на патроны покрыты: `Gatling Laser` использует строку
  `ammo_energy_cell,ammo_fusion_core` (оба типа существуют). Других битых ссылок нет.
- 3 «лишних» патрона, ни к чему не привязаны: `ammo_gas_grenade`,
  `ammo_plasma_cartridge_alien`, `ammo_syringe_bloodpack`.

**Источники сравнения:**
- pipboy3000: 35 `AMMO_TYPE`, focharactersheet: 37 `ammunition`.

**Вывод по патронам:** покрытие **хорошее и полное** — все стандартные калибры
(.308, .357, .44, 10mm, 5.56, 5mm, 9mm, 12.7, 25/40мм, 2мм EC, дробь,
мини-ньюк, ракета, стрелы/болты, cryo, energy/fusion, plasma, gamma, flamer fuel
и т.д.). Небольшие расхождения — в **названиях**, не в сути:
- `ammo_bolt` у нас = `Crossbow Bolt` в источниках (у нас есть и `ammo_arrow`).
- `ammo_energy_cell` = `Fusion Cell` в источниках.
- `Junk Jet` в источниках использует патрон `Junk` — у нас эта логика через
  `ammo_anything`.

## Итог

| Раздел | Полнота | Что можно доработать |
|---|---|---|
| Оружие | **Почти полное** | +23 оружия из дополнений; +~6 робо-орудий Mr Handy |
| Моды | **Средняя** (204 vs 233/304) | моды на дальнобойное оружие; чистка 17 «осиротевших» модов |
| Патроны | **Полное** | 3 неиспользуемых патрона; унификация имён (bolt/energy cell/junk) |

> Решение о добавлении/доработке — по указанию. Это только сводка для сравнения.
