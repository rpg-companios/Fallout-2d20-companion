#!/usr/bin/env bash
# OTA-обновление ТОЛЬКО тестировщику (канал preview).
#
#   ./scripts/testing-push.sh --message "проверка модов оружия"
#   ./scripts/testing-push.sh --dry-run
#
# Что делает:
#   1. собирает бандл (expo export) — падение импорта ловится здесь, а не на телефоне;
#   2. отправляет OTA в канал preview (его слушают APK профиля preview);
#   3. запоминает отпечаток исходников — с ним потом сверится product-push.
#
# Всем обновление НЕ уходит: канал preview есть только у тестовых сборок.
# Когда проверил и всё устраивает: ./scripts/product-push.sh
#
# Полный список флагов: ./scripts/testing-push.sh --help

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "[ota] нужен node 18+: https://nodejs.org" >&2
  exit 1
fi

# Канал — не флаг вызова, а смысл файла: testing-push всегда preview.
for arg in "$@"; do
  if [ "$arg" = "--channel" ] || [ "${arg#--channel=}" != "$arg" ]; then
    echo "[ota] канал выбирает скрипт: testing-push.sh → preview." >&2
    echo "[ota] Всем — ./scripts/product-push.sh" >&2
    exit 2
  fi
done

exec node "$ROOT/scripts/ota-push.mjs" "$@" --channel preview
