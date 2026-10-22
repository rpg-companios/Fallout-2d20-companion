#!/usr/bin/env bash
# Публикация движка в rpg-companios/ttrpg-engine.
#
# Запускать из любой папки: скрипт сам переходит в корень чекаута.
#
#   ./scripts/publish-engine.sh              # собрать дерево и запушить
#   ./scripts/publish-engine.sh --dry-run    # только показать, что изменится
#   ./scripts/publish-engine.sh --patch      # дополнительно сохранить .publish/patches/engine.patch
#   ./scripts/publish-engine.sh --message "..." --patch
#
# Это ТОЛЬКО доставка кода в репозиторий движка. Релиз (сборка APK/AAB и
# публикация на GitHub) выпускается там же, в репозитории движка:
#
#   cd ~/workspace/ttrpg-engine && ./scripts/release.sh
#
# app-release.json (индекс обновлений) публикация не трогает: его пишет
# релизный сценарий движка, иначе push откатил бы его к прошлой версии.
#
# Токен (если git не авторизован): GH_TOKEN или GITHUB_TOKEN с правом записи
# в целевой репозиторий. Подпись коммита — PUBLISH_GIT_NAME / PUBLISH_GIT_EMAIL.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  # Шапка — подряд идущие строки-комментарии после shebang.
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

PUSH=1
ARGS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run|--no-push) PUSH=0 ;;
    --release|--asset|--asset=*)
      echo "[publish-engine] релиз движка выпускается в самом репозитории движка: ./scripts/release.sh" >&2
      echo "[publish-engine] здесь только публикация кода — запустите без --release/--asset" >&2
      exit 1 ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done

if ! command -v node >/dev/null 2>&1; then
  echo "[publish-engine] нужен node (18+): https://nodejs.org" >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "[publish-engine] нужен git" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[publish-engine] нужен node 18+, сейчас $(node -v)" >&2
  exit 1
fi

if [ -z "${PUBLISH_GITHUB_TOKEN:-}${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
  echo "[publish-engine] токен не задан — полагаюсь на git credential helper."
  echo "[publish-engine] если push вернёт 403: export GH_TOKEN=... с правом записи в rpg-companios/ttrpg-engine"
fi

CMD=(node scripts/publish-repositories.mjs --target engine)
if [ "$PUSH" -eq 1 ]; then
  CMD+=(--push)
else
  echo "[publish-engine] режим проверки: ничего не будет отправлено"
fi
CMD+=(${ARGS[@]+"${ARGS[@]}"})

exec "${CMD[@]}"
