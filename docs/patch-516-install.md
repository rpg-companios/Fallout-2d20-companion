# Установка патча 516: серверная проверка ключа и возврат на карточки

> **Общее хранилище в две панели — патч 518. План: `docs/roadmap.md`, установка: `docs/patch-518-install.md`.**

> **Ворота между точками — патч 517. План: `docs/roadmap.md`, установка: `docs/patch-517-install.md`.**

Патч подготовлен от состояния **версии 515** (коммит `8f1eb0f`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–516
цепочкой.

> Владелец: «Продолжаем. И давай после создания точки, не открывать её сразу
> же. Возвращайся на экран карточек».

## Что изменилось

### 1. Решение о доступе — на сервере

Новый `server/keyAccess.js` (чистое правило, без сети):

| Состояние | Условие | Поведение |
| --- | --- | --- |
| `none` | требования нет | обычный доступ |
| `open-by-key` | запись есть на общем складе | мини-игра не запускается, точка открыта |
| `denied` | обязательный ключ не найден | отказ `KEY_REQUIRED` |
| `needs-check` | необязательный ключ не найден, проверка не пройдена | отказ `KEY_REQUIRED` |
| `open` | привязанный терминал взломан | доступ открыт без ключа |

Проверка идёт по идентификатору записи на складе; текст описания записки не
разбирается. Клиент не решает, открыта точка или нет.

### 2. Где применяется

- `server/lootTradeSession.js` — поля требования в сессии и узлах локации,
  `applyKeyAccessToSession`, отказ `KEY_REQUIRED` при взятии добычи и торговле.
- `server/roomRegistry.js` — пересчёт при выдаче точки, выдаче терминала,
  появлении ключа, восстановлении снимка хранилища, взломе терминала и
  действиях игрока. Терминал с найденным ключом получает выигранное состояние
  без доски, попыток и уведомления Мастеру.
- `server/roomServer.js` — свежие состояния сессии и терминалов рассылаются
  всем в комнате после каждого пересчёта.
- `server/terminalHacking.js`, `domain/lootTrade.js`, клиент `LootTradeScreen` —
  требование доезжает до сервера и в одиночном терминале, и в узлах локации.
- `KEY_REQUIRED` добавлен в `server/protocol.js` и `src/room/roomProtocol.ts`.
- `findCompleted` больше не шлёт Мастеру «Терминал взломан» для точек,
  открытых ключом; в интерфейсе игрока появились пометки «Открыт ключом» и
  понятный текст отказа.

### 3. Возврат на экран карточек

Из `handleSaveContainerForm` убран переход в детальный экран только что
сохранённой точки. Привязка к локациям по-прежнему записывается, карточка
сразу видна на сетке.

## Файлы

| Файл | Изменение |
| --- | --- |
| `server/keyAccess.js` | новое чистое правило доступа |
| `server/lootTradeSession.js`, `server/roomRegistry.js`, `server/roomServer.js` | проверка и рассылка |
| `server/terminalHacking.js`, `server/protocol.js` | конфигурация и код ошибки |
| `domain/lootTrade.js`, `components/screens/LootTradeScreen/LootTradeScreen.js` | поля в выданных точках, возврат на сетку |
| `components/lootTrade/PlayerLootTradeOverlay.js`, `TerminalHackingModal.js`, `terminalAccess.js`, `terminalRetryPrompt.js` | пометки и отказы |
| `src/room/roomProtocol.ts` | зеркало `KEY_REQUIRED` |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | парные подписи |
| `__tests__/room/key-access-516.test.js` | 9 приёмочных проверок |
| `docs/roadmap.md`, `docs/key-items-and-gates-design.md`, `docs/changelog.*.md` | план и RU/EN описание |
| `public/version.json`, `patchs/baseline.json` | версия 516, 82/82 заметок |
| `patchs/516-server-key-access.patch` | сам патч для установщика |

## Установка

С действующей версии 515:

```bash
./apply-patch.sh 516
# ✓ Установлен патч: №516 (версия 515 → 516)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 516
```

`patchs/baseline.json` в источнике равен `516`. После установки
`public/version.json` → `516`; закоммитьте изменения, **перезапустите сервис
Node.js** (серверный код менялся) и пересоберите веб-сборку.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/key-access-516.test.js
npx vitest run __tests__/room/terminal-gm-retry-504.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "516"'
```

Тесты покрывают все пять состояний доступа, отказ по обязательному ключу,
открытие после находки, ожидание привязанного терминала, «доступ разрешён» без
мини-игры и без уведомления Мастеру, зеркало протокола, парные словари и
возврат на экран карточек.

### Прямой `git apply` без установщика

```bash
git apply patchs/516-server-key-access.patch
cp /path/to/516-server-key-access.patch patchs/
```
