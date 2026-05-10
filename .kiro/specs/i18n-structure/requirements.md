# Требования: Реструктуризация i18n

## Введение

Сейчас в `i18n/<locale>/` всё лежит вперемешку: переводы экранов (`CharacterScreen.json`, `WeaponsAndArmorScreen.json`), переводы игровых данных (`weapons.json`, `weapon_mods.json`, `chems.json`) и глобальные строки (`App.json`) — всё на одном уровне. Единственное исключение — `screens/inventory/`, которое уже вынесено в подпапку.

Цель — привести структуру `i18n/` в соответствие со структурой программы:
- переводы экранов и их модалок — в `i18n/<locale>/screens/<screenName>/`
- переводы игровых данных — в `i18n/<locale>/data/`
- глобальные строки — в `i18n/<locale>/App.json` (остаются на месте)

---

## Требования

### Требование 1: Переводы экранов переезжают в `screens/`

**User Story:** Как разработчик, я хочу, чтобы переводы каждого экрана и его модалок лежали в `i18n/<locale>/screens/<screenName>/`, чтобы сразу было понятно, к какому экрану относится файл.

#### Acceptance Criteria

1. WHEN разработчик ищет переводы CharacterScreen THEN они SHALL находиться в `i18n/<locale>/screens/character/screen.json`.
2. WHEN разработчик ищет переводы WeaponsAndArmorScreen THEN они SHALL находиться в `i18n/<locale>/screens/weaponsAndArmor/screen.json`.
3. WHEN разработчик ищет переводы HomeScreen THEN они SHALL находиться в `i18n/<locale>/screens/home/screen.json`.
4. WHEN разработчик ищет переводы PerksAndTraitsScreen THEN они SHALL находиться в `i18n/<locale>/screens/perksAndTraits/screen.json` (если файл существует).
5. WHEN у экрана есть модалки THEN их переводы SHALL находиться в `i18n/<locale>/screens/<screenName>/modals/<modalName>.json`.
6. WHEN файлы `CharacterScreen.json`, `WeaponsAndArmorScreen.json`, `HomeScreen.json` перемещены THEN старые файлы на верхнем уровне SHALL быть удалены.
7. IF экран уже использует структуру `screens/inventory/` THEN он SHALL остаться без изменений (уже соответствует целевой структуре).

---

### Требование 2: Переводы игровых данных переезжают в `data/`

**User Story:** Как разработчик, я хочу, чтобы переводы игровых данных (оружие, броня, моды, расходники и т.д.) лежали в `i18n/<locale>/data/`, отдельно от переводов UI.

#### Acceptance Criteria

1. WHEN разработчик ищет переводы оружия THEN они SHALL находиться в `i18n/<locale>/data/weapons.json`.
2. WHEN разработчик ищет переводы модов оружия THEN они SHALL находиться в `i18n/<locale>/data/weapon_mods.json`.
3. WHEN разработчик ищет переводы патронов THEN они SHALL находиться в `i18n/<locale>/data/ammo_types.json`.
4. WHEN разработчик ищет переводы брони THEN они SHALL находиться в `i18n/<locale>/data/armor.json`.
5. WHEN разработчик ищет переводы расходников THEN они SHALL находиться в `i18n/<locale>/data/chems.json` и `i18n/<locale>/data/drinks.json`.
6. WHEN разработчик ищет переводы качеств оружия THEN они SHALL находиться в `i18n/<locale>/data/qualities.json`.
7. WHEN разработчик ищет переводы одежды THEN они SHALL находиться в `i18n/<locale>/data/Clothes.json`.
8. WHEN разработчик ищет переводы разного снаряжения THEN они SHALL находиться в `i18n/<locale>/data/miscellaneous.json`.
9. WHEN разработчик ищет переводы частей роботов THEN они SHALL находиться в `i18n/<locale>/data/robot/` (weapons, armor, modules, items, partsUpgrade).
10. WHEN файлы данных перемещены THEN старые файлы на верхнем уровне `i18n/<locale>/` SHALL быть удалены.

---

### Требование 3: Обновление импортов в коде

**User Story:** Как разработчик, я хочу, чтобы все импорты JSON-файлов переводов в JS-коде указывали на новые пути, чтобы приложение продолжало работать после реструктуризации.

#### Acceptance Criteria

1. WHEN файл перевода перемещён THEN все JS-файлы, импортирующие его, SHALL обновить путь импорта.
2. WHEN `equipmentCatalog.js` импортирует файлы переводов данных THEN пути SHALL указывать на `i18n/<locale>/data/`.
3. WHEN `*I18n.js` хелперы экранов импортируют файлы переводов THEN пути SHALL указывать на `i18n/<locale>/screens/<screenName>/`.
4. IF файл перевода используется в нескольких местах THEN все места SHALL быть обновлены одновременно.

---

### Требование 4: Целевая структура директорий

**User Story:** Как разработчик, я хочу видеть предсказуемую структуру `i18n/`, которая зеркалит структуру проекта.

#### Acceptance Criteria

1. WHEN разработчик открывает `i18n/<locale>/` THEN он SHALL видеть только три категории: `App.json`, `screens/`, `data/`.
2. WHEN разработчик открывает `i18n/<locale>/screens/` THEN он SHALL видеть по одной папке на каждый экран приложения.
3. WHEN разработчик открывает `i18n/<locale>/data/` THEN он SHALL видеть только файлы переводов игровых данных.
4. IF добавляется новый экран THEN его переводы SHALL создаваться в `i18n/<locale>/screens/<newScreen>/`.
5. IF добавляется новый тип игровых данных THEN его переводы SHALL создаваться в `i18n/<locale>/data/`.

Целевая структура:
```
i18n/
  ru-RU/
    App.json
    screens/
      home/
        screen.json
      character/
        screen.json
      weaponsAndArmor/
        screen.json
      perksAndTraits/
        screen.json        (если есть)
      inventory/           (уже существует, не трогать)
        screen.json
        modals/
          ...
    data/
      weapons.json
      weapon_mods.json
      armor.json
      armor_mods.json
      uniq_armor_mods.json
      armor_effects.json
      ammo_types.json
      ammoData.json
      qualities.json
      mods_overrides.json
      Clothes.json
      chems.json
      drinks.json
      miscellaneous.json
      equipmentKits.json
      effects.json
      robot/
        weapons.json
        armor.json
        modules.json
        items.json
        partsUpgrade.json
  en-EN/
    (зеркальная структура)
```
