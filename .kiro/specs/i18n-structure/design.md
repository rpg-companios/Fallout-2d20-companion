# Дизайн: Реструктуризация i18n

## Обзор

Миграция сводится к перемещению JSON-файлов в новые папки и обновлению путей импорта в JS. Логика кода не меняется — только физическое расположение файлов и строки `import`.

Inventory уже в правильном месте (`i18n/<locale>/screens/inventory/`) — не трогаем.

---

## Архитектура

### Текущее состояние

```
i18n/ru-RU/
  App.json                        ← глобальные строки (остаётся)
  CharacterScreen.json            ← переводы экрана
  WeaponsAndArmorScreen.json      ← переводы экрана
  HomeScreen.json                 ← переводы экрана
  screens/
    inventory/                    ← уже правильно, не трогаем
      screen.json
      modals/...
  weapons.json                    ← переводы данных
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
  robotWeapons.json
  robotArmor.json
  robotModules.json
  robotItems.json
  robotPartsUpgrade.json
```

### Целевое состояние

```
i18n/ru-RU/
  App.json
  screens/
    inventory/                    ← не трогаем
      screen.json
      modals/...
    character/
      screen.json                 ← бывший CharacterScreen.json
    weaponsAndArmor/
      screen.json                 ← бывший WeaponsAndArmorScreen.json
    home/
      screen.json                 ← бывший HomeScreen.json
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
      weapons.json                ← бывший robotWeapons.json
      armor.json                  ← бывший robotArmor.json
      modules.json                ← бывший robotModules.json
      items.json                  ← бывший robotItems.json
      partsUpgrade.json           ← бывший robotPartsUpgrade.json
```

Та же структура зеркалируется в `i18n/en-EN/`.

---

## Компоненты и интерфейсы

### Затронутые JS-файлы и их новые импорты

#### `i18n/equipmentCatalog.js`

Все 19 импортов данных переезжают в `data/`, роботы — в `data/robot/`:

```js
// было
import ruWeapons from './ru-RU/weapons.json';
import ruRobotWeapons from './ru-RU/robotWeapons.json';

// станет
import ruWeapons from './ru-RU/data/weapons.json';
import ruRobotWeapons from './ru-RU/data/robot/weapons.json';
```

Полный список новых путей для `ru-RU` (аналогично для `en-EN`):
| Переменная | Новый путь |
|---|---|
| `ruWeapons` | `./ru-RU/data/weapons.json` |
| `ruWeaponMods` | `./ru-RU/data/weapon_mods.json` |
| `ruAmmoTypes` | `./ru-RU/data/ammo_types.json` |
| `ruQualities` | `./ru-RU/data/qualities.json` |
| `ruModsOverrides` | `./ru-RU/data/mods_overrides.json` |
| `ruArmor` | `./ru-RU/data/armor.json` |
| `ruArmorMods` | `./ru-RU/data/armor_mods.json` |
| `ruUniqArmorMods` | `./ru-RU/data/uniq_armor_mods.json` |
| `ruArmorEffects` | `./ru-RU/data/armor_effects.json` |
| `ruClothes` | `./ru-RU/data/Clothes.json` |
| `ruChems` | `./ru-RU/data/chems.json` |
| `ruDrinks` | `./ru-RU/data/drinks.json` |
| `ruMisc` | `./ru-RU/data/miscellaneous.json` |
| `ruAmmoData` | `./ru-RU/data/ammoData.json` |
| `ruRobotWeapons` | `./ru-RU/data/robot/weapons.json` |
| `ruRobotArmor` | `./ru-RU/data/robot/armor.json` |
| `ruRobotModules` | `./ru-RU/data/robot/modules.json` |
| `ruRobotItems` | `./ru-RU/data/robot/items.json` |
| `ruRobotPartsUpgrade` | `./ru-RU/data/robot/partsUpgrade.json` |

#### `components/screens/CharacterScreen/logic/characterScreenI18n.js`

```js
// было
import ruCharacterScreen from "../../../../i18n/ru-RU/CharacterScreen.json";
import enCharacterScreen from "../../../../i18n/en-EN/CharacterScreen.json";

// станет
import ruCharacterScreen from "../../../../i18n/ru-RU/screens/character/screen.json";
import enCharacterScreen from "../../../../i18n/en-EN/screens/character/screen.json";
```

#### `domain/characterCreation.js`

```js
// было
import ruCharacterScreen from '../i18n/ru-RU/CharacterScreen.json';

// станет
import ruCharacterScreen from '../i18n/ru-RU/screens/character/screen.json';
```

#### `components/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n.js`

```js
// было
import ruWeaponsAndArmorScreen from '../../../i18n/ru-RU/WeaponsAndArmorScreen.json';
import enWeaponsAndArmorScreen from '../../../i18n/en-EN/WeaponsAndArmorScreen.json';

// станет
import ruWeaponsAndArmorScreen from '../../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enWeaponsAndArmorScreen from '../../../i18n/en-EN/screens/weaponsAndArmor/screen.json';
```

#### `components/screens/HomeScreen/logic/homeScreenI18n.js`

```js
// было
import ruHomeScreen from "../../../../i18n/ru-RU/HomeScreen.json";
import enHomeScreen from "../../../../i18n/en-EN/HomeScreen.json";

// станет
import ruHomeScreen from "../../../../i18n/ru-RU/screens/home/screen.json";
import enHomeScreen from "../../../../i18n/en-EN/screens/home/screen.json";
```

### Файлы без изменений

- `i18n/appI18n.js` — импортирует `App.json`, который остаётся на месте
- `i18n/equipmentCatalog.js` — логика не меняется, только пути импортов
- `components/screens/InventoryScreen/logic/inventoryI18n.js` — уже использует правильные пути

---

## Модели данных

Содержимое JSON-файлов не меняется. Меняется только их расположение.

---

## Обработка ошибок

Если после перемещения файл не найден по новому пути — Metro bundler (или Vite в тестах) выдаст ошибку на этапе сборки/импорта. Это обнаруживается сразу при запуске, не в рантайме.

---

## Стратегия тестирования

- Запустить `npx vitest run domain/contract.test.js` после миграции — тесты должны пройти (они импортируют `equipmentCatalog.js`, который использует новые пути)
- Запустить `npx vitest run` для всего проекта — убедиться что ничего не сломалось
- Проверить что Metro/Expo не выдаёт ошибок импорта при запуске приложения

---

## Порядок выполнения

1. Переместить файлы экранов (`CharacterScreen.json`, `WeaponsAndArmorScreen.json`, `HomeScreen.json`) в `screens/<name>/screen.json` для обоих локалей
2. Обновить импорты в `characterScreenI18n.js`, `domain/characterCreation.js`, `weaponsAndArmorScreenI18n.js`, `homeScreenI18n.js`
3. Переместить файлы данных в `data/` и `data/robot/` для обоих локалей
4. Обновить импорты в `equipmentCatalog.js`
5. Удалить старые файлы с верхнего уровня
6. Прогнать тесты
