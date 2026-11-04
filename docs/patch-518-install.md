# Установка патча 518: общее хранилище в две панели

> **Мини-игра взлома замков и «ИЛИ» — патч 520. План: `docs/roadmap.md`, установка: `docs/patch-520-install.md`.**

> **Терминал как замок сундука — патч 519. План: `docs/roadmap.md`, установка: `docs/patch-519-install.md`.**

Патч подготовлен от состояния **версии 517** (коммит `d343346`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–518
цепочкой.

> Тезис 10 плана закрыт по развёрнутому описанию владельца; вопросов перед
> патчем не осталось. Полная цитата — `docs/roadmap.md`.

## Мастер

- **Отдельная карточка** «Общее хранилище» на сетке «Добыча / Торговля»
  (`StorageCardCell`, те же стили карточек, что у контейнеров и ключей).
- Окно показывает список вещей **как в инвентаре, но без кнопок действий и
  без параметров**: только название и количество.
- Единственное доступное действие со складом — **трансляция ключей**: каталог
  созданных записей с кнопкой «Выдать на склад». Уже выданные ключи читаются
  отдельным списком.
- **Запрет вносить и забирать вещи** теперь на сервере: и старое сообщение
  `storage.deposit`, и новый `storage.transfer` для Мастера возвращают
  `STORAGE_FORBIDDEN`.

## Игрок

- Кнопка в инвентаре (была с патча 507) открывает **двупанельное окно по
  дизайну торговца**: слева личный инвентарь, справа общий склад.
- Цен, наценок, крышек, веса и настроек нет. Каркас строк, буфера и кнопки
  подтверждения импортируется из `PlayerLootTradeOverlay`
  (`tradeOverlayStyles`) — правило `docs/ui-modals-rules.md` соблюдено.
- **Буфер**: нажатие на строку лишь добавляет предмет в отложенный список;
  клик по строке буфера возвращает его. Пока не нажата «Перенести», сервер и
  локальный инвентарь не меняются.
- **«Перенести»** отправляет один атомарный запрос `storage.transfer` со всеми
  поступлениями и списаниями. Если любая строка некорректна, не применяется
  ничего. Локальный инвентарь обновляется только после ответа сервера.
- Ключи по-прежнему нельзя забрать; экспорт/импорт снимка сохранён.

## Файлы

| Файл | Изменение |
| --- | --- |
| `server/protocol.js`, `src/room/roomProtocol.ts` | `STORAGE_TRANSFER` |
| `server/roomRegistry.js` | `transferPartyStorage`, запрет `deposit` для Мастера |
| `server/roomServer.js`, `src/room/roomStore.ts` | обработчик и действие стора |
| `components/lootTrade/PartyStorageModal.js` | GM-режим и двупанельный буфер |
| `components/lootTrade/PlayerLootTradeOverlay.js` | экспорт `tradeOverlayStyles` |
| `components/lootTrade/StorageCardCell.js` | новая карточка Мастера |
| `components/screens/LootTradeScreen/LootTradeScreen.js`, `i18n/*` | карточка на сетке, парные подписи |
| `__tests__/room/storage-two-panel-518.test.js` | 15 приёмочных проверок |
| `docs/roadmap.md`, `docs/key-items-and-gates-design.md`, `docs/changelog.*.md` | план и RU/EN описание |
| `public/version.json`, `patchs/baseline.json` | версия 518, 84/84 заметок |
| `patchs/518-storage-two-panel.patch` | сам патч для установщика |

## Установка

С действующей версии 517:

```bash
./apply-patch.sh 518
# ✓ Установлен патч: №518 (версия 517 → 518)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 518
```

`patchs/baseline.json` в источнике равен `518`. После установки
`public/version.json` → `518`; закоммитьте изменения, **перезапустите сервис
Node.js** (серверный код менялся) и пересоберите веб-сборку.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/storage-two-panel-518.test.js
npx vitest run __tests__/room/key-items-510.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "518"'
```

Тесты покрывают запрет Мастера вносить/забирать, трансляцию ключей, отложенность
буфера, атомарность переноса, откат всей операции при некорректной строке,
запрет забирать ключи, зеркало протокола, импорт каркаса торговца, отсутствие
цен и парность словарей.

### Прямой `git apply` без установщика

```bash
git apply patchs/518-storage-two-panel.patch
cp /path/to/518-storage-two-panel.patch patchs/
```
