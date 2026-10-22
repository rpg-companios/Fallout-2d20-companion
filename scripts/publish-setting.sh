#!/usr/bin/env bash
# Публикация КОДА сеттинга в rpg-companios/positronium-game-settings:
# папка fallout/, tools/, README, сценарий релиза и заметки.
#
#   ./scripts/publish-setting.sh                  # проверить и запушить
#   ./scripts/publish-setting.sh --dry-run        # только показать, что изменится
#   ./scripts/publish-setting.sh --no-push        # собрать дерево, но не отправлять
#   ./scripts/publish-setting.sh --patch          # дополнительно сохранить .publish/patches/setting.patch
#   ./scripts/publish-setting.sh --message "..."  # текст коммита в целевом репозитории
#
# Сборки и релиза здесь нет: `.trpg` собирается и публикуется в самом
# репозитории сеттинга — `./scripts/release.sh` там же, где лежит кошелёк.
# Этот скрипт только доставляет код; release.json и версию в manifest.json
# в целевом репозитории он сохраняет (их меняет релиз).
#
# Нужны node 18+ и git. Токен с правом записи в целевой репозиторий —
# PUBLISH_GITHUB_TOKEN, GH_TOKEN или GITHUB_TOKEN; без токена подойдут
# настроенные git-креды (в Replit: PUBLISH_NO_TOKEN=1).
# Подпись коммита — PUBLISH_GIT_NAME / PUBLISH_GIT_EMAIL.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  # Шапка — подряд идущие строки-комментарии после shebang.
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

PUSH=1
ARGS=()
for argument in "$@"; do
  case "$argument" in
    -h|--help) usage; exit 0 ;;
    --dry-run|--no-push) PUSH=0 ;;
    --release|--no-release|--bump|--version|--asset|--no-prune-legacy|--no-install)
      echo "[publish-setting] $argument больше не нужен: сборка и релиз живут в репозитории сеттинга." >&2
      echo "[publish-setting] там же, у кошелька: ./scripts/release.sh [--bump minor|major] [--version 1.2.0]" >&2
      exit 1
      ;;
    *) ARGS+=("$argument") ;;
  esac
done

for tool in node git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[publish-setting] нужен $tool" >&2
    exit 1
  fi
done

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[publish-setting] нужен node 18+, сейчас $(node -v)" >&2
  exit 1
fi

if [ -z "${PUBLISH_GITHUB_TOKEN:-}${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
  echo "[publish-setting] токен не задан — push пойдёт через системные git-креды."
fi

CMD=(node scripts/publish-repositories.mjs --target setting)
if [ "$PUSH" -eq 1 ]; then
  CMD+=(--push)
else
  echo "[publish-setting] режим проверки: ничего не будет отправлено"
fi
CMD+=(${ARGS[@]+"${ARGS[@]}"})

exec "${CMD[@]}"
