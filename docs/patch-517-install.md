# Установка патча 517: ворота между точками

> **Терминал как замок сундука — патч 519. План: `docs/roadmap.md`, установка: `docs/patch-519-install.md`.**

> **Общее хранилище в две панели — патч 518. План: `docs/roadmap.md`, установка: `docs/patch-518-install.md`.**

Патч подготовлен от состояния **версии 516** (коммит `d84aa70`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–517
цепочкой.

> Вопросов к владельцу перед патчем не было: контракт ворот уже зафиксирован
в разделах 3.3–3.4 и 8 `docs/key-items-and-gates-design.md`, а открытая
развилка про «вторую строку» оставлена как есть.

## Что изменилось

### 1. Нейтральное событие на комнате

`server/roomRegistry.js` — `room.accessEvents: Map<containerId, event>`.
Событие `hacked` дают: взлом терминала (`game.status === 'won'`), открытие
точки ключом, открытие по привязанной проверке и ручное решение Мастера
(снятие блокировки узла локации). Запись идемпотентна.

`server/keyAccess.js` — `isCheckPassed` теперь смотрит и на журнал событий, и
на состояния терминалов. Ворота работают **даже без требования ключа**: нет
ключа и нет события → `needs-check`, событие есть → `open`.

### 2. Цепочки ворот

`refreshKeyAccess` повторяет пересчёт до четырёх раз: если A открыла B, а B —
источник для C, вся цепочка раскрывается. Ограничение защищает от циклов.

### 3. Протокол и клиент

- `ACCESS_STATE: 'access.state'` в `server/protocol.js` и
  `src/room/roomProtocol.ts`; события входят в `room.state` при подключении и
  рассылаются всем участникам при каждом пересчёте доступа.
- `src/room/roomStore.ts` хранит `accessEvents` в состоянии комнаты.

### 4. Интерфейс Мастера

- Вторая строка формы «Ворота: событие другой точки» выбирает из **всех**
  точек (локации, контейнеры, торговцы, терминалы), а не только терминалов;
  себя в качестве источника выбрать нельзя.
- На карточке точки — строка «После: <имя точки>» с пометкой «ворота
  пройдены / закрыты».
- В локации — раздел «Ворота между точками» со списком связей и их состоянием.
- Парные RU/EN подписи, включая обновлённую подсказку второй строки.

## Файлы

| Файл | Изменение |
| --- | --- |
| `server/keyAccess.js` | ворота без ключа, журнал событий как источник |
| `server/roomRegistry.js` | `accessEvents`, запись событий, цепочки, `getAccessEvents` |
| `server/roomServer.js`, `server/protocol.js` | рассылка `access.state` |
| `src/room/roomProtocol.ts`, `src/room/roomStore.ts` | зеркало и состояние клиента |
| `components/screens/LootTradeScreen/modals/ContainerFormModal.js` | подпись источника |
| `components/screens/LootTradeScreen/LootTradeScreen.js`, `i18n/*` | все точки как источники, бейджи, раздел ворот |
| `__tests__/room/container-gates-517.test.js` | 11 приёмочных проверок |
| `docs/roadmap.md`, `docs/key-items-and-gates-design.md`, `docs/changelog.*.md` | план и RU/EN описание |
| `public/version.json`, `patchs/baseline.json` | версия 517, 83/83 заметок |
| `patchs/517-container-gates.patch` | сам патч для установщика |

## Установка

С действующей версии 516:

```bash
./apply-patch.sh 517
# ✓ Установлен патч: №517 (версия 516 → 517)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 517
```

`patchs/baseline.json` в источнике равен `517`. После установки
`public/version.json` → `517`; закоммитьте изменения, **перезапустите сервис
Node.js** (серверный код менялся) и пересоберите веб-сборку.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/container-gates-517.test.js
npx vitest run __tests__/room/key-access-516.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "517"'
```

Тесты покрывают ворота без ключа, равенство источников события, общий журнал
комнаты, раскрытие цепочки A → B, взлом терминала как источник,
идентификацию событий, протокол, отображение связей и парность словарей.

### Прямой `git apply` без установщика

```bash
git apply patchs/517-container-gates.patch
cp /path/to/517-container-gates.patch patchs/
```
