# Установка патча 520: взлом замков и «ИЛИ» между проверками

Патч подготовлен от состояния **версии 519** (коммит `98a91f8`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–520
цепочкой.

> Владелец: «Взлом замков можно назвать самостоятельно и он как и прочие
> эффекты может жить внутри локации или отдельно и может выступать преградой
> для другой локации/сундука/торговца. Взлом и терминал не могут одновременно
> блокировать локацию, если они указаны в требованиях сундука/торговца/локации,
> то считать эти требования как "или". Или терминал или взлом. В ui это можно
> показать, как 2 строчки: 1я "Терминал ур.3" или 2я "Замок ур.5"».

## Что добавлено

### 1. Пятый вид точки

`kind: 'lock'` перестал быть зарезервированным именем: отдельная плитка
создания на сетке «Добыча / Торговля» (иконка замка), форма по образцу
терминала со сложностью **1…5**, самостоятельная выдача в комнату,
перетаскивание в локацию стрелкой и роль преграды для локации, сундука или
торговца. Уровень **0** в форме недоступен — он приходит только понижением от
журналов/перков (`mag_tumblers_today_02`, явное
`lockPicking.difficultyReduction`), как `hackerRank` у терминала.

### 2. Две строки ворот через «ИЛИ»

Вторая строка требования теперь хранит **до двух** источников:
`linkedCheckIds` (старое `linkedCheckId` осталось первым для совместимости с
карточками 516–519). `server/keyAccess.js` открывает точку, если **любой**
источник дал событие `hacked`; терминал и замок вместе точку не блокируют.
В форме, на карточке, в связях локации у Мастера и у запертой точки у игрока
это две строки «Терминал ур.3» / «Замок ур.5» с «или» между ними и своими
кнопками «Смотреть» / «Взломать». Оба источника скрыты у игроков по правилу
пача 519.

### 3. Мини-игра

- `server/lockPicking.js` — чистое ядро: `N = 12 − PER + 2·D` ячеек
  (PER 4…10, D 0…5, два ряда при `N > 8`), случайная комбинация из четырёх
  стрелок, позиционное угадывание, красный `?` без подсказки при провале.
- Одна отмычка `item_bobby_pin` в руке выдерживает `S` провалов,
  `S` = ранг `LOCKPICK` 0…6; Удача 4…10 даёт `0.05 + 0.025·(LCK−4)` шанс
  уцелеть в момент поломки. При поломке комбинация та же, угаданные стрелки
  остаются видимыми серыми.
- Секретная комбинация **не уходит клиенту**; потраченные отмычки ведутся
  счётчиком комнаты `pinLedger` по персонажу, чтобы новый замок не «находил»
  их заново. Списания в БД персонажа нет — счётчик живёт в памяти комнаты.
- Замки используют общий с терминалами реестр состояний: оператор, один взлом
  на `accessId`, «Да/Нет» Мастера при «Отмычки закончились», общий журнал
  `accessEvents`. Победа любого источника снимает `locked` с сундука.
- `components/lootTrade/LockPickingModal.js` — окно со строкой
  «Отмычки: n шт», ячейками и крестовиной стрелок. Каркас вынесен в
  `terminalHackingStyles.js` и переиспользуется обеими мини-играми по правилу
  `docs/ui-modals-rules.md`.

## Файлы

| Файл | Изменение |
| --- | --- |
| `server/lockPicking.js` | новое ядро: ячейки, отмычки, удача, маркер узла |
| `server/keyAccess.js`, `server/lootTradeSession.js` | `linkedCheckIds`, «ИЛИ», скрытие обоих источников |
| `server/roomRegistry.js`, `server/roomServer.js` | замки в общем реестре, `pinLedger`, `capabilities.lockPicking` |
| `server/terminalHacking.js`, `server/protocol.js`, `src/room/roomProtocol.ts` | `kind`/`linkedCheckIds` в конфиге, `LOCK_*` коды, скрытие `secret` |
| `domain/lootTrade.js` | `CONTAINER_KIND.LOCK`, `normalizeLinkedCheckIds`, маркер замка, вложенные точки |
| `components/lootTrade/LockPickingModal.js`, `terminalHackingStyles.js`, `lockPickingConstants.js` | окно мини-игры и общий каркас |
| `components/lootTrade/PlayerLootTradeOverlay.js` | две строки вариантов, выбор модалки по типу |
| `components/screens/LootTradeScreen/LootTradeScreen.js`, `modals/*` | плитка замка, форма, выдача, drag, связи локации |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | парные подписи `lock.*`, `form.*`, `card.*` |
| `__tests__/room/lock-picking-520.test.js` | 26 приёмочных проверок |
| `docs/roadmap.md`, `docs/lockpicking-mini-game-design.md`, `docs/key-items-and-gates-design.md`, `docs/changelog.*.md` | план, спецификация и RU/EN описание |
| `public/version.json`, `patchs/baseline.json` | версия 520, 86/86 заметок |
| `patchs/520-lock-picking.patch` | сам патч для установщика |

## Установка

С действующей версии 519:

```bash
./apply-patch.sh 520
# ✓ Установлен патч: №520 (версия 519 → 520)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 520
```

`patchs/baseline.json` в источнике равен `520`. После установки
`public/version.json` → `520`; закоммитьте изменения, **перезапустите сервис
Node.js** (менялся серверный код) и пересоберите веб-сборку.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/lock-picking-520.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "520"'
```

### Прямой `git apply` без установщика

```bash
git apply patchs/520-lock-picking.patch
cp /path/to/520-lock-picking.patch patchs/
```
