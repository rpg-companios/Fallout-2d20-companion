#!/usr/bin/env bash

set -euo pipefail

ARENA_BRANCH="arena/01a0610e-fallout-2d20-companion"
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
  ./apply-patch.sh <номер> --only  применить ровно один патч, без цепочки
  ./apply-patch.sh --status        показать, что стоит и чего не хватает
  ./apply-patch.sh --list          то же, что --status

Примеры:
  ./apply-patch.sh 144
  ./apply-patch.sh 144 --only
  ./apply-patch.sh --status

Скрипт сам определяет, какие патчи уже применены, и ставит только
недостающие, по возрастанию номера. Порядок соблюдается автоматически,
помнить, на чём вы остановились, не нужно.
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
    --only)
      MODE="only"
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

# Состояние патча: applied | pending | conflict
#
# ВАЖНО: --3way здесь не используется даже с --check, потому что
# git apply --3way --check реально пишет в индекс и рабочее дерево.
# Определяем состояние только неразрушающими проверками.
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

  # Патч не встаёт целиком и не откатывается целиком. Возможны два случая:
  # часть изменений уже внесена (тогда --3way справится), либо реальный
  # конфликт. Различить без записи нельзя, поэтому помечаем как conflict
  # и предлагаем --3way на этапе применения.
  printf 'conflict'
}

# --- режим статуса -----------------------------------------------------------

if [[ "$MODE" == "status" ]]; then
  echo "Состояние патчей:"
  echo

  applied_count=0
  pending_count=0
  stale_count=0
  PENDING_LIST=()

  for name in "${ALL_PATCHES[@]}"; do
    file="$(extract_patch "$name")"
    state="$(patch_state "$file")"
    case "$state" in
      applied)
        applied_count=$((applied_count + 1))
        ;;
      pending)
        pending_count=$((pending_count + 1))
        PENDING_LIST+=("$name")
        ;;
      conflict)
        stale_count=$((stale_count + 1))
        ;;
    esac
  done

  if [[ $pending_count -gt 0 ]]; then
    echo "Не хватает — будут поставлены:"
    printf '  [ ] %s\n' "${PENDING_LIST[@]}"
    echo
  fi

  echo "Применено точно:      $applied_count"
  echo "Не хватает:           $pending_count"
  echo "Контекст разошёлся:   $stale_count  (как правило, давно влиты в main)"

  if [[ $pending_count -eq 0 ]]; then
    echo
    echo "Всё актуально."
  else
    echo
    last="${PENDING_LIST[${#PENDING_LIST[@]} - 1]}"
    echo "Поставить всё недостающее:  ./apply-patch.sh $(patch_number "$last")"
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

# --- какие патчи ставить -----------------------------------------------------

QUEUE=()

if [[ "$MODE" == "only" ]]; then
  QUEUE=("$TARGET")
else
  for name in "${ALL_PATCHES[@]}"; do
    number_le "$(patch_number "$name")" "$PATCH_ID" || continue
    QUEUE+=("$name")
  done
fi

echo "Проверка состояния..."
echo

# «Уровень» дерева — самый свежий достоверно применённый патч.
# Патчи, отставшие от уровня БОЛЬШЕ ЧЕМ НА STALE_GAP, в цепочку не берём:
# они почти наверняка давно влиты, а «применяются» лишь потому, что
# создают файл, который с тех пор переехал (пример: 31b при уровне 145).
# Недавние же пропуски — обычная ситуация «забыл поставить» — ставятся.
STALE_GAP=10

LEVEL=""
LEVEL_NUM=0
for name in "${ALL_PATCHES[@]}"; do
  file="$(extract_patch "$name")"
  if [[ "$(patch_state "$file")" == "applied" ]]; then
    LEVEL="$(patch_number "$name")"
  fi
done
if [[ -n "$LEVEL" ]]; then
  LEVEL_NUM="10#$(sed -E 's|^0*([0-9]+).*$|\1|' <<<"$LEVEL")"
fi

TODO=()
DEFERRED=()
SKIPPED=0
STALE=0
OLD=0

for name in "${QUEUE[@]}"; do
  file="$(extract_patch "$name")"
  state="$(patch_state "$file")"
  case "$state" in
    applied)
      SKIPPED=$((SKIPPED + 1))
      ;;
    pending)
      # 10# — «08»/«09» иначе трактуются как восьмеричные и роняют (( )).
      name_num="10#$(sed -E 's|^0*([0-9]+).*$|\1|' <<<"$(patch_number "$name")")"
      if [[ -n "$LEVEL" && "$name" != "$TARGET" ]] \
        && (( name_num + STALE_GAP < LEVEL_NUM )); then
        OLD=$((OLD + 1))
      else
        TODO+=("$name")
      fi
      ;;
    conflict)
      # Патч не встаёт и не откатывается целиком. Для старых патчей это
      # обычно значит «давно влит, а контекст вокруг с тех пор изменился».
      # Вслепую переприменять такое опасно, поэтому в цепочке пропускаем.
      # Исключение — сам целевой патч: его пробуем всерьёз, включая --3way.
      if [[ "$name" == "$TARGET" ]]; then
        TODO+=("$name")
      else
        # Состояние считается ДО применения цепочки, поэтому «conflict» здесь
        # неоднозначен: патч может не вставать лишь потому, что нужный ему
        # контекст создаёт предыдущий патч очереди. Откладываем на
        # перепроверку только СВЕЖИЕ патчи (в пределах STALE_GAP от уровня
        # дерева) — древние в конфликте почти всегда давно влиты в main.
        STALE=$((STALE + 1))
        # Откладываем на перепроверку только патчи НОВЕЕ целевого... точнее,
        # те, что стоят в очереди ПЕРЕД целевым и новее уровня дерева: именно
        # они могут оказаться незакрытой зависимостью (151 правит то, что
        # добавил 150). Древние конфликты — это уже влитое в main.
        # 10# — «08»/«09» иначе трактуются как восьмеричные и роняют (( )).
        conflict_num="10#$(sed -E 's|^0*([0-9]+).*$|\1|' <<<"$(patch_number "$name")")"
        target_num="10#$(sed -E 's|^0*([0-9]+).*$|\1|' <<<"$(patch_number "$TARGET")")"
        if (( conflict_num > LEVEL_NUM && conflict_num < target_num )); then
          DEFERRED+=("$name")
        fi
      fi
      ;;
  esac
done

if [[ ${#TODO[@]} -eq 0 ]]; then
  echo "Всё уже применено (пропущено: $SKIPPED)."
  echo "Патч №$PATCH_ID стоит."
  exit 0
fi

echo "Уже стоит: $SKIPPED"
if [[ $OLD -gt 0 ]]; then
  echo "Пропущено как старее уровня дерева: $OLD"
fi
if [[ $STALE -gt 0 ]]; then
  echo "Пропущено как устаревшие: $STALE (контекст разошёлся, обычно уже в main)"
fi
# Отложенные «conflict» возвращаем в очередь по номеру: их состояние будет
# пересчитано непосредственно перед применением, когда предыдущие патчи
# цепочки уже лягут в дерево.
if [[ ${#DEFERRED[@]} -gt 0 ]]; then
  mapfile -t TODO < <(printf '%s\n' "${TODO[@]}" "${DEFERRED[@]}" | sort -V)
  STALE=$((STALE - ${#DEFERRED[@]}))
fi

echo "Будет применено: ${#TODO[@]} (из них перепроверяемых: ${#DEFERRED[@]})"
for name in "${TODO[@]}"; do
  printf '  %s\n' "$name"
done
echo

# Был ли патч отложен на этапе классификации как «conflict». Такие патчи
# перепроверяются перед применением: их контекст мог создать сосед по очереди.
is_deferred() {
  local needle="$1" item
  for item in "${DEFERRED[@]}"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

# --- применение --------------------------------------------------------------

APPLIED=()
RECHECK_SKIPPED=0

for name in "${TODO[@]}"; do
  file="$(extract_patch "$name")"

  # Пересчёт состояния на актуальном дереве: предыдущие патчи очереди могли
  # создать контекст, которого не было на момент первичной классификации.
  case "$(patch_state "$file")" in
    applied)
      RECHECK_SKIPPED=$((RECHECK_SKIPPED + 1))
      continue
      ;;
    conflict)
      # «Контекст разошёлся» на этом этапе значит одно из двух: патч давно
      # влит в main, либо его контекст создаёт СОСЕДНИЙ патч этой же очереди,
      # который лёг только что. Второй случай — реальная зависимость (151
      # правит то, что добавил 150); молча пропустить её значит оставить
      # дерево в половинчатом состоянии, поэтому такие патчи доходят
      # до --3way ниже. Всё остальное пропускаем как устаревшее.
      if [[ "$name" != "$TARGET" ]] && ! is_deferred "$name"; then
        RECHECK_SKIPPED=$((RECHECK_SKIPPED + 1))
        continue
      fi
      ;;
  esac

  printf 'Применение: %s ... ' "$name"

  if git -C "$ROOT_DIR" apply --whitespace=nowarn "$file" >/dev/null 2>&1; then
    echo "ок"
    APPLIED+=("$name")
    continue
  fi

  # Обычное применение не прошло. Пробуем трёхстороннее слияние:
  # оно вытягивает недостающий контекст из объектов Git и умеет
  # ставить патч поверх изменившегося окружения.
  if git -C "$ROOT_DIR" apply --3way --whitespace=nowarn "$file" >/dev/null 2>&1; then
    echo "ок (3way)"
    APPLIED+=("$name")
    continue
  fi

  # --3way мог оставить конфликтные маркеры в рабочем дереве.
  if git -C "$ROOT_DIR" ls-files --unmerged | grep -q .; then
    echo "КОНФЛИКТ"
    echo
    echo "Патч $name применён частично, есть конфликтующие файлы:"
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

  echo "НЕ УДАЛОСЬ"
  echo
  echo "Патч $name не применяется. Рабочее дерево не изменено этим патчем."
  echo "Вероятные причины:"
  echo "  - файлы правились вручную;"
  echo "  - патч рассчитан на другую версию исходников."
  if [[ ${#APPLIED[@]} -gt 0 ]]; then
    echo
    echo "Успешно применены до остановки:"
    printf '  %s\n' "${APPLIED[@]}"
  fi
  exit 1
done

echo
if [[ $RECHECK_SKIPPED -gt 0 ]]; then
  echo "Пропущено при перепроверке: $RECHECK_SKIPPED"
fi
echo "Готово. Применено патчей: ${#APPLIED[@]}"
printf '  %s\n' "${APPLIED[@]}"
echo
echo "Источник: $REMOTE/$ARENA_BRANCH"
echo "Коммит:   $FETCHED_COMMIT"
