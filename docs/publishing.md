# Публикация в целевые репозитории

Правки сначала делаются в этом checkout. Потом два shell-скрипта раскладывают их
по целевым репозиториям: движок — в `rpg-companios/ttrpg-engine`, сеттинг — в
`rpg-companios/positronium-game-settings`.

## Быстрый запуск (Replit)

```sh
git switch arena/0b69018a-fallout-2d20-companion

export GH_TOKEN=...        # токен с правом записи в оба репозитория
./scripts/publish-engine.sh
./scripts/publish-setting.sh
```

Токен можно положить в Replit → Tools → Secrets под именем `GH_TOKEN`
(скрипты также понимают `GITHUB_TOKEN` и `PUBLISH_GITHUB_TOKEN`).

## Что делает каждый скрипт

**`scripts/publish-engine.sh`** — собирает дерево движка и пушит его в
`ttrpg-engine`:

- копирует всё, кроме `modules/`, `__tests__/`, `patchs/`, `artifacts/`,
  `сеттинги/`, рабочих файлов чекаута, скриптов публикации и готовых архивов;
- в движке нет тестов: наборы проверяют механику сеттинга и требуют папки
  `modules/`, поэтому остаются в совмещённом репозитории;
- коммит подписывается `PUBLISH_GIT_NAME`/`PUBLISH_GIT_EMAIL`
  (по умолчанию «Positronium publish»);
- `--dry-run` — показать изменения, ничего не отправляя;
- `--patch` — сохранить `.publish/patches/engine.patch`;
- `--message "..."` — своё сообщение коммита;
- `--release` — дополнительно выпустить GitHub Release `engine-v<версия>`
  (версия из `app.json`) с описанием из `release-notes/engine.md`;
- `--asset <файл>` — приложить к релизу APK/AAB (флаг можно повторять;
  `--asset` сам включает `--release`).

**`scripts/publish-setting.sh`** — собирает репозиторий сеттингов и выпускает
релиз:

- `modules/fallout/` → папка `fallout/` в корне (папка = сеттинг);
- `tools/` — `pack-setting.py`, `unpack-setting.py`, `build-setting-runtime.mjs`;
- `LICENSE`, `NOTICE` — лицензия относится к инструментам;
- README репозитория;
- `release-notes/fallout.md` — заметки о релизах (см. ниже);
- собирает `fallout.trpg` (20 МБ) упаковщиком этого репозитория;
- пишет `release.json` (версия, `requiresCore`, размер, sha256, тег, ссылки);
- создаёт GitHub-релиз с тегом `fallout-v<версия>` и загружает в него `.trpg`
  через REST API (или `gh`, если токена нет, а `gh` авторизован);
- `--dry-run` — показать изменения;
- `--no-release` — только запушить дерево, без нового релиза и без пересборки `.trpg`;
- `--bump minor|major` — шаг версии (по умолчанию `patch`);
- `--version 1.2.0` — задать номер вручную (должен быть выше опубликованного);
- `--no-prune-legacy` — не убирать старые целочисленные теги (`fallout-v1`);
- `--patch`, `--message` — как у движка.

Оба скрипта идемпотентны: повторный запуск без изменений ничего не коммитит.

## Релизы движка

APK публикация не собирает — его собирает EAS (`npm run apk`) или локальный
Gradle (`npm run apk:local`). Публикация прикладывает готовый файл к релизу:

```sh
npm run apk                                   # получить APK (ссылка от EAS)
./scripts/publish-engine.sh --release --asset ~/Downloads/positronium-1.0.0.apk
```

Что создаётся: тег `engine-v<версия>` (версия — `expo.version` в `app.json`,
она же `ENGINE_VERSION` в `src/engine/version.js`), GitHub Release
«Positronium <версия>» с текстом из верхней секции `release-notes/engine.md`
и приложенным APK. Если номер секции не совпадает с версией, публикация
остановится до копирования дерева.

**APK обязателен.** Публикация сама называет его `positronium.apk` (имя файла
на диске не важно) и пишет в корень репозитория `app-release.json` — по нему
приложение узнаёт о новой версии. Без APK релиз не выпускается: обновляться
игрокам было бы не на что.

Постоянные адреса (не меняются от релиза к релизу, их можно давать людям):

- страница всех версий — <https://github.com/rpg-companios/ttrpg-engine/releases>;
- последний APK — <https://github.com/rpg-companios/ttrpg-engine/releases/latest/download/positronium.apk>;
- индекс обновлений — <https://raw.githubusercontent.com/rpg-companios/ttrpg-engine/main/app-release.json>.

`app-release.json` пишет только релиз (версия, тег, имя ассета, размер, sha256,
заметки). Обычный `publish-engine.sh` без `--release` файл не трогает: то, что
уже лежит в репозитории, сохраняется как есть, поэтому push не откатывает
индекс обновлений.

```json
{
  "schemaVersion": 1,
  "version": "1.1.0",
  "tag": "engine-v1.1.0",
  "repository": "rpg-companios/ttrpg-engine",
  "asset": "positronium.apk",
  "bytes": 20123456,
  "sha256": "…",
  "downloadUrl": "https://github.com/rpg-companios/ttrpg-engine/releases/latest/download/positronium.apk",
  "pageUrl": "https://github.com/rpg-companios/ttrpg-engine/releases",
  "notes": { "ru-RU": ["Что изменилось для игрока"] }
}
```

Второй канал доставки — OTA (`expo-updates`): правки JS доезжают до уже
установленных APK без новой сборки. Только нативные изменения (новый модуль,
разрешение, иконка) требуют `npm run apk`; OTA-обновление не меняет
`versionCode` и не показывается в окне обновления.

```sh
npm run ota -- --message "Исправления интерфейса"   # канал preview
npx eas-cli update --channel production --message "..."  # канал production
```

Первый APK с `expo-updates` — база OTA; на сборки, выпущенные до его установки,
обновления не приезжают.

## Версии и заметки о релизах

Номер релиза — семантический: `MAJOR.MINOR.PATCH`. Он живёт в
`modules/fallout/manifest.json`, и публикация сама поднимает его перед сборкой:

| ситуация | номер релиза |
| --- | --- |
| опубликованного семантического релиза нет (`fallout-v1`, пусто) | берётся из манифеста (`1.0.0`) |
| манифест выше `release.json` (номер подняли вручную) | берётся из манифеста как есть |
| иначе | шаг `--bump` от опубликованной версии: `1.0.0 → 1.0.1` |

После подъёма манифест в рабочем дереве меняется — этот файл нужно закоммитить
в совмещённом репозитории вместе с остальными правками.

Текст GitHub Release берётся из верхней секции `release-notes/fallout.md`:

```markdown
## 1.0.1 — Ремонт по книге
Что изменилось для игрока.
```

Секция сверху должна совпадать с выпускаемым номером. Если она про другую
версию, публикация останавливается **до** сборки архива и просит добавить
раздел. Блоки в ```` ``` ```` не считаются секциями — в них можно держать пример.

Старые целочисленные теги (`fallout-v1`) при выпуске удаляются вместе с
релизом: они не продолжают семантическую линию, и рядом с `fallout-v1.0.0`
только путают. Отключается флагом `--no-prune-legacy`.

Сборка APK из репозитория движка — отдельная инструкция: `docs/apk-build.md`.

## Требования

`node` 18+, `git`; для сеттинга ещё `python3` (упаковщик) и `esbuild`
(devDependency движка — им собирается runtime-бандл сеттинга). `gh` не
обязателен, если задан токен.

Если зависимостей нет, достаточно один раз выполнить в корне движка:

```sh
npm install
```

`publish-setting.sh` сам доустановит только сборщик, если его не хватает
(флаг `--no-install` это отключает). Сборщик ставится **в кэш вне проекта**
(`$TMPDIR/positronium-build-tools` или `POSITRONIUM_TOOLS_DIR`) и подключается
через `NODE_PATH` — дерево `node_modules` проекта не трогается. Это важно там,
где зависимости поставлены pnpm: `npm install` поверх такого дерева падает
(`Cannot read properties of null (reading 'isDescendantOf')`).

В репозитории сеттинга зависимости ставит только публикация в `tools/`:
`npm install --prefix tools` кладёт `esbuild` в `tools/node_modules`. Checkout
движка для сборки не нужен — кошелёк ходит в движок через `engine:<id>`,
и такие импорты отдаёт приложение (`src/engine/settings/settingRuntimeHost.js`).
Список доступных модулей едет вместе с инструментами: `tools/host-modules.json`
(его пишет публикация).

## Если что-то пошло не так

| Симптом | Что делать |
| --- | --- |
| `Permission ... denied` / 403 | токен без прав на целевой репозиторий: выдать доступ и повторить |
| `Resource not accessible by integration` | подключение GitHub выдано только этому репозиторию, а не двум целевым |
| `engine imports missing from the host module list` | кошелёк просит модуль, которого нет в `tools/host-modules.json`; обновить файл публикацией или добавить модуль в хост |
| `esbuild не установлен` / `ERR_MODULE_NOT_FOUND: esbuild` | просто повторить `./scripts/publish-setting.sh` — сборщик доустановится в кэш сам |
| `Cannot read properties of null (reading 'isDescendantOf')` | это `npm install` в дереве, созданном pnpm (частая причина — запуск в репозитории сеттинга, где нет `package.json`). Здесь ставить зависимости не нужно; если пострадал `node_modules` проекта — переустановите его тем менеджером, которым он создавался |

### Если `npm install` всё-таки запустили в репозитории сеттинга

Команда уходит вверх по дереву и работает с чужим проектом. Проверка и уборка:

```sh
cd positronium-game-settings
ls -a                      # ожидаемы только .git, fallout, tools, README.md, release.json, LICENSE, NOTICE
git status --porcelain     # должно быть пусто
```

Появились `package.json`, `package-lock.json` или `node_modules` — они созданы этим
запуском, их можно удалить:

```sh
rm -rf node_modules package.json package-lock.json
```

Если npm успел пройтись по корню основного проекта (`~/workspace`), переустановите
его зависимости тем менеджером, который создавал дерево: `pnpm install` для
pnpm-дерева или `rm -rf node_modules && npm install` для npm.
| релиз создан, а приложение обновление не видит | проверить `release.json` в ветке репозитория сеттинга и тег `<id>-v<версия>` |
| `верхняя секция release-notes/fallout.md — X, а публикуется Y` | добавить раздел `## Y` в начало заметок |
| `manifest.version must be MAJOR.MINOR.PATCH` | номер в манифесте должен быть `1.0.0`, а не `1` |
| `верхняя секция release-notes/engine.md — X, а публикуется Y` | добавить раздел `## Y` в начало заметок движка |
| `--asset: файл не найден` | передать путь к собранному APK/AAB |
| `релиз движка требует APK` | собрать `npm run apk` и передать `--asset`; без APK игрокам нечего скачивать |
| APK установлен, а обновление не приходит | проверить, что сборка содержит `expo-updates` (новый билд после 2026-10-22), и что релиз содержит `app-release.json` |
| push работает из Replit, а скрипт получает 403 | запустить с `PUBLISH_NO_TOKEN=1` — скрипт возьмёт системные git-креды вместо переменной окружения |

Проверить решение клиента об обновлении можно без публикации:

```sh
npx vitest run __tests__/settings/
```
