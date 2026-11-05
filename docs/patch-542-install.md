# Установка патча 542: выдача хаба целиком и окно игрока

Патч подготовлен от состояния **версии 541**. Файл установки:
`patchs/542-hub-player-window.patch`.

> Владелец: «Выдача Ниптона с вложенными локациями/терминалом/замком падает
> с “добавьте в локацию хотя бы один контейнер или торговца” — это баг»;
> верхний уровень хаба — любые прямые элементы, вложенные точки не видны до
> входа; вход в локацию с преградой сначала показывает замок/терминал, после
> прохождения — содержимое; замок отдельно НЕ выдаётся
> (`lock_never_standalone`); «Назад» возвращает только в локацию, через
> которую пришёл; `exitLocationId` — вход в другую локацию, возврат по
> истории входа.

## Что меняется

| Файл | Что сделано |
| --- | --- |
| `server/locationGraph.js` | `buildGraphFromSession(rootId, nodes)` — граф сессии по `links` + `parentLocationId`; очередь с `viaExit`, `exits`, `exitOnly` в `flattenForSession` (узел, достигнутый обычным входом, сбрасывает `exitOnly`) |
| `domain/lootTrade.js` | `makeSessionNode` несёт `accessExpression`/`exitLocationId`; `buildLocationSessionNodes` ставит `exitOnly` и прячет check-источники (замки и привязанные терминалы) у игроков |
| `server/lootTradeSession.js` | `exitLocationId`/`exitOnly` в узле и сессии; скрытие замков и referenced-терминалов; корень-преграда (`needs-check`/`denied`) отдаёт `nodes: []`; `applySessionUpdate` принимает `requiredKeyItemId`/`keyRequirement`/`linkedCheckIds`/`accessExpression`/`exitLocationId` корня |
| `components/screens/LootTradeScreen/LootTradeScreen.js` | выдача хаба и живое обновление передают `accessExpression`/`exitLocationId`/`nodeDifficulty`; отдельная выдача замка убрана из интерфейса (плитка создания и серверный API остались), fallback-выдача — только терминал |
| `components/lootTrade/PlayerLootTradeOverlay.js` | gate-first: вход в запертую локацию сначала показывает проверки (без двойного шага в стек и без авто-закрытия по победе); список корня/точки фильтрует `exitOnly`/`hiddenForPlayers`/строки замков; кнопка «Выход → …» пушит цель в историю; «Назад» — `pop` истории; сброс истории при смене сессии; отдельно выданный замок не открывает окно игрока; заголовок/описание текущей локации |
| `src/room/roomStore.ts` | тип `updateRoomSessionRates` расширен полями `requiredKeyItemId`/`keyRequirement`/`linkedCheckIds`/`linkedCheckId`/`accessExpression`/`exitLocationId` |
| `i18n/{ru-RU,en-EN}/screens/lootTrade/screen.json` | новые парные ключи `player.exitToLocation` («Выход → {name}») и `player.gateAnd` («и» / «and») |
| `__tests__/room/hub-player-window-542.test.js` | новый приёмочный тест: фильтры верхнего уровня, gate-first, назад/выход, контракт файлов |
| `__tests__/lootTrade/hack-outcome-530.test.js`, `__tests__/lootTrade/player-lock-overlay-524.test.js`, `__tests__/lootTrade/standalone-direct-525.test.js` | исторические фикстуры перенацелены на модель 542: замок — часть локации/сундука, отдельной точкой не является |
| `docs/roadmap.md`, `docs/changelog.*.md`, `public/version.json`, `patchs/baseline.json` | версия/отсечка 542, тезис 33, «Осталось после патча 542» |

## Границы

- Плитка создания замка, конструктор И/ИЛИ и серверный `issueTerminal(kind:lock)`
  (внутренний API, используют сборки 516–535) сохранены — убрана только
  выдача замка игроку как отдельной точки.
- Закон снимка 529, адресный взлом 523, общая доска/журнал 535 и семантика
  530 не менялись.
- `apply-patch.sh` смотрит на ту же ветку доставки
  `arena/aa289f1c-fallout-2d20-companion`.

## Установка через консоль

Из корня репозитория приложения: сначала заменить `apply-patch.sh` свежей
версией из ветки доставки, затем поставить патч 542.

```bash
git fetch --no-tags origin arena/aa289f1c-fallout-2d20-companion
git show FETCH_HEAD:apply-patch.sh > apply-patch.sh
chmod +x apply-patch.sh
./apply-patch.sh 542
```

## Проверки

- `npm run typecheck`: успешно.
- `npm test`: зелёные, кроме восьми заранее известных падений
  `__tests__/room/terminal-hacking-balance-496.test.js` — они падают теми же
  ошибками и на чистом дереве 541, патч 542 их не трогает.
- `git apply --check` вперёд от дерева 541 и в обратную сторону от 542.

## Откат

`git apply -R patchs/542-hub-player-window.patch` вернёт граф, окно игрока,
словари и версию к состоянию 541.
