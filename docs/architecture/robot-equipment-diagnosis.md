# Диагностика экипировки роботов (Fix #2, ветка «роботы»)

Дата: 2026-06-15.

## Как сейчас устроено (факты из кода)

### Модель данных робота
- Тело-план берётся из `data/bodyplans/bodyplans.json` (humanoid, robobrain, misterHandy,
  protectron, assaultron, sentryBot). У каждого свои `slots` и `defaults`.
- Слот = `{ limb, armor, plating, frame, heldWeapon, capabilities:{canEquipWeapon, canEquipArmor} }`.
- Каждый слот поддерживает 3 защитных слоя: **plating / armor / frame** (2 из 3 одновременно
  через `incompatibleLayers` — это уже реализовано в `canEquipRobotArmor`).
- Руки (`limb` типа `robotArm`):
  - `canHoldWeapons` + `weaponSlots` → может держать оружие из weapons.json (`heldWeapon`).
  - `builtinWeapons` / `builtinWeaponId` → встроенное оружие (снять нельзя).
  - `builtinManipulator` → манипулятор (не оружие, но числится в attack-list).
  - `replacesArm` оружие → ставится КАК limb (рука-оружие), без heldWeapon.
  - `builtinToHead` оружие → уходит в голову, не в инвентарь.

### Где живёт состояние (КЛЮЧЕВОЙ момент)
- `equippedRobotSlots` и `equippedRobotModules` живут **ТОЛЬКО в `CharacterContext` (useState)**.
- В Zustand-сторе их **нет вообще** (`characterStore.js` про роботов ничего не знает).
- Персист робо-слотов идёт исключительно через legacy-снапшот БД (`buildSnapshot` →
  `saveCharacter`), НЕ через zustand `persist`.
- Робо-оружие попадает в общий список через `equippedWeaponsForDisplay`, который мёржит
  `storeEquippedWeapons` (из стора) + `robotExtras` (builtin/manipulator/sourceSlot из Context-массива).
  Дедуп по uniqueId/id есть в обоих экранах.

## Проблемы (по типам, как ты и описал)

### A. Несогласованность источника правды 🟠
Робо-слоты — НЕ в сторе, обычные предметы — в сторе. Архитектурная цель документа
(«всё мутабельное в сторе») для роботов не выполнена. Это НЕ вызывает рассинхрон сам по
себе (у робо-слотов единственный владелец = Context), но:
- зустандовый `persist` робота не сохраняет (только БД-снапшот);
- derived-расчёты в сторе получают `equipmentState.equippedRobotSlots` только через мост,
  который мы добавили в Fix #4 — ок, но это костыль вокруг того, что слоты вне стора.

### B. Мёртвый/противоречивый код формата 🔴 (низкий риск починки)
В `domain/robotEquip.js` вверху есть константа `BODY_PLAN_SLOTS`, которая:
- нигде не используется (реальные слоты берутся из `bodyplans.json` через `getRobotSlotKeys`);
- противоречит данным (другой порядок/набор слотов).
Это сбивает с толку и провоцирует баги при правках.

### C. Устаревшие тесты 🔴 (низкий риск)
2 теста в `domain/robotEquip.test.js` падали ДО любых моих изменений:
1. `getRobotSlotKeys('unknown')` — тест ждёт фоллбэк на `protectron`, а код (правильно по
   данным) фоллбэчит на `humanoid`.
2. `createEmptyRobotSlots` — тест не знает про новое поле `capabilities` в слоте.
Это «тесты отстали от рефакторинга данных», а не баги в логике.

## Возможные направления работ (с оценкой риска)

| Вариант | Что делаем | Риск | Польза |
|---|---|---|---|
| **1. Чистка + тесты** | Удалить мёртвый `BODY_PLAN_SLOTS`; обновить 2 устаревших теста под текущую (корректную) логику | 🟢 низкий | Зелёный прогон, меньше путаницы |
| **2. Робо-оружие — один путь** | Убедиться, что робо-оружие нигде не дублируется со стором; формализовать границу | 🟡 средний | Меньше шансов на рассинхрон отображения |
| **3. Перенос робо-слотов в стор** | `equippedRobotSlots/Modules` → срез Zustand-стора + persist | 🔴 высокий | Полное соответствие архитектуре, persist роботов |

Рекомендация: начать с **варианта 1** (безопасно, сразу зелёные тесты и чистый формат),
затем по желанию 2, и только осознанно — 3.

---

## Прогресс

### Шаг 0 — чистка + тесты ✅ (сделано)
- Удалена мёртвая константа `BODY_PLAN_SLOTS` из `domain/robotEquip.js`
  (слоты — единый источник правды в `data/bodyplans/bodyplans.json`).
- Починены 2 устаревших теста в `domain/robotEquip.test.js`:
  фоллбэк теперь корректно сверяется с `humanoid`; слот проверяется через `toMatchObject`
  + отдельная проверка `capabilities`.
- Результат: **288/288 тестов проходят**.

### Известные ДО-существующие поломки (НЕ мои, требуют решения)
Два тест-файла тестируют УДАЛЁННЫЙ код и падают на загрузке и в оригинальном репозитории:
- `domain/robotEquipSimple.test.js` → импортирует несуществующий `./robotEquipSimple.js`
  (функции `initRobotSlotsSimple`, `canLimbHoldWeapon`, `isWeaponInsteadOfLimb` удалены).
- `__tests__/robot-limb-rendering/RobotSlot.property.test.js` → импортирует несуществующий
  `RobotSlotLogic.js` и функцию `getDrValue` (тоже удалена; актуальный файл — `domain/robotSlotLogic.js`).
Варианты: (а) удалить эти мёртвые тест-файлы, (б) переписать под текущий API. Требует решения владельца.

### Цель пользователя (уточнено)
Перенести робо-состояние в Zustand так, чтобы:
1. `equippedRobotSlots` / `equippedRobotModules` / `bodyPlan` жили в сторе (+persist);
2. **переносимый вес робота** считался от брони/конечностей (а НЕ от Силы);
3. **возможность держать оружие** определялась руками (limb.canHoldWeapons/weaponSlots);
4. экраны только ЧИТАЛИ через селекторы, не мутируя состояние по месту.

### План переноса (Шаги 1–3)
- **Шаг 1**: срез `robot:{ bodyPlan, slots, modules }` в сторе + actions
  (`initRobot`, `replaceLimb`, `equipHeldWeapon`, `unequipHeldWeapon`, `setRobotArmorLayer`,
  `addModule`, `removeModule`) — обёртки над уже существующими чистыми функциями `robotEquip.js`.
  + добавить `robot` в `partialize` (persist).
- **Шаг 2**: правило переносимого веса робота в `resolvers.calculateDerivedStats`
  (если персонаж — робот: суммировать грузоподъёмность конечностей/брони вместо STR-формулы).
- **Шаг 3**: `CharacterContext` → тонкий читатель робо-стора; экраны
  (`WeaponsAndArmorScreen`, `RobotSlot`, модалки) переключить на селекторы.

### Шаг 1 — срез robot в Zustand ✅ (сделано)
- Новый модуль `src/store/robotSlice.js`: `createInitialRobotState` + `createRobotActions`
  (initRobot, initRobotFromKit, loadRobotState, resetRobot, replaceLimb, equipHeldWeapon,
  unequipHeldWeapon, setRobotArmorLayer, addRobotModule, removeRobotModule) — тонкие обёртки
  над чистыми функциями `domain/robotEquip.js`.
- Селекторы: selectRobotSlots / selectRobotModules / selectRobotBodyPlan /
  selectRobotSlotKeysOrdered / selectRobotWeapons.
- Интегрировано в `characterStore.js`: initial state, actions, `persist.partialize` (robot).
- Тесты: `src/store/robotSlice.test.js` (7 шт). Полный прогон: **295/295**.

### Данные для Шага 2 (переносимый вес робота) — факты
- `carryWeight` есть ТОЛЬКО у `data/equipment/robot/robotbody.json`
  (например robot_body_mister_handy → 150). У рук/ног/головы поля нет.
- Брони/обшивки/рамы с `carryWeightModifier` в robotparts.json пока не обнаружено
  (возможно поле появится позже).
- Текущий `calculateCarryWeight` для всех считает STR×множитель + база trait + модификаторы.
  Для робота нужно правило БЕЗ STR. Ожидается формула от пользователя.

### Шаг 2 — переносимый вес робота ✅ (сделано)
Правило (подтверждено пользователем + данными):
```
если origin.isRobot:
  carryWeight = carryWeight_корпуса (слот body/chassis/thruster → limb.carryWeight)
              + сумма(carryWeightModifier по всем слоям брони)
  STR / перки / химия НЕ влияют
  фоллбэк базы: trait.carryWeightFixed (по умолч. 150)
```
Подтверждено данными: protectron body=225, assaultron body=150 → смена корпуса меняет вес.
- Новая чистая функция `calculateRobotCarryWeight(robotSlots, trait)` в `domain/characterCreation.js`.
- Ветвление в `resolvers.calculateDerivedStats` по `equipmentState.isRobot`.
- `characterStore.recalculateDerivedStats` теперь читает `_characterContext` и инжектит
  `isRobot` + `robot.slots` из стора.
- `CharacterContext` прокидывает `isRobot` (из `isRobotCharacter({origin,trait})`).
- Тесты: `src/store/robotCarryWeight.test.js` (7 шт, включая сценарий protectron→assaultron).

### Шаг 3 — Context как читатель, единый источник правды ✅ (сделано)
- `setEquippedRobotSlots` / `setEquippedRobotModules` в `CharacterContext` обёрнуты: они
  по-прежнему обновляют legacy useState (для buildSnapshot/БД), но ЗЕРКАЛЯТ запись в
  store-слайс через `loadRobotState`. Функциональные апдейты (prev=>next) сохранены.
- `loadCharacter` сначала сидит `bodyPlan` (через `resolveBodyPlan`) и слоты/модули в стор.
- `resetCharacter` зовёт `resetRobot()`.
- Новые read-only хуки: `useRobotSlots`, `useRobotModules`, `useRobotBodyPlan` — экраны
  читают робо-состояние из стора, не мутируя его.

Итог: **20 файлов / 302 теста — зелёные.** Робо-состояние теперь в Zustand (+persist),
вес считается от корпуса/брони, экраны могут читать через селекторы.

### Осталось (опционально, на будущее)
- Перевести 5 файлов-экранов/модалок (`ArmorLayerModal`, `LimbUpgradeModal`,
  `CharacterScreen`, `InventoryScreen`) с `setEquippedRobotSlots(prev=>...)` на прямые
  store-actions (`replaceLimb`, `setRobotArmorLayer`, `equipHeldWeapon`). Сейчас они
  работают через обёртку-мост (безопасно), но прямые actions убрали бы legacy useState.
- Лимит веса оружия для руки робота (поле в данных пока не заполнено; код
  `canEquipWeaponToSlot` готов через `maxHandelWeaponWeight`).
