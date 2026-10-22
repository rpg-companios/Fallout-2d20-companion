#!/usr/bin/env bash
# Релиз — в том репозитории, где живёт артефакт.
#
# Движок (есть app.json и release-notes/engine.md):
#   ./scripts/release.sh             # APK → GitHub Release + app-release.json
#   ./scripts/release.sh --aab       # AAB (файл для Google Play) в релиз
#   ./scripts/release.sh --aab --submit   # ещё и загрузка AAB в Play Console
#   ./scripts/release.sh --build-id <id>  # опубликовать уже собранную сборку
#   ./scripts/release.sh --dry-run        # показать план и ничего не делать
#
# Сеттинг (есть tools/pack-setting.py и папка с manifest.json):
#   ./scripts/release.sh             # .trpg → GitHub Release + release.json
#   ./scripts/release.sh --bump minor
#   ./scripts/release.sh --version 1.2.0
#   ./scripts/release.sh --dry-run
#
# Версия: движок — из app.json (expo.version), сеттинг — поднимается от
# release.json (по умолчанию patch). Текст — верхняя секция
# release-notes/<id>.md, номер секции обязан совпасть с версией.
#
# Перед сборкой checkout обновляется из origin: только fast-forward и только
# при чистом дереве (незакоммиченные правки — стоп). Отключить — --no-pull.
# Сборка APK — EAS; .trpg — tools/pack-setting.py. Файл скачивается/собирается
# сам, релиз создаётся через gh CLI (или токеном GH_TOKEN /
# PUBLISH_GITHUB_TOKEN).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "[release] нужен node 18+: https://nodejs.org" >&2
  exit 1
fi

MODE=""
if [ -f app.json ] && [ -f release-notes/engine.md ]; then
  MODE="engine"
elif [ -f tools/pack-setting.py ]; then
  MODE="setting"
else
  echo "[release] не понял, что релизить." >&2
  echo "[release] движок: app.json + release-notes/engine.md; сеттинг: tools/pack-setting.py + <id>/manifest.json" >&2
  echo "[release] код сюда публикуется из смешанного репозитория (publish-engine.sh / publish-setting.sh)" >&2
  exit 1
fi

if [ "$MODE" = "setting" ] && ! command -v python3 >/dev/null 2>&1; then
  echo "[release] для сборки .trpg нужен python3" >&2
  exit 1
fi

if [ -z "${PUBLISH_GITHUB_TOKEN:-}${GH_TOKEN:-}${GITHUB_TOKEN:-}" ] && ! command -v gh >/dev/null 2>&1; then
  echo "[release] нужен gh CLI или токен GH_TOKEN / PUBLISH_GITHUB_TOKEN" >&2
  exit 1
fi

exec node scripts/release.mjs "$@"
