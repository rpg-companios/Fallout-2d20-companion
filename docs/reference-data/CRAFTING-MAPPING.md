# Крафт: как датасет рецептов стал данными каталога

> Порождается `scripts/build-crafting-data.mjs` — руками не править.
> Перегенерация: `node scripts/build-crafting-data.mjs`.
> `__tests__/crafting/crafting-data.test.js` падает, если данные в репо
> разошлись с тем, что умеет генератор.

## Поток данных

```text
docs/reference-data/pipboyapp_crafting.json   — чужие имена и строки (справочные данные)
        │  генератор: имя → id нашего каталога (perк, предмет, ингредиент)
        ▼
modules/fallout/data/recipes/*.json — только id: результат, материалы, перки, ключ навыка
        ▼
реестр данных сеттинга → движок крафта (следующий патч)

docs/reference-data/Missing_craft.json — обменник: то, где каталог молчит, с «unknown» вместо чисел
```

## Покрытие

- рецептов в источнике: **356**
- выпущено в данные: **289** (ammo: 28, weapons: 152, explosives: 9, armor: 44, chems: 21, food: 27, drinks: 8)
- не выпущено: **263**
- из них упирается в дыры каталога и выгружено в обменник: **1** (chem: 0, food: 0, loot: 1, ammo: 0)

## Материалоёмкость: наборы материалов по сложности (книга, с. 210)

Для рецептов без собственной колонки материалов (и для будущего крафта
модов брони/оружия/силовой брони) действует печатная кривая
«материалоёмкость → требуемые материалы». Запись — константа
`MATERIALS_BY_COMPLEXITY` в этом генераторе; предохранитель —
`__tests__/crafting/crafting-data.test.js` («кривая "сложность → материалы"»).

| Материалоёмкость | Требуемые материалы |
|---|---|
| 1 | Обычные материалы ×2 |
| 2 | Обычные материалы ×3 |
| 3 | Обычные материалы ×4, Необычные материалы ×2 |
| 4 | Обычные материалы ×5, Необычные материалы ×3 |
| 5 | Обычные материалы ×6, Необычные материалы ×4, Редкие материалы ×2 |
| 6 | Обычные материалы ×7, Необычные материалы ×5, Редкие материалы ×3 |
| 7+ | Обычные материалы ×8, Необычные материалы ×6, Редкие материалы ×4 |

Сверено с таблицей владельца (2026-09-23): расхождений нет; «7+» = строка 7
(сложность выше 7 в данных не встречается, кап `Math.min(7, …)`).

## Какие таблицы книги вошли

| Таблица источника | Что за неё берутся материалы |
|---|---|
| AMMUNITION | боеприпасы (количество — по объёму находки) |
| SYRINGER AMMUNITION | дротики для шприцера |
| EXPLOSIVES | гранаты, мины, «Молотов» |
| CHEMS | препараты |
| FOOD | еда |
| BEVERAGE | напитки |
| REPAIR KITS | ремкомплекты |
| UTILITY DEVICES | полезные устройства |
| WORKBENCH | сам верстак (кухня) |

Таблицы модификаций ОРУЖИЯ выпущены веткой крафт-модов (348): рецепты
строятся из колонок каталога weapon_mods.json — аудита тех же таблиц.
Остались отложенными: броня/силовая броня/роботы (броня выпущена по
диктованным владельцем таблицам — 44 рецепта).

## Не выпущено — по причинам

| Причина | Сколько |
|---|---|
| не предметный рецепт (броня, силовая броня, роботы) — ветка отложена | 136 |
| модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) | 124 |
| рецепт помечен в источнике как самодеятельность приложения (в книге нет) | 2 |
| в каталоге сеттинга нет такого предмета-результата | 1 |

## Ручные соответствия (то же самое, названо иначе)

| В источнике | Наш id | Где применено | Почему считаем тем же предметом |
|---|---|---|---|
| Berserk Syringe | `ammo_syringe_berserk` | ингредиент | ингредиент «Fury» — он же дротик шприцера «Berserk» (соответствие владельца) |
| Common Materials | `item_common_materials` | ингредиент | переименование владельца 2026-09-17: «Common Materials» = наш «Common material» |
| Mongrel Dog Meat | `food_dog_meat` | ингредиент | то же сырьё: наше ru-имя — «Собачатина» |
| Queen Mirelurk Meat | `food_mirelurk_queen_meat` | ингредиент | тот же продукт: у нас имя по животному, потом по части |
| Rare Materials | `item_rare_materials` | ингредиент | переименование владельца 2026-09-17: «Rare Materials» = наш «Rare material» |
| Uncommon Materials | `item_uncommon_materials` | ингредиент | переименование владельца 2026-09-17: «Uncommon Materials» = наш «Uncommon material» |
| Baked Bloatfly | `food_grilled_bloatfly` | результат | то же блюдо: наше ru-имя — «Печёный дутень» |
| Cooked Softshell Meat | `food_cooked_softshell_mirelurk` | результат | то же блюдо: у нас названо по животному |
| Fusion Cell | `ammo_energy_cell` | результат | книжная графа «Fusion Cell» = наша «Energy Cell» (см. AMMO-FOUND-TABLE.md) |
| Iguana Soup | `food_iguana_stew` | результат | то же блюдо: ru-имя у обеих записей «Кусочки игуаны» |
| Mole Rat Chunks | `food_mole_rat_chops` | результат | то же блюдо: ru «Отбивные из кротокрыса» |
| Mutant Hound Chops | `food_mutant_hound_ribs` | результат | то же блюдо: эффект совпадает («Heals 2 Radiation damage»), у нас имя — «Mutant Hound Ribs» |
| Mutt Chops | `food_dog_chops` | результат | то же блюдо: ru «Отбивные из собачатины» |
| Noodle Cup | `food_noodle_bowl` | результат | то же блюдо: ru «Миска лапши» |
| Stingwing Filet | `food_stingwing_fillet` | результат | разница написания: filet / fillet |
| Tato Juice | `drink_potato_juice` | результат | тот же напиток: книга зовёт «Tato Juice», у нас — «Potato Juice» |

## Исправления владельца к печатным числам

Где источник расходится с книгой (или ссылается на предметы, которых в
игре нет), числа диктует владелец — они в `BOOK_CORRECTIONS` генератора.

| Строка источника | Материалы по исправлению | Примечание |
|---|---|---|
| Mentats | Uncommon Materials ×3, Rare Materials ×2, Brain Fungus ×2 | владелец 2026-09-15: материалы «Mentats» — Необычные ×3, Редкие ×2 и Мозговой гриб ×2 (вместо книжного «Abraxo Cleaner») |

## Незакрытые позиции: файл-обменник

Всё, что не выпустилось из-за дыр каталога (нет предмета-результата или
недостающий ингредиент), лежит в `docs/reference-data/Missing_craft.json`:
структура полей — как у рецептов, где данных нет — строка «unknown».
Генератор не решает за владельца, каких книг касаться: он только выгружает
позиции со всеми известными числами. Сейчас в обменнике:

- **chem** (0) — пусто
- **food** (0) — пусто
- **loot** (1) — «Cooking Station»
- **ammo** (0) — пусто

Файл перегенерируется: починить руками его можно как черновик, но в данные
позиции попадают только после того, как соответствия и числа переедут в
генератор (аллиас или явные ингредиенты) и рецепт пройдёт строгую сверку.

**Модификации оружия** (348): 152 рецептов из колонок каталога;
модов без колонок крафта (рецептов в книге нет): 53.
**Броня/силовая броня/роботы** в обменник не попадают: не дыра каталога, а
отложенная ветка (решение владельца); моды брони выпущены по диктованным
таблицам (44 рецепта, патчи 341+).

## Список непрошедших рецептов

| Рецепт | Группа источника | Верстак | Причина |
|---|---|---|---|
| Hardened | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Powerful | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Advanced | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Calibrated | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Automatic | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Hair Trigger | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| .38 Receiver | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| .308 Receiver | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| .45 Receiver | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| .50 Receiver | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Automatic Piston | SMALL GUNS RECEIVER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Snubnose | SMALL GUNS BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Bull Barrel | SMALL GUNS BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Long | SMALL GUNS BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Ported | SMALL GUNS BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Vented | SMALL GUNS BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Sawed-Off | SMALL GUNS BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Finned | SMALL GUNS BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Comfort Grip | SMALL GUNS GRIP MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Sharpshooter’s Grip | SMALL GUNS GRIP MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Full Stock | SMALL GUNS STOCK MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Marksman’s Stock | SMALL GUNS STOCK MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Recoil Compensating Stock | SMALL GUNS STOCK MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Reflex Sight | SMALL GUNS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Short Scope | SMALL GUNS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Long Scope | SMALL GUNS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Short Night Vision Scope | SMALL GUNS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Long Night Vision Scope | SMALL GUNS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Recon Scope | SMALL GUNS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Bayonet | SMALL GUNS MUZZLE | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Compensator | SMALL GUNS MUZZLE | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Muzzle Break | SMALL GUNS MUZZLE | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Suppressor | SMALL GUNS MUZZLE | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Beta Wave Tuner | ENERGY WEAPON CAPACITOR MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Boosted Capacitor | ENERGY WEAPON CAPACITOR MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Photon Exciter | ENERGY WEAPON CAPACITOR MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Photon Agitator | ENERGY WEAPON CAPACITOR MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Three-crank capacitor | ENERGY WEAPON CAPACITOR MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Four-crank capacitor | ENERGY WEAPON CAPACITOR MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Five-crank capacitor | ENERGY WEAPON CAPACITOR MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Six-crank capacitor | ENERGY WEAPON CAPACITOR MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Bracketed Short Barrel | ENERGY WEAPON BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Long Barrel | ENERGY WEAPON BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Splitter | ENERGY WEAPON BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Automatic Barrel | ENERGY WEAPON BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Bracketed Long Barrel | ENERGY WEAPON BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Improved Barrel | ENERGY WEAPON BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Sniper Barrel | ENERGY WEAPON BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Flamer Barrel | ENERGY WEAPON BARREL MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Sharpshooter’s Grip | ENERGY WEAPON GRIP MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Standard Stock | ENERGY WEAPON STOCK MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Full Stock | ENERGY WEAPON STOCK MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Marksman’s Stock | ENERGY WEAPON STOCK MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Recoil Compensating Stock | ENERGY WEAPON STOCK MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Reflex Sight | ENERGY WEAPONS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Short Scope | ENERGY WEAPONS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Long Scope | ENERGY WEAPONS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Short Night Vision Scope | ENERGY WEAPONS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Long Night Vision Scope | ENERGY WEAPONS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Recon Scope | ENERGY WEAPONS SIGHTS | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Beam Splitter | ENERGY WEAPON MUZZLE | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Beam Focuser | ENERGY WEAPON MUZZLE | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Gyro Compensating Lens | ENERGY WEAPON MUZZLE | weapons | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Napalm Fuel | FLAMER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Long Barrel | FLAMER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Large Tank | FLAMER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Huge Tank | FLAMER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Compression Nozzle | FLAMER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Vaporization Nozzle | FLAMER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Deep Dish | GAMMA GUN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Electric Signal Carrier antennae | GAMMA GUN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Signal Repeater | GAMMA GUN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Photon Exciter | GATLING LASER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Beta Wave Tuner | GATLING LASER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Boosted Capacitor | GATLING LASER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Photon Agitator | GATLING LASER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Charging Barrels | GATLING LASER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Reflex Sight | GATLING LASER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Beam Focuser | GATLING LASER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Long Barrel | JUNK JET MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Recoil Compensating Stock | JUNK JET MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Gunner Sight | JUNK JET MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Electrification Module | JUNK JET MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Ignition Module | JUNK JET MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Accelerated Barrel | MINIGUN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Tri-Barrel | MINIGUN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Gunner Sight | MINIGUN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Shredder | MINIGUN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Triple Barrel | MISSILE LAUNCHER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Quad Barrel | MISSILE LAUNCHER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Scope | MISSILE LAUNCHER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Night Vision Scope | MISSILE LAUNCHER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Targeting Computer | MISSILE LAUNCHER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Bayonet | MISSILE LAUNCHER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Stabilizer | MISSILE LAUNCHER MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Serrated Blade | SWORD MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Electrified Blade | SWORD MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Electrified Serrated Blade | SWORD MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Stun Pack | SWORD MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Serrated Blade | COMBAT KNIFE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Stealth Blade | COMBAT KNIFE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Serrated Blade | MACHETE MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Curved Blade | RIPPER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Extended Blade | RIPPER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Extra Flame Jets | SHISHKEBAB MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Serrated Blade | SWITCHBLADE MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Barbed | BASEBALL BAT MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Spiked | BASEBALL BAT MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Sharp | BASEBALL BAT MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Chain-Wrapped | BASEBALL BAT MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Bladed | BASEBALL BAT MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Spiked | BOARD MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Puncturing | BOARD MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Bladed | BOARD MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Spiked | LEAD PIPE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Heavy | LEAD PIPE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Hooked | PIPE WRENCH MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Heavy | PIPE WRENCH MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Puncturing | PIPE WRENCH MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Extra Heavy | PIPE WRENCH MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Barbed | POOL CUE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Sharp | POOL CUE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Spiked | ROLLING PIN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Sharp | ROLLING PIN MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Electrified | BATON MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Stun Pack | BATON MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Puncturing | SLEDGEHAMMER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Heavy | SLEDGEHAMMER MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Heating Coil | SUPER SLEDGE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Stun Pack | SUPER SLEDGE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Bladed | TIRE IRON MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Barbed | WALKING CANE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Spiked | WALKING CANE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Spiked | BOXING GLOVE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Puncturing | BOXING GLOVE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Lead lining | BOXING GLOVE MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Extra Claw | DEATHCLAW GAUNTLET MOD | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Sharp | KNUCKLES MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Spiked | KNUCKLES MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Puncturing | KNUCKLES MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Bladed | KNUCKLES MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Puncturing | POWER FIST MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Heating Coil | POWER FIST MODS | weapons | модификации оружия: рецепт выпущен веткой модов оружия (колонки каталога weapon_mods, 348) |
| Ballistic Weave | BALLISTIC WEAVE | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Ballistic Weave Mk II | BALLISTIC WEAVE | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Ballistic Weave Mk III | BALLISTIC WEAVE | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Ballistic Weave Mk IV | BALLISTIC WEAVE | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Ballistic Weave Mk V | BALLISTIC WEAVE | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Insulated Lining | VAULT SUIT LINING | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Treated Lining | VAULT SUIT LINING | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Resistant Lining | VAULT SUIT LINING | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Protective Lining | VAULT SUIT LINING | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Shielded Lining | VAULT SUIT LINING | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Welded | RAIDER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Tempered | RAIDER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Hardened | RAIDER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Buttressed | RAIDER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Boiled Leather | LEATHER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Girded Leather | LEATHER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Treated Leather | LEATHER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Shadowed Leather | LEATHER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Boiled Leather (Advanced) | LEATHER ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Painted Metal | METAL ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Enameled Metal | METAL ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Shadowed Metal | METAL ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Alloyed Metal | METAL ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Polished Metal | METAL ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Reinforced | COMBAT ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Shadowed | COMBAT ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Fiberglass | COMBAT ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Polymer | COMBAT ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Laminated | SYNTH ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Resin | SYNTH ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Microcarbon | SYNTH ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Nanofilament | SYNTH ARMOR MATERIAL | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Lighter Build | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Pocketed | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Deep Pocketed | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Lead Lined | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Ultra-Light Build | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Padded (Torso Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Asbestos Lining (Torso Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Dense (Torso Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| BioCommMesh (Torso Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Pneumatic (Torso Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Brawling (Arms Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Braced (Arms Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Stabilized (Arms Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Aerodynamic (Arms Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Weighted (Arms Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Cushioned (Legs Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Muffled (Legs Only) | ARMOR MODS | armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Raider II | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-45b | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-45c | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-45d | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-45e | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-45f | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-51b | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-51c | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-51d | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-51e | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-51f | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-60b | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-60c | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-60d | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-60e | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| T-60f | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| X-01 Mk II | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| X-01 Mk III | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| X-01 Mk IV | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| X-01 Mk V | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| X-01 Mk VI | POWER ARMOR UPGRADES | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Rad Scrubber | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Sensor Array | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Targeting HUD | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Internal Database | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Welded Rebar (Raider only) | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Core Assembly | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Blood Cleanser | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Emergency Protocols | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Motion-Assist Servos | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Kinetic Dynamo | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Medic Pump | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Reactive Plates | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Tesla Coils | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Stealth Boy | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Jetpack | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Rusty Knuckles | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Hydraulic Bracers | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Optimized Bracers | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Tesla Bracers | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Calibrated Shocks | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Explosive Vent | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Overdrive Servos | POWER ARMOR SYSTEMS | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Titanium Plating | POWER ARMOR PLATING | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Lead Plating | POWER ARMOR PLATING | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Photovoltaic Plating | POWER ARMOR PLATING | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Winterized Coating (not on X-01) | POWER ARMOR PLATING | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Prism Shielding | POWER ARMOR PLATING | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Explosive Shielding | POWER ARMOR PLATING | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| EMP Shielding (X-01 only) | POWER ARMOR PLATING | power_armor | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Factory Armor | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Factory Storage Armor | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Primal Plate | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Serrated Plate | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Noxious Plate | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Toxic Plate | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Actuated Frame | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Voltaic Frame | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Hydraulic Frame | ROBOT ARMOR | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Hacking Module | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Lockpick Module | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Radiation Coils | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Recon Sensors | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Regeneration Field | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Resistance Field | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Sensor Array | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Stealth Field | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Tesla Coils | ROBOT MODS | robot | не предметный рецепт (броня, силовая броня, роботы) — ветка отложена |
| Cooking Station | WORKBENCH | cooking | в каталоге сеттинга нет такого предмета-результата |
| Robot Repair Kit | REPAIR KITS | chemistry | рецепт помечен в источнике как самодеятельность приложения (в книге нет) |
| Stealth Boy | UTILITY DEVICES | chemistry | рецепт помечен в источнике как самодеятельность приложения (в книге нет) |
