# Установка патча 507: «Общее хранилище» комнаты (шаг 1)

Патч подготовлен от состояния **версии 506** (коммит `f087e98`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–507
цепочкой.

Это **первый шаг** последовательного внедрения дизайна
`docs/key-items-and-gates-design.md`. Ключевые записи, `requires`, ворота и
мини-игра взлома замков в этот патч **не входят**.

## Что изменилось

Владелец предложил общий контейнер для группы: «Нашла группа пулемёт, а
отдать надо другому игроку, которого сегодня нет. Они скидывают предмет в
общее хранилище и когда человек придёт он его оттуда достанет ... игроки
метагеймингово объясняют это как багажник машины или брамин с грузом».
Затем уточнил: «хранилище лучше на сервере. Подключился — получил
обновления», «то, что принадлежит игрокам — это их», «Имя настраивать не
надо. Это просто "общее хранилище"».

### 1. Канон на сервере, переживает рестарт

- Новый модуль `server/partyStorageStore.js` читает и атомарно пишет
  `.data/party-storage.json` (служебный файл, добавлен в `.gitignore`).
- `createRoomRegistry()` принимает необязательный `partyStorageStore`: при
  создании комнаты подтягивает сохранённое состояние, при каждом изменении
  пишет весь набор обратно. `server/start.js` передаёт файловый store;
  тестовый `createRoomServer()` работает без него, в памяти.
- `roomSnapshot` теперь включает `partyStorage`, поэтому склад приходит
  клиенту **вместе с состоянием комнаты** при `room.join` и
  переподключении — ровно «подключился, получил обновления». Дополнительного
  запроса нет.

### 2. Положить / забрать атомарно

Новые сообщения протокола (`server/protocol.js` и зеркало
`src/room/roomProtocol.ts`): `storage.state`, `storage.deposit`,
`storage.withdraw`. Коды ошибок: `STORAGE_BAD_MESSAGE`,
`STORAGE_ENTRY_NOT_FOUND`, `STORAGE_FORBIDDEN`.

- Запись склада: `entryId`, `item` (самодостаточный снимок предмета), `name`,
  `itemType`, `quantity`, `depositedBy`, `depositedByName`, `at`.
- `deposit` проверяет объект и количество (1–999), создаёт запись, увеличивает
  `revision`, сохраняет файл и рассылает свежий снимок всем участникам.
- `withdraw` атомарно уменьшает количество или удаляет запись; запросившему
  возвращается `withdrawn` (что именно положить в личный инвентарь), остальным
  — только новый снимок. Двое не могут забрать одну и ту же вещь.
- **Собственность партии:** `withdraw` разрешён только участникам с ролью
  `player`. Мастер может положить вещь, но не может забрать уже добытое
  игроками. Операций отзыва и удаления чужого нет — при ошибке Мастер создаёт
  новую запись, а не изымает старую.

### 3. Интерфейс

- `components/lootTrade/PartyStorageModal.js` — окно склада: слева предметы
  персонажа («Положить»), справа общие («Забрать»). Локальный инвентарь
  меняется **только после успешного ответа сервера**: списание через
  `adjustItemQuantity`, добавление через `handleAddItem(..., 'storage')`
  (без бонусов «находки»).
- В `InventoryScreen.renderFooter()` под двумя зелёными ячейками `addActionCell`
  («Добавить добычу» / «Купить предметы») добавлена **такая же зелёная область
  во всю ширину** — `styles.sharedStorageCell` с надписью
  «Общее хранилище» (`testID="shared-storage-button"`).
- Парные RU/EN подписи в `i18n/*/screens/inventory/screen.json`. Названия не
  настраиваются: в модалке нет переименования, в словарях нет поля имени.

### 4. Клиентский стор

`src/room/roomStore.ts`: поле `partyStorage` в состоянии комнаты, обработка
`storage.state`, методы `depositToPartyStorage` и `withdrawFromPartyStorage`.
Broadcast от других игроков обновляет ту же комнату, поэтому все вкладки видят
один и тот же склад.

## Файлы

| Файл | Изменение |
| --- | --- |
| `server/partyStorageStore.js` | новый: файловый канон склада |
| `server/roomRegistry.js` | состояние комнаты, `deposit`/`withdraw`, `roomSnapshot`, персистентность |
| `server/roomServer.js` | обработчики `storage.deposit` / `storage.withdraw`, рассылка |
| `server/start.js` | подключение файлового store |
| `server/protocol.js`, `src/room/roomProtocol.ts` | сообщения и коды ошибок |
| `src/room/roomStore.ts` | `partyStorage`, обработка состояния, методы |
| `components/lootTrade/PartyStorageModal.js` | новое окно склада |
| `components/screens/InventoryScreen/InventoryScreen.js` | зелёная плашка и модалка |
| `styles/InventoryScreen.styles.js` | `sharedStorageCell`, `sharedStorageLabel` |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | парные подписи |
| `.gitignore` | `.data/` |
| `__tests__/room/party-storage-507.test.js` | 8 проверок домена, персистентности, протокола и UI |
| `__tests__/lootTrade/party-storage-modal-507.test.js` | 2 рендер-проверки окна |
| `__tests__/room/room-server.integration.test.js` | WS-сценарий склада |
| `public/version.json`, `patchs/baseline.json` | версия 507, 64/64 заметок |
| `docs/changelog.*.md`, `docs/guides/admin-and-loot-trade.*.md` | RU/EN описание |
| `docs/key-items-and-gates-design.md` | статус: шаг 1 внедрён |
| `patchs/507-shared-storage.patch` | сам патч для установщика |

## Установка

С действующей версии 506:

```bash
./apply-patch.sh 507
# ✓ Установлен патч: №507 (версия 506 → 507)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 507
```

`patchs/baseline.json` в источнике равен `507`. После установки
`public/version.json` → `507`; закоммитьте изменения, **перезапустите сервис
Node.js** (новые обработчики и файловый канон живут на сервере) и пересоберите
веб-сборку. Сервер создаст `.data/party-storage.json` при первом изменении
склада; удалять его при обновлении не нужно.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/party-storage-507.test.js
npx vitest run __tests__/lootTrade/party-storage-modal-507.test.js
npx vitest run __tests__/room/room-server.integration.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "507"'
```

Приёмочные тесты покрывают: атомарное изменение количества и ревизию, запрет
`withdraw` для Мастера, валидацию данных, восстановление склада после
«рестарта» из файла, зеркало протокола, фиксированное название, зелёную
плашку, обновление стора из `storage.state` и исключение `.data/` из git.
WS-тест проверяет, что склад уже приходит в `room.state` при подключении,
изменения рассылаются второму игроку, а Мастер получает
`STORAGE_FORBIDDEN`.

### Прямой `git apply` без установщика

```bash
git apply patchs/507-shared-storage.patch
cp /path/to/507-shared-storage.patch patchs/
```
