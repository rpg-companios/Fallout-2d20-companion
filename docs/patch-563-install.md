# Установка патча 563: привязка к локации в обе стороны

Патч подготовлен от состояния **версии 562**. Файл установки:
`patchs/563-location-binding.patch`.

> **Слова владельца:** «Я всё ещё в локации не могу перемещать сущности. И нужна
> тождественность привязки терминалов/замков к локации и наоборот. Если я в
> терминале/замке выбираю локацию, то они туда встраиваются. А не только через
> локацию».

## Что меняется

| Файл | Что сделано |
| --- | --- |
| `src/ui/useDragResponder.js` | **причина бага.** `withRowPayload(rowPayload)` оборачивает responder-пропсы (`onStartShouldSetResponder[Capture]`, `onMoveShouldSetResponder[Capture]`): сначала исходный обработчик PanResponder, затем `claim(rowPayload)`. Раньше в props уходили имена конфига, которых `View` не знает, — жест не начинался |
| `domain/hubBindings.js` | **новый.** Один закон привязки: `locateContainer`, `planLocationBinding`, `planMoveIntoLocation`, `isLocationNode`. Ссылка живёт в родителе: `parentLocationId` у локации, `links` у остальных |
| `components/screens/LootTradeScreen/modals/ContainerFormModal.js` | «Локация» — обычное поле выбора (первое), ниже «Ещё локации» для нескольких мест; набранный-но-не-выбранный текст останавливает сохранение подсказкой `form.locationNotPicked`; в `onSave` уходит массив «основная + дополнительные» |
| `components/screens/LootTradeScreen/LootTradeScreen.js` | `handleSaveContainerForm` применяет `planLocationBinding` и показывает подтверждение; новые `handleMoveRowToLocation`, `handleOpenHubChildPicker`, `handleCreateHubChild`; `prefillHubId` — созданное внутри локации сразу встаёт в неё |
| `components/screens/LootTradeScreen/modals/HubTreeView.js` | настоящий драг: `measureRows`, `locationUnderPoint`, `descendantsOfId` (запрет переноса в потомка), `overLocationId` (бросок на локацию важнее порядка); кнопка `hub-tree-add-child` |
| `components/screens/LootTradeScreen/modals/HubChildPickerModal.js` | из выбора «Добавить в локацию» можно создать новую вещь — сразу в эту локацию |
| `i18n/ru-RU/.../lootTrade/screen.json`, `i18n/en-EN/.../lootTrade/screen.json` | `form.primaryLocationLabel/Hint`, `form.extraLocationsLabel/Hint`, `form.locationNotPicked`, `detail.hubAddChild`, `detail.hubDropIntoHint`, `detail.locationBound`, `detail.hubPickerCreateTitle` |
| `__tests__/room/location-binding-563.test.js` | **новая приёмка** (13 проверок поведением: закон привязки, драг в дереве, переезд в локацию, форма терминала, создание из локации) |
| `__tests__/lootTrade/drag-responder-549.test.js`, `gm-screen-behaviour-549.test.js`, `__tests__/room/admin-reorder-arrows-548.test.js`, `hub-order-drag-545.test.js` | моки `PanResponder` стали честными: props системы ответственности → обработчики конфига. Прежний мок `create: (config) => ({ panHandlers: config })` и был причиной, по которой баг жил |
| `__tests__/lootTrade/matryoshka-rooms-473.test.js` | проверка формы смотрит на поле «Локация» вместо старого поиска по складу |
| `__tests__/room/gm-decision-535.test.js`, `__tests__/room/lock-progress-532.test.js` | защёлки версии: 563 / `baseline` 563 / roadmap `**563**` |
| `patchs/baseline.json`, `public/version.json` | отсечка и версия 563 |
| `docs/changelog.ru.md`, `docs/changelog.en.md`, `docs/roadmap.md`, `docs/agents/state.md`, `docs/design-location-binding-563.md` | записи патча, тезис 51, документ о законе привязки |

## Как это выглядит

Параметры терминала или замка:

```
Локация            [ Ниптон ▾ ]
В терминале выбрал локацию — терминал в ней и лежит.

Ещё локации
[ поиск по складу ]           (только если нужен «бродячий» случай)
```

Дерево локации:

```
⇅  Пещера        (локация)   Параметры
⇅  Сундук                    Параметры   ← тянем за ⇅ на строку «Пещера»
   └ Пещера
⇅  Торговец                  Параметры
+ Добавить в локацию
```

Перетаскивание среди соседей меняет порядок; бросок на строку-локацию — переносит
внутрь. Перенос в собственного потомка отклоняется.

## Что НЕ менялось

- Поля хранения (`links`, `parentLocationId`, `childOrder`) и
  `saveGmContainer`/`normalizeContainerEntity` — только чтение и запись тем же
  путём.
- Протокол комнаты, выдача точек игрокам, мини-игры взлома, склад и торговец.
- Порядок строк внутри локации (545) — тот же `childOrder`, просто теперь ручка
  действительно начинает жест.

## Установка через консоль

```bash
git fetch --no-tags origin arena/a97ebb5a-fallout-2d20-companion
git show FETCH_HEAD:apply-patch.sh > apply-patch.sh
chmod +x apply-patch.sh
./apply-patch.sh 563
```

После установки: `git add -A && git commit -m "Патч 563"`.

## Проверка

```bash
npx vitest run __tests__/room/location-binding-563.test.js \
  __tests__/lootTrade/drag-responder-549.test.js \
  __tests__/lootTrade/gm-screen-behaviour-549.test.js \
  __tests__/room/admin-reorder-arrows-548.test.js \
  __tests__/room/hub-order-drag-545.test.js
npx tsc --noEmit
```

Глазами:

1. Открыть локацию с двумя-тремя строками, потянуть ручку ⇅ — порядок меняется и
   остаётся после перезагрузки.
2. Притянуть строку сундука на строку-локацию — сундук оказывается внутри, из
   старой локации исчезает.
3. Открыть параметры терминала, выбрать локацию, сохранить — терминал пропадает
   с экрана карточек и появляется в дереве этой локации.
4. Набрать в «Ещё локации» название, не выбирая вариант, и нажать «Сохранить» —
   форма останавливается с подсказкой, а не теряет текст.
5. «Добавить в локацию» → «Создать сундук» → назвать — сундук сразу внутри.
