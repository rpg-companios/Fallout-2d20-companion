# Установка патча 510: ключи и записки на общем складе (шаг 2)

> **Серверная проверка ключа и возврат на карточки — патч 516. План: `docs/roadmap.md`, установка: `docs/patch-516-install.md`.**

> **Чекбокс «Обязателен» и описание в конце формы — патч 515. План: `docs/roadmap.md`, установка: `docs/patch-515-install.md`.**

> **Поля и требования в карточках — патч 514. Живой план: `docs/roadmap.md`, установка: `docs/patch-514-install.md`.**

> **Правила ключей и требований доступа уточнены (только документ) — `docs/key-items-and-gates-design.md`, установка: `docs/patch-513-install.md`.**

> **Модалки берут каркас у соседних окон — правила: `docs/ui-modals-rules.md`, установка: `docs/patch-512-install.md`.**

> **Ключи как карточки на сетке (уточнение интерфейса 510) — см. `docs/patch-511-install.md`.**

Патч подготовлен от состояния **версии 509** (коммит `6b16651`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–510
цепочкой.

Это **шаг 2** дизайна `docs/key-items-and-gates-design.md`. Шаги 3–5
(проверка ключа контейнером, ворота, мини-игра замков) сюда не входят.
Счётчик на плашке и лог операций владелец отверг: «Предметы есть на складе
или нет. Игроки сами возятся ними и могут смотреть, что есть, чего нет» — их
нет и не планируется.

## Что изменилось

### 1. Справочник ключевых записей Мастера

- Новая таблица `gm_key_items (id, name, description, room_code, ...)`;
  `saveGmKeyItem`, `getGmKeyItems`, `getGmKeyItemById` в обоих адаптерах БД.
- `components/lootTrade/KeyItemCatalogModal.js` открывается кнопкой с иконкой
  ключа в шапке «Добыча/Торговля» (`testID="key-catalog-button"`). Имя
  обязательно, описание можно оставить пустым.
- Редактор вставляет уже существующие теги `**жирный**`, `*курсив*`,
  список `- `, `{CD}`, `{CAP}` и показывает предпросмотр через
  `renderTextWithIcons`. Никакого второго формата разметки и HTML в сейвах.

### 2. Появление на складе

- Новое сообщение `storage.addKey` и код `STORAGE_KEY_READ_ONLY` в обоих
  протоколах. Кнопка «Выдать на склад» отправляет запись; разрешено только
  Мастеру и только когда он в сети.
- Если в контейнере добычи лежала запись с `keyItemId` / `keyDescription`,
  `normalizeSessionItem` сохраняет эти поля, а `lootTake` кладёт ключ **на
  общий склад**, а не в личный инвентарь забравшего игрока. После взятия всем
  рассылается свежий `storage.state`.
- Дубликат записи с тем же `keyItemId` не создаётся.

### 3. Запись остаётся общей

Запись склада вида `kind: 'keyItem'` хранит `keyItemId`, имя и текст описания
**в самой себе** — последующие правки справочника Мастера не «гасят» уже
добытый ключ. `withdraw` для неё отклоняется `STORAGE_KEY_READ_ONLY`.

В `PartyStorageModal` ключи идут отдельным списком: по нажатию открывается
карточка с отформатированным текстом и подписью, что запись остаётся общей.
Кнопки «Забрать» у ключей нет. Экспорт/импорт снимка хранилища сохраняет
`kind`, `keyItemId` и `description`, поэтому ключи переезжают на новый сервер
вместе с остальными вещами.

## Файлы

| Файл | Изменение |
| --- | --- |
| `components/lootTrade/KeyItemCatalogModal.js` | новый редактор справочника с предпросмотром |
| `components/lootTrade/PartyStorageModal.js` | отдельный список ключей и карточка |
| `components/screens/LootTradeScreen/LootTradeScreen.js` | кнопка справочника в шапке |
| `db/schema.js`, `db/Database.js`, `db/Database.web.js` | `gm_key_items` и функции |
| `server/protocol.js`, `src/room/roomProtocol.ts` | `STORAGE_ADD_KEY`, `STORAGE_KEY_READ_ONLY` |
| `server/lootTradeSession.js` | `keyItemId` / `keyDescription` в предмете добычи |
| `server/roomRegistry.js` | `addKeyItemToStorage`, `appendKeyItem`, ключ из добычи, запрет `withdraw` |
| `server/roomServer.js` | обработчик `storage.addKey`, рассылка после взятия ключа |
| `src/room/roomStore.ts` | `addKeyItemToStorage` |
| `domain/partyStorageTransfer.js` | ключи в снимке хранилища |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | парные подписи справочника и карточки |
| `__tests__/room/key-items-510.test.js` | 7 приёмочных проверок |
| `docs/key-items-and-gates-design.md` | шаг 2 отмечен реализованным |
| `public/version.json`, `patchs/baseline.json` | версия 510, 76/76 заметок |
| `docs/changelog.*.md`, `docs/guides/admin-and-loot-trade.*.md` | RU/EN описание |
| `patchs/510-key-items.patch` | сам патч для установщика |

## Установка

С действующей версии 509:

```bash
./apply-patch.sh 510
# ✓ Установлен патч: №510 (версия 509 → 510)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 510
```

`patchs/baseline.json` в источнике равен `510`. После установки
`public/version.json` → `510`; закоммитьте изменения, **перезапустите сервис
Node.js** и пересоберите веб-сборку.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/key-items-510.test.js
npx vitest run __tests__/lootTrade/party-storage-modal-507.test.js
npx vitest run __tests__/room/room-server.integration.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "510"'
```

Тесты покрывают: выдачу ключа Мастером, запрет `withdraw`, запрет выдачи
игроком и без Мастера, защиту от дубликатов, попадание ключа из контейнера
добычи на общий склад, перенос ключей в снимке, зеркало протокола, справочник,
редактор с предпросмотром и парность словарей.

### Прямой `git apply` без установщика

```bash
git apply patchs/510-key-items.patch
cp /path/to/510-key-items.patch patchs/
```
