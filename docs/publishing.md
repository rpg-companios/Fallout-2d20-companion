# Публикация в целевые репозитории

Правки сначала делаются в этом checkout. Потом два shell-скрипта раскладывают
их по целевым репозиториям: движок — в `rpg-companios/ttrpg-engine`, сеттинг — в
`rpg-companios/positronium-game-settings`.

Здесь только **код**. Сборка и релиз живут в целевых репозиториях, рядом с
артефактом: движок собирает APK/AAB и выпускает `app-release.json`, сеттинг
собирает `.trpg` и выпускает `release.json`. Никаких путей из других чекаутов
и ручного скачивания файлов нет.

## Три проекта Replit — три репозитория GitHub

| Проект в Replit | Свой репозиторий на GitHub | Роль |
| --- | --- | --- |
| смешанный | `rpg-companios/Fallout-2d20-companion` | разработка и веб-режим; публикует код в два целевых репозитория |
| движок | `rpg-companios/ttrpg-engine` | тянет свой код, собирает APK/AAB, выпускает релиз |
| сеттинг | `rpg-companios/positronium-game-settings` | тянет свой код, собирает `.trpg`, выпускает релиз |

Обмена файлами между проектами нет — только через GitHub:

```
правка → смешанный → GitHub смешанного
                   ↓ publish-*.sh
        GitHub движка / GitHub сеттинга
                   ↓ git pull (release.sh делает сам)
        Replit: движок / сеттинг → сборка → релиз
```

Каждый проект обновляется **из своего** репозитория: движок и сеттинг —
`release.sh` перед сборкой, смешанный — `publish-*.sh` перед отправкой кода.

## Быстрый запуск (Replit)

```sh
git switch arena/0b69018a-fallout-2d20-companion

export GH_TOKEN=...        # токен с правом записи в оба репозитория
./scripts/publish-engine.sh    # сам обновит checkout из origin и отправит код
./scripts/publish-setting.sh
```

### Обновить рабочую копию Replit

Правки приезжают из GitHub: перед публикацией Replit должен догнать ветку,
иначе он отправит в целевые репозитории старый код.

`arena/0b69018a-fallout-2d20-companion` — ветка **этого, смешанного**
репозитория: в ней работает агент, и только в неё Arena сохраняет правки.
Целевые репозитории (`ttrpg-engine`, `positronium-game-settings`) — отдельные:
публикация копирует туда файлы, а не историю, поэтому этой ветки там нет и
быть не может. В проектах Replit «движок» и «сеттинг» обновление — это
обычный `git pull --ff-only` своей ветки (обычно `main`), его же делает
`./scripts/release.sh` перед сборкой.

```sh
git fetch origin
git status                    # локальные правки? их нужно убрать или закоммитить
git pull --ff-only origin arena/0b69018a-fallout-2d20-companion
npm install                   # только если менялись package.json / package-lock.json
```

`--ff-only` не создаёт merge-коммитов: если ветки разошлись, команда просто
остановится и покажет, что мешает. Переставить рабочую копию ровно на ветку
из GitHub (локальные правки пропадут):

```sh
git fetch origin
git reset --hard origin/arena/0b69018a-fallout-2d20-companion
```

После обновления перезапустите приложение в Replit (Run / `npm run web`),
чтобы веб-режим отдавал новый код.

### Что должно быть в проекте Replit

`release.sh` в репозитории сеттинга — Node-скрипт, который для упаковки
вызывает Python. Поэтому в проекте нужны:

- **node 18+ и npm** — сам сценарий релиза и esbuild в `tools/node_modules`;
- **python3** — `tools/pack-setting.py`;
- **git** — обновление checkout'а;
- токен GitHub (`GH_TOKEN`/`PUBLISH_GITHUB_TOKEN`) или авторизованный `gh`.

В Replit это добавляется модулями в `.replit`:

```toml
modules = ["nodejs-20", "python-3.11"]
```

после чего проект перезапускается (Stop → Run). Проверка: `node -v` (≥ 18),
`python3 -V`, `npm -v`. `.replit` относится к конкретному проекту Replit и
в git его можно не коммитить: публикация из смешанного репозитория
пересобирает дерево целиком, и всё, чего нет в плане, из репозитория исчезнет.

### Если файлы в проекте удалены

`git fetch` файлы не восстанавливает — он только обновляет ссылки на ветки.
Пустой проект останется пустым, пока рабочую копию не перемотают на коммит:

```sh
cd ~/workspace                    # папка проекта, узнать: pwd
git status                        # «not a git repository» → см. вариант ниже
git fetch origin
git reset --hard origin/arena/0b69018a-fallout-2d20-companion
git clean -fd                     # остатки неотслеживаемых файлов; node_modules не тронет
npm ci                            # node_modules в git не лежит — ставим заново
```

Если вместе с файлами удалён и `.git`, проект клонируется заново (для
приватного репозитория нужен подключённый в Replit GitHub):

```sh
cd ~
git clone https://github.com/rpg-companios/Fallout-2d20-companion.git workspace
cd workspace
git switch arena/0b69018a-fallout-2d20-companion
npm ci
```

Replit Secrets (Tools → Secrets) от удаления файлов не страдают. А `.env`,
если он был, в git не хранится и его нужно создать заново.

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
- перед сборкой дерева обновляет свой checkout из origin (fast-forward,
  только при чистом дереве): публикуется то, что уже на GitHub; `--no-pull`
  отключает обновление;
- `--dry-run` — показать изменения, ничего не отправляя;
- `--patch` — сохранить `.publish/patches/engine.patch`;
- `--message "..."` — своё сообщение коммита;
- релиза не делает: APK собирается и публикуется в самом репозитории движка
  (`npm run release` там же, см. ниже). `--release`/`--asset` — ошибка с
  подсказкой;
- `app-release.json` (индекс обновлений) не трогает: сохраняет тот, что уже
  лежит в репозитории движка.

**`scripts/publish-setting.sh`** — собирает репозиторий сеттингов и пушит его:

- `modules/fallout/` → папка `fallout/` в корне (папка = сеттинг);
- `tools/` — `pack-setting.py`, `unpack-setting.py`, `build-setting-runtime.mjs`,
  `package.json` (esbuild) и `host-modules.json` (список `engine:` модулей);
- `scripts/release.mjs`, `scripts/release.sh` и `scripts/lib/*` — сценарий
  релиза, который живёт рядом с кошельком;
- `LICENSE`, `NOTICE` — лицензия относится к инструментам;
- README репозитория и `release-notes/fallout.md` — заметки о релизах;
- **не** собирает `.trpg` и **не** выпускает релиз: это делает
  `./scripts/release.sh` в самом репозитории сеттинга;
- не откатывает `release.json` и версию в `fallout/manifest.json`, даже если
  в этом checkout они ниже: номер двигает только релиз;
- перед сборкой дерева обновляет свой checkout из origin (fast-forward,
  только при чистом дереве); `--no-pull` отключает обновление;
- `--dry-run`/`--no-push` — показать изменения, ничего не отправляя;
- `--patch`, `--message` — как у движка;
- флаги `--release`, `--no-release`, `--bump`, `--version`, `--asset`,
  `--no-install`, `--no-prune-legacy` теперь отклоняются с подсказкой: они
  переехали в релизный сценарий сеттинга.

Оба скрипта идемпотентны: повторный запуск без изменений ничего не коммитит.

## Релизы движка — в репозитории движка

Порядок работы: разработка и веб-режим — здесь, в смешанном репозитории;
`publish-engine.sh` доставляет сюда код; **сборка и релиз живут в самом
движке**. Одна команда там, без путей из других чекаутов:

```sh
cd ~/workspace/ttrpg-engine
./scripts/release.sh            # обновит checkout → APK → GitHub Release → app-release.json
```

Что делает `./scripts/release.sh` (`npm run release`):

1. берёт версию из `app.json` и заметки из `release-notes/engine.md`;
2. собирает профиль EAS `preview` (APK) — ждёт завершения;
3. скачивает артефакт сборки сам;
4. создаёт GitHub Release `engine-v<версия>` с ассетом `positronium.apk`
   (текст — верхняя секция `release-notes/engine.md`);
5. пишет `app-release.json` и коммитит его в репозиторий.

Другие режимы:

```sh
./scripts/release.sh --aab            # AAB (файл для Google Play) в релиз
./scripts/release.sh --aab --submit   # плюс загрузка AAB в Play Console (eas submit)
./scripts/release.sh --build-id <id>  # опубликовать уже собранную сборку
./scripts/release.sh --skip-build     # взять последнюю успешную сборку профиля
./scripts/release.sh --dry-run        # только показать план
```

Проверка версии: номер верхней секции `release-notes/engine.md` должен
совпадать с `expo.version` — иначе скрипт останавливается до сборки.

Перед сборкой `release.sh` сам обновляет checkout из `origin` — только
fast-forward и только при чистом дереве. Незакоммиченные правки или локальные
коммиты впереди `origin` останавливают релиз с подсказкой: разберитесь с ними
вручную либо запустите `./scripts/release.sh --no-pull`. Если обновился сам
сценарий релиза, он перезапускается уже новой версией.

Ветку скрипт не угадывает и ниоткуда не приносит: он обновляет **ту ветку, на
которой стоит сам клон** — в репозитории движка это его собственная `main`.
Никакого `arena/...` в целевом репозитории нет; поменять ветку можно
переменной `RELEASE_BRANCH`.

Постоянные адреса (не меняются от релиза к релизу, их можно давать людям):

- страница всех версий — <https://github.com/rpg-companios/ttrpg-engine/releases>;
- последний APK — <https://github.com/rpg-companios/ttrpg-engine/releases/latest/download/positronium.apk>;
- индекс обновлений — <https://raw.githubusercontent.com/rpg-companios/ttrpg-engine/main/app-release.json>.

`app-release.json` пишет только релиз движка (версия, тег, имя ассета, размер,
sha256, заметки). Публикация кода (`publish-engine.sh`) файл не трогает: то,
что уже лежит в репозитории, сохраняется как есть, поэтому push не откатывает
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

## Релизы сеттинга — в репозитории сеттинга

Сеттинг — самостоятельное рабочее место: `.trpg` собирается там же, где лежит
кошелёк, и релиз выпускается оттуда же. Публикация кода только привозит туда
исходники, инструменты и сам сценарий релиза.

```sh
cd ~/workspace/positronium-game-settings
./scripts/release.sh                 # обновит checkout → .trpg → GitHub Release → release.json
```

Что делает `./scripts/release.sh`:

1. читает версии из `<id>/manifest.json` и опубликованный номер из
   `release.json`;
2. поднимает версию (по умолчанию patch), пишет её в манифест и сверяет с
   верхней секцией `release-notes/<id>.md`;
3. ставит esbuild в `tools/node_modules` (если его нет) и собирает
   `<id>.trpg` упаковщиком `tools/pack-setting.py`;
4. создаёт GitHub Release `<id>-v<версия>` и загружает туда `.trpg`;
5. убирает до-семантические теги (`fallout-v1`) этого сеттинга;
6. пишет `release.json` (версия, `requiresCore`, размер, sha256, тег, ссылки)
   и коммитит его вместе с манифестом.

Другие режимы:

```sh
./scripts/release.sh --bump minor      # 1.0.1 → 1.1.0
./scripts/release.sh --version 2.0.0   # задать номер вручную
./scripts/release.sh --setting fallout # только этот сеттинг (если их несколько)
./scripts/release.sh --dry-run         # только показать план
```

Обновление checkout'а — то же, что у движка: fast-forward из `origin`,
остановка на грязном дереве, `--no-pull` для отключения.

Постоянные адреса сеттинга:

- страница всех версий — <https://github.com/rpg-companios/positronium-game-settings/releases>;
- последний пакет — <https://github.com/rpg-companios/positronium-game-settings/releases/latest/download/fallout.trpg>;
- индекс обновлений — <https://raw.githubusercontent.com/rpg-companios/positronium-game-settings/main/release.json>.

`release.json` пишет только релиз сеттинга. Публикация кода его сохраняет:
если в целевом репозитории номер уже 1.0.1, а в этом checkout ещё 1.0.0,
push не откатит ни индекс, ни манифест.

```json
{
  "schemaVersion": 1,
  "repository": "rpg-companios/positronium-game-settings",
  "settings": {
    "fallout": {
      "id": "fallout",
      "name": "Fallout 2d20",
      "version": "1.0.1",
      "packFormat": 1,
      "requiresCore": ">=1.0",
      "tag": "fallout-v1.0.1",
      "asset": "fallout.trpg",
      "bytes": 20229745,
      "sha256": "…",
      "assetUrl": "https://github.com/rpg-companios/positronium-game-settings/releases/download/fallout-v1.0.1/fallout.trpg",
      "latestUrl": "https://github.com/rpg-companios/positronium-game-settings/releases/latest/download/fallout.trpg"
    }
  }
}
```

## Версии и заметки о релизах

Номер релиза — семантический: `MAJOR.MINOR.PATCH`. Для сеттинга он живёт в
`modules/<id>/manifest.json`, а опубликованный — в `release.json` целевого
репозитория. Релиз поднимает номер сам:

| ситуация | номер релиза |
| --- | --- |
| опубликованного семантического релиза нет (`fallout-v1`, пусто) | берётся из манифеста (`1.0.0`) |
| манифест выше `release.json` (номер подняли вручную) | берётся из манифеста как есть |
| иначе | шаг `--bump` от опубликованной версии: `1.0.0 → 1.0.1` |

Поднятый номер релиз записывает в манифест сам и коммитит вместе с
`release.json` — вручную править номер перед выпуском не нужно. В совмещённом
репозитории манифест может остаться на старом номере: публикация кода версию
не понижает.

Текст GitHub Release берётся из верхней секции `release-notes/<id>.md`:

```markdown
## 1.0.1 — Ремонт по книге
Что изменилось для игрока.
```

Секция сверху должна совпадать с выпускаемым номером. Если она про другую
версию, релиз останавливается **до** сборки архива и просит добавить раздел.
Блоки в ```` ``` ```` не считаются секциями — в них можно держать пример.

Заметки правятся в смешанном репозитории: публикация доставляет файл в
репозиторий сеттинга, и релиз читает его уже оттуда. Правки, сделанные прямо
в репозитории сеттинга, следующая публикация перезапишет — файл в рабочем
checkout остаётся источником истины.

Старые целочисленные теги (`fallout-v1`) при выпуске удаляются вместе с
релизом: они не продолжают семантическую линию, и рядом с `fallout-v1.0.0`
только путают.

Сборка APK из репозитория движка — отдельная инструкция: `docs/apk-build.md`.

## Требования

`node` 18+, `git`; для релиза сеттинга ещё `python3` (упаковщик) и `esbuild`
(ставится в `tools/node_modules` при первом релизе). `gh` не обязателен, если
задан токен: релиз работает и через REST API.

## Если что-то пошло не так

| Симптом | Что делать |
| --- | --- |
| `Permission ... denied` / 403 | токен без прав на целевой репозиторий: выдать доступ и повторить |
| `Resource not accessible by integration` | подключение GitHub выдано только этому репозиторию, а не двум целевым |
| `engine imports missing from the host module list` | кошелёк просит модуль, которого нет в `tools/host-modules.json`; обновить файл публикацией или добавить модуль в хост |
| `esbuild не установлен` / `ERR_MODULE_NOT_FOUND: esbuild` | повторить `./scripts/release.sh` в репозитории сеттинга — сборщик доустановится в `tools/` |
| `не понял, что релизить` | запустить релиз в репозитории движка (`app.json`) или сеттинга (`tools/pack-setting.py`) |
| релиз создан, а приложение обновление не видит | проверить `release.json` в ветке репозитория сеттинга и тег `<id>-v<версия>` |
| `верхняя секция release-notes/fallout.md — X, а выпускается Y` | добавить раздел `## Y` в начало заметок |
| `version must be MAJOR.MINOR.PATCH` | номер в манифесте должен быть `1.0.0`, а не `1` |
| `незакоммиченные изменения (...)` | в checkout есть правки: закоммитьте/уберите их или запустите с `--no-pull` |
| publish: `git fetch` не проходит | у проекта Replit нет доступа к своему GitHub: настройте креды или запустите с `--no-pull` |
| publish: «код уже совпадает», а правок нет | проект Replit стоит не на той ветке: `git branch --show-current`; правки агента — в `arena/0b69018a-fallout-2d20-companion` |
| `ветка ... разошлась с origin/...` | локальные коммиты не отправлены: `git pull`/`git push` либо `--no-pull` |
| `верхняя секция release-notes/engine.md — X, а выпускается Y` | добавить раздел `## Y` в начало заметок движка |
| `релиз движка выпускается в самом репозитории движка` | `publish-engine.sh` только доставляет код; релиз — `./scripts/release.sh` в движке |
| `--release: сборка и релиз теперь в целевом репозитории` | публикация сеттинга больше не релизит: релиз — `./scripts/release.sh` в сеттинге |
| APK установлен, а обновление не приходит | проверить, что сборка содержит `expo-updates` (новый билд после 2026-10-22), и что релиз содержит `app-release.json` |
| `нет успешных сборок профиля preview` | убрать `--skip-build` или передать `--build-id` |
| push работает из Replit, а скрипт получает 403 | запустить с `PUBLISH_NO_TOKEN=1` — скрипт возьмёт системные git-креды вместо переменной окружения |

Проверить решение клиента об обновлении можно без публикации:

```sh
npx vitest run __tests__/settings/
```
