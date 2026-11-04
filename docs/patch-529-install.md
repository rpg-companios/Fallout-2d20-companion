# Установка патча 529: закон снимка на всё пространство Мастера

Патч подготовлен от состояния **версии 528** (коммит `0e0132e`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–529
цепочкой. Файл установки: `patchs/529-gm-snapshot-law.patch`.

> **Слово владельца:** «снапшот юзера не трогаем, если надо что-то изменить у
> пользователя — посылаем команду, которую исполнит клиент. По нему должно
> работать всё пространство мастера. Снапшот нужен для наблюдением за
> изменением состояния пользователя без вмешательства даже между сессиями».

Канон закона — `docs/gm-snapshot-law.md`; он обязателен для всех следующих
патчей, включая оставшиеся пункты тезиса 13.

## Что изменено

### 1. Снимок больше не редактируется сервером

- `server/roomRegistry.js`: удалена **последняя** серверная правка листа —
  эффект журнала «Программиста» (`usedMagazineEffects`, `terminalHacking`).
  Вместо неё `terminalAction()` возвращает `digestCommand`. Теперь во всех
  `server/*.js` ровно одна запись `lastSnapshots.set(...)` — внутри
  `putSnapshot` (обычный `char.publish` клиента).
- Сервер не поднимает ревизию листа, не чистит и не дописывает эффекты.
  `room.lastSnapshots` живёт на комнате, а не на сессии: `room.state` отдаёт
  листы игроков, когда ни одна сессия не открыта, и `openSession` /
  `closeSession` / «Покинуть локацию» их не очищают. Удалить запись может
  только сам клиент (`removed` / `snapshot: null`).

### 2. Единый кадр команды для всего пространства Мастера

- `server/protocol.js`, `src/room/roomProtocol.ts`: `CHAR_COMMAND`
  (`char.command`). `CHAR_SPEND` 528 остаётся совместимым алиасом на приёме.
- `server/roomServer.js`: `sendCharacterCommand()` шлёт пару
  `char.command { commandId, characterId, kind, payload }` → `char.refresh
  { commandId, spendId?, characterId }`. Порядок кадров WebSocket
  гарантирован; при `room.join` неподтверждённые команды повторяются из
  `registry.pendingCommandsForClient()`.
- `server/roomRegistry.js`: `registerCharacterCommand()` (универсальный
  `kind` + `payload`), `pendingCommandsForClient()`, `pendingCommands` в
  `room.state`. `registerPinSpend()` и `pendingSpendsForClient()` сохранены как
  алиасы 528. `putSnapshot()` снимает команды после публикации свежего листа.
- `src/room/roomStore.ts`: подписка `onRoomCharSpend` принимает и
  `char.command`.

### 3. Исполнители команд на клиенте

- `components/gm/charCommands.js` (новый): `CHAR_COMMAND_KIND` — жёсткий белый
  список `item.spend` / `magazine.use`; `normalizeCharacterCommand()` сводит
  `char.command` и legacy `char.spend` к одному виду; `applyCharacterCommand()`
  исполняет изменение **штатными средствами**:
  - `item.spend` → `spendItemStacks` через `spendBobbyPins(..., publish:false)`;
  - `magazine.use` → `markMagazineEffectUsed` + обычный `saveCharacter()`.
- `components/lootTrade/CharSpendCommandHost.js`: обобщён на любой `kind`,
  дедуплицирует `commandId` (память + AsyncStorage), вторая команда явно
  ждёт первую, затем публикует лист штатным
  `pushSavedCharacterToBoundRoomIfAny()`. Монтирован в `App.js` поверх всех
  экранов.
- `components/lootTrade/TerminalHackingModal.js`: локальная ветка `useDigest`
  оставлена как идемпотентный резерв для сервера 528 (без `char.command`).
  `components/lootTrade/spendBobbyPins.js`: уточнён комментарий 527.

## Что сохранено

- Состояние, которым владеет Мастер (`activeSession`, `terminalStates`,
  `accessEvents`, `partyStorage`, `directives`, ключи, `pinLedger`), остаётся
  серверным каноном: закон касается листа игрока.
- Защита сервера: лимиты сообщений, роли/владелец/членство, валидация JSON,
  целые положительные количества, атомарность переносов — без послаблений.
- Законы 520–528: PER/Удача/LOCKPICK, четыре попытки терминала, сколько угодно
  явных подходов, запрет авторестарта после ACCESS GRANTED, «Да/Нет» Мастера
  только для терминала, `shouldBlockLock()`, светлая гамма 525, канон
  «Заколка», стрелки и подсказка 527, пауза перед сбросом красного 528.

## Проверки

- `npm run typecheck`, `npm run build`, `npm test` (полный набор: 258 файлов,
  2334 теста).
- `git apply --check patchs/529-gm-snapshot-law.patch` от дерева 528.
- `./apply-patch.sh 529` от версии 528 и полная цепочка 493–529 от чистого
  `main` `a62ec71`; побайтовое сравнение установленных деревьев.
- Приёмочные тесты: `__tests__/room/gm-snapshot-law-529.test.js` — канон
  закона, зеркало протокола, **статический страж** «одна запись lastSnapshots
  и только в putSnapshot», отсутствие `published.revision + 1`, снимки при
  закрытых сессиях и после `openSession`/`closeSession`, удаление записи
  только клиентом, белый список `kind`, дедупликация команд. Тесты
  `__tests__/room/char-spend-commands-528.test.js` обновлены под единый кадр.
- Живой сервер комнат: `/version.json` = 529/4/109+109 и WS-проба с парой
  `char.command` → `char.refresh`, неизменённым снимком сервера до публикации
  и обновлённым листом после `char.publish`.
- После установки на боевой площадке перезапустить процесс сервера комнат,
  чтобы подхватить обновлённые файлы `server/`.
