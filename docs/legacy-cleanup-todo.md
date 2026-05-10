# Легаси-код и неиспользуемые сценарии — к удалению

Документ создан автоматическим анализом кодовой базы. Всё перечисленное можно удалить без потери функциональности.

---

## 1. Устаревшие файлы-прослойки (deprecated re-exports)

Эти файлы только реэкспортируют функции из `domain/`, они помечены `@deprecated` и не несут собственной логики. Нужно найти все импорты и переключить на прямые пути.

| Файл | Реэкспортирует из |
|------|-------------------|
| `components/screens/WeaponsAndArmorScreen/weaponModificationUtils.js` | `domain/modsEquip.js` |
| `components/screens/WeaponsAndArmorScreen/armorModificationUtils.js` | `domain/modsEquip.js` |
| `components/screens/WeaponsAndArmorScreen/modificationConstants.js` | нигде не импортируется |
| `components/screens/CharacterScreen/logic/attributeKeyUtils.js` | `domain/characterCreation.js` |
| `components/screens/CharacterScreen/logic/Calculator.js` | `domain/diceRollsLogic.js` |
| `components/screens/CharacterScreen/logic/characterLogic.js` | `domain/characterCreation.js` |
| `components/screens/CharacterScreen/logic/perksLogic.js` | `domain/perks.js` |
| `components/screens/CharacterScreen/logic/traitsData.js` | `domain/traits.js` |
| `components/screens/CharacterScreen/logic/ammoLogic.js` | `domain/effects.js` (частично) |
| `assets/scripts/sceneEffects.js` | `domain/effects.js` |

---

## 2. Неиспользуемые файлы

- `components/screens/WeaponsAndArmorScreen/testModificationUtils.js` — тестовые данные, нигде не импортируются
- `assets/bg.png_old` — старый фон, не используется

---

## 3. Мёртвые пропсы и параметры

### `showSourceSlot` в `WeaponCard`
- Определён с дефолтом `false`, всегда передаётся как `false`
- Условие `showSourceSlot && weapon?.sourceSlot` никогда не выполняется
- Убрать проп и весь блок с подписью слота

### `onUnequip` в `WeaponCard`
- Кнопка "Снять" удалена из рендера
- Проп `onUnequip` и `handleUnequipWeapon` в `WeaponsAndArmorScreen` больше не нужны

### `hasSecondaryWeaponOverManipulator` — удалено
- Логика скрытия урона манипулятора когда есть другое оружие
- Удалена, т.к. манипулятор всегда `robotOnly` и у людей не бывает

### `uniqueKey: 'unused'` в `ArmorModificationModal`
- Явно помечен как неиспользуемый при вызове `applyArmorMods`

---

## 4. Незавершённые фичи (заглушки)

### Robot Body Upgrade Modal
- `robotBodyUpgradeModalVisible` — стейт и модалка с текстом "Скоро добавим"
- Файл: `WeaponsAndArmorScreen.js`
- Либо реализовать, либо убрать стейт и модалку

---

## 5. Тесты с битыми импортами

- `__tests__/robot-limb-rendering/RobotSlot.property.test.js`
- Импортирует `getDrValue` из `RobotSlotLogic.js`, но эта функция там больше не экспортируется (удалена при рефакторинге)
- Тест упадёт при запуске — нужно либо убрать импорт, либо восстановить экспорт

---

## 6. Дублирующаяся логика

### `handleUnequipWeapon`
- Определена в `WeaponsAndArmorScreen.js` и в `InventoryScreen.js`
- Обе проверяют `isBuiltin` и `isManipulator`
- Вынести в `domain/` или убрать из `WeaponsAndArmorScreen` (там кнопка "Снять" уже удалена)

---

## 7. Миграционный код (можно убрать после полного перехода)

- `components/CharacterContext.js` — фильтрация `null` из `equippedWeapons` при загрузке персонажа
- Нужен для старых сохранений в формате `[null, null]`
- Убрать после того как все старые персонажи будут пересохранены

---

## 8. TODO из кода

- `scripts/markWeaponsWithoutMods.js` — проверить и добавить моды для `weapon_fat_man` и `weapon_heavy_incinerator`
- `WeaponsAndArmorScreen.js` — Robot Body Upgrade Modal ("Скоро добавим")

---

## 9. Импорты из deprecated-файлов

Следующие компоненты импортируют из устаревших прослоек вместо прямых путей:

- `PerksAndTraitsScreen.js` → импортирует `TRAITS` из `logic/traitsData.js` → нужно из `domain/traits.js`
- `WeaponsAndArmorScreen.js` → импортирует `TRAITS` из `logic/traitsData.js`
- `AttributesSection.js` → импортирует из `logic/attributeKeyUtils.js`
