#!/usr/bin/env bash

set -euo pipefail

ARENA_BRANCH="arena/01a0b2bb-fallout-2d20-companion"
REMOTE="origin"

ROOT_DIR="$(
  CDPATH=''
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  pwd
)"

usage() {
  cat <<'USAGE'
Использование:
  ./apply-patch.sh <номер>        применить патч и все недостающие до него
  ./apply-patch.sh <номер> --only применить ровно один патч, без цепочки
  ./apply-patch.sh <номер> --3way применить с трёхсторонним слиянием
                                  (только если точно понимаешь, зачем:
                                  3way может оставить конфликтные маркеры)
  ./apply-patch.sh --status       показать, что стоит и чего не хватает
  ./apply-patch.sh --list         то же, что --status
  ./apply-patch.sh --mark-through <номер>
                                  записать «всё до <номер> уже применено»
                                  в локальное состояние (дерево не трогает)
  ./apply-patch.sh --unmark <номер>
                                  вычеркнуть <номер> из записи состояния

Скрипт ведёт локальную запись применённого — файл arena-patches.state
внутри .git (не коммитится, не пушится, переживает смену ветки).
Состояние НЕ «вынюхивается» из дерева: локальные коммиты и правки между
запусками не сбивают цепочку. Недостающие патчи либо встают начисто,
либо скрипт останавливается с точным отчётом, ничего не ломая.

Первый запуск на дереве, где патчи уже стоят (записи ещё нет):
  ./apply-patch.sh --mark-through <последний номер, который точно стоит>

Примеры:
  ./apply-patch.sh 144
  ./apply-patch.sh 144 --only
  ./apply-patch.sh --status
  ./apply-patch.sh --mark-through 294

Скрипт сам знает по записи, какие патчи уже применены, и ставит только
недостающие, по возрастанию номера. Порядок соблюдается автоматически,
помнить, на чём вы остановились, не нужно.
USAGE
}

MODE="chain"
PATCH_ID=""
ALLOW_3WAY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status|--list)
      MODE="status"
      shift
      ;;
    --only)
      MODE="only"
      shift
      ;;
    --3way)
      ALLOW_3WAY=1
      shift
      ;;
    --mark-through)
      MODE="mark"
      shift
      ;;
    --unmark)
      MODE="unmark"
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

# --- локальная запись состояния ----------------------------------------------
# Живёт внутри .git: не попадает в коммиты, не уходит при push, не мешает
# смене ветки. «Между запусками не пушу» — этот файл и не нужно пушить.

GIT_DIR="$(git -C "$ROOT_DIR" rev-parse --git-dir)"
case "$GIT_DIR" in
  /*) ;;
  *)  GIT_DIR="$ROOT_DIR/$GIT_DIR" ;;
esac
STATE_FILE="$GIT_DIR/arena-patches.state"

declare -a RECORDED=()
state_load() {
  RECORDED=()
  [[ -f "$STATE_FILE" ]] || return 0
  mapfile -t RECORDED < <(grep -Ev '^[[:space:]]*(#|$)' "$STATE_FILE" 2>/dev/null || true)
}

state_has() {
  local needle="$1" item
  for item in "${RECORDED[@]:-}"; do
    [[ -n "$item" && "$item" == "$needle" ]] && return 0
  done
  return 1
}

state_add() {
  {
    grep -Ev '^[[:space:]]*(#|$)' "$STATE_FILE" 2>/dev/null || true
    printf '%s\n' "$1"
  } | sort -Vu >"${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
}

state_remove() {
  grep -Fxv -- "$1" "$STATE_FILE" >"${STATE_FILE}.tmp" 2>/dev/null || true
  mv "${STATE_FILE}.tmp" "$STATE_FILE"
}

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

extract_patch() {
  local name="$1"
  local dest="$WORKDIR/$name"
  if [[ ! -f "$dest" ]]; then
    git -C "$ROOT_DIR" show "${FETCHED_COMMIT}:patchs/${name}" > "$dest"
  fi
  printf '%s' "$dest"
}

# Состояние патча по дереву (только для --status и стартовой проверки,
# решения о применении принимает ТОЛЬКО локальная запись):
#   pending  — применяется начисто
#   applied  — откатывается начисто (по дереву стоит)
#   conflict — ни то ни другое (влито в main / правлено локально)
patch_state() {
  local file="$1"

  if git -C "$ROOT_DIR" apply --check --whitespace=nowarn "$file" >/dev/null 2>&1; then
    printf 'pending'
    return
  fi

  if git -C "$ROOT_DIR" apply --reverse --check "$file" >/dev/null 2>&1; then
    printf 'applied'
    return
  fi

  printf 'conflict'
}

state_load

# --- режим записи/вычёркивания состояния -------------------------------------

find_by_number() {
  local want="$1" name
  for name in "${ALL_PATCHES[@]}"; do
    [[ "$(patch_number "$name")" == "$want" ]] && { printf '%s' "$name"; return 0; }
  done
  return 1
}

if [[ "$MODE" == "mark" ]]; then
  TARGET="$(find_by_number "$PATCH_ID")" || {
    echo "Ошибка: патч №$PATCH_ID не найден в Arena-ветке."
    exit 1
  }
  ADDED=0
  for name in "${ALL_PATCHES[@]}"; do
    number_le "$(patch_number "$name")" "$PATCH_ID" || continue
    if ! state_has "$name"; then
      state_add "$name"
      printf '  записан: %s\n' "$name"
      ADDED=$((ADDED + 1))
    fi
  done
  echo
  echo "Записано: $ADDED (дерево не изменено)."
  echo "Файл записи: $STATE_FILE"
  exit 0
fi

if [[ "$MODE" == "unmark" ]]; then
  TARGET="$(find_by_number "$PATCH_ID")" || {
    echo "Ошибка: патч №$PATCH_ID не найден в Arena-ветке."
    exit 1
  }
  if state_has "$TARGET"; then
    state_remove "$TARGET"
    echo "Вычеркнут из записи: $TARGET"
  else
    echo "Патч $TARGET в записи состояния не значится."
  fi
  echo "Файл записи: $STATE_FILE"
  exit 0
fi

# --- режим статуса -----------------------------------------------------------

if [[ "$MODE" == "status" ]]; then
  echo "Состояние патчей:"
  echo "  Запись состояния: $STATE_FILE"
  if [[ ${#RECORDED[@]} -eq 0 ]]; then
    echo "  (записи нет — первый запуск на уже пропатченном дереве:"
    echo "   ./apply-patch.sh --mark-through <последний номер, который точно стоит>)"
  fi
  echo

  recorded_count=0
  missing_list=()
  sniff_applied_unrecorded=0
  sniff_applied_max=""
  conflict_count=0

  for name in "${ALL_PATCHES[@]}"; do
    if state_has "$name"; then
      recorded_count=$((recorded_count + 1))
      continue
    fi
    state="$(patch_state "$(extract_patch "$name")")"
    case "$state" in
      pending)
        missing_list+=("$name")
        ;;
      applied)
        sniff_applied_unrecorded=$((sniff_applied_unrecorded + 1))
        sniff_applied_max="$name"
        ;;
      conflict)
        conflict_count=$((conflict_count + 1))
        ;;
    esac
  done

  echo "В записи (применено):  $recorded_count"

  if [[ $sniff_applied_unrecorded -gt 0 ]]; then
    echo "Стоит по дереву, но не в записи: $sniff_applied_unrecorded"
    echo "  старший: $sniff_applied_max"
    echo "  (ставил без этого скрипта — занеси: --mark-through <номер>)"
  fi
  if [[ $conflict_count -gt 0 ]]; then
    echo "Контекст разошёлся:    $conflict_count (не в записи; влито в main либо правлено локально)"
  fi

  if [[ ${#missing_list[@]} -gt 0 ]]; then
    echo
    echo "Не хватает — будут поставлены:"
    printf '  [ ] %s\n' "${missing_list[@]}"
    echo
    last="${missing_list[${#missing_list[@]} - 1]}"
    echo "Поставить всё недостающее:  ./apply-patch.sh $(patch_number "$last")"
  else
    echo
    echo "Всё актуально."
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

# --- какие патчи ставить: только по записи состояния -------------------------

QUEUE=()

if [[ "$MODE" == "only" ]]; then
  if ! state_has "$TARGET"; then
    QUEUE=("$TARGET")
  fi
else
  for name in "${ALL_PATCHES[@]}"; do
    number_le "$(patch_number "$name")" "$PATCH_ID" || continue
    state_has "$name" && continue
    QUEUE+=("$name")
  done
fi

# --- стартовая проверка: дерево без записи, но с признаками патчей -----------

# Проверяем ПЕРВЫЙ патч цепочки, а не все: на свежем дереве поздние патчи
# закономерно конфликтуют (их контекст создают предыдущие), а вот первый
# обязан быть pending. Если он applied/conflict — дерево уже несёт патчи
# (или их следы), и без записи состояния вслепую применять нельзя.
if [[ ${#RECORDED[@]} -eq 0 && ${#QUEUE[@]} -gt 0 ]]; then
  first_state="$(patch_state "$(extract_patch "${ALL_PATCHES[0]}")")"
  if [[ "$first_state" != "pending" ]]; then
    echo "Остановка: первый патч цепочки (${ALL_PATCHES[0]}) на этом дереве"
    case "$first_state" in
      applied)  echo "уже стоит (откатывается начисто), " ;;
      conflict) echo "не встаёт и не откатывается (правлен локально или влит), " ;;
    esac
    echo "а локальной записи состояния нет ($STATE_FILE). Применять вслепую —"
    echo "значит риск положить патчи поверх твоих локальных правок."
    echo
    echo "Если нужные патчи уже стоят:"
    echo "  ./apply-patch.sh --mark-through <последний номер, который точно стоит>"
    echo
    echo "Если дерево должно быть чистым от патчей — проверь ветку:"
    echo "  git status && git log --oneline -5"
    exit 1
  fi
fi

if [[ ${#QUEUE[@]} -eq 0 ]]; then
  echo "По локальной записи всё до №$PATCH_ID стоит. Ничего не нужно."
  exit 0
fi

echo "Будет применено: ${#QUEUE[@]}"
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

# --- применение --------------------------------------------------------------

APPLIED=()

for name in "${QUEUE[@]}"; do
  file="$(extract_patch "$name")"

  printf 'Применение: %s ... ' "$name"

  if git -C "$ROOT_DIR" apply --check --whitespace=nowarn "$file" 2>"$WORKDIR/check.err"; then
    git -C "$ROOT_DIR" apply --whitespace=nowarn "$file"
    echo "ок"
    APPLIED+=("$name")
    state_add "$name"
    continue
  fi

  # Явно разрешённое трёхстороннее слияние: только по флагу --3way.
  if [[ $ALLOW_3WAY -eq 1 ]] \
    && git -C "$ROOT_DIR" apply --3way --whitespace=nowarn "$file" >/dev/null 2>&1; then
    if git -C "$ROOT_DIR" ls-files --unmerged | grep -q .; then
      echo "КОНФЛИКТ"
      echo
      echo "Патч $name применён частично (3way), есть конфликтующие файлы:"
      git -C "$ROOT_DIR" diff --name-only --diff-filter=U | sed 's|^|  |'
      echo
      echo "Разберите маркеры <<<<<<< / >>>>>>> в этих файлах."
      echo "Откатить всё сделанное этим запуском:"
      echo "  git checkout -- . && git reset"
      if [[ ${#APPLIED[@]} -gt 0 ]]; then
        echo
        echo "До конфликта успешно применены:"
        printf '  %s\n' "${APPLIED[@]}"
      fi
      exit 1
    fi
    echo "ок (3way)"
    APPLIED+=("$name")
    state_add "$name"
    continue
  fi

  echo "НЕ ПРИМЕНЯЕТСЯ НАЧИСТО"
  echo
  echo "Патч $name не встаёт, дерево этим патчем НЕ изменено (применение"
  echo "без 3way атомарно). Причины и места:"
  sed 's|^|  |' "$WORKDIR/check.err" | head -20
  echo
  echo "Что дальше:"
  echo "  — мешают локальные правки: закоммить/stash и повтори,"
  echo "    либо правь файлы вручную по этому патчу;"
  echo "  — патч по факту уже стоит: ./apply-patch.sh --mark-through $(patch_number "$name")"
  echo "    (или точечно: --unmark $(patch_number "$name") при необходимости);"
  echo "  — нужно переиздание патча под твоё дерево (без конфликтующих"
  echo "    кусков) — скажи, соберу точечный вариант."
  if [[ ${#APPLIED[@]} -gt 0 ]]; then
    echo
    echo "Успешно применены до остановки (они в записи состояния):"
    printf '  %s\n' "${APPLIED[@]}"
  fi
  exit 1
done

echo
echo "Готово. Применено патчей: ${#APPLIED[@]}"
printf '  %s\n' "${APPLIED[@]}"
echo
echo "Источник: $REMOTE/$ARENA_BRANCH"
echo "Коммит:   $FETCHED_COMMIT"
echo "Запись:   $STATE_FILE"
