# Установка патча 514: поля и требования в карточках

> **Чекбокс «Обязателен» и описание в конце формы — патч 515. План: `docs/roadmap.md`, установка: `docs/patch-515-install.md`.**

Патч подготовлен от состояния **версии 513** (коммит `8a3e274`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–514
цепочкой.

Это **первая половина шага 3** дизайна: поля, формы, вложенность и
перетаскивание. Серверная проверка ключа (пропуск мини-игры, отказ по
обязательному ключу) и ворота **не входят** — см. `docs/roadmap.md`.

## Что изменилось

### 1. Поля точки доступа

`domain/lootTrade.js` — новые поля в `normalizeContainerEntity`:

| Поле | Смысл |
| --- | --- |
| `keyItemIds` | вложенные ключевые записи (только локация, контейнер, торговец; у терминала всегда пусто) |
| `requiredKeyItemId` | идентификатор требуемой записи |
| `keyRequirement` | `none` / `optional` / `required` |
| `linkedCheckId` | терминал (в будущем — замок) как альтернативная проверка |

Добавлены `containerCanHoldKey`, `containerCanRequireKey`,
`normalizeKeyItemIds`, `normalizeKeyRequirement`, `KEY_REQUIREMENT` и
зарезервированный `RESERVED_LOCK_KIND = 'lock'`. Изменений схемы БД нет:
поля едут в уже существующем JSON карточки.

### 2. Две строки в форме точки

`ContainerFormModal` получил `availableKeyItems` и
`availableCheckContainers`:

- строка 1 — поиск по названию или список ключей/записок, рядом переключатель
  «Обязателен?» (обязателен / необязателен);
- строка 2 — поиск или список терминалов;
- на карточке точки показывается название требуемого ключа и пометка
  обязательности.

Стили новых строк взяты из того же `lootTradeFormStyles` (правило
`docs/ui-modals-rules.md` не нарушено).

### 3. Ключ как часть родителя

`KeyItemFormModal` — строка «Часть чего»: локация, контейнер или торговец.
Терминал в список не входит. Привязка хранится в `keyItemIds` родителя, а не в
шаблоне ключа, поэтому правка шаблона не влияет на уже добытую запись на
складе. `handleSaveKeyItem` синхронизирует привязку у всех родителей.

### 4. Перетаскивание всех четырёх карточек

`KeyItemCardCell` получил `arrow-all` и `PanResponder` как у
`ContainerCardCell`. Ключ уходит с корня в локацию, в локации показывается
отдельным списком с кнопкой «Вернуть на сетку». Пункт «Выдать на склад» в меню
`⋮` сохранён (исключение обратной совместимости из патча 513).

### 5. Живой план

`docs/roadmap.md` — таблица тезисов со статусами и раздел «Осталось после
патча 514». По просьбе владельца обновляется в каждом патче и дублируется в
ответе. Туда же записано новое описание окна склада: две панели как у
торговца, без проверок стоимости.

## Файлы

| Файл | Изменение |
| --- | --- |
| `domain/lootTrade.js` | поля требований, хелперы, резерв `lock` |
| `components/screens/LootTradeScreen/modals/ContainerFormModal.js` | две строки настройки |
| `components/screens/LootTradeScreen/modals/KeyItemFormModal.js` | «Часть чего» |
| `components/lootTrade/KeyItemCardCell.js` | иконка перетаскивания |
| `components/screens/LootTradeScreen/LootTradeScreen.js` | привязка, перенос, список в локации, метка на карточке, props |
| `styles/LootTradeScreen.styles.js` | стили списка ключей в локации |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | парные подписи |
| `__tests__/room/key-items-fields-514.test.js` | 12 приёмочных проверок |
| `docs/roadmap.md` | новый живой план |
| `docs/key-items-and-gates-design.md` | раздел 7.6, статус шага 3 |
| `docs/changelog.*.md`, `docs/guides/admin-and-loot-trade.*.md` | RU/EN описание |
| `public/version.json`, `patchs/baseline.json` | версия 514, 80/80 заметок |
| `patchs/514-key-card-fields.patch` | сам патч для установщика |

## Установка

С действующей версии 513:

```bash
./apply-patch.sh 514
# ✓ Установлен патч: №514 (версия 513 → 514)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 514
```

`patchs/baseline.json` в источнике равен `514`. После установки
`public/version.json` → `514`; закоммитьте изменения и пересоберите
веб-сборку. Серверный код не менялся, перезапуск сервиса не обязателен.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/key-items-fields-514.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "514"'
```

### Прямой `git apply` без установщика

```bash
git apply patchs/514-key-card-fields.patch
cp /path/to/514-key-card-fields.patch patchs/
```
