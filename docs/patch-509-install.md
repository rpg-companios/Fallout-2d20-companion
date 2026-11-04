# Установка патча 509: мультиплатформенный сейв и перенос хранилища через JSON

> **Мини-игра взлома замков и «ИЛИ» — патч 520. План: `docs/roadmap.md`, установка: `docs/patch-520-install.md`.**

> **Терминал как замок сундука — патч 519. План: `docs/roadmap.md`, установка: `docs/patch-519-install.md`.**

> **Общее хранилище в две панели — патч 518. План: `docs/roadmap.md`, установка: `docs/patch-518-install.md`.**

> **Ворота между точками — патч 517. План: `docs/roadmap.md`, установка: `docs/patch-517-install.md`.**

> **Серверная проверка ключа и возврат на карточки — патч 516. План: `docs/roadmap.md`, установка: `docs/patch-516-install.md`.**

> **Чекбокс «Обязателен» и описание в конце формы — патч 515. План: `docs/roadmap.md`, установка: `docs/patch-515-install.md`.**

> **Поля и требования в карточках — патч 514. Живой план: `docs/roadmap.md`, установка: `docs/patch-514-install.md`.**

> **Правила ключей и требований доступа уточнены (только документ) — `docs/key-items-and-gates-design.md`, установка: `docs/patch-513-install.md`.**

> **Модалки берут каркас у соседних окон — правила: `docs/ui-modals-rules.md`, установка: `docs/patch-512-install.md`.**

> **Ключи как карточки на сетке (уточнение интерфейса 510) — см. `docs/patch-511-install.md`.**

> **Ключи и записки на складе (шаг 2) — см. `docs/patch-510-install.md`.**

Патч подготовлен от состояния **версии 508** (коммит `24711e7`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–509
цепочкой.

Владелец: «Да сейв нужен мультиплатформенный. И ещё надо чтобы, что мастер,
что игрок могли экспортировать общее хранилище в json ... если вдруг мастер
перестанет вести игру или игроки поменяют мастера ... в общее хранилище можно
было сделать импорт того, что было в снапшоте через json. Поскольку при
отключении от сервера, то содержимое общего хранилища удаляется. А так пришли
в новый сервер и мастер наполнил хранилище одним действием».

## Что изменилось

### 1. Сейв приезжает с другого устройства

В 508 выгрузка снимка в Drive Мастера была односторонней. Теперь
`syncRoomStoragesInSession` в `components/cloudSync/googleDriveSync.js`
работает в обе стороны:

- сканирует папку `gm_containers` на файлы с префиксом `storage__`, читает
  `type: 'gm_room_storage'` / `type: 'party_storage'` и сохраняет снимки в
  локальную БД (`gm_room_storage`);
- выгружает локальные снимки, которых в облаке ещё нет;
- при расхождении спрашивает подтверждение через общий `confirmDownload`.

Функция вызывается из `syncAllCharactersWithCloud` рядом с синхронизацией
комнат, контейнеров и плиток. Добавлен `getAllRoomStorages` в обоих адаптерах
БД (`db/Database.js`, `db/Database.web.js`). Так сейв Мастера доступен на
другом устройстве и платформе, а `restoreMasterStorage` из 508 поднимет его в
комнату при подключении.

### 2. Экспорт / импорт JSON у обеих ролей

Новый чистый модуль `domain/partyStorageTransfer.js`:

- `createStorageExportPayload` — конверт `{ formatVersion, type:
  'party_storage', code, exportedBy, exportedAt, storage }`;
- `parseStorageImportPayload` — валидация, нормализация записей, умеет читать
  и «голый» снимок `{ revision, entries }`;
- `storageExportFileName` — безопасное имя `storage__<код>__<дата>.json`.

Файлы пишутся и читаются через существующий кросс-платформенный
`src/utils/characterFileTransfer.js`: Web Share API, `browser-fs-access` и
`<a download>` на вебе; `expo-document-picker` + `expo-sharing` в нативном
приложении. Никакого нового файлового кода.

В окне «Общее хранилище» (`components/lootTrade/PartyStorageModal.js`)
появились кнопки **«Экспорт в JSON»** и **«Импорт из JSON»**. Окно теперь
находит комнату и у Мастера, и у игрока — экспорт доступен обоим.

- **Импорт Мастера:** снимок сохраняется в его локальную БД и сразу
  отправляется `storage.restore` в комнату. На новом сервере хранилище
  наполняется **одним действием**.
- **Импорт игрока:** снимок сохраняется на устройстве под кодом текущей
  комнаты; когда игрок станет Мастером, `restoreMasterStorage` поднимет его.
  В алерте есть понятная подсказка.

### 3. Почему это нужно

Состояние склада **эфемерно**: сервер держит его в памяти и при отключении /
смене сервера оно исчезает. JSON-файл и сейв в Drive Мастера — два способа
восстановить его без какого-либо хранилища на хостинге. Парные RU/EN подписи
добавлены в `i18n/*/screens/inventory/screen.json`.

## Файлы

| Файл | Изменение |
| --- | --- |
| `domain/partyStorageTransfer.js` | новый чистый формат JSON и валидация |
| `components/cloudSync/googleDriveSync.js` | `syncRoomStoragesInSession`, загрузка из Drive |
| `db/Database.js`, `db/Database.web.js` | `getAllRoomStorages` |
| `components/lootTrade/PartyStorageModal.js` | кнопки экспорта/импорта, окно для Мастера |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | парные подписи переноса |
| `__tests__/room/party-storage-transfer-509.test.js` | 7 проверок формата и переноса |
| `__tests__/lootTrade/party-storage-modal-507.test.js` | заглушки файлового IO |
| `docs/key-items-and-gates-design.md` | статус: мультиплатформенный сейв реализован |
| `public/version.json`, `patchs/baseline.json` | версия 509, 72/72 заметок |
| `docs/changelog.*.md`, `docs/guides/admin-and-loot-trade.*.md` | RU/EN описание |
| `patchs/509-storage-json-handover.patch` | сам патч для установщика |

## Установка

С действующей версии 508:

```bash
./apply-patch.sh 509
# ✓ Установлен патч: №509 (версия 508 → 509)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 509
```

`patchs/baseline.json` в источнике равен `509`. После установки
`public/version.json` → `509`; закоммитьте изменения, перезапустите сервис
Node.js и пересоберите веб-сборку.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/party-storage-transfer-509.test.js
npx vitest run __tests__/lootTrade/party-storage-modal-507.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "509"'
```

Тесты покрывают: конверт экспорта, импорт конверта и «голого» снимка, отказ
битых файлов, безопасное имя файла, сценарий «новый Мастер наполнил новый
сервер одним импортом» (свежий реестр → `storage.restore` → подключившийся
игрок видит вещи), двустороннюю синхронизацию Drive, доступность кнопок обеим
ролям и парность словарей.

### Прямой `git apply` без установщика

```bash
git apply patchs/509-storage-json-handover.patch
cp /path/to/509-storage-json-handover.patch patchs/
```
