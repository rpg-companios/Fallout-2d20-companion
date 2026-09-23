#!/usr/bin/env bash

set -euo pipefail

ARENA_BRANCH="arena/01a0c8e2-fallout-2d20-companion"
REMOTE="origin"

ROOT_DIR="$(
  CDPATH=''
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  pwd
)"

# Цепочка может переписать сам apply-patch.sh: bash читает сценарий по
# смещениям, и перезапись файла посреди выполнения ломает поток команд.
# Работаем со стабильной копией себя; оригинальный каталог передаём
# через окружение (копия живёт во временном каталоге).
if [[ "${APPLY_PATCH_STABLE:-}" != "1" ]]; then
  STABLE_SELF="$(mktemp "${TMPDIR:-/tmp}/apply-patch.stable.XXXXXX.sh")"
  cp -- "${BASH_SOURCE[0]}" "$STABLE_SELF"
  chmod +x -- "$STABLE_SELF"
  export APPLY_PATCH_STABLE=1
  export APPLY_PATCH_ROOT="$ROOT_DIR"
  export APPLY_PATCH_SELF="$STABLE_SELF"
  exec bash "$STABLE_SELF" "$@"
fi
ROOT_DIR="${APPLY_PATCH_ROOT:?}"

usage() {
  cat <<'USAGE'
Использование:
  ./apply-patch.sh <номер>   применить патч и все недостающие до него
  ./apply-patch.sh --status  показать, что стоит и чего не хватает
  ./apply-patch.sh --list    то же, что --status

Единственный источник истины — реальное содержимое файлов прямо сейчас.
При каждом запуске каждый патч ветки проверяется заново:
  git apply --check           — патч ещё не стоит, может встать начисто;
  git apply --reverse --check — патч уже стоит, откатывается начисто.
Никакого журнала, которому доверяют без проверки: коммитил ты или нет,
откатывал ли — скрипту не нужно знать историю, он смотрит на файлы.

Патч, который не проходит ни одну проверку — не приговор: твои коммиты
и правки закономерно уходят мимо старых патчей. Такой патч откладывается,
очередь идёт дальше, а в конце каждый отложенный подтверждается более
поздним патчем на тех же файлах. Нет подтверждения — громкое предупреждение
с точным отчётом. Цель не достигнута — остановка с отчётом по первому
не вставшему.

Откат (git reset/checkout) не трогает новые файлы будущих патчей: скрипт
узнаёт такие остатки (содержимое совпадает байт в байт) и даёт патчу
воссоздать их.

Примеры:
  ./apply-patch.sh 308
  ./apply-patch.sh --status
USAGE
}

MODE="chain"
PATCH_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status|--list)
      MODE="status"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Ошибка: неизвестный ключ: $1"
      echo
      usage
      exit 2
      ;;
    *)
      if [[ -n "$PATCH_ID" ]]; then
        echo "Ошибка: номер патча указан дважды: $PATCH_ID и $1"
        exit 2
      fi
      PATCH_ID="$1"
      shift
      ;;
  esac
done

if [[ "$MODE" != "status" && -z "$PATCH_ID" ]]; then
  usage
  exit 2
fi

# Поддерживает номера вроде 134 и 121b.
if [[ -n "$PATCH_ID" && ! "$PATCH_ID" =~ ^[0-9]+[[:alnum:]]*$ ]]; then
  echo "Ошибка: некорректный номер патча: $PATCH_ID"
  exit 2
fi

if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Ошибка: $ROOT_DIR не является Git-репозиторием."
  exit 1
fi

echo "Загрузка Arena-ветки:"
echo "  $REMOTE/$ARENA_BRANCH"

# Загружает ветку, но не переключает текущую ветку
# и не выполняет merge/rebase.
git -C "$ROOT_DIR" fetch \
  --no-tags \
  "$REMOTE" \
  "refs/heads/$ARENA_BRANCH"

FETCHED_COMMIT="$(
  git -C "$ROOT_DIR" rev-parse FETCH_HEAD
)"

echo "Загружен коммит: $FETCHED_COMMIT"
echo

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/arena-patches.XXXXXX")"

cleanup() {
  rm -rf -- "$WORKDIR"
  if [[ -n "${APPLY_PATCH_SELF:-}" ]]; then
    rm -f -- "$APPLY_PATCH_SELF"
  fi
}

trap cleanup EXIT

# --- список всех патчей в ветке, отсортированный по номеру -------------------

mapfile -t ALL_PATCHES < <(
  git -C "$ROOT_DIR" ls-tree \
    -r \
    --name-only \
    "$FETCHED_COMMIT" \
    -- patchs |
  grep -E '^patchs/[0-9]+[[:alnum:]]*-[^/]*\.patch$' |
  sed -E 's|^patchs/||' |
  sort -V ||
  true
)

if [[ ${#ALL_PATCHES[@]} -eq 0 ]]; then
  echo "Ошибка: в Arena-ветке не найдено ни одного патча."
  exit 1
fi

patch_number() {
  # 144-ammo-weights.patch -> 144 ; 121b-foo.patch -> 121b
  sed -E 's|^([0-9]+[[:alnum:]]*)-.*$|\1|' <<<"$1"
}

# Сравнение номеров: 121 < 121b < 122. sort -V делает это корректно.
number_le() {
  [[ "$1" == "$2" ]] && return 0
  local first
  first="$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)"
  [[ "$first" == "$1" ]]
}

# Строго больше: a < b.
number_lt() {
  [[ "$1" != "$2" ]] && number_le "$1" "$2"
}

extract_patch() {
  local name="$1"
  local dest="$WORKDIR/$name"
  if [[ ! -f "$dest" ]]; then
    git -C "$ROOT_DIR" show "${FETCHED_COMMIT}:patchs/${name}" > "$dest"
  fi
  printf '%s' "$dest"
}

# Файлы, которые патч изменяет (по строкам +++ b/...).
patch_files() {
  grep -E '^\+\+\+ b/' "$1" 2>/dev/null | sed -E 's/^\+\+\+ b\///' | grep -v '^/dev/null' || true
}

# --- проверка патча по дереву, заново при каждом запуске ----------------------
#   applied  — откатывается начисто: по дереву стоит
#   pending  — применяется начисто: по дереву не стоит
#   conflict — ни то ни другое: дерево разошлось с патчем

check_forward() {
  git -C "$ROOT_DIR" apply --check --whitespace=nowarn "$1" 2>/dev/null
}

check_reverse() {
  git -C "$ROOT_DIR" apply --reverse --check "$1" >/dev/null 2>&1
}

patch_state() {
  # Порядок важен: сначала «может встать». На файлах с продублированным
  # содержимым (склейка «два JSON подряд») обратная проверка способна
  # ложно сказать «стоит», совпав с первой копией региона, — тогда патч
  # никогда не починит склейку. Применение решает первым.
  if check_forward "$1"; then
    printf 'pending'
    return
  fi
  if check_reverse "$1"; then
    printf 'applied'
    return
  fi
  printf 'conflict'
}

# --- снимок состояния: каждый патч ветки проверяется по текущему дереву -------

declare -A STATE
for name in "${ALL_PATCHES[@]}"; do
  STATE["$name"]="$(patch_state "$(extract_patch "$name")")"
done

# Старший стоящий патч (для ответа «дерево уже новее запрошенного»).
TOP_APPLIED=""
for name in "${ALL_PATCHES[@]}"; do
  [[ "${STATE[$name]}" == "applied" ]] && TOP_APPLIED="$name"
done

TOP_APPLIED_NUMBER=""
[[ -n "$TOP_APPLIED" ]] && TOP_APPLIED_NUMBER="$(patch_number "$TOP_APPLIED")"

# Подтверждён ли отложенный патч. Два вида доказательства, любое:
#   1) более поздний патч на тех же файлах (кроме чейнджлогов — их
#      трогают все, это не доказательство) стоит или был применён;
#   2) след строк: хотя бы одна добавленная патчем строка (в файле
#      вне чейнджлогов) до сих пор лежит в дереве дословно.
# Есть доказательство — дерево закономерно ушло мимо отложенного
# (его строки изменило или унаследовало то, что встало позже).
# Нет — файлы отложенного никем не подтверждены: возможно повреждение.
is_changelog() {
  [[ "$1" == "docs/changelog.ru.md" || "$1" == "docs/changelog.en.md" ]]
}

patch_files_strong() {
  # файлы патча, кроме чейнджлогов
  local f
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    is_changelog "$f" && continue
    printf '%s\n' "$f"
  done < <(patch_files "$1")
}

is_confirmed() {
  # $1 = имя отложенного патча; $2... = имена стоящих/применённых
  local dname="$1"
  shift
  local dnum dfile ok v f
  dnum="$(patch_number "$dname")"
  dfile="$(extract_patch "$dname")"
  ok=0

  # 0) патч самого установщика: установщик приходит бутстрапом (копия себя
  # из ветки до цепочки), минуя промежуточные патчи 295→297→299 — их
  # содержимое в дереве перекрыто самой программой установки. Такой патч
  # подтверждён, если его единственный содержательный файл — apply-patch.sh.
  local only_installer=1
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ "$f" != "apply-patch.sh" ]]; then only_installer=0; break; fi
  done < <(patch_files_strong "$dfile")
  if [[ $only_installer -eq 1 ]]; then
    return 0
  fi

  # 1) общий файл с более поздним стоящим/применённым
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    for v in "$@"; do
      [[ -z "$v" ]] && continue
      number_lt "$dnum" "$(patch_number "$v")" || continue
      if patch_files_strong "$(extract_patch "$v")" | grep -Fxq -- "$f"; then
        return 0
      fi
    done
  done < <(patch_files_strong "$dfile")

  # 2) след добавленных строк в дереве (файлы вне чейнджлогов)
  local file line checked
  while IFS=$'\t' read -r file line; do
    [[ -z "$file" || -z "$line" ]] && continue
    [[ -f "$ROOT_DIR/$file" ]] || continue
    if grep -Fqx -- "$line" "$ROOT_DIR/$file" 2>/dev/null; then
      return 0
    fi
  done < <(added_lines "$dfile")
  return 1
}

# Добавленные строки патча: «файл<TAB>строка», файлы вне чейнджлогов,
# строка не короче 10 символов, не больше 15 на файл.
added_lines() {
  awk '
    function flush() { n = 0 }
    BEGIN { cur = ""; n = 0 }
    /^diff --git / { flush(); cur = "" }
    /^\+\+\+ b\// {
      p = substr($0, 7)
      if (p != "docs/changelog.ru.md" && p != "docs/changelog.en.md") cur = p
      else cur = ""
      flush()
      next
    }
    cur != "" && /^\+/ && !/^\+\+\+/ {
      if (n < 15) {
        l = substr($0, 2)
        if (length(l) >= 10) {
          printf "%s\t%s\n", cur, l
          n++
        }
      }
    }
  ' "$1"
}

# --- целостность файлов данных ------------------------------------------------
# Склейки «два JSON подряд» ломают приложение на загрузке — ловим сразу
# после применения и на повторных запусках. Лечение — tools/fix-double-json.js.
json_check() {
  command -v node >/dev/null 2>&1 || return 0
  local out
  if out="$(cd "$ROOT_DIR" && node -e '
    const fs=require("fs"),path=require("path");const bad=[];
    function walk(d){ if(!fs.existsSync(d))return; for(const f of fs.readdirSync(d)){const p=path.join(d,f);const s=fs.statSync(p);if(s.isDirectory())walk(p);else if(p.endsWith(".json")){try{JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){bad.push(p+" — "+e.message.slice(0,60))}}}}
    walk("modules"); walk("i18n");
    if(bad.length){console.log(bad.join("\n"));process.exit(1)}
  ' 2>/dev/null)"; then
    return 0
  fi
  echo "ВНИМАНИЕ: в файлах данных есть поломки формата (склейки и т.п.):"
  printf '%s\n' "$out" | sed 's/^/  /'
  echo
  echo "Лечение: node tools/fix-double-json.js  (резервные копии .bak)"
  return 1
}

# --- режим статуса -----------------------------------------------------------

if [[ "$MODE" == "status" ]]; then
  echo "Состояние патчей (проверка по содержимому дерева, заново):"
  echo
  STANDING=()
  will_apply=()
  confirmed=0
  diverged=()
  for name in "${ALL_PATCHES[@]}"; do
    state="${STATE[$name]}"
    case "$state" in
      applied)
        printf '  [стоит]     %s\n' "$name"
        STANDING+=("$name")
        ;;
      pending)
        printf '  [будет]     %s\n' "$name"
        will_apply+=("$name")
        ;;
      conflict)
        if is_confirmed "$name" "${STANDING[@]}"; then
          printf '  [перекрыт]  %s\n' "$name"
          confirmed=$((confirmed + 1))
        else
          printf '  [разошлось] %s\n' "$name"
          diverged+=("$name")
        fi
        ;;
    esac
  done
  echo
  echo "Стоит: ${#STANDING[@]}  Будет: ${#will_apply[@]}  Перекрыто: $confirmed  Разошлось: ${#diverged[@]}"
  if [[ -n "$TOP_APPLIED" ]]; then
    echo "Старший стоящий: $TOP_APPLIED"
  else
    echo "Стоящих патчей нет — дерево до самой первой цепочки."
  fi
  echo
  if [[ ${#will_apply[@]} -gt 0 ]]; then
    last="${will_apply[${#will_apply[@]} - 1]}"
    echo "Поставить всё недостающее:  ./apply-patch.sh $(patch_number "$last")"
  elif [[ ${#diverged[@]} -eq 0 ]]; then
    echo "Всё актуально."
  fi
  echo
  if json_check; then
    echo "Формат файлов данных: чисто."
  fi
  exit 0
fi

# --- поиск целевого патча ----------------------------------------------------

TARGET=""
for name in "${ALL_PATCHES[@]}"; do
  if [[ "$(patch_number "$name")" == "$PATCH_ID" ]]; then
    if [[ -n "$TARGET" ]]; then
      echo "Ошибка: в Arena-ветке несколько патчей №$PATCH_ID:"
      echo "  $TARGET"
      echo "  $name"
      exit 1
    fi
    TARGET="$name"
  fi
done

if [[ -z "$TARGET" ]]; then
  echo "Ошибка: патч №$PATCH_ID не найден в Arena-ветке."
  exit 1
fi

# --- дерево уже новее запрошенного -------------------------------------------

if [[ -n "$TOP_APPLIED_NUMBER" ]] \
  && ! number_le "$TOP_APPLIED_NUMBER" "$PATCH_ID"; then
  echo "Дерево уже новее запрошенного: стоит $TOP_APPLIED (№$TOP_APPLIED_NUMBER >= №$PATCH_ID)."
  echo "Ничего не делаю."
  exit 0
fi

# --- очередь: все патчи до целевого, по порядку, по состоянию дерева ----------
# Наверх пропускаются только стоящие (откатываются начисто). Всё прочее —
# в очередь: заранее отличить «цепочка ещё не дошла» от «дерево ушло мимо»
# нельзя, вердикт каждому выносит применение.

QUEUE=()
UPFRONT_STANDING=()

for name in "${ALL_PATCHES[@]}"; do
  number_le "$(patch_number "$name")" "$PATCH_ID" || continue
  if [[ "${STATE[$name]}" == "applied" ]]; then
    UPFRONT_STANDING+=("$name")
  else
    QUEUE+=("$name")
  fi
done

if [[ ${#QUEUE[@]} -eq 0 ]]; then
  echo "По содержимому дерева всё до №$PATCH_ID стоит."
  echo "Ничего не нужно."
  echo
  json_check || exit 1
  exit 0
fi

echo "По содержимому дерева стоит: ${#UPFRONT_STANDING[@]} (пропускаются молча)."
echo
echo "Очередь (вердикт каждому — при применении): ${#QUEUE[@]}"
for name in "${QUEUE[@]}"; do
  printf '  %s\n' "$name"
done
echo

# --- незакоммиченные изменения: предупреждение -------------------------------

if [[ -n "$(git -C "$ROOT_DIR" status --porcelain 2>/dev/null)" ]]; then
  echo "ВНИМАНИЕ: в дереве есть незакоммиченные изменения."
  echo "Смешивать их с применением патчей рискованно. Лучше закоммитить"
  echo "или сделать stash. Продолжаю, но при неудаче откат сделанного"
  echo "этим запуском: git checkout -- . && git reset"
  echo
fi

# Содержимое нового файла из патча (секция «--- /dev/null / +++ b/путь»):
# нужно, чтобы узнать остатки отката — файлы будущего патча, которые
# git reset не трогает (они несопровождаемые). Если содержимое остатка
# совпадает с патчевым байт в байт — это след самого патча, а не чужой
# файл: его можно убрать и дать патчу воссоздать.
new_file_content() {
  local patch_file="$1" want="$2"
  awk -v path="$want" '
    BEGIN { insec = 0; buf = "" }
    /^diff --git / { if (insec) exit; insec = 0 }
    /^\+\+\+ b\// {
      p = substr($0, 7)
      if (insec) exit
      if (p == path) insec = 1
      next
    }
    insec && /^\+/ { buf = buf substr($0, 2) "\n" }
    END { printf "%s", buf }
  ' "$patch_file"
}

# --- применение --------------------------------------------------------------

APPLIED=()
STANDING_LATE=()
DEFERRED=()

for name in "${QUEUE[@]}"; do
  file="$(extract_patch "$name")"

  printf 'Применение: %s ... ' "$name"

  if git -C "$ROOT_DIR" apply --check --whitespace=nowarn "$file" 2>"$WORKDIR/fwd.err"; then
    git -C "$ROOT_DIR" apply --whitespace=nowarn "$file"
    echo "ок"
    APPLIED+=("$name")
    continue
  fi

  if check_reverse "$file"; then
    echo "ок (по проверке уже стоит — дерево не тронуто)"
    STANDING_LATE+=("$name")
    continue
  fi

  # Остатки отката: «file already exists» от несопровождаемых файлов,
  # чьё содержимое совпадает с патчевым байт в байт.
  moved=()
  leftovers_ok=1
  while IFS= read -r errline; do
    p="${errline#error: }"
    p="${p%: already exists*}"
    [[ -n "$p" && -f "$ROOT_DIR/$p" ]] || { leftovers_ok=0; break; }
    if [[ "$(new_file_content "$file" "$p")" == "$(cat "$ROOT_DIR/$p")" ]]; then
      mkdir -p "$WORKDIR/leftovers/$(dirname "$p")"
      mv "$ROOT_DIR/$p" "$WORKDIR/leftovers/$p"
      moved+=("$p")
    else
      leftovers_ok=0
      break
    fi
  done < <(grep 'already exists' "$WORKDIR/fwd.err" || true)

  apply_done=0
  if [[ $leftovers_ok -eq 1 && ${#moved[@]} -gt 0 ]]; then
    if git -C "$ROOT_DIR" apply --check --whitespace=nowarn "$file" 2>/dev/null; then
      git -C "$ROOT_DIR" apply --whitespace=nowarn "$file"
      echo "ок (остатки отката совпали байт в байт — воссозданы патчем)"
      APPLIED+=("$name")
      apply_done=1
    fi
  fi
  if [[ $apply_done -ne 1 && ${#moved[@]} -gt 0 ]]; then
    # Вернуть перемещённое на место ВСЕГДА: и когда очередной файл не
    # совпал (leftovers_ok=0), и когда проверка с перемещённым не прошла.
    # Раньше возврат был только во второй ветке — частично перемещённые
    # файлы терялись из дерева (случай с приёмочным тестом тест-сеттинга).
    for p in "${moved[@]}"; do
      [[ -e "$WORKDIR/leftovers/$p" ]] && mv "$WORKDIR/leftovers/$p" "$ROOT_DIR/$p"
    done
  fi

  if [[ $apply_done -eq 1 ]]; then
    continue
  fi

  echo "отложен (дерево разошлось — проверю по ходу цепочки)"
  DEFERRED+=("$name")
done

# --- вердикт ------------------------------------------------------------------

TARGET_OK=0
if [[ "${STATE[$TARGET]}" == "applied" ]]; then
  TARGET_OK=1
fi
for name in "${APPLIED[@]}" "${STANDING_LATE[@]}"; do
  [[ "$name" == "$TARGET" ]] && TARGET_OK=1
done

if [[ $TARGET_OK -ne 1 ]]; then
  echo
  echo "ОСТАНОВКА: цель №$PATCH_ID ($TARGET) не достигнута."
  if [[ ${#DEFERRED[@]} -gt 0 ]]; then
    first="${DEFERRED[0]}"
    echo "Первый не вставший: $first"
    echo "Дерево этим патчем НЕ изменено (применение атомарно)."
    echo
    echo "Причины и места (сырой вывод проверки):"
    git -C "$ROOT_DIR" apply --check --whitespace=nowarn "$WORKDIR/$first" 2>&1 | sed 's|^|  |' | head -20
    if [[ ${#DEFERRED[@]} -gt 1 ]]; then
      echo
      echo "И ещё не встали ($(( ${#DEFERRED[@]} - 1 ))), все ниже по цепочке:"
      printf '  %s\n' "${DEFERRED[@]:1}"
    fi
  fi
  echo
  echo "Что дальше:"
  echo "  — мешают локальные правки: закоммить или stash и повтори,"
  echo "    либо правь файлы вручную по этому патчу;"
  echo "  — нужно переиздание патча под твоё дерево — скажи, соберу."
  if [[ ${#APPLIED[@]} -gt 0 ]]; then
    echo
    echo "До остановки этим запуском применены:"
    printf '  %s\n' "${APPLIED[@]}"
    echo
    echo "Откатить сделанное этим запуском:"
    echo "  git checkout -- . && git reset"
  fi
  exit 1
fi

# Цель достигнута. Отложенные должны подтверждаться более поздними патчами
# на тех же файлах — иначе их файлы никем не проверены (возможно повреждение).

VALIDATORS=()
for name in "${APPLIED[@]}" "${STANDING_LATE[@]}" "${UPFRONT_STANDING[@]}"; do
  VALIDATORS+=("$name")
done

UNVALIDATED=()
if [[ ${#DEFERRED[@]} -gt 0 ]]; then
  for name in "${DEFERRED[@]}"; do
    if ! is_confirmed "$name" ${VALIDATORS+"${VALIDATORS[@]}"}; then
      UNVALIDATED+=("$name")
    fi
  done
fi

if [[ ${#UNVALIDATED[@]} -eq 0 ]]; then
  echo
  if [[ ${#APPLIED[@]} -eq 0 ]]; then
    echo "По содержимому дерева всё до №$PATCH_ID стоит. Ничего не нужно."
  else
    echo "Готово. Применено патчей: ${#APPLIED[@]}"
    printf '  %s\n' "${APPLIED[@]}"
  fi
  if [[ ${#DEFERRED[@]} -gt 0 ]]; then
    echo
    echo "Отложено (дерево ушло мимо, подтверждено): ${#DEFERRED[@]}"
    printf '  %s\n' "${DEFERRED[@]}"
  fi
  echo
  json_check || exit 1
  echo "Источник: $REMOTE/$ARENA_BRANCH"
  echo "Коммит:   $FETCHED_COMMIT"
  if [[ ${#APPLIED[@]} -gt 0 ]]; then
    echo
    echo "Закрепите результат коммитом — это точка отката перед следующей установкой:"
    echo "  git add -A && git commit -m \"Патчи применены: цель №$PATCH_ID\""
  fi
  exit 0
fi

echo
echo "ВНИМАНИЕ: цель №$PATCH_ID достигнута, но ${#UNVALIDATED[@]} патч(ей)"
echo "разошлись с деревом БЕЗ подтверждения более поздних патчей —"
echo "их файлы никем не проверены, приложение может быть повреждено."
echo
for name in "${UNVALIDATED[@]}"; do
  echo "  $name:"
  git -C "$ROOT_DIR" apply --check --whitespace=nowarn "$WORKDIR/$name" 2>&1 | sed 's|^|    |' | head -6
done
echo
echo "Что дальше:"
echo "  — покажи этот вывод мне — найду причину и соберу починку;"
echo "  — файлы из отчёта выше могли быть повреждены локальными правками:"
echo "    сравни с ожидаемым (git diff / скажи мне)."
exit 1
