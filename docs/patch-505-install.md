# Установка патча 505: успешный взлом больше не пропадает

> **Одноразовый доступ к терминалу, уведомление Мастеру и «Покинуть локацию» — в `docs/patch-506-install.md`.**

Патч подготовлен от состояния **версии 504** (коммит `c4a3510`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–505
цепочкой.

## Что изменилось

Владелец тестировал игру **в одном браузере в двух вкладках**: «Нашёл
комбинацию 5/7, выбираю следующее слово. Доска сбросилась и всё надо заново.
Я не понял я взломал, не взломал, почему сброс? У мастера никаких
уведомлений».

Воспроизведение по WebSocket подтвердило три отдельные проблемы:

1. Следующее слово оказалось **паролем** — сервер вернул `status: won` и
   `ACCESS GRANTED`, то есть игрок **взломал** терминал.
2. В 504 уведомление Мастеру было привязано только к `awaitingRetry`
   (все попытки исчерпаны). Состояние `won` приходило Мастеру как обычное
   `terminal.state`, без единого сообщения в интерфейсе.
3. Эффект автозапуска в `TerminalHackingModal` пропускал только `playing` и
   `pendingDigest`. На смену статуса на `won` он отправлял лишний
   `terminal.action: start`. Пока `clientId` совпадал с оператором, сервер
   отвечал `TERMINAL_ALREADY_ACTIVE`. Но при другом `clientId` (вторая
   вкладка, переподключение, повторная публикация листа) включалась механика
   передачи хода из патча 503: `entry.game = null` → **новая доска
   `rev=1, playing, attempts=4`**. Победа стиралась быстрее, чем игрок успевал
   её прочитать. Проверено на живой комнате:

   ```
   GUESS GOSLING: status=won result=ACCESS GRANTED
   start (тот же клиент)      → TERMINAL_ALREADY_ACTIVE
   start (второе соединение)  → rev=1 status=playing attempts=4   ← баг
   ```

### 1. Победа — финальное состояние

`server/terminalHacking.js` и `server/roomRegistry.js`:

- `applyGameAction()` при `action: 'start'` и `status: 'won'` возвращает
  `TERMINAL_ALREADY_ACTIVE` **для любого оператора** (раньше отказ действовал
  только для того же);
- реестр комнат отклоняет `start` после `won` **до** блока `switchingOperator`,
  поэтому ни переподключение вкладки, ни «Взломать» от другого персонажа не
  обнуляют доску;
- `guess` и `bracket` в этом состоянии по-прежнему отклоняются с
  `TERMINAL_NOT_ACTIVE`;
- новую партию после успеха можно начать **только** явной повторной
  трансляцией Мастера: `reissue`, повторная выдача терминала или локации.
  `reissue` обнуляет `game`, следующий `start` собирает свежую доску.

### 2. Окно взлома не шлёт лишний `start`

Новый чистый модуль `components/lootTrade/terminalAutoStart.js`:

- `shouldAutoStart()` запрещает запуск в финальных состояниях `won`,
  `awaitingRetry`, `closed`, а также при `isClosed` / `awaitingGm`, без
  выбранного персонажа и без комнаты;
- передача хода по кнопке «Взломать» (`boardOfAnotherOperator`) в активной
  партии сохранена;
- `autoStartKey()` различает статус доски и оператора, поэтому один `start`
  приходится ровно на одно открытие окна;
- штатный отказ `TERMINAL_ALREADY_ACTIVE` больше не показывает игроку алерт
  «Не удалось выполнить действие терминала».

Правило вынесено из React-компонента, чтобы покрывать его юнит-тестами без
`react-native` (в 504 импорт компонента в тест ломался на Flow-синтаксисе).

### 3. Мастер узнаёт об успехе

`components/lootTrade/terminalRetryPrompt.js` получил `findCompleted()`: он
отбирает `won` только в комнатах с `role: 'gm'`, исключает закрытые карточки и
даёт ключ `won:<code>|<container>|<revision>` — он не конфликтует с ключом
вопроса «Разрешить повторный взлом?».

`TerminalRetryPromptHost.js` (смонтирован один раз в `App.js`) теперь ставит в
общую очередь оба типа событий и показывает их **через `AlertHost`** вызовом
`showRawAlert`:

- провал — вопрос с кнопками «Да» / «Нет» и отправкой `retry` (как в 504);
- успех — уведомление **«Терминал взломан»** с именем терминала и оператора,
  без какого-либо действия на сервер.

Диалоги по-прежнему идут по очереди: `AlertHost` держит один запрос, поэтому
несколько терминалов не перезаписывают друг друга. В живой панели карточки
терминала на экране «Добыча/Торговля» добавлено состояние **«Взломан»** и
кнопка **«Транслировать заново»**.

### 4. Подсказки не пропадают

Раньше панель «ВЗЛОМ ПРОВАЛЕН» полностью заменяла доску: найденная
комбинация `5/7` исчезала, и игрок не понимал, что случилось. Теперь история
подсказок — общий блок `guessesPanel` — рисуется и на экране провала, и на
экране успеха, и в активной партии. На экране успеха добавлена подпись о том,
что новую партию начинает только повторная трансляция Мастера.

Парные RU/EN подписи: `terminal.hackedTitle`, `terminal.hackedMessage`,
`terminal.wonHint`, `terminal.stateWon`. Механика 504 не тронута: вопрос
«Разрешить повторный взлом?» задаётся **только** при провале.

## Файлы

| Файл | Изменение |
| --- | --- |
| `server/terminalHacking.js` | `start` после `won` → `TERMINAL_ALREADY_ACTIVE` у любого оператора |
| `server/roomRegistry.js` | запрет takeover после победы до блока `switchingOperator` |
| `components/lootTrade/terminalAutoStart.js` | новый чистый модуль правила автозапуска |
| `components/lootTrade/TerminalHackingModal.js` | новый guard, общий блок подсказок, без ложного алерта |
| `components/lootTrade/terminalRetryPrompt.js` | `findCompleted()` для событий успеха |
| `components/lootTrade/TerminalRetryPromptHost.js` | очередь вопросов и уведомлений Мастеру |
| `components/screens/LootTradeScreen/LootTradeScreen.js` | состояние «Взломан» + повторная трансляция |
| `i18n/ru-RU/screens/lootTrade/screen.json`, `i18n/en-EN/...` | парные подписи |
| `__tests__/room/terminal-win-505.test.js` | 9 приёмочных проверок |
| `__tests__/room/room-server.integration.test.js` | WS-сценарий с двумя вкладками |
| `public/version.json`, `patchs/baseline.json` | версия 505, 56/56 заметок |
| `docs/changelog.*.md`, `docs/guides/admin-and-loot-trade.*.md` | RU/EN описание |
| `patchs/505-terminal-win-notice.patch` | сам патч для установщика |

## Установка

С действующей версии 504:

```bash
./apply-patch.sh 505
# ✓ Установлен патч: №505 (версия 504 → 505)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 505
```

`patchs/baseline.json` в источнике равен `505`. После установки
`public/version.json` → `505`; закоммитьте изменения, **перезапустите сервис
Node.js** (состояние партий живёт на сервере) и пересоберите веб-сборку.
Партии, начатые до обновления, запустите заново.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/terminal-win-505.test.js
npx vitest run __tests__/room/room-server.integration.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "505"'
```

Приёмочный тест `__tests__/room/terminal-win-505.test.js` покрывает: чистое
правило автозапуска, ключ дедупликации, отказ движка на `start` после победы
для трёх операторов, неизменность ревизии и результата в реестре, `reissue`
как единственный путь к новой партии, запрет `guess`/`bracket` после `won`,
отбор `findCompleted` и независимость ключей провала и успеха. WS-тест
воспроизводит две вкладки одного браузера: победа приходит Мастеру, `start`
второй вкладки отклоняется, после `reissue` собирается свежая доска.

### Прямой `git apply` без установщика

```bash
git apply patchs/505-terminal-win-notice.patch
cp /path/to/505-terminal-win-notice.patch patchs/
```
