#!/usr/bin/env bash
# Публикация сеттинга в rpg-companios/positronium-game-settings:
# папка fallout/, tools/, README, release.json и релиз с .trpg.
#
#   ./scripts/publish-setting.sh                  # собрать .trpg, запушить, создать релиз
#   ./scripts/publish-setting.sh --dry-run        # только показать, что изменится
#   ./scripts/publish-setting.sh --no-release     # запушить без нового релиза
#   ./scripts/publish-setting.sh --patch          # дополнительно сохранить .publish/patches/setting.patch
#   ./scripts/publish-setting.sh --message "..."
#
# Нужны node 18+, git, python3 и токен с правом записи в целевой репозиторий
# (PUBLISH_GITHUB_TOKEN, GH_TOKEN или GITHUB_TOKEN). Без токена релиз
# создаётся через gh CLI, если он авторизован.
# Подпись коммита — PUBLISH_GIT_NAME / PUBLISH_GIT_EMAIL.
#
# Сборка .trpg требует esbuild (devDependency движка). Если его нет,
# скрипт доустановит только сборщик; --no-install отключает это поведение.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

PUSH=1
RELEASE=1
INSTALL=1
ARGS=()
for argument in "$@"; do
  case "$argument" in
    -h|--help) usage; exit 0 ;;
    --dry-run) PUSH=0; RELEASE=0 ;;
    --no-push) PUSH=0 ;;
    --no-release) RELEASE=0 ;;
    --release) RELEASE=1 ;;
    --no-install) INSTALL=0 ;;
    *) ARGS+=("$argument") ;;
  esac
done

for tool in node git python3; do
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

# .trpg собирается esbuild'ом. В Replit зависимости могут быть не установлены
# или установлены без devDependencies — тогда ставим только сборщик.
if [ "$RELEASE" -eq 1 ] && ! node -e "require.resolve('esbuild')" >/dev/null 2>&1; then
  if [ "$INSTALL" -eq 1 ]; then
    ESBUILD_VERSION="$(node -p "require('./package.json').devDependencies.esbuild" 2>/dev/null || echo '')"
    echo "[publish-setting] esbuild не найден — ставлю ${ESBUILD_VERSION:-esbuild} (это займёт несколько секунд)"
    npm install --no-save --no-audit --no-fund "esbuild@${ESBUILD_VERSION:-latest}"
  fi
  if ! node -e "require.resolve('esbuild')" >/dev/null 2>&1; then
    echo "[publish-setting] без esbuild пакет .trpg не собрать." >&2
    echo "[publish-setting] выполните: npm install   (или npm install --no-save esbuild)" >&2
    exit 1
  fi
fi

if [ -z "${PUBLISH_GITHUB_TOKEN:-}${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
  if command -v gh >/dev/null 2>&1; then
    echo "[publish-setting] токен не задан — релиз будет создан через gh CLI."
  else
    echo "[publish-setting] токен не задан и gh не установлен: push может не пройти,"
    echo "[publish-setting] а релиз создать нечем. export GH_TOKEN=... с правом записи."
  fi
fi

CMD=(node scripts/publish-repositories.mjs --target setting)
if [ "$PUSH" -eq 1 ] || [ "$RELEASE" -eq 1 ]; then
  CMD+=(--push)
else
  echo "[publish-setting] режим проверки: ничего не будет отправлено"
fi
if [ "$RELEASE" -eq 1 ]; then
  CMD+=(--release)
fi
CMD+=(${ARGS[@]+"${ARGS[@]}"})

exec "${CMD[@]}"
