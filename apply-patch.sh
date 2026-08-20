#!/usr/bin/env bash

set -euo pipefail

REMOTE="origin"

ROOT_DIR="$(
  CDPATH=''
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  pwd
)"

if [[ $# -ne 1 ]]; then
  echo "Использование: ./apply-patch.sh <номер патча>"
  echo "Пример:       ./apply-patch.sh 134"
  exit 2
fi

PATCH_ID="$1"

# Поддерживает номера вроде 134 и 121b.
if [[ ! "$PATCH_ID" =~ ^[0-9]+[[:alnum:]]*$ ]]; then
  echo "Ошибка: некорректный номер патча: $PATCH_ID"
  exit 2
fi

if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Ошибка: $ROOT_DIR не является Git-репозиторием."
  exit 1
fi

ARENA_BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
if [[ -z "$ARENA_BRANCH" || "$ARENA_BRANCH" == "HEAD" ]]; then
  echo "Ошибка: не удалось определить текущую ветку."
  exit 1
fi

echo "Загрузка текущей ветки:"
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
echo "Поиск патча №$PATCH_ID..."

mapfile -t PATCH_PATHS < <(
  git -C "$ROOT_DIR" ls-tree \
    -r \
    --name-only \
    "$FETCHED_COMMIT" \
    -- patchs |
  grep -E "^patchs/${PATCH_ID}-[^/]*\\.patch$" ||
  true
)

if [[ ${#PATCH_PATHS[@]} -eq 0 ]]; then
  echo "Ошибка: патч №$PATCH_ID не найден в $REMOTE/$ARENA_BRANCH."
  exit 1
fi

if [[ ${#PATCH_PATHS[@]} -gt 1 ]]; then
  echo "Ошибка: в $REMOTE/$ARENA_BRANCH найдено несколько патчей №$PATCH_ID:"
  printf '  %s\n' "${PATCH_PATHS[@]}"
  exit 1
fi

PATCH_PATH="${PATCH_PATHS[0]}"
PATCH_NAME="$(basename -- "$PATCH_PATH")"
TEMP_PATCH="$(mktemp "${TMPDIR:-/tmp}/arena-patch-${PATCH_ID}.XXXXXX.patch")"

cleanup() {
  rm -f -- "$TEMP_PATCH"
}

trap cleanup EXIT

echo "Извлечение патча:"
echo "  $PATCH_PATH"

# Патч извлекается во временный файл.
# Локальная папка patchs не изменяется.
git -C "$ROOT_DIR" show \
  "${FETCHED_COMMIT}:${PATCH_PATH}" \
  > "$TEMP_PATCH"

if [[ ! -s "$TEMP_PATCH" ]]; then
  echo "Ошибка: извлечённый патч пуст."
  exit 1
fi

echo "Проверка патча: $PATCH_NAME"

if git -C "$ROOT_DIR" apply \
  --check \
  --whitespace=error \
  "$TEMP_PATCH"
then
  echo "Применение патча..."

  git -C "$ROOT_DIR" apply \
    --whitespace=error \
    "$TEMP_PATCH"

  echo
  echo "Патч успешно применён: $PATCH_NAME"
  echo "Источник: $REMOTE/$ARENA_BRANCH"
  echo "Коммит:   $FETCHED_COMMIT"
  exit 0
fi

# Если обычная проверка не прошла, проверяем,
# не был ли этот патч уже применён.
if git -C "$ROOT_DIR" apply \
  --reverse \
  --check \
  "$TEMP_PATCH" >/dev/null 2>&1
then
  echo
  echo "Патч уже был применён: $PATCH_NAME"
  exit 0
fi

echo
echo "Ошибка: патч $PATCH_NAME невозможно применить."
echo "Возможные причины:"
echo "  - не применены предыдущие патчи;"
echo "  - исходники отличаются от ожидаемой версии;"
echo "  - часть изменений патча уже внесена вручную."
exit 1
