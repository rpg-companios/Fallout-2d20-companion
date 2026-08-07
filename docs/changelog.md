# История изменений / Changelog

---

## 36 — Английская локализация перков / English perk localization

### RU

- Исправлена английская локализация всех 94 перков.
- Названия и описания перков теперь отображаются на английском языке при выборе английской локали.

### EN

- Fixed the English localization of all 94 perks.
- Perk names and descriptions are now displayed in English when the English locale is selected.

---

## 37 — Английская локализация оружия и случайной добычи / English weapon and random-loot localization

### RU

- Исправлены русские фрагменты, случайно попавшие в английские названия, описания и дальности оружия.
- Названия предметов случайной добычи теперь корректно переключаются вместе с языком приложения.
- В английской локали предмет «Косметичка» отображается как `Cosmetics Bag`.

### EN

- Fixed Russian fragments that had accidentally appeared in English weapon names, descriptions, and ranges.
- Random-loot item names now switch correctly with the application language.
- The item previously shown as «Косметичка» is displayed as `Cosmetics Bag` in English.

---

## 38 — Настраиваемая прочность оружия / Configurable weapon durability

### RU

- Добавлено окно настроек.
- Добавлена опциональная механика случайной прочности оружия.
- При включённой опции оружие, полученное как добыча, имеет случайную прочность от 1 до 100.
- Купленное оружие всегда получает 100% прочности.
- Добавлена настройка расхода прочности за 10 выстрелов.
- Ненадёжное оружие изнашивается вдвое быстрее, а надёжное — вдвое медленнее.
- На экране экипировки отображается прочность оружия.
- Оружие с нулевой прочностью нельзя использовать до ремонта.
- Оружие можно бесплатно починить через инвентарь.

### EN

- Added a Settings dialog.
- Added an optional random weapon durability mechanic.
- When enabled, weapons acquired as loot receive random durability from 1 to 100.
- Purchased weapons always start at 100% durability.
- Added a setting for durability loss per 10 shots.
- Unreliable weapons wear twice as fast, while Reliable weapons wear half as fast.
- Weapon durability is displayed on the equipment screen.
- Weapons at zero durability cannot be used until repaired.
- Weapons can be repaired for free through the inventory.

---

## 39 — Тип боеприпаса в инвентаре / Ammo type in inventory

### RU

- В инвентаре у оружия отображается подходящий тип боеприпаса.
- Например: `Патрон: 10-мм` или `Патрон: Энергоячейка`.

### EN

- Weapons in the inventory now display their compatible ammo type.
- For example: `Ammo: 10mm Round` or `Ammo: Energy Cell`.

---

## 40 — Награды за отмеченные навыки / Tagged-skill rewards

### RU

- Исправлено повторное начисление наград за отмеченные навыки.
- Повторное сохранение тех же навыков больше не добавляет предметы повторно.
- Если персонаж получает новый отмеченный навык позже, награда будет выдана только за новый навык.

### EN

- Fixed duplicate rewards for tagged skills.
- Saving the same tagged skills again no longer adds the rewards a second time.
- If a character receives a new tagged skill later, only that new skill receives its reward.

---

## 41 — Взаимоисключающие качества оружия / Mutually exclusive weapon qualities

### RU

- Исправлено применение взаимоисключающих качеств оружия.
- «Точное» заменяет «Неточное», и наоборот.
- «Надёжное» заменяет «Ненадёжное», и наоборот.

### EN

- Fixed the application of mutually exclusive weapon qualities.
- Accurate replaces Inaccurate, and vice versa.
- Reliable replaces Unreliable, and vice versa.

---

## 42 — Исправление старых сохранений / Legacy-save correction

### RU

- Исправлены старые сохранения, в которых оружие могло одновременно иметь взаимоисключающие качества.
- После загрузки сохранения остаётся только одно качество из каждой конфликтующей пары.

### EN

- Fixed legacy saves in which a weapon could contain mutually exclusive qualities at the same time.
- After loading a save, only one quality from each conflicting pair remains.

---

## 44 — Конфликт рукояти и ложа / Grip and stock conflict

### RU

- Рукоять и ложе оружия теперь являются взаимоисключающими модификациями.
- Установка рукояти автоматически снимает ложе, а установка ложа снимает рукоять.
- Исправлено русское название слота: «Приклад» заменён на «Ложе».

### EN

- Weapon grips and stocks are now mutually exclusive modifications.
- Installing a grip automatically removes the stock, and installing a stock removes the grip.
- The Russian name of the slot was corrected from «Приклад» to «Ложе».
