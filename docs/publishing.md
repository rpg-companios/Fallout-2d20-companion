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

- копирует всё, кроме `modules/`, `patchs/`, `artifacts/`, `сеттинги/`,
  рабочих файлов чекаута и готовых архивов;
- коммит подписывается `PUBLISH_GIT_NAME`/`PUBLISH_GIT_EMAIL`
  (по умолчанию «Positronium publish»);
- `--dry-run` — показать изменения, ничего не отправляя;
- `--patch` — сохранить `.publish/patches/engine.patch`;
- `--message "..."` — своё сообщение коммита.

**`scripts/publish-setting.sh`** — собирает репозиторий сеттингов и выпускает
релиз:

- `modules/fallout/` → папка `fallout/` в корне (папка = сеттинг);
- `tools/` — `pack-setting.py`, `unpack-setting.py`, `build-setting-runtime.mjs`;
- `LICENSE`, `NOTICE` — лицензия относится к инструментам;
- README репозитория;
- собирает `fallout.trpg` (20 МБ) упаковщиком этого репозитория;
- пишет `release.json` (версия, `requiresCore`, размер, sha256, тег, ссылки);
- создаёт GitHub-релиз с тегом `fallout-v1` и загружает в него `.trpg`
  через REST API (или `gh`, если токена нет, а `gh` авторизован);
- `--dry-run` — показать изменения;
- `--no-release` — только запушить дерево, без нового релиза и без пересборки `.trpg`;
- `--patch`, `--message` — как у движка.

Оба скрипта идемпотентны: повторный запуск без изменений ничего не коммитит,
а повторный релиз той же версии заменяет ассет у существующего тега.

## Требования

`node` 18+, `git`; для сеттинга ещё `python3` (упаковщик) и `esbuild`
(devDependency движка — им собирается runtime-бандл сеттинга). `gh` не
обязателен, если задан токен.

Если зависимостей нет, достаточно один раз выполнить в корне движка:

```sh
npm install
```

`publish-setting.sh` сам доустановит только сборщик, если его не хватает
(флаг `--no-install` это отключает). Тот же путь работает и в отдельном
репозитории сеттинга: `tools/build-setting-runtime.mjs` ищет `esbuild`
в checkout'е движка (`POSITRONIUM_ENGINE`), а не рядом с собой.

## Если что-то пошло не так

| Симптом | Что делать |
| --- | --- |
| `Permission ... denied` / 403 | токен без прав на целевой репозиторий: выдать доступ и повторить |
| `Resource not accessible by integration` | подключение GitHub выдано только этому репозиторию, а не двум целевым |
| `engine checkout not found` при ручной сборке | задать `POSITRONIUM_ENGINE=/path/to/engine` |
| `esbuild не установлен` / `ERR_MODULE_NOT_FOUND: esbuild` | `npm install` в корне движка или просто повторить `./scripts/publish-setting.sh` — сборщик доустановится сам |
| релиз создан, а приложение обновление не видит | проверить `release.json` в ветке репозитория сеттинга и тег `<id>-v<version>` |
| push работает из Replit, а скрипт получает 403 | запустить с `PUBLISH_NO_TOKEN=1` — скрипт возьмёт системные git-креды вместо переменной окружения |

Проверить решение клиента об обновлении можно без публикации:

```sh
npx vitest run __tests__/settings/
```
