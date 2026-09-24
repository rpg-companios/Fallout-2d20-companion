# Как устроено приложение — шпаргалка агента

> ЧИТАТЬ ПЕРЕД ЛЮБОЙ РАБОТОЙ ВНУТРИ ЭТИХ МЕХАНИЗМОВ. Здесь — только то, что
> проверено кодом (пути файлов точные). Цель: не пересматривать приложение
> заново в каждой сессии. Дополнять В ТОМ ЖЕ ПАТЧЕ, что и изменение механизма.

## Диалоги — единая точка (УРОК 363/364)

- **Единственный способ показа всплывающих окон** — `components/alerts/alertService.js`
  + `components/alerts/AlertHost.js` (монтируется один раз в App.js). Работает
  одинаково на вебе и нативе, любое число кнопок, Promise-ответ.
- `Alert.alert` из react-native **на Web — ПУСТАЯ ФУНКЦИЯ** (`alert() {}`):
  молчит без ошибок. Прямые вызовы Alert.alert в игровых окнах — дефект
  (см. тест inline-feedback-363).
- API: `showAlert(alertId, params)` — по каталогу `components/alerts/catalog.js`
  (kinds: info/confirm/choice; подписи кнопок — labelKey + scope экрана);
  `confirmAlert(alertId, params)` — да/нет; `showRawAlert({title, message, kind,
  buttons})` — текст вне каталога. У raw-кнопок формат Alert.alert
  `[{ text, onPress, style }]`, промис резолвится ИНДЕКСОМ кнопки; закрытие
  без выбора → null. У info «Ок» уже переведён общим словарём приложения.
- Домен диалоги НЕ зовёт (чистая логика): движок возвращает событие/код отказа,
  экран сопоставляет с записью каталога и показывает диалог.

## Крафт (323–357, 356)

- Пайплайн: экран (CraftingModal / кнопка «Создать» модалки оружия) →
  `modules/fallout/crafting/operations.js` (`craftRecipe`, `craftingPreview`,
  `craftBatch`, `settleCraftTime`) → движок `domain/craftingEngine.js`
  (`evaluateCraft`, `runCraft`) + `domain/d20Checks.js` (`resolveD20Check`).
- Порты движка (rollD20/rollCD/spend/grand) переопределяемы — тесты; экраны
  зовут без портов (настоящие кости). `craftBatch` = пачка попыток; отчёт —
  `buildCraftReport` (windowModel) → общий `CraftReportView` (обоих окон).
- Время (323): час всем, еда/напитки 20 мин; осложнение +30/+10 мин аддитивно;
  `deferTime` — окно спросит про 2 ОД (324: пул ОД 6, +1 за успех сверх
  сложности, всегда — закон 358).
- `zeroDifficulty` (356): опция runCraft/craftRecipe 'auto'|'roll'; сложность 0
  (снята навыком) → вопрос про бросок через AlertHost. Автопровал = осложнение
  без единого успеха (358; не «две двадцатки»).
- Потери при провале: настройки craftFailLoss* (consumables/gear группы).

## Моды (закон 343/344 + 359)

- Установка мода: мод-предмет получает `equipped: true` + `installedOn`
  (невидим в сумке — курсив это и есть установленный); снятие/замена возвращает;
  продали носитель — ушли оба (`releaseModsBoundTo`).
- Броня: `installArmorMod` (hostKey — ключ предмета). **Робо-оружие** (359):
  носитель — не предмет сумки, ключ синтетический
  `robotWeaponHostKey(слот, id)` = `robotSlot:слот:id`; стор-действие
  `installRobotWeaponMod`; уход оружия из слота (replaceLimb/unequipHeldWeapon)
  возвращает моды в сумку. Запись выбора — ветки плана
  `classifyModWritePlan` (storeItem/equippedWeapon/robotSlot) в
  WeaponsAndArmorScreen.handleApplyModification.
- Гейт «требовать мод в сумке» — настройка `modsRequireInventoryItem`
  (ВЫКЛ по 342); список модов НЕ фильтруется (350), кнопка «Создать» — 352–355
  (зелёная #22c55e, компактная справа; требования блоком).
- Отчёт о крафте в модалке (357): `CraftReportView` + `buildCraftReport`;
  отказ ДО проверки (перк/материалы) — короткий диалог AlertHost.

## Робо-слоты и сейвы (360)

- Правда о робо-оружии — слоты стора (`robot.slots`); `loadRobotState`
  разворачивает худые слоты сейва в полную форму (в памяти всегда полная —
  иначе ветки записи модов молча не срабатывают: им нужен `limb.builtinWeapons`).
- Робо-оружие НЕ живёт в `equippedWeapons` (загрузка вычищает призраков) —
  экран собирает карточки из слотов (`collectAttacks`).
- Худая/полная форма слотов — `domain/robotSlots.js` (`serializeSlot`/
  `deserializeSlot`); карта потоков — `docs/agents/data-flows.md`.

## Экспорт = сейв (361)

- `createCharacterExportPayload` (domain/characterTransfer.js) отдаёт тело
  записи БД БЕЗ обработки. Единственный владелец сжатия — `saveCharacter`
  (`slimSaveData` до записи). Импорт — `restoreSaveData` достраивает каталожное.
- Экспорт персонажа владельца = файл `format: 'rpg-companion-character'`;
  пример разбора — фикстура `__tests__/fixtures/assaultron-ghost-export.json`,
  приёмочный реплей — `robot-mod-load-replay-360`.

## Настройки/каталог/данные

- Каталог JSON = источник истины; модули сеттинга не знают движок, движок —
  не сеттинг; единая дверь `domain/registry.js` (SETTING). UI зовёт только
  стор-действия/операции.
- i18n: экраны держат свои словари (modules/fallout/i18n/<loc>/... + корневые
  i18n/<loc>/screens/...), t-функции по экранам; каталог оборудования —
  `i18n/equipmentCatalog.js` (по локали).
- Стор: zustand; новое действие = паспорт `src/store/characterActions.ts` +
  тест `action-passports` (иначе падает). `src/engine/items/weaponMods.ts` —
  движковый контракт модов.
- Версия: `public/version.json` (version = номер последнего патча; release
  трогает только владелец); «Что нового» — раз на релиз.

## Инфраструктура сессии

- Патчи: `patchs/N-имя.patch`, установка `./apply-patch.sh N`; один шаг =
  один патч; после каждого — полный `npx vitest run` + `tsc --noEmit`.
- Песочница: node_modules может исчезать → `npm ci` (tsc только локальный);
  `.git` может откатываться → `git fetch origin <branch> && git reset
  FETCH_HEAD`; e2e — worktree от предыдущего HEAD + apply --check + полный
  прогон + diff (лишним правом только сам файл патча).
