#!/usr/bin/env bash

set -euo pipefail

# Скрипт автоматической сборки и развёртывания Positronium на хостинге NetAngels (na4u.ru).
#
# Что делает один запуск:
# 1. Находит каталог сайта NetAngels (~/positronium-engine.na4u.ru) и подхватывает
#    виртуальное окружение Node.js из etc/environment/PATH.
# 2. Клонирует или обновляет репозиторий в <сайт>/repo (не засоряя app/ и www/).
# 3. Устанавливает зависимости сборки (принудительно включая devDependencies, несмотря
#    на NODE_ENV=production в контейнере NetAngels) и собирает веб-бандл dist/ с
#    безопасными лимитами памяти и воркеров для контейнера 2 ГБ.
# 4. Раскладывает статику в <сайт>/www/ с сохранением .well-known и google*.html / yandex_*.html.
# 5. Раскладывает лёгкий сервер комнат в <сайт>/app/ (server/, package.json, hello.js, ws),
#    так что запуск работает сразу и с дефолтным APP_PATH=.../app/hello.js, и с .../app/.
# 6. Перезапускает демон Node.js через `touch reload` и проверяет HTTP + WebSocket /ws.

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" && "${DEPLOY_NETANGELS_STABLE:-}" != "1" ]]; then
  ORIGIN_SCRIPT_DIR="$(
    CDPATH=''
    cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
    pwd
  )"
  STABLE_SELF="$(mktemp "${TMPDIR:-/tmp}/deploy-netangels.XXXXXX.sh")"
  cp -- "${BASH_SOURCE[0]}" "$STABLE_SELF"
  export DEPLOY_NETANGELS_STABLE=1
  export DEPLOY_NETANGELS_SCRIPT_DIR="$ORIGIN_SCRIPT_DIR"
  export DEPLOY_NETANGELS_SELF="$STABLE_SELF"
  exec bash "$STABLE_SELF" "$@"
fi

cleanup_stable_self() {
  if [[ -n "${DEPLOY_NETANGELS_SELF:-}" && -f "${DEPLOY_NETANGELS_SELF}" ]]; then
    rm -f -- "${DEPLOY_NETANGELS_SELF}" || true
  fi
}
trap cleanup_stable_self EXIT

usage() {
  cat <<'USAGE'
Использование:
  ./deploy-netangels.sh [опции] [путь_к_каталогу_сайта]

Опции:
  --site <путь>       Каталог сайта NetAngels (например ~/positronium-engine.na4u.ru)
  --branch <ветка>    Ветка Git для сборки (по умолчанию: main)
  --repo-url <url>    URL репозитория GitHub
  --patch <номер>     После обновления кода применить ./apply-patch.sh <номер>
  --skip-pull         Не обновлять локальный Git-репозиторий из сети
  --skip-build        Использовать уже готовую папку dist/ без пересборки
  --clean             Переустановить node_modules и очистить кэш Metro с нуля
  --no-healthcheck    Не проверять живой ответ APP_IP:APP_PORT после touch reload
  -h, --help          Показать эту справку

Примеры запуска в SSH-консоли NetAngels:
  cd ~/positronium-engine.na4u.ru
  ./deploy-netangels.sh
USAGE
}

is_netangels_site_dir() {
  local d="$1"
  [[ -d "$d" ]] || return 1
  if [[ -d "$d/etc/environment" ]]; then
    return 0
  fi
  if [[ -d "$d/app" && -d "$d/www" ]]; then
    return 0
  fi
  return 1
}

is_positronium_repo_dir() {
  local d="$1"
  [[ -f "$d/App.js" && -f "$d/server/index.js" && -f "$d/package.json" ]]
}

read_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d '\r\n' < "$file"
  fi
}

resolve_abs_dir() {
  local target="$1"
  (
    CDPATH=''
    cd -- "$target"
    pwd -P
  )
}

resolve_modern_node_bin() {
  local site_dir="$1"
  local site_env_path="$2"
  local prompt_suffix="$3"

  local wanted_ver=""
  if [[ "$prompt_suffix" =~ v([0-9]+\.[0-9]+\.[0-9]+) ]]; then
    wanted_ver="${BASH_REMATCH[1]}"
  fi

  local candidates=()
  local d

  for d in "$site_dir/bin" "$site_dir/env/bin" "$site_dir/.env/bin" "$site_dir/node/bin"; do
    [[ -d "$d" ]] && candidates+=("$d")
  done

  local ifs_save="$IFS"
  IFS=':'
  for d in $PATH; do
    [[ -n "$d" && -d "$d" ]] && candidates+=("$d")
  done
  for d in $site_env_path; do
    [[ -n "$d" && -d "$d" ]] && candidates+=("$d")
  done
  IFS="$ifs_save"

  local search_roots=("/opt" "/usr/local" "/usr/lib" "/usr/share")
  if [[ -d "$HOME/.nvm/versions" ]]; then
    search_roots=("$HOME/.nvm/versions" "${search_roots[@]}")
  fi
  if [[ -n "${POSITRONIUM_NODE_SEARCH_ROOT:-}" && -d "${POSITRONIUM_NODE_SEARCH_ROOT}" ]]; then
    search_roots=("${POSITRONIUM_NODE_SEARCH_ROOT}" "${search_roots[@]}")
  fi

  # Также проверяем любые пути с /bin внутри etc/environment/* сайта
  if [[ -d "$site_dir/etc/environment" ]]; then
    local env_f env_val
    for env_f in "$site_dir/etc/environment"/*; do
      [[ -f "$env_f" ]] || continue
      env_val="$(tr -d '\r\n' < "$env_f" 2>/dev/null || true)"
      IFS=':'
      for d in $env_val; do
        [[ -n "$d" && -d "$d" ]] && candidates+=("$d")
      done
      IFS="$ifs_save"
    done
  fi

  shopt -s nullglob
  local root_dir
  if [[ -n "$wanted_ver" ]]; then
    for root_dir in "${search_roots[@]}"; do
      for d in \
        "$root_dir"/*node*/"$wanted_ver"/bin \
        "$root_dir"/*node*/"v$wanted_ver"/bin \
        "$root_dir"/*node*"$wanted_ver"*/bin \
        "$root_dir"/alt/alt-nodejs*/root/usr/bin; do
        [[ -d "$d" ]] && candidates+=("$d")
      done
    done
  fi
  for root_dir in "${search_roots[@]}"; do
    for d in \
      "$root_dir"/*node*/v2*/bin \
      "$root_dir"/*node*/2*/bin \
      "$root_dir"/*node*2*/bin \
      "$root_dir"/alt/alt-nodejs2*/root/usr/bin; do
      [[ -d "$d" ]] && candidates+=("$d")
    done
  done
  shopt -u nullglob

  local fallback_dir=""
  local ver major
  for d in "${candidates[@]}"; do
    [[ -x "$d/node" ]] || continue
    ver="$("$d/node" -v 2>/dev/null || true)"
    ver="${ver#v}"
    [[ "$ver" =~ ^([0-9]+)\. ]] || continue
    major="${BASH_REMATCH[1]}"
    [[ "$major" -ge 18 ]] || continue
    if [[ -n "$wanted_ver" && "$ver" == "$wanted_ver" ]]; then
      printf '%s\n' "$d"
      return 0
    fi
    if [[ -z "$fallback_dir" ]]; then
      fallback_dir="$d"
    fi
  done

  if [[ -n "$fallback_dir" ]]; then
    printf '%s\n' "$fallback_dir"
    return 0
  fi

  # Резерв на случай, если окружение Node.js в NetAngels подключено через PROMPT_COMMAND / alias / функцию в интерактивном bashrc.
  local probe_out probe_line resolved_bin
  probe_out="$(
    bash -ic "cd -- \"$site_dir\" >/dev/null 2>&1; if [[ -n \"\${PROMPT_COMMAND:-}\" ]]; then eval \"\$PROMPT_COMMAND\" >/dev/null 2>&1 || true; fi; alias node 2>/dev/null || true; declare -f node 2>/dev/null || true; type -a -P node 2>/dev/null || true" </dev/null 2>/dev/null || true
  )"
  while IFS= read -r probe_line; do
    if [[ "$probe_line" =~ (/[^\'\"[:space:]]+/node) ]]; then
      resolved_bin="${BASH_REMATCH[1]}"
      d="$(dirname -- "$resolved_bin")"
      if [[ -x "$d/node" ]]; then
        ver="$("$d/node" -v 2>/dev/null || true)"
        ver="${ver#v}"
        if [[ "$ver" =~ ^([0-9]+)\. ]] && [[ "${BASH_REMATCH[1]}" -ge 18 ]]; then
          printf '%s\n' "$d"
          return 0
        fi
      fi
    fi
  done <<< "$probe_out"

  return 1
}

main() {
  local site_arg=""
  local branch="${POSITRONIUM_BRANCH:-main}"
  local repo_url="${POSITRONIUM_REPO_URL:-https://github.com/rpg-companios/Fallout-2d20-companion.git}"
  local target_patch="${POSITRONIUM_PATCH:-}"
  local skip_pull=0
  local skip_build=0
  local clean_build=0
  local run_healthcheck=1

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --site)
        [[ $# -ge 2 ]] || { echo "Ошибка: после --site нужен путь к каталогу сайта." >&2; exit 2; }
        site_arg="$2"
        shift 2
        ;;
      --branch)
        [[ $# -ge 2 ]] || { echo "Ошибка: после --branch нужно имя ветки." >&2; exit 2; }
        branch="$2"
        shift 2
        ;;
      --repo-url)
        [[ $# -ge 2 ]] || { echo "Ошибка: после --repo-url нужен URL репозитория." >&2; exit 2; }
        repo_url="$2"
        shift 2
        ;;
      --patch)
        [[ $# -ge 2 ]] || { echo "Ошибка: после --patch нужен номер патча." >&2; exit 2; }
        target_patch="$2"
        shift 2
        ;;
      --skip-pull)
        skip_pull=1
        shift
        ;;
      --skip-build)
        skip_build=1
        shift
        ;;
      --clean)
        clean_build=1
        shift
        ;;
      --no-healthcheck)
        run_healthcheck=0
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      -*)
        echo "Ошибка: неизвестный параметр: $1" >&2
        usage >&2
        exit 2
        ;;
      *)
        if [[ -n "$site_arg" ]]; then
          echo "Ошибка: каталог сайта указан дважды: '$site_arg' и '$1'." >&2
          exit 2
        fi
        site_arg="$1"
        shift
        ;;
    esac
  done

  local cwd_abs
  cwd_abs="$(resolve_abs_dir "$PWD")"
  local script_dir="${DEPLOY_NETANGELS_SCRIPT_DIR:-$cwd_abs}"
  script_dir="$(resolve_abs_dir "$script_dir")"

  # 1. Определяем каталог сайта NetAngels (SITE_DIR).
  local site_dir=""
  if [[ -n "$site_arg" ]]; then
    if [[ ! -d "$site_arg" ]]; then
      echo "✗ Каталог сайта не найден: $site_arg" >&2
      exit 1
    fi
    site_dir="$(resolve_abs_dir "$site_arg")"
  elif is_netangels_site_dir "$cwd_abs" && ! is_positronium_repo_dir "$cwd_abs"; then
    site_dir="$cwd_abs"
  elif is_netangels_site_dir "$script_dir" && ! is_positronium_repo_dir "$script_dir"; then
    site_dir="$script_dir"
  elif is_netangels_site_dir "$(dirname -- "$cwd_abs")"; then
    site_dir="$(resolve_abs_dir "$(dirname -- "$cwd_abs")")"
  elif is_netangels_site_dir "$(dirname -- "$script_dir")"; then
    site_dir="$(resolve_abs_dir "$(dirname -- "$script_dir")")"
  else
    local candidates=()
    local candidate
    for candidate in "$HOME"/*; do
      [[ -d "$candidate" ]] || continue
      if [[ -f "$candidate/etc/environment/APP_IP" ]]; then
        candidates+=("$(resolve_abs_dir "$candidate")")
      fi
    done
    if [[ "${#candidates[@]}" -eq 1 ]]; then
      site_dir="${candidates[0]}"
    else
      echo "✗ Не удалось автоматически определить каталог сайта NetAngels." >&2
      echo "  Перейдите в каталог сайта (например: cd ~/positronium-engine.na4u.ru)" >&2
      echo "  или передайте путь явно: ./deploy-netangels.sh ~/positronium-engine.na4u.ru" >&2
      exit 1
    fi
  fi

  mkdir -p -- "$site_dir/app" "$site_dir/www" "$site_dir/tmp"
  export TMPDIR="$site_dir/tmp"

  # 2. Активируем виртуальное окружение Node.js сайта NetAngels.
  # Важно: etc/environment/PATH в контейнере содержит системный /usr/bin (где лежит старый
  # системный node v10.24.0), поэтому НЕ ставим его впереди активного виртуального Node.js!
  local site_env_path prompt_suffix
  site_env_path="$(read_env_file "$site_dir/etc/environment/PATH")"
  prompt_suffix="$(read_env_file "$site_dir/etc/environment/PROMPT_SUFFIX")"
  if [[ "$prompt_suffix" == "(html)" ]]; then
    echo "✗ Сайт $(basename -- "$site_dir") создан с типом «Статический HTML» ($prompt_suffix)." >&2
    echo "  В таком контейнере нет демона Node.js и поддержки WebSocket /ws." >&2
    echo "  Создайте сайт с конфигурацией «Node.js • PostgreSQL» (или «Node.js • MySQL») в панели NetAngels." >&2
    exit 1
  fi

  local modern_node_bin=""
  if modern_node_bin="$(resolve_modern_node_bin "$site_dir" "$site_env_path" "$prompt_suffix")"; then
    export PATH="${modern_node_bin}:${PATH}${site_env_path:+:${site_env_path}}"
  elif [[ -n "$site_env_path" ]]; then
    export PATH="${PATH}:${site_env_path}"
  fi
  if [[ -d "$site_dir/bin" ]]; then
    export PATH="${PATH}:$site_dir/bin"
  fi
  hash -r 2>/dev/null || true

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "✗ Не найдены команды node / npm в окружении сайта $site_dir." >&2
    echo "  Убедитесь, что сайт в панели NetAngels создан на шаблоне Node.js (рекомендуется Node.js 20 или 22)." >&2
    exit 1
  fi

  local node_major
  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if [[ "$node_major" -lt 18 ]]; then
    echo "✗ Обнаружена слишком старая версия Node.js ($(node -v))." >&2
    echo "  Выберите версию Node.js 20 или 22 на вкладке «Node.js» в настройках сайта NetAngels." >&2
    exit 1
  fi

  local app_ip app_port app_path
  app_ip="$(read_env_file "$site_dir/etc/environment/APP_IP")"
  app_port="$(read_env_file "$site_dir/etc/environment/APP_PORT")"
  app_path="$(read_env_file "$site_dir/etc/environment/APP_PATH")"

  echo "==> Развёртывание Positronium в $site_dir (Node $(node -v))"

  # 3. Определяем или клонируем рабочий репозиторий с исходниками (REPO_DIR).
  local repo_dir=""
  if is_positronium_repo_dir "$script_dir"; then
    repo_dir="$script_dir"
  elif is_positronium_repo_dir "$cwd_abs"; then
    repo_dir="$cwd_abs"
  else
    repo_dir="$site_dir/repo"
  fi

  if [[ ! -d "$repo_dir/.git" ]] && ! is_positronium_repo_dir "$repo_dir"; then
    if ! command -v git >/dev/null 2>&1; then
      echo "✗ Команда git не найдена, клонирование невозможно." >&2
      exit 1
    fi
    echo "==> Клонирование репозитория ($branch) в $repo_dir..."
    rm -rf -- "$repo_dir"
    git clone --branch "$branch" -- "$repo_url" "$repo_dir" </dev/null
  elif [[ "$skip_pull" -eq 0 && -d "$repo_dir/.git" ]]; then
    if [[ "$repo_dir" == "$site_dir/repo" ]]; then
      echo "==> Обновление исходников ($branch) в $repo_dir..."
      git -C "$repo_dir" fetch --quiet origin "$branch" </dev/null
      git -C "$repo_dir" checkout --quiet -f "$branch" </dev/null
      git -C "$repo_dir" reset --hard "origin/$branch" >/dev/null
      git -C "$repo_dir" clean -fd -e node_modules -e .expo >/dev/null
    fi
  fi

  repo_dir="$(resolve_abs_dir "$repo_dir")"

  # Если запрошен конкретный патч или в ветке ещё нет актуального скрипта NetAngels (патч 467+),
  # автоматически подтягиваем свежий патч через apply-patch.sh.
  local min_netangels_patch="467"
  local effective_patch="$target_patch"
  if [[ -z "$effective_patch" && "$skip_pull" -eq 0 && -f "$repo_dir/apply-patch.sh" ]]; then
    local repo_ver
    repo_ver="$(
      node -p "try { parseInt(JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).version, 10) || 0 } catch { 0 }" \
        "$repo_dir/public/version.json" 2>/dev/null || echo 0
    )"
    if [[ "$repo_ver" -lt "$min_netangels_patch" ]]; then
      effective_patch="$min_netangels_patch"
    fi
  fi
  if [[ -n "$effective_patch" ]]; then
    echo "==> Применение патча №${effective_patch}..."
    bash "$repo_dir/apply-patch.sh" "$effective_patch" </dev/null
  fi

  # 4. Установка зависимостей и сборка статического веб-интерфейса dist/.
  if [[ "$skip_build" -eq 0 ]]; then
    if [[ "$clean_build" -eq 1 ]]; then
      rm -rf -- "$repo_dir/node_modules" "$repo_dir/.expo/metro-cache" "$repo_dir/dist"
    fi

    local lock_hash=""
    if [[ -f "$repo_dir/package-lock.json" ]]; then
      lock_hash="$(
        node -e "
          const fs = require('node:fs');
          const crypto = require('node:crypto');
          const h = crypto.createHash('sha256');
          h.update(process.versions.node + '\0');
          h.update(fs.readFileSync(process.argv[1]));
          h.update('\0');
          h.update(fs.readFileSync(process.argv[2]));
          process.stdout.write(h.digest('hex'));
        " "$repo_dir/package.json" "$repo_dir/package-lock.json"
      )"
    fi

    local hash_stamp="$repo_dir/node_modules/.positronium-lock-hash"
    local installed_hash=""
    if [[ -f "$hash_stamp" ]]; then
      installed_hash="$(tr -d '\r\n' < "$hash_stamp")"
    fi

    if [[ -z "$lock_hash" || "$installed_hash" != "$lock_hash" || ! -d "$repo_dir/node_modules/expo" || ! -d "$repo_dir/node_modules/@babel/core" || ! -d "$repo_dir/node_modules/ws" ]]; then
      echo "==> Установка npm-зависимостей (включая пакеты сборки)..."
      (
        cd -- "$repo_dir"
        if [[ -f package-lock.json ]]; then
          NPM_CONFIG_PRODUCTION=false NODE_ENV=development npm ci --include=dev --no-audit --no-fund </dev/null
        else
          NPM_CONFIG_PRODUCTION=false NODE_ENV=development npm install --include=dev --no-audit --no-fund </dev/null
        fi
      )
      if [[ -n "$lock_hash" && -d "$repo_dir/node_modules" ]]; then
        printf '%s\n' "$lock_hash" > "$hash_stamp"
      fi
    else
      echo "==> Зависимости npm уже актуальны (пропуск npm ci)."
    fi

    local workers="${POSITRONIUM_BUILD_WORKERS:-2}"
    local node_opts="${NODE_OPTIONS:---max-old-space-size=1536}"
    echo "==> Сборка веб-приложения (expo export, workers=${workers})..."
    (
      cd -- "$repo_dir"
      rm -rf -- dist
      CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production NODE_OPTIONS="$node_opts" \
        npx expo export --platform web --max-workers "$workers" </dev/null
    )
  fi

  if [[ ! -f "$repo_dir/dist/index.html" ]]; then
    echo "✗ Ошибка: после сборки не найден файл $repo_dir/dist/index.html" >&2
    exit 1
  fi

  # 5. Раскладываем статику в <сайт>/www/ (сохраняя права каталога www, .well-known и файлы верификации).
  echo "==> Обновление статики в $site_dir/www..."
  local preserve_dir="$site_dir/tmp/www-preserve-$$"
  rm -rf -- "$preserve_dir"
  mkdir -p -- "$preserve_dir"

  shopt -s nullglob
  local verify_file
  for verify_file in "$site_dir/www"/google*.html "$site_dir/www"/yandex_*.html; do
    cp -a -- "$verify_file" "$preserve_dir/"
  done
  shopt -u nullglob

  find "$site_dir/www" -mindepth 1 -maxdepth 1 ! -name '.well-known' -exec rm -rf -- {} +
  cp -a -- "$repo_dir/dist/." "$site_dir/www/"

  shopt -s nullglob
  for verify_file in "$preserve_dir"/*; do
    local base_name
    base_name="$(basename -- "$verify_file")"
    if [[ ! -e "$site_dir/www/$base_name" ]]; then
      cp -a -- "$verify_file" "$site_dir/www/$base_name"
    fi
  done
  shopt -u nullglob
  rm -rf -- "$preserve_dir"

  chmod -R u+rwX,go+rX -- "$site_dir/www"

  # 6. Раскладываем лёгкий комнатный сервер в <сайт>/app/.
  local app_dir
  app_dir="$(resolve_abs_dir "$site_dir/app")"
  echo "==> Настройка комнатного сервера в $app_dir..."

  if [[ "$repo_dir" != "$app_dir" ]]; then
    # Очищаем старые артефакты внутри app/, не удаляя сам каталог app/ и кэш ws при совпадении.
    find "$app_dir" -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec rm -rf -- {} +
    cp -a -- "$repo_dir/server" "$app_dir/server"

    local ws_range
    ws_range="$(
      node -p "(require(process.argv[1]).dependencies && require(process.argv[1]).dependencies.ws) || '^8.22.0'" \
        "$repo_dir/package.json"
    )"

    cat > "$app_dir/package.json" <<EOF
{
  "name": "positronium-room-server",
  "private": true,
  "scripts": {
    "start": "node server/index.js"
  },
  "dependencies": {
    "ws": "${ws_range}"
  }
}
EOF

    if [[ -d "$repo_dir/node_modules/ws" ]]; then
      mkdir -p -- "$app_dir/node_modules"
      rm -rf -- "$app_dir/node_modules/ws"
      cp -a -- "$repo_dir/node_modules/ws" "$app_dir/node_modules/ws"
    elif [[ ! -d "$app_dir/node_modules/ws" ]]; then
      (
        cd -- "$app_dir"
        npm install --omit=dev --no-audit --no-fund </dev/null
      )
    fi
  fi

  # hello.js нужен, чтобы стандартный APP_PATH NetAngels (.../app/hello.js) работал
  # сразу после создания сайта вообще без ручного редактирования настроек в панели.
  cat > "$app_dir/hello.js" <<'EOF'
'use strict';

// Точка входа по умолчанию для Node.js-контейнера NetAngels (APP_PATH=.../app/hello.js).
// Работает идентично `npm start` и `node server/index.js`.
require('./server/index.js');
EOF

  chmod -R u+rwX,go+rX -- "$app_dir/server" "$app_dir/hello.js"

  # Контрольная проверка загрузки серверных модулей ДО перезапуска демона.
  node -e "
    const mod = require(process.argv[1]);
    if (typeof mod.createManagedAppServer !== 'function') {
      throw new Error('createManagedAppServer не экспортирован');
    }
  " "$app_dir/server/start.js"

  # Кладём свежую копию скрипта в корень сайта для удобных будущих обновлений `./deploy-netangels.sh`.
  if [[ -f "$repo_dir/deploy-netangels.sh" && "$repo_dir" != "$site_dir" ]]; then
    cp -- "$repo_dir/deploy-netangels.sh" "$site_dir/deploy-netangels.sh"
    chmod +x -- "$site_dir/deploy-netangels.sh"
  fi

  local deployed_version
  deployed_version="$(
    node -p "try { JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).version || '' } catch { '' }" \
      "$site_dir/www/version.json"
  )"

  # 7. Перезапускаем сервис Node.js в NetAngels и проверяем готовность HTTP + WebSocket /ws.
  touch -- "$site_dir/reload"
  echo "✓ Файлы развёрнуты (версия: ${deployed_version:-unknown}), отправлен сигнал перезапуска ($site_dir/reload)."

  if [[ "$run_healthcheck" -eq 1 && -n "$app_ip" && -n "$app_port" ]]; then
    echo "==> Проверка локального сокета NetAngels (${app_ip}:${app_port})..."
    if node - "$app_ip" "$app_port" "$deployed_version" "$app_dir" <<'NODE_CHECK'
const http = require('node:http');
const path = require('node:path');

const [host, rawPort, expectedVersion, appDir] = process.argv.slice(2);
const port = Number(rawPort);
const { PROTOCOL_VERSION, MESSAGE } = require(path.join(appDir, 'server', 'protocol.js'));
const WsMod = require(require.resolve('ws', { paths: [appDir] }));
const WebSocket = WsMod.WebSocket || WsMod;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const checkHttp = () => new Promise((resolve, reject) => {
  const req = http.get(
    { host, port, path: '/__boot-status', timeout: 1500 },
    (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    },
  );
  req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
  req.on('error', reject);
});

const checkWs = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://${host}:${port}/ws`);
  const timer = setTimeout(() => {
    try { ws.terminate(); } catch {}
    reject(new Error('WS timeout'));
  }, 3000);
  ws.on('open', () => {
    ws.send(JSON.stringify({
      v: PROTOCOL_VERSION,
      type: MESSAGE.PRESENCE_PING,
      clientId: 'netangels-deploy-probe',
      ts: Date.now(),
      payload: {},
    }));
  });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg && msg.type === MESSAGE.PRESENCE_PONG) {
        clearTimeout(timer);
        ws.close();
        resolve(true);
      }
    } catch (err) {
      clearTimeout(timer);
      ws.close();
      reject(err);
    }
  });
  ws.on('error', (err) => {
    clearTimeout(timer);
    reject(err);
  });
});

(async () => {
  let lastErr = null;
  let matchedStatus = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const st = await checkHttp();
      if (st && st.state === 'ready' && (!expectedVersion || String(st.version) === String(expectedVersion))) {
        matchedStatus = st;
        break;
      }
      lastErr = new Error(`state=${st?.state}, version=${st?.version}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(400);
  }
  if (!matchedStatus) {
    throw lastErr || new Error('Сервер ещё не ответил на /__boot-status');
  }
  await checkWs();
  console.log(`✓ Сервер комнат активен на ${host}:${port} (статус: ${matchedStatus.state}, версия: ${matchedStatus.version}, WebSocket /ws: OK)`);
})().catch((err) => {
  console.error(`! Не удалось дождаться ответа от ${host}:${port}: ${err.message}`);
  process.exit(1);
});
NODE_CHECK
    then
      :
    else
      echo "  Подсказка: если сайт создан только что, нажмите «Перезапустить Node.js» в панели NetAngels" >&2
      echo "  (APP_PATH сейчас: ${app_path:-не задан}). Лог: tail -n 30 $site_dir/log/node-runlog/current" >&2
      if [[ -s "$site_dir/log/node-runlog/current" ]]; then
        echo "--- Последние строки лога Node.js ---" >&2
        tail -n 15 "$site_dir/log/node-runlog/current" >&2 || true
      fi
    fi
  fi

  echo "✓ Готово! Сайт: https://$(basename -- "$site_dir")"
}

main "$@"
