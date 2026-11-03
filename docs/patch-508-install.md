# Установка патча 508: хранилище Мастера + снапшот игрокам

> **Правила ключей и требований доступа уточнены (только документ) — `docs/key-items-and-gates-design.md`, установка: `docs/patch-513-install.md`.**

> **Модалки берут каркас у соседних окон — правила: `docs/ui-modals-rules.md`, установка: `docs/patch-512-install.md`.**

> **Ключи как карточки на сетке (уточнение интерфейса 510) — см. `docs/patch-511-install.md`.**

> **Ключи и записки на складе (шаг 2) — см. `docs/patch-510-install.md`.**

> **Мультиплатформенный сейв и JSON-перенос хранилища — см. `docs/patch-509-install.md`.**

Патч подготовлен от состояния **версии 507** (коммит `10e176f`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–508
цепочкой.

Это **исправление слоя хранения** «Общего хранилища» из 507. Протокол,
атомарные операции, запрет `withdraw` Мастеру, зелёная плашка и модалка из
507 сохраняются.

## Что было не так

В 507 сервер писал общий файл `.data/party-storage.json` на хостинге. При
множестве пользователей приложения это один файл на процесс со складами всех
комнат всех людей; при нескольких инстансах состояние рассогласуется, при
переносе сервера — пропадёт, а приватности у такой схемы нет. Владелец
отверг её и упростил модель:

> «Общее хранилище это хранилище мастера + снапшот игрокам. Без мастера
> онлайн они не могут взять предметы из общего хранилища, но могут смотреть.
> Когда игрок подключается к комнате, то происходит обновление хранилища на
> текущее состояние. Все изменения происходят пока игрок и мастер в сети».

Никаких офлайн-коммитов, очередей, `baseRevision`, конфликтов и алертов о
расхождении.

## Что изменилось

### 1. Сервер ничего не пишет на диск

- Удалён `server/partyStorageStore.js`, убраны `.data/` из `.gitignore`,
  параметр `partyStorageStore` из `createRoomRegistry()` и wiring в
  `server/start.js`.
- `room.partyStorage` живёт **в памяти комнаты** рядом с `activeSession` и
  `terminalStates`. `roomSnapshot` отдаёт его вместе с `room.state`, поэтому
  подключившийся игрок сразу получает актуальный снимок.
- В снимок добавлено поле `gmOnline`: есть ли владелец комнаты в сети.

### 2. Канон — хранилище Мастера

- Новая таблица `gm_room_storage (code, data, updated_at)` в `db/schema.js`;
  `saveRoomStorage` / `getRoomStorage` в обоих адаптерах БД.
- `src/lootTrade/partyStoragePersistence.js` слушает `storage.state`, и
  **только на устройстве Мастера** сохраняет снимок в локальную БД и фоном
  выгружает в его Google Drive (`type: 'gm_room_storage'`) через новый
  `syncRoomStorageToCloudIfEnabled` — тем же путём, что контейнеры добычи.
- `onRoomStorageState` добавлен в `src/room/roomStore.ts`; подписка
  запускается в `App.js` рядом с `startGmSessionPersistence()`.
- Двусторонняя загрузка склада из Drive пока не делается: восстановление идёт
  из локальной БД Мастера, выгрузка в облако уже работает.

### 3. Восстановление при подключении

- Новое сообщение `storage.restore` и код `STORAGE_GM_OFFLINE` в обоих
  протоколах.
- `restorePartyStorage` в реестре принимает снимок **только от владельца**
  (по `ownerToken`), не откатывает комнату более старой ревизией и рассылает
  свежий `storage.state` всем.
- При подключении Мастера `App.js` вызывает `restoreMasterStorage(code)`;
  игрок при подключении получает уже восстановленное состояние обычным
  `room.state`.

### 4. Только онлайн

- `deposit` / `withdraw` отклоняются с `STORAGE_GM_OFFLINE`, если Мастер не в
  комнате. Список вещей при этом **виден** — снимок с `gmOnline: false`.
- `PartyStorageModal` блокирует кнопки «Положить» / «Забрать» и показывает
  «Мастер не в сети — хранилище доступно только для просмотра» (парные
  RU/EN подписи `screen.storage.readOnly`).
- Все изменения происходят, пока и Мастер, и игрок в сети; офлайн-правок нет,
  поэтому конфликтовать нечему.

## Файлы

| Файл | Изменение |
| --- | --- |
| `server/partyStorageStore.js` | **удалён** |
| `server/roomRegistry.js` | снимок в памяти, `gmOnline`, `storageSnapshot`, `restorePartyStorage` |
| `server/start.js` | убран файловый store |
| `server/roomServer.js` | обработчик `storage.restore` |
| `server/protocol.js`, `src/room/roomProtocol.ts` | `STORAGE_RESTORE`, `STORAGE_GM_OFFLINE` |
| `src/room/roomStore.ts` | `onRoomStorageState`, `restorePartyStorage`, `gmOnline` в типе |
| `db/schema.js`, `db/Database.js`, `db/Database.web.js` | `gm_room_storage`, save/get |
| `src/lootTrade/partyStoragePersistence.js` | новый: сейв Мастера + Drive |
| `components/cloudSync/googleDriveSync.js` | `syncRoomStorageToCloudIfEnabled` |
| `components/lootTrade/PartyStorageModal.js` | режим только чтения без Мастера |
| `App.js` | запуск сохранения и восстановления |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | `screen.storage.readOnly` |
| `.gitignore` | убрана `.data/` |
| `__tests__/room/party-storage-507.test.js` | тесты новой модели |
| `__tests__/room/room-server.integration.test.js` | WS: restore, снимок, offline |
| `docs/key-items-and-gates-design.md` | финальная модель (Обновление 5) |
| `public/version.json`, `patchs/baseline.json` | версия 508, 68/68 заметок |
| `docs/changelog.*.md`, `docs/guides/admin-and-loot-trade.*.md` | RU/EN описание |
| `patchs/508-master-storage.patch` | сам патч для установщика |

## Установка

С действующей версии 507:

```bash
./apply-patch.sh 508
# ✓ Установлен патч: №508 (версия 507 → 508)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 508
```

`patchs/baseline.json` в источнике равен `508`. После установки
`public/version.json` → `508`; закоммитьте изменения и **перезапустите сервис
Node.js**. Файл `.data/party-storage.json`, если он успел появиться от 507,
можно удалить — он больше не используется и не хранится в git.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/party-storage-507.test.js
npx vitest run __tests__/lootTrade/party-storage-modal-507.test.js
npx vitest run __tests__/room/room-server.integration.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "508"'
```

Тесты покрывают: атомарность и ревизию, «только чтение» без Мастера,
`storage.restore` только от владельца и без отката, получение снимка при
подключении, отсутствие серверного файла и `.data/`, локальную БД и Drive
Мастера, зеркало протокола и подпись «Мастер не в сети». WS-тест проверяет
поднятие сейва Мастера, рассылку снимка игроку и `STORAGE_GM_OFFLINE` после
ухода ведущего.

### Прямой `git apply` без установщика

```bash
git apply patchs/508-master-storage.patch
cp /path/to/508-master-storage.patch patchs/
```
