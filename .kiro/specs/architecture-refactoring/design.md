# Дизайн: Поэтапный архитектурный рефакторинг

## Обзор

Рефакторинг выполняется поэтапно, без остановки разработки фич. Каждый шаг атомарный: перемещаем файл, обновляем импорты, проверяем работоспособность.

---

## Целевая структура

```
assets/
  (только медиа: изображения, иконки)

data/
  origins/
    origins.json
  traits/
    traits.json
  equipment/
    armor.json
    weapons.json
    robotparts.json
    mods.json

domain/
  characterCreation.js   ← логика создания персонажа (атрибуты, навыки, черты, происхождения)
  equipEquip.js          ← логика надевания снаряжения (кто что может надеть)
  modsEquip.js           ← логика установки модов на оружие/броню
  effects.js             ← логика временных эффектов (сцены, расходники)
  perks.js               ← логика перков (требования, применение)

i18n/
  ru-RU/
    (только переводы: названия, описания, тексты UI)
  en-EN/
    (только переводы)

styles/
  CharacterScreen.styles.js
  CharacterScreen.AttributesSection.styles.js
  OriginModal.styles.js
  TraitModal.styles.js
  EquipmentKitModal.styles.js
  WeaponsAndArmorScreen.styles.js
  WeaponModificationModal.styles.js
  ArmorModificationModal.styles.js
  InventoryScreen.styles.js
  AddItemModal.styles.js
  PerksAndTraitsScreen.styles.js
  HomeScreen.styles.js
  (один файл стилей на каждый экран/модалку/компонент)

components/
  screens/
    CharacterScreen/
      CharacterScreen.js          ← только UI
      AttributesSection.js        ← только UI
      modals/
        OriginModal.js            ← только UI
        TraitSkillModal.js        ← только UI
        EquipmentKitModal.js      ← только UI
        traits/
          VaultDwellerModal.js    ← только UI
          BrotherhoodModal.js     ← только UI
          ... (остальные)
    WeaponsAndArmorScreen/
      WeaponsAndArmorScreen.js    ← только UI
      WeaponModificationModal.js  ← только UI
      ArmorModificationModal.js   ← только UI
    InventoryScreen/
      InventoryScreen.js          ← только UI
      modals/
        AddItemModal.js           ← только UI
        AddWeaponModal.js         ← только UI
        ... (остальные)
    PerksAndTraitsScreen/
      PerksAndTraitsScreen.js     ← только UI
      PerkSelectModal.js          ← только UI
    HomeScreen/
      HomeScreen.js               ← только UI
  CharacterContext.js             ← тонкий state-слой

db/
  (БД, адаптеры — без изменений)
```

---

## Слой данных: data/

Только JSON. Никакой логики. Данные описывают **что существует** в игре.

### data/origins/origins.json

```json
[
  {
    "id": "vaultDweller",
    "displayNameKey": "origins.vaultDweller.name",
    "descriptionKey": "origins.vaultDweller.description",
    "isRobot": false,
    "canWearStandardArmor": true,
    "traitIds": ["vaultdweller-goodsoul",
    "equipmentKitIds": ["vaultdweller-starter-01"]
  },
  {
    "id": "superMutant",
    "displayNameKey": "origins.superMutant.name",
    "isRobot": false,
    "isMutant": true,
    "canWearStandardArmor": false,
    "canWearMutantArmor": true,
    "traitIds": ["supermutant-forced-evo"]
  },
  {
    "id": "protectron",
    "displayNameKey": "origins.protectron.name",
    "isRobot": true,
    "canWearStandardArmor": false,
    "canWearRobotArmor": true,
    "traitIds": ["protectron-protect-or-destroy"]
  }
]
```

### data/traits/traits.json

```json
[
  {
    "id": "supermutant-forced-evo",
    "originId": "superMutant",
    "displayNameKey": "traits.supermutant.forcedevo.name",
    "descriptionKey": "traits.supermutant.forcedevo.description",
    "modifiers": {
      "attributes": {
        "STR": { "baseBonus": 2, "max": 12 },
        "END": { "baseBonus": 2, "max": 12 },
        "CHA": { "max": 6 },
        "INT": { "max": 6 }
      },
      "skillMaxValue": 4,
      "immunities": ["radiation", "poison"],
      "armorConstraint": "raiderOnly"
    }
  },
  {
    "id": "vaultdweller-goodsoul",
    "originId": "vaultDweller",
    "displayNameKey": "traits.vaultdweller.goodsoul.name",
    "descriptionKey": "traits.vaultdweller.goodsoul.description",
    "modifiers": {
      "extraSkills": 1
    }
  }
]
```

### data/equipment/armor.json, weapons.json, robotparts.json, mods.json

Данные снаряжения переносятся из `i18n/ru-RU/*.json` постепенно. Каждый предмет содержит только данные, без логики. Переводы (названия, описания) остаются в `i18n/`.

---

## Слой логики: domain/

Каждый файл — набор чистых функций. Без React, без UI, без прямых обращений к БД.

### domain/characterCreation.js

Вся логика создания персонажа: стандарты, расчёты, применение модификаторов черт.

```js
// Стандарты (константы)
export const BASE_ATTRIBUTE_VALUE = 4;
export const MIN_ATTRIBUTE = 4;
export const MAX_ATTRIBUTE = 10;
export const DISTRIBUTION_POINTS = 12;
export const BASE_TAGGED_SKILLS = 3;
export const ALL_SKILLS = [...];

// Расчёты с учётом черты
export function getAttributeLimits(trait)
// Для supermutant-forcedevo → { STR: {min:6, max:12}, CHA: {min:4, max:6} }
// Для обычного персонажа → { STR: {min:4, max:10}, ... }

export function getRemainingAttributePoints(attributes, trait)
export function getSkillPoints(attributes, level)       // INT + 9 + (level-1)
export function canChangeSkillValue(value, delta, trait, level, isTagged)
export function getTraitExtraSkills(trait)              // { count: 1, forcedFrom: [...] }

// Производные характеристики
export function calculateInitiative(attributes)         // PER + AGI
export function calculateDefense(attributes)            // AGI >= 9 ? 2 : 1
export function calculateMeleeBonus(attributes, trait)
export function calculateMaxHealth(attributes, level)
export function calculateCarryWeight(attributes, trait)
export function getLuckPoints(attributes, trait)

// Утилиты
export function createInitialAttributes()
export function getAttributeValue(attributes, key)
export function getCanonicalAttributeKey(name)
export function isMultiTraitOrigin(originName)
```

Источники: `CharacterScreen/logic/characterLogic.js`, `attributeKeyUtils.js`, часть `traitsData.js`.

### domain/equipEquip.js

Логика надевания снаряжения. Вызывается из модалок инвентаря и экрана снаряжения.

```js
// Проверка — может ли персонаж надеть броню
export function canEquipArmor(armorItem, character)
// character = { origin, trait, attributes }
// Логика:
//   1. Читает origin.canWearStandardArmor, origin.canWearRobotArmor, origin.canWearMutantArmor
//   2. Читает trait.modifiers.armorConstraint
//   3. Сравнивает с armorItem.armorType ('standard', 'robot', 'mutant', 'powerArmor')
// Возвращает: { allowed: bool, reason: string | null }

// Проверка — может ли персонаж взять оружие
export function canEquipWeapon(weaponItem, character)
// Возвращает: { allowed: bool, reason: string | null }

// Фильтрация списка брони для персонажа
export function filterAvailableArmor(allArmor, character)

// Расчёт лимита переноски с учётом происхождения и черты
export function getCarryWeightLimit(character)
// Для роботов — фиксированный лимит из черты
// Для людей — 150 + STR * multiplier (multiplier из черты)
```

### domain/modsEquip.js

Логика установки модов на оружие и броню.

```js
// Оружие
export function getModifiedWeaponName(weapon, mods)
export function applyWeaponMod(weapon, mod)
export function removeWeaponMod(weapon, mod)
export function applyModToSlot(weapon, slotName, mod)
export function getAvailableWeaponMods(weapon, allMods)
export function canInstallWeaponMod(weapon, mod)

// Броня
export function applyArmorMod(armor, mod)
export function removeArmorMod(armor, mod)
export function getAvailableArmorMods(armor, allMods)

// Утилиты
export function declinePrefix(prefix, weaponName)     // склонение префикса по роду
```

Источники: `WeaponsAndArmorScreen/weaponModificationUtils.js`, `armorModificationUtils.js`.

### domain/effects.js

Логика временных эффектов (расходники, сцены).

```js
export function applyConsumableToEffects(item, currentEffects)
export function advanceEffectsByScene(effects)
export function pruneExpiredTimedEffects(effects)
export const SCENE_RULES
```

Источник: `assets/scripts/sceneEffects.js` — переносится без изменений.

### domain/perks.js

Логика перков.

```js
export function meetsPerkRequirements(perk, attributes, level)
export function getPerkUnmetReasons(perk, attributes, level)
export function annotatePerks(perks, attributes, level)
export function buildAttributeValueMap(attributes)
```

Источник: `CharacterScreen/logic/perksLogic.js` — переносится без изменений.

---

## Слой стилей: styles/

Один файл стилей на каждый экран, модалку и значимый компонент. Стили выносятся из компонентов.

```js
// styles/CharacterScreen.styles.js
import { StyleSheet } from 'react-native';
export default StyleSheet.create({
  container: { ... },
  header: { ... },
});

// В компоненте:
import styles from '../../../styles/CharacterScreen.styles';
```

---

## Слой состояния: CharacterContext.js

После рефакторинга `CharacterContext` — тонкий слой:
- Хранит состояние через `useState`
- Вычисления делегирует в `domain/characterCreation.js`
- Проверки снаряжения делегирует в `domain/equipEquip.js`
- Сохранение/загрузка остаётся в контексте (или выносится в `application/` позже)

```js
// Было (inline в CharacterContext):
const newLuck = getLuckPoints(newAttributes, trait); // из logic/

// Станет:
import { getLuckPoints } from '../domain/characterCreation';
const newLuck = getLuckPoints(newAttributes, trait); // из domain/
```

---

## Слой переводов: i18n/

Только переводы. Никаких данных снаряжения, никакой логики.

```
i18n/
  ru-RU/
    App.json
    CharacterScreen.json
    WeaponsAndArmorScreen.json
    traits.json          ← названия и описания черт по ключам
    origins.json         ← названия и описания происхождений
    skills.json          ← названия навыков
    attributes.json      ← названия атрибутов
    (данные предметов переносятся в data/ постепенно)
  en-EN/
    (аналогично)
```

---

## Принцип миграции (без поломок)

Для каждого перемещаемого файла:

1. Создаём новый файл в `domain/` с той же логикой
2. Старый файл превращается в re-export:
   ```js
   // components/screens/CharacterScreen/logic/characterLogic.js
   // @deprecated: перенесено в domain/characterCreation.js
   export * from '../../../../domain/characterCreation';
   ```
3. Обновляем прямые импорты в CharacterContext и экранах
4. Удаляем старый файл когда все импорты обновлены

---

## Smoke-check после каждого шага

- Создание персонажа → выбор происхождения → выбор черты
- Распределение атрибутов (лимиты для супермутанта работают)
- Экипировка брони (робот не может надеть обычную броню)
- Установка мода на оружие
- Сохранение и загрузка персонажа

---

## Порядок шагов

1. `domain/effects.js` — изолирован, нет зависимостей от UI
2. `domain/perks.js` — изолирован, простой перенос
3. `domain/characterCreation.js` — базовая логика персонажа
4. `domain/modsEquip.js` — модификации оружия/брони
5. `domain/equipEquip.js` + `data/origins/` + `data/traits/` — снаряжение и данные
6. Рефакторинг `CharacterContext` — делегирует в domain/
7. `styles/` — организация стилей
8. `data/equipment/` — перенос данных снаряжения из i18n/
