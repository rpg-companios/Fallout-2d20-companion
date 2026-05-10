# План реализации

- [x] 1. Создать `domain/robotEquip.js` с базовыми чистыми функциями





  - Реализовать `isRobotCharacter(character)` — проверка `origin.isRobot`
  - Реализовать `getRobotSlotKeys(bodyPlan)` — возвращает массив ключей слотов по шасси
  - Реализовать `createEmptyRobotSlots(bodyPlan)` — создаёт объект с null-полями для каждого слота
  - Реализовать `getBuiltinWeaponsFromSlots(slots)` — собирает массив оружия из встроенных, манипуляторных и удерживаемых источников
  - Реализовать `canEquipRobotArmor(armorItem, slotKey, layer, slots)` — проверка совместимости слоёв через `incompatibleLayers`
  - Реализовать `canReplaceLimb(slotKey, newLimb, character)` — проверка совместимости шасси
  - Реализовать `applyLimbReplacement(slots, slotKey, newLimb)` — замена конечности + пересборка оружия
  - Реализовать `canEquipWeaponToSlot(weapon, slotData, character)` — проверка веса и двуручности
  - _Требования: 2.5, 5.2–5.4, 8.1–8.5, 12.1–12.9_

- [x] 2. Реализовать `initRobotSlots` в `domain/robotEquip.js`





  - Реализовать алгоритм распределения предметов комплекта по слотам (конечности, оружие, броня, модули, инвентарь)
  - Обработать `requiresWeaponId` — поиск слота с нужным манипулятором
  - Обработать `replacesArm: true` — оружие занимает слот конечности
  - Обработать `slot: "left"|"right"` — маппинг на конкретный слот
  - Автоматически добавлять конечности по умолчанию (голова, корпус, ноги) если не указаны в комплекте
  - Вызвать `getBuiltinWeaponsFromSlots` для сборки итогового массива оружия
  - _Требования: 3.1–3.10, 4.1–4.5, 11.1–11.8_

- [x] 3. Написать юнит-тесты для `domain/robotEquip.js`






  - Тест `isRobotCharacter` — все пути (origin.isRobot true/false)
  - Тест `initRobotSlots` для `protectron_standard` — проверить слоты, оружие, инвентарь
  - Тест `initRobotSlots` для `mister_handy_assistant` — проверить arm1/arm2/arm3
  - Тест `canEquipRobotArmor` — матрица совместимости plating/armor/frame
  - Тест `applyLimbReplacement` — обновление слота и пересборка оружия
  - _Требования: 12.1–12.9_
-


- [x] 4. Добавить оружие `unarmed_human` в `data/equipment/weapons.json`



  - Добавить запись с `id: "unarmed_human"`, `damage: 2`, `weaponType: "Unarmed"`, `isBuiltin: true`
  - Добавить i18n ключи: "Кулаки" (ru-RU), "Fists" (en-EN) в соответствующие файлы локализации
  - _Требования: 13.1–13.3_

- [-] 5. Обновить JSON комплектов снаряжения роботов




  - [x] 5.1 Обновить `data/equipmentKits/protectron.json` — добавить конечности во все варианты комплектов

    - Добавить `robotArm` предметы с `slot: "left"/"right"` в каждый вариант
    - Голова, корпус, ноги добавляются автоматически через `initRobotSlots` — в JSON не нужны
    - _Требования: 11.1–11.6_
  - [x] 5.2 Обновить `data/equipmentKits/misterHandy.json` — добавить конечности во все варианты





















    - Добавить оружия-конечности для arm1/arm2/arm3 в каждый вариант
    - _Требования: 11.1–11.6_
  - [x] 5.3 Обновить `data/equipmentKits/robobrain.json` — добавить конечности




    - _Требования: 11.1–11.6_

- [x] 6. Обновить `CharacterContext` — новые поля состояния





  - Добавить `equippedRobotSlots` (начальное значение `null`) и `equippedRobotModules` (начальное значение `[]`)
  - Изменить начальное значение `equippedWeapons` с `[null, null]` на `[]`
  - Обновить `buildSnapshot` для включения новых полей
  - Обновить `serializeState` / `deserializeState` для новых полей
  - Обновить `loadCharacter` — миграция старого формата `[null, null]` (фильтрация null-ов)
  - Обновить `resetCharacter` — очистка новых полей
  - Экспортировать `setEquippedRobotSlots`, `setEquippedRobotModules` в value
  - _Требования: 1.1, 1.5, 2.1–2.6, 10.1–10.6_

- [x] 7. Обновить `EquipmentKitModal` — интеграция `initRobotSlots`





  - В `handleSelectKit` определять робота через `isRobotCharacter`
  - Для роботов: вызывать `initRobotSlots`, передавать `{ slots, weapons, modules, inventoryItems, caps }` через `onSelectKit`
  - Для людей: добавить `unarmed_human` в `equippedWeapons` если его нет
  - Обновить `CharacterScreen` для приёма и применения новых полей через контекст
  - _Требования: 1.2, 3.1–3.10_

- [x] 8. Создать компонент `RobotSlot` для `WeaponsAndArmorScreen`
  - Отображать: название слота, название конечности, индикаторы слоёв брони (plating/armor/frame + значения DR)
  - Отображать информацию об оружии слота (встроенное или удерживаемое) со ссылкой на карточку
  - Кнопки: "Модернизировать конечность", "Улучшить броню", "Улучшить обшивку", "Улучшить раму"
  - _Требования: 6.1–6.7_

- [x] 9. Создать `LimbUpgradeModal`
  - Загружать данные из `data/equipment/robot/robotarms.json`, `robotheads.json`, `robotbody.json`, `robotlegs.json`
  - Фильтровать по `itemType` слота и `compatibleBodyPlans`/`defaultForBodyPlan`
  - При выборе: вызывать `applyLimbReplacement`, обновлять `equippedRobotSlots` и `equippedWeapons` в контексте
  - _Требования: 8.1–8.5_

- [x] 10. Создать `ArmorLayerModal`
  - Загружать данные из `data/equipment/robot/armor_plating.json`, `armor.json`, `frames.json`
  - Фильтровать по `layer` и `robotLocation`
  - Проверять совместимость через `canEquipRobotArmor` перед отображением
  - При выборе: обновлять соответствующий слой в `equippedRobotSlots[slotKey]`
  - _Требования: 5.1–5.7, 6.6–6.7_

- [x] 11. Обновить `WeaponsAndArmorScreen` — ветка робота
  - Добавить условный рендеринг: если `isRobotCharacter` → рендерить `RobotEquipmentSection` вместо `ArmorPart`
  - `RobotEquipmentSection` итерирует по `getRobotSlotKeys(bodyPlan)` и рендерит `RobotSlot` для каждого
  - Обновить секцию оружия: рендерить динамический список из `equippedWeapons` (убрать ограничение на 2 слота)
  - Для карточек оружия роботов: показывать метку `sourceSlot`
  - _Требования: 6.1–6.9_

- [x] 12. Обновить `InventoryScreen` — поток экипировки для роботов
  - Для роботов: проверять наличие руки с `canHoldWeapons` перед показом кнопки "Экипировать"
  - Если руки нет — скрыть кнопку "Экипировать", показать предупреждение (существующий алерт `manipulatorRequiredTitle`)
  - Если рука есть — добавлять оружие напрямую в `equippedWeapons` без диалога выбора слота
  - Кнопка "Снять" для встроенного/манипуляторного оружия (`isBuiltin`, `isManipulator`) — скрыта/неактивна
  - Скрыть предметы-конечности (`robotArm`, `robotHead`, `robotBody`, `robotLeg`) из списка инвентаря
  - _Требования: 7.1–7.6_

- [x] 13. Обновить `AddItemModal` — выбор количества
  - Добавить внутреннее состояние `pendingItem` и `pendingQuantity`
  - При нажатии на предмет: установить `pendingItem`, показать шаг выбора количества
  - Элементы управления количеством: кнопка `-`, числовой `TextInput`, кнопка `+` (стиль как в `SellItemModal`)
  - Кнопка "Добавить" вызывает `onSelectItem(item, quantity)` и закрывает модалку
  - Обновить `InventoryScreen.handleSelectCatalogItem` для приёма `(item, quantity)`
  - _Требования: 9.1–9.6_

- [x] 14. Добавить `unarmed_human` в `equippedWeapons` для людей
  - При создании нового персонажа-человека: добавить `unarmed_human` в `equippedWeapons`
  - При загрузке персонажа-человека: добавить `unarmed_human` если его нет
  - В `WeaponsAndArmorScreen`: скрыть кнопку "Снять" для оружия с `isBuiltin: true`
  - _Требования: 1.2, 13.1–13.6_

- [x] 15. Создать документ для будущей задачи: управление конечностями в инвентаре
  - Создать `docs/robot-limb-inventory-management.md`
  - Описать задачи: отображение снятых конечностей в инвентаре, экипировка конечностей из инвентаря, кнопка "Снять конечность" в `WeaponsAndArmorScreen`
  - _Требования: 14.1–14.3_
