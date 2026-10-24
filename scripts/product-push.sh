#!/usr/bin/env bash
# OTA-обновление ВСЕМ (канал production).
#
#   ./scripts/product-push.sh --message "моды оружия: исправлено"
#   ./scripts/product-push.sh --dry-run      # только проверки, без отправки
#
# Что делает:
#   1. сверяет код с последней тестовой публикацией (коммит + незакоммиченные
#      правки). Не совпало — отказ: в продакшн не должно уезжать непроверенное;
#   2. собирает бандл (expo export), чтобы не отправить заведомо падающий;
#   3. отправляет OTA в канал production.
#
# Обновление скачается у всех на канале production при следующем запуске
# приложения и не потребует переустановки.
#
# Отправить, несмотря на расхождение с тестом: --force
# Полный список флагов: ./scripts/product-push.sh --help

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "[ota] нужен node 18+: https://nodejs.org" >&2
  exit 1
fi

exec node "$ROOT/scripts/ota-push.mjs" --channel production "$@"
