# Установка патча 495: словарь, ИНТ/Наука/Удача, «О приложении»

> **Общее хранилище в две панели — патч 518. План: `docs/roadmap.md`, установка: `docs/patch-518-install.md`.**

> **Ворота между точками — патч 517. План: `docs/roadmap.md`, установка: `docs/patch-517-install.md`.**

> **Серверная проверка ключа и возврат на карточки — патч 516. План: `docs/roadmap.md`, установка: `docs/patch-516-install.md`.**

> **Чекбокс «Обязателен» и описание в конце формы — патч 515. План: `docs/roadmap.md`, установка: `docs/patch-515-install.md`.**

> **Поля и требования в карточках — патч 514. Живой план: `docs/roadmap.md`, установка: `docs/patch-514-install.md`.**

> **Правила ключей и требований доступа уточнены (только документ) — `docs/key-items-and-gates-design.md`, установка: `docs/patch-513-install.md`.**

> **Модалки берут каркас у соседних окон — правила: `docs/ui-modals-rules.md`, установка: `docs/patch-512-install.md`.**

> **Ключи как карточки на сетке (уточнение интерфейса 510) — см. `docs/patch-511-install.md`.**

Патч подготовлен от состояния **версии 494** (коммит `a572b16`, ветка
`arena/054e6676-fallout-2d20-companion`). Он применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — тогда установщик подтянет
патчи 493, 494 и 495 цепочкой.

## Через `apply-patch.sh` (основной способ)

Если у вас уже установлен патч 493 или 494 из ветки
`arena/054e6676-fallout-2d20-companion`:

```bash
./apply-patch.sh 495
```

`apply-patch.sh` указывает на нужную ветку, поэтому `sed` больше не нужен.

Если вы всё ещё на `a62ec71` со старым установщиком
(`arena/c1c60b87-fallout-2d20-companion`), один раз переключите источник:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 495
```

`./apply-patch.sh --status` до установки может написать «Всё актуально»:
ориентируйтесь на `public/version.json` и явно указывайте номер патча.
`patchs/baseline.json` в ветке-источнике равен `495`, поэтому при установке
точно до отсечки дерево приводится к коммиту патча целиком, а каталог
`patchs/` синхронизируется (файл `patchs/495-terminal-words-and-balance.patch`
появится и локально).

После установки:

- `public/version.json` → `495`, `patchs/baseline.json` → `495`;
- закоммитьте изменения (`git add -A && git commit -m "Патч 495"`);
- **перезапустите сервис Node.js** (`server/`): обновлённый сервер комнат
  хранит буфер слов последних досок и синхронизирует новую доску для всей
  группы. Без перезапуска мини-игра по-прежнему откроется модалкой и будет
  играбельна локально, но без общего буфера повторов.

## Без `apply-patch.sh`

Патч — обычный `git`-дифф от коммита версии 494:

```bash
git apply --check --whitespace=nowarn patchs/495-terminal-words-and-balance.patch
git apply --whitespace=nowarn patchs/495-terminal-words-and-balance.patch
```

Патч не может содержать сам себя, поэтому при «голом» `git apply` файл
`patchs/495-terminal-words-and-balance.patch` не появится автоматически —
скопируйте его в `patchs/` вручную (иначе предохранитель
`__tests__/patches/baseline-cutoff.test.js` не найдёт файл с номером 495).
Через `apply-patch.sh` каталог `patchs/` синхронизируется сам.

## Что входит

| Область | Изменение |
|---|---|
| Словарь | `server/terminalWords/*.json` — шесть файлов по длине, 12 308 слов; `scripts/build-terminal-words.mjs`, исходники и лицензии в `scripts/terminal-words/` |
| Движок | `server/terminalHacking.js`: «пароль → пустышки», база 20 слов, ИНТ/Наука/Удача, `+1` попытка, режим `d=0` без подчёркивания |
| Сервер | `server/roomRegistry.js`: буфер слов последних трёх досок (`excludeWords`) |
| UI | удалена строка «Слов: N · подсказка ≤ K/M · ИНТ+Наука S/16»; окно «О приложении» с дисклеймером, AGPL и дословными уведомлениями UKACD / ESDB |
| i18n | RU/EN: подсказки формы терминала, новые ключи `about.*` |
| Документы | changelog, гайды Мастера, `docs/terminal-words.md`, `docs/terminal-hacking-balance-proposal.md`, `scripts/terminal-words/LICENSES.md` |
| Тесты | `__tests__/room/terminal-hacking-balance-495.test.js`, `__tests__/screens/about-app-495.test.js`, `__tests__/room/terminal-words.test.js`, обновлённый `__tests__/room/terminal-hacking.test.js` |

## Что проверить после установки

```bash
cat public/version.json | grep version        # 495
cat patchs/baseline.json                     # {"baseline":"495"}
node -e "const e=require('./server/terminalHacking'); console.log(e.passwordWordCount(5,4), e.passwordWordCount(5,10), e.recoveryChancePercent(4))"
# 20 12 10
npm run typecheck && npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
```

В приложении: «О приложении» → дисклеймер, AGPL и два дословных уведомления;
окно взлома → без служебной строки, на сложности 0 — семейки анаграмм и
пароль-выброс.

## Лицензии и коммерческое использование

Словарь собран из EOWL/UKACD и ESDB/SCOWL — оба источника разрешают
коммерческое использование при сохранении уведомления. Частотный список
Google (`google-10000-english`), у которого есть некоммерческая оговорка LDC,
из сборки исключён. Дословные тексты лежат в
`scripts/terminal-words/LICENSES.md` и выведены в окне «О приложении» —
это выполняет требование UKACD «prominently displayed». Код движка — AGPL,
игровые данные подготовлены фанатами.
