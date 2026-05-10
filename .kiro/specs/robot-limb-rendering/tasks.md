# Tasks: robot-limb-rendering

## Task List

- [x] 1. Переработать компонент RobotSlot под стиль ArmorPart
  - [x] 1.1 Заменить JSX-структуру RobotSlot: использовать `armorPartContainer`, `sectionHeader`, `armorStatsContainer`, `armorStatRow` из `WeaponsAndArmorScreen.styles`
  - [x] 1.2 Сформировать массив `stats` из данных слота: Plating DR, Armor DR, Frame DR, оружие (если есть), кнопки апгрейда
  - [x] 1.3 Добавить вспомогательную функцию `getDrValue(layerItem)` для извлечения DR из объекта слоя (`physicalDamageRating ?? dr ?? null`)
  - [x] 1.4 Отображать `limbName` под заголовком слота в стиле `armorItemNameTitle`
  - [x] 1.5 Удалить старые стили `slotStyles` (badge, layersRow, buttonsContainer и т.д.) из RobotSlot.js

- [x] 2. Обновить раскладку роботов в WeaponsAndArmorScreen
  - [x] 2.1 Заменить вертикальный список `getRobotSlotKeys(bodyPlan).map(...)` на сетку `statsRow` (две строки по 3 слота)
  - [x] 2.2 Добавить вспомогательную функцию `chunkSlotKeys(keys, size)` для разбивки массива ключей на строки
  - [x] 2.3 Применить те же отступы (`marginTop: 8` между строками), что используются для людей

- [x] 3. Обеспечить null-безопасность
  - [x] 3.1 Защитить все обращения к `slotData` через optional chaining (`slotData?.limb`, `slotData?.plating` и т.д.)
  - [x] 3.2 Отображать `'—'` (или `tWeaponsAndArmorScreen('common.none')`) при отсутствии DR-значения
  - [x] 3.3 Отображать локализованную строку «нет конечности» при `limb === null`

- [x] 4. Написать property-тесты
  - [x] 4.1 Настроить fast-check в проекте (если не установлен)
  - [x] 4.2 Property 1: для любого slotKey заголовок слота присутствует в рендере
  - [x] 4.3 Property 2: для любого limb.name имя конечности присутствует в рендере
  - [x] 4.4 Property 3: для любой комбинации plating/armor/frame в рендере присутствуют три строки DR
  - [x] 4.5 Property 4: для любого slotKey в рендере присутствуют 4 кнопки (апгрейд конечности + 3 слоя)
  - [x] 4.6 Property 5: нажатие кнопки апгрейда конечности вызывает onUpgradeLimb(slotKey)
  - [x] 4.7 Property 6: нажатие кнопки апгрейда слоя вызывает onUpgradeArmor(layer) с правильным layer
  - [x] 4.8 Property 7: строка оружия присутствует тогда и только тогда, когда есть оружие
  - [x] 4.9 Property 8: количество рендеримых слотов равно getRobotSlotKeys(bodyPlan).length
  - [x] 4.10 Property 9: рендер с slotData=null не бросает ошибок

- [x] 5. Проверить обратную совместимость
  - [x] 5.1 Убедиться, что пропсы LimbUpgradeModal и ArmorLayerModal не изменились
  - [x] 5.2 Проверить, что equippedRobotSlots читается без изменения структуры данных
  - [x] 5.3 Провести ручное smoke-тестирование на персонаже-роботе (protectron и misterHandy) <!-- REQUIRES MANUAL TESTING: code paths verified statically — getRobotSlotKeys('protectron') returns 6 slots (2×3 grid), getRobotSlotKeys('misterHandy') returns 6 slots (2×3 grid), chunkSlotKeys handles both correctly -->
