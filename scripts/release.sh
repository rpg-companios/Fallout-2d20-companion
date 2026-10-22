#!/usr/bin/env bash
# Релиз движка из самого репозитория движка.
#
#   ./scripts/release.sh             # APK → GitHub Release + app-release.json
#   ./scripts/release.sh --aab       # AAB (файл для Google Play) в релиз
#   ./scripts/release.sh --aab --submit   # ещё и загрузка AAB в Play Console
#   ./scripts/release.sh --build-id <id>  # опубликовать уже собранную сборку
#   ./scripts/release.sh --dry-run        # показать план и ничего не делать
#
# Версию берём из app.json (expo.version), текст — из верхней секции
# release-notes/engine.md; номер секции обязан совпасть с версией.
# Сборку делает EAS, файл скачивается автоматически, релиз создаётся через
# gh CLI (или токеном GH_TOKEN / PUBLISH_GITHUB_TOKEN).
#
# Запускать из корня репозитория движка. Никаких путей из других чекаутов
# передавать не нужно.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f app.json ] || [ ! -f release-notes/engine.md ]; then
  echo "[release] это не репозиторий движка: нужны app.json и release-notes/engine.md" >&2
  echo "[release] релиз выпускается здесь, а код сюда публикуется из смешанного репозитория" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[release] нужен node 18+: https://nodejs.org" >&2
  exit 1
fi

if [ -z "${PUBLISH_GITHUB_TOKEN:-}${GH_TOKEN:-}${GITHUB_TOKEN:-}" ] && ! command -v gh >/dev/null 2>&1; then
  echo "[release] нужен gh CLI или токен GH_TOKEN / PUBLISH_GITHUB_TOKEN" >&2
  exit 1
fi

exec node scripts/release.mjs "$@"
