#!/usr/bin/env bash
# Одноразовый перенос Кузницы в её репозиторий (2026-10-25).
# Запускать ЛОКАЛЬНО, со своими учётками GitHub (из клона ветки с item-forge/).
# Песочница Arena пушить не может: её токен — платформенный интеграционный
# (egress), запись доступна только в основной репозиторий сессии.
#
#   bash tools/push-forge-to-own-repo.sh            # в $TMP, самоочистится
#   FORGE_DEST=/path/to/fallout2d20forge-lite bash tools/push-forge-to-own-repo.sh
#
# После удачного пуша: Settings → Pages → Source: GitHub Actions в
# fallout2d20forge; и чистовая здесь — чек-лист в docs/agents/state.md, п.6.

set -euo pipefail

DEST="${FORGE_DEST:-$(mktemp -d)/fallout2d20forge}"
# Источник: item-forge/ рядом с репозиторием ИЛИ явно: FORGE_SRC=/куда/распаковали/архив
SRC="${FORGE_SRC:-$(cd "$(dirname "$0")/.." && pwd)/item-forge}"

[ -d "$SRC" ] || { echo "источник не найден: $SRC (запускать из основного репо или задать FORGE_SRC)"; exit 1; }

git clone https://github.com/rpg-companios/fallout2d20forge.git "$DEST"
cd "$DEST"
cp -r "$SRC"/{.github,.gitignore,README.md,index.html,package.json,package-lock.json,public,src,tests,tools,tsconfig.json,vite.config.ts} .
git add -A
git commit -m "Кузница предметов v0.1: самодостаточный генератор паков контента

Прототип этапа P (оружие/моды/патроны, аудитория, экспорт/импорт).
Самодостаточность: справочники и валидатор — локальные слепки
(src/data/forge-refs.json + src/itempack/), обновление из основного
репозитория командой npm run sync (tools/sync-from-main.mjs).
PWA: манифест, иконка, service worker; деплой на Pages — workflow pages.yml.
Тесты: 6/6 (round-trip генератор↔валидатор + целостность слепка)." || true
git branch -M main
git push origin main
echo "OK: https://github.com/rpg-companios/fallout2d20forge (ветка main)"
