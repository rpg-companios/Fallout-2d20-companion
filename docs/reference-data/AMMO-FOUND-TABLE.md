# Таблица получения патронов (Ammunition Found)

**Назначение:** сколько боеприпаса даёт одна находка/выдача. Значение вида
`10+5CD` = базовое число плюс бросок 5 кубов combat dice.

**Источник базы:** `lonestar_ammo.json` (поле `quantity`), 31 тип.
**Дополнено:** 11 типов, которых нет в референсе, — выведены по аналогии
(помечены **★**, обоснование в конце файла).
**Машиночитаемая версия:** `ammo-found-table.json`.

---

## Выявленная закономерность

Главное правило, вытекающее из данных:

> **base = 2 × CD**

Соблюдается в **27 из 31** записи референса. То есть таблица задаёт по сути
одно число — количество кубов, — а база всегда вдвое больше. Ожидаемый бросок
одного CD в Fallout 2d20 равен 1, значит средняя находка ≈ `base + cd`, то
есть примерно **3 × CD**.

### Исключения из правила

| Тип | Значение | Отклонение | Причина |
|---|---|---|---|
| Mini-Nuke | 1+1CD | base = cd | предмет штучный, разброс важнее базы |
| Alien Power Module | 3+1CD | base = 3×cd | уникальный инопланетный ресурс |
| Arrow | 6+4CD | base = 1.5×cd | самодельный боеприпас: разброс шире |
| Crossbow Bolt | 4+4CD | base = cd | то же, что и стрелы |
| Fusion Core / Plasma Core | 1 | без броска | всегда ровно одна штука |

Стрелы и болты выбиваются осознанно: их делают на коленке, поэтому результат
менее предсказуем. Ядра — неделимый предмет, бросок к ним неприменим.

### Связь с редкостью и ценой

Прямой формулы нет. Rarity и cost описывают доступность и стоимость, а не
объём находки. Сравните: `5mm` (rarity 3, cost 1) даёт **12+6CD**, а
`.44 Magnum` (rarity 3, cost 3) — всего **4+2CD**. Определяющий фактор —
темп расхода: чем скорострельнее оружие под патрон, тем крупнее находка.

Поэтому дополнения ниже выводились **по типу оружия-потребителя**, а не по
редкости.

---

## Таблица

★ — значение выведено по аналогии, в референсе отсутствует.

| id | Название | Находка | Rarity | Cost |
|---|---|---|---|---|
| `ammo_10mm` | 10mm | **8+4CD** | 0 | 2 |
| `ammo_38` | .38 | **10+5CD** | 0 | 1 |
| `ammo_9mm` | 9mm | **10+5CD** | 0 | 1 |
| `ammo_308` | .308 | **6+3CD** | 1 | 3 |
| `ammo_357_magnum` | .357 Magnum | **6+3CD** | 1 | 2 |
| `ammo_arrow` | Arrow | **6+4CD** | 1 | 2 |
| `ammo_flare` | Flare | **2+1CD** | 1 | 1 |
| `ammo_shotgun_shell` | Shotgun Shell | **6+3CD** | 1 | 3 |
| `ammo_12_7mm` | 12.7mm | **6+3CD** | 2 | 2 |
| `ammo_45` | .45 | **8+4CD** | 2 | 3 |
| `ammo_bolt` | Crossbow Bolt | **4+4CD** | 2 | 3 |
| `ammo_energy_cell` | Fusion Cell | **14+7CD** | 2 | 3 |
| `ammo_flamer_fuel` | Flamer Fuel | **12+6CD** | 2 | 1 |
| `ammo_gamma_round` | Gamma Round | **4+2CD** | 2 | 10 |
| `ammo_railway_spike` | Railway Spike | **6+3CD** | 2 | 1 |
| `ammo_syringe` | Syringer Ammo | **4+2CD** | 2 | Разная стоимость |
| `ammo_syringe_bloodpack` | Blood Pack Syringe | **4+2CD** | 2 | 15 | ★
| `ammo_44_magnum` | .44 Magnum | **4+2CD** | 3 | 3 |
| `ammo_50_ball` | .50 Ball | **4+2CD** | 3 | 1 |
| `ammo_50_cal` | .50 | **4+2CD** | 3 | 4 |
| `ammo_5_56mm` | 5.56mm | **8+4CD** | 3 | 2 |
| `ammo_5mm` | 5mm | **12+6CD** | 3 | 1 |
| `ammo_fusion_core` | Fusion Core | **1** | 3 | 200 |
| `ammo_missile` | Missile | **2+1CD** | 3 | 25 |
| `ammo_25mm_grenade` | 25mm Grenade | **2+1CD** | 4 | 8 |
| `ammo_40mm_grenade` | 40mm Grenade Round | **2+1CD** | 4 | 20 |
| `ammo_plasma_cartridge` | Plasma Cartridge | **10+5CD** | 4 | 5 |
| `ammo_2mm_ec` | 2mm EC | **6+3CD** | 5 | 10 |
| `ammo_alien_power_cell` | Alien Power Cells | **4+2CD** | 5 | 5 |
| `ammo_plasma_cartridge_alien` | Plasma Core | **1** | 5 | 200 |
| `ammo_alien_power_module` | Alien Power Module | **3+1CD** | 6 | 10 |
| `ammo_mini_nuke` | Mini-Nuke | **1+1CD** | 6 | 100 |
| `ammo_acid_concentrate` | Acid Concentrate | **12+6CD** | — | — | ★
| `ammo_anything` | Anything (Junk) | **12+6CD** | — | — | ★
| `ammo_cannonball` | Cannonball | **2+1CD** | — | — | ★
| `ammo_cryo_cell` | Cryo Cell | **12+6CD** | — | — | ★
| `ammo_gas_grenade` | Gas Grenade | **2+1CD** | — | — | ★
| `ammo_grappling_hook` | Grappling Hook | **1+1CD** | — | — | ★
| `ammo_harpoon` | Harpoon | **4+2CD** | — | — | ★
| `ammo_homemade` | Homemade Round | **10+5CD** | — | — | ★
| `ammo_tear_gas` | Tear Gas Canister | **2+1CD** | — | — | ★
| `ammo_tranq_dart` | Tranquilizer Dart | **4+2CD** | — | — | ★

---

## Обоснование дополнений (★)

Ни один из этих типов не встречается в `lonestar_ammo.json`. Все они есть в
нашем `modules/fallout/data/equipment/ammo.json` и используются реальным
оружием модуля, поэтому таблица без них неполна.

| id | Значение | Аналог | Обоснование |
|---|---|---|---|
| `ammo_cryo_cell` | **12+6CD** | Flamer Fuel/Fusion Cell | расходный энергозаряд автоматического оружия (Cryolator) |
| `ammo_acid_concentrate` | **12+6CD** | Flamer Fuel | жидкий расходник для распылителя (Acid Soaker) |
| `ammo_harpoon` | **4+2CD** | Railway Spike/.50 Ball | крупный одиночный снаряд, но 6+3CD завышено для подводного гарпуна |
| `ammo_cannonball` | **2+1CD** | Missile | тяжёлый штучный снаряд (Broadsider) |
| `ammo_tranq_dart` | **4+2CD** | Syringer Ammo | игольчатый спецбоеприпас |
| `ammo_syringe_bloodpack` | **4+2CD** | Syringer Ammo | тот же носитель, отличается наполнением |
| `ammo_tear_gas` | **2+1CD** | 25mm Grenade | гранатный боеприпас навесного пуска |
| `ammo_gas_grenade` | **2+1CD** | 25mm Grenade | гранатный боеприпас |
| `ammo_grappling_hook` | **1+1CD** | снаряжение многоразового применения | находится штучно |
| `ammo_homemade` | **10+5CD** | .38/9mm | кустарный патрон массового распространения (Ghoul Pistol) |
| `ammo_anything` | **12+6CD** | Junk Jet стреляет любым хламом | находка обильная, ограничена только переноской |

### Логика подбора

- **Расходники автоматического оружия** (Cryo Cell, Acid Concentrate) — по
  образцу Flamer Fuel `12+6CD`: оружие льёт непрерывно, находка обязана быть
  крупной, иначе боезапас кончается за один бой.
- **Гранатные боеприпасы** (Tear Gas, Gas Grenade) — по образцу
  25mm Grenade `2+1CD`.
- **Игольчатые спецбоеприпасы** (Tranquilizer Dart, Blood Pack Syringe) — по
  образцу Syringer Ammo `4+2CD`: тот же носитель, отличается наполнением.
- **Тяжёлые штучные снаряды** (Cannonball) — по образцу Missile `2+1CD`.
- **Кустарный патрон** (Homemade Round) — по образцу `.38`/`9mm` `10+5CD`:
  массовый и повсеместный.
- **Junk Jet (Anything)** — `12+6CD`: стреляет любым хламом, ограничение не в
  дефиците, а в переносимом весе.
- **Grappling Hook** — `1+1CD`: не расходник в обычном смысле, снаряжение
  многоразового применения.

Все дополнения соблюдают правило `base = 2 × CD`, кроме Grappling Hook, где
штучность важнее (как у Mini-Nuke).

---

## Не покрыто

Референс описывает **объём** находки, но не условия. Правила «когда и сколько
раз бросать» лежат в рулбуке, а не в данных. В референсах есть только
модификаторы к этому броску:

| Источник | Эффект |
|---|---|
| Perk **Scrounger** | ранг 1 → +3, ранг 2 → +6, ранг 3 → +10 (того же типа) |
| Журнал **The Gunsmith of Harper's Ferry** | +2D6 выстрелов при находке ammo |
| Perk **Ammosmith** | крафт боеприпаса на верстаке |
| Журнал **Guns and Bullets Annual** | удвоение результата крафта |

**Расхождение источников:** у `focharactersheet` Scrounger даёт `+3D6/+6D6/+10D6`,
у `lonestar` — `+3/+6/+10 shots`. Перед переносом в модуль нужно решить, какая
редакция наша.
