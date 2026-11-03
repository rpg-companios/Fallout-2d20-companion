# Установка патча 515: чекбокс «Обязателен» и порядок полей

Патч подготовлен от состояния **версии 514** (коммит `5f642d7`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–515
цепочкой.

> Уточнение владельца: «При создании контейнера, требование "Обязателен" лучше
> пусть будет чекбокс. А поля под описание пусть будут последними или
> предпоследними. Так логичнее».

## Что изменилось

### 1. Чекбокс вместо двух кнопок

В `ContainerFormModal` блок «Обязателен / Необязателен» заменён одним
`TouchableOpacity` с `accessibilityRole="checkbox"`, иконкой
`checkbox-marked` / `checkbox-blank-outline` и подписью «Обязателен».
Одно нажатие переключает `keyRequirement` между `required` и `optional`;
если ключ не выбран, режим остаётся `none`. Подписи двух кнопок удалены из
RU/EN словарей.

Стили `checkboxRow` и `checkboxLabel` добавлены в `lootTradeFormStyles` —
общий каркас, который импортирует `KeyItemFormModal`. Правило
`docs/ui-modals-rules.md` соблюдено: новый элемент не рисуется отдельным
набором стилей.

### 2. Описание в конце формы

Поле «Описание» вынесено из середины формы и стоит **последним** полем
перед футером: имя → привязки → сложность/настройки точки → две строки
требования → описание. В форме ключа описание и предпросмотр уже были в конце;
порядок закреплён приёмочным тестом.

Поведение сохранения, поля данных и протокол не изменились.

## Файлы

| Файл | Изменение |
| --- | --- |
| `components/screens/LootTradeScreen/modals/ContainerFormModal.js` | чекбокс, перенос описания, стили в общем каркасе |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | удалены подписи двух кнопок |
| `__tests__/room/key-items-fields-514.test.js` | ожидания под чекбокс и порядок полей |
| `__tests__/ui/form-checkbox-515.test.js` | новый предохранитель (7 проверок) |
| `docs/roadmap.md` | версия 515, «Осталось после патча 515» |
| `docs/key-items-and-gates-design.md`, `docs/changelog.*.md` | RU/EN описание |
| `public/version.json`, `patchs/baseline.json` | версия 515, 81/81 заметок |
| `patchs/515-form-checkbox-order.patch` | сам патч для установщика |

## Установка

С действующей версии 514:

```bash
./apply-patch.sh 515
# ✓ Установлен патч: №515 (версия 514 → 515)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 515
```

`patchs/baseline.json` в источнике равен `515`. После установки
`public/version.json` → `515`; закоммитьте изменения и пересоберите
веб-сборку. Серверный код не менялся, перезапуск сервиса не обязателен.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/ui/form-checkbox-515.test.js
npx vitest run __tests__/room/key-items-fields-514.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "515"'
```

### Прямой `git apply` без установщика

```bash
git apply patchs/515-form-checkbox-order.patch
cp /path/to/515-form-checkbox-order.patch patchs/
```
