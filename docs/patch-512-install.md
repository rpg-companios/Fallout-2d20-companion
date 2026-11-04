# Установка патча 512: модалки берут дизайн у соседних окон

> **Мини-игра взлома замков и «ИЛИ» — патч 520. План: `docs/roadmap.md`, установка: `docs/patch-520-install.md`.**

> **Терминал как замок сундука — патч 519. План: `docs/roadmap.md`, установка: `docs/patch-519-install.md`.**

> **Общее хранилище в две панели — патч 518. План: `docs/roadmap.md`, установка: `docs/patch-518-install.md`.**

> **Ворота между точками — патч 517. План: `docs/roadmap.md`, установка: `docs/patch-517-install.md`.**

> **Серверная проверка ключа и возврат на карточки — патч 516. План: `docs/roadmap.md`, установка: `docs/patch-516-install.md`.**

> **Чекбокс «Обязателен» и описание в конце формы — патч 515. План: `docs/roadmap.md`, установка: `docs/patch-515-install.md`.**

> **Поля и требования в карточках — патч 514. Живой план: `docs/roadmap.md`, установка: `docs/patch-514-install.md`.**

> **Правила ключей и требований доступа уточнены (только документ) — `docs/key-items-and-gates-design.md`, установка: `docs/patch-513-install.md`.**

Патч подготовлен от состояния **версии 511** (коммит `860fe82`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–512
цепочкой.

## Причина

> Просьба если создаёшь модалки, то хотя бы ориентируйся на дизайн других
> модалок, которые рядом или делают что-то похожее. По возможности зафиксируй
> в правилах работы с приложением.

Патч 511 сделал форму ключа «в стиле» `ContainerFormModal`, но описал стили
заново: высота 92 % вместо 84 %, радиус 8 вместо 5, отступы 16 вместо 24/22,
заголовок 17 с иконкой вместо центрированных 18, подписи 11 заглавными вместо
13 жирных, свои чипсы комнат, свой футер и обратный порядок кнопок. Карточка
ключа получила две отдельные круглые кнопки вместо общего `⋮`-меню.

## Что изменилось

### 1. Общий каркас формы

`ContainerFormModal` экспортирует свой `StyleSheet` как
`lootTradeFormStyles`; внутри он остаётся `const styles = lootTradeFormStyles;`,
то есть **внешний вид формы контейнера не изменился ни на пиксель**.

`KeyItemFormModal` удалил собственный `StyleSheet.create` с базовыми ключами и
импортирует `lootTradeFormStyles`. Теперь совпадают: подложка, карточка,
заголовок, прокрутка, подписи, поля ввода, многострочное поле, чипсы комнат,
тексты подсказок/предупреждений и футер с «Сохранить» слева и «Отмена»
справа. Локальный `extraStyles` содержит только панель тегов и предпросмотр —
этих элементов у формы контейнера нет.

### 2. Карточка как у контейнера

`KeyItemCardCell` заменил две круглые кнопки на одну `⋮` в правом нижнем углу и
выпадающее меню с иконками («Изменить», «Выдать на склад»). Используются те же
`cardActionButton`, `menuBackdrop`, `actionMenu`, `actionMenuItem`,
`actionMenuText` из `styles/LootTradeScreen.styles.js` и тот же расчёт позиции
через `measureInWindow`, что и в `ContainerCardCell`.

Поведение не изменилось: нажатие на карточку открывает форму, «Изменить» —
её же с текущими значениями, «Выдать на склад» — прежний `storage.addKey`.

### 3. Правило зафиксировано

- **`docs/ui-modals-rules.md`** — новый документ по образцу
  `docs/ui-alerts-rules.md`: основное правило, как именно переиспользовать
  каркас, таблица ближайших образцов по слоям, чек-лист перед сдачей,
  причины и урок 511.
- **`docs/agents/README.md`** — документ добавлен в обязательный порядок
  чтения и в короткий список правил, которые нельзя нарушать.
- **`docs/architecture/engine-charter.md`** — строка 12 в таблице
  предохранителей (правило → тест) и запись в разделе «Уроки (не повторять)».
- **`replit.md`** — ссылка в разделе обязательного контекста для ИИ-агентов.
- **`__tests__/ui/modal-design-reuse-512.test.js`** — предохранитель: проверяет
  импорт каркаса, отсутствие своего набора базовых стилей, совпадение порядка
  кнопок, `⋮`-меню карточки и наличие правила в трёх документах.

## Файлы

| Файл | Изменение |
| --- | --- |
| `components/screens/LootTradeScreen/modals/ContainerFormModal.js` | экспорт `lootTradeFormStyles`, внешний вид не менялся |
| `components/screens/LootTradeScreen/modals/KeyItemFormModal.js` | импорт общего каркаса, локально только теги и превью |
| `components/lootTrade/KeyItemCardCell.js` | `⋮`-меню вместо двух круглых кнопок |
| `__tests__/room/key-items-cards-511.test.js` | ожидания под общий каркас |
| `__tests__/ui/modal-design-reuse-512.test.js` | новый предохранитель (6 проверок) |
| `docs/ui-modals-rules.md` | новые правила работы с модалками |
| `docs/agents/README.md`, `docs/architecture/engine-charter.md`, `replit.md` | ссылки и строка предохранителя |
| `docs/changelog.*.md`, `docs/guides/admin-and-loot-trade.*.md`, `docs/key-items-and-gates-design.md` | RU/EN описание и фиксация решения |
| `public/version.json`, `patchs/baseline.json` | версия 512, 78/78 заметок |
| `patchs/512-modal-design-reuse.patch` | сам патч для установщика |

## Установка

С действующей версии 511:

```bash
./apply-patch.sh 512
# ✓ Установлен патч: №512 (версия 511 → 512)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 512
```

`patchs/baseline.json` в источнике равен `512`. После установки
`public/version.json` → `512`; закоммитьте изменения, **перезапустите сервис
Node.js** и пересоберите веб-сборку.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/ui/modal-design-reuse-512.test.js
npx vitest run __tests__/room/key-items-cards-511.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "512"'
```

### Прямой `git apply` без установщика

```bash
git apply patchs/512-modal-design-reuse.patch
cp /path/to/512-modal-design-reuse.patch patchs/
```
