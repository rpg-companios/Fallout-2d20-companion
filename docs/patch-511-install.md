# Установка патча 511: ключи как карточки на экране «Добыча / Торговля»

> **Терминал как замок сундука — патч 519. План: `docs/roadmap.md`, установка: `docs/patch-519-install.md`.**

> **Общее хранилище в две панели — патч 518. План: `docs/roadmap.md`, установка: `docs/patch-518-install.md`.**

> **Ворота между точками — патч 517. План: `docs/roadmap.md`, установка: `docs/patch-517-install.md`.**

> **Серверная проверка ключа и возврат на карточки — патч 516. План: `docs/roadmap.md`, установка: `docs/patch-516-install.md`.**

> **Чекбокс «Обязателен» и описание в конце формы — патч 515. План: `docs/roadmap.md`, установка: `docs/patch-515-install.md`.**

> **Поля и требования в карточках — патч 514. Живой план: `docs/roadmap.md`, установка: `docs/patch-514-install.md`.**

> **Правила ключей и требований доступа уточнены (только документ) — `docs/key-items-and-gates-design.md`, установка: `docs/patch-513-install.md`.**

> **Модалки берут каркас у соседних окон — правила: `docs/ui-modals-rules.md`, установка: `docs/patch-512-install.md`.**

Патч подготовлен от состояния **версии 510** (коммит `0606fb8`, ветка
`arena/054e6676-fallout-2d20-companion`). Применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — установщик подтянет 493–511
цепочкой.

## Причина

Владелец отклонил интерфейс 510 (справочник по иконке ключа в шапке):

> Я полагал ключ будет, как карточка контейнера/торговца/терминала и с
> модалкой в стиле создания контейнера и потом сохранением в экран.

Патч меняет **только слой интерфейса Мастера**. Хранение ключей, протокол
`storage.addKey`, запрет забирать ключ в личный инвентарь и перенос ключей в
снимке «Общего хранилища» остались как в 510.

## Что изменилось

### 1. Плитка создания на сетке

`gridItems` экрана получил `{ type: 'createKeyItem' }` рядом с
`createHub` / `createLoot` / `createMerchant` / `createTerminal`.
`ActionCell` с иконкой `key-variant` и подписью «Создать ключ / записку»
(`testID="create-key-item-cell"`) открывает форму.

### 2. Форма в стиле `ContainerFormModal`

Новый `components/screens/LootTradeScreen/modals/KeyItemFormModal.js`:

- та же тема `ADMIN_MODAL_PALETTE`, `Modal` + `KeyboardAvoidingView` +
  `ScrollView`, карточка, подписи полей `form.nameLabel` /
  `form.roomsMultiLabel`, футер «Отмена / Сохранить»;
- имя обязательно, описание можно оставить пустым;
- выбор комнаты чипсами из `availableRooms` (можно оставить без комнаты);
- редактор вставляет уже существующие теги `**жирный**`, `*курсив*`,
  список `- `, `{CD}`, `{CAP}` и показывает предпросмотр через
  `renderTextWithIcons`. Никакого второго формата разметки, никакого HTML;
- при редактировании форма заполняется текущими значениями записи.

### 3. Сохранение прямо в экран

`handleSaveKeyItem` пишет запись через `db.saveGmKeyItem`, перечитывает
`db.getGmKeyItems()` и обновляет `keyItems` — карточка появляется на сетке
сразу, без перезахода на экран. `loadData` загружает ключи вместе с
контейнерами, папками и комнатами.

`KeyItemCardCell` использует те же `cardCell` / `cardHero` / `cardBody` /
`cardTitle` / `cardDesc` / `cardMeta`, что и карточки контейнеров, торговцев и
терминалов. На карточке две кнопки:

- «Изменить» — та же форма с текущими значениями;
- «Выдать на склад» — прежний `addKeyItemToStorage` (`storage.addKey`), только
  Мастер и только онлайн; комната берётся из записи, иначе из подключённой
  комнаты Мастера.

### 4. Удалено

`components/lootTrade/KeyItemCatalogModal.js`, кнопка
`testID="key-catalog-button"` в шапке и состояние `keyCatalogVisible`.
Окно «Общего хранилища» у игроков (`PartyStorageModal`) не менялось: ключи
по-прежнему отдельным списком, читаются, но не забираются.

Счётчик на плашке и лог операций по-прежнему не добавляются: «Предметы есть
на складе или нет. Игроки сами возятся ними и могут смотреть, что есть, чего
нет».

## Файлы

| Файл | Изменение |
| --- | --- |
| `components/screens/LootTradeScreen/LootTradeScreen.js` | плитка, карточки на сетке, загрузка/сохранение/выдача ключей, удалён значок в шапке |
| `components/screens/LootTradeScreen/modals/KeyItemFormModal.js` | новая форма в стиле создания контейнера |
| `components/lootTrade/KeyItemCardCell.js` | новая карточка ключа в стилях карточек сетки |
| `components/lootTrade/KeyItemCatalogModal.js` | удалён (заменён формой) |
| `i18n/ru-RU/...`, `i18n/en-EN/...` | парные подписи: `actions.createKeyItem`, `form.createKeyItemTitle`, `form.editKeyItemTitle`, `keyItems.saved`, обновлённая подсказка |
| `__tests__/room/key-items-510.test.js` | ожидания перенесены на новый UI |
| `__tests__/room/key-items-cards-511.test.js` | 7 приёмочных проверок карточек и формы |
| `docs/key-items-and-gates-design.md` | Обновление 6: UI шага 2 — карточки |
| `docs/changelog.*.md`, `docs/guides/admin-and-loot-trade.*.md` | RU/EN описание |
| `public/version.json`, `patchs/baseline.json` | версия 511, 77/77 заметок |
| `patchs/511-key-item-cards.patch` | сам патч для установщика |

## Установка

С действующей версии 510:

```bash
./apply-patch.sh 511
# ✓ Установлен патч: №511 (версия 510 → 511)
```

С чистого `main` со старым установщиком:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 511
```

`patchs/baseline.json` в источнике равен `511`. После установки
`public/version.json` → `511`; закоммитьте изменения, **перезапустите сервис
Node.js** и пересоберите веб-сборку.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/key-items-cards-511.test.js
npx vitest run __tests__/room/key-items-510.test.js
npx vitest run __tests__/lootTrade/party-storage-modal-507.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "511"'
```

Тесты покрывают: плитку создания, карточки сохранённых ключей на сетке,
удаление старого справочника и значка, сходство формы с `ContainerFormModal`,
общие стили карточки, сохранение в `gm_key_items` с обновлением экрана, выдачу
на общий склад, парность словарей и фиксацию решения в дизайн-документе.

### Прямой `git apply` без установщика

```bash
git apply patchs/511-key-item-cards.patch
cp /path/to/511-key-item-cards.patch patchs/
```
