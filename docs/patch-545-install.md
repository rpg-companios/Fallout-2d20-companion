# Установка патча 545: порядок мест перетаскиванием

Патч подготовлен от состояния **версии 544**. Файл установки:
`patchs/545-hub-order-drag.patch`.

> Владелец: «в интерфейсе мастера, при работе с хабом/локацией, нужна
> возможность менять местами позиции перетаскиванием. И порядок локаций у
> мастера = порядок мест у юзера. Это важно».

## Что меняется

| Файл | Что сделано |
| --- | --- |
| `server/locationGraph.js` | канон порядка детей: `childOrder` родителя, `orderChildIds`, `moveChildInOrder`; граф и сессия сортируют детей одинаково, несколько родителей не смешивают порядки |
| `domain/lootTrade.js` | `normalizeContainerEntity` хранит `childOrder`; ранги типов для fallback-порядка берутся из канона графа |
| `components/screens/LootTradeScreen/modals/HubTreeView.js` | ручка-стрелки и PanResponder в строках одного родителя, подсветка цели, новый порядок отдаётся наружу; ключи не перетаскиваются |
| `components/screens/LootTradeScreen/LootTradeScreen.js` | `handleReorderHubChildren` сохраняет `childOrder` через `persistAndSyncContainer` — живые сессии получают пересобранные узлы |
| `components/lootTrade/PlayerLootTradeOverlay.js` | список мест внутри вложенной локации сортируется по `childIds` родителя; корень идёт в порядке сессии |
| `i18n/ru-RU/screens/lootTrade/screen.json`, `i18n/en-EN/screens/lootTrade/screen.json` | парные строки ручки и подсказки перестановки |
| `__tests__/room/hub-order-drag-545.test.js` | приёмка: канон порядка, перетаскивание в дереве, порядок игрока, старый сервер/маркер 544 |
| `docs/roadmap.md`, `docs/changelog.*.md`, `public/version.json`, `patchs/baseline.json` | версия/отсечка 545, тезис 35, «Осталось после патча 545» |

## Границы

- Перетаскивание меняет порядок только среди строк одного родителя. Перенос
  карточки внутрь локации/наружу прежний (стрелки на сетке и кнопки дерева).
- Порядок хранится на родителе, поэтому общий ребёнок нескольких родителей
  имеет независимый порядок в каждом родителе.
- Ключи остаются строками после объектов и не участвуют в перестановке мест.
- Закон снимка 529, адресный взлом 523, gate-first 542, перекрытие проходов
  543 и маркер пространственного узла 544 сохранены.

## Установка через консоль

```bash
git fetch --no-tags origin arena/f90c80d8-fallout-2d20-companion
git show FETCH_HEAD:apply-patch.sh > apply-patch.sh
chmod +x apply-patch.sh
./apply-patch.sh 545
```

## Проверки

- `npm run typecheck`: успешно.
- `npm test`: зелёные, кроме восьми заранее известных падений
  `__tests__/room/terminal-hacking-balance-496.test.js` — они падают теми же
  ошибками и на чистом дереве 544, патч 545 их не трогает.
- `npm run build`: веб-сборка Expo проходит.

## Откат

`git apply -R patchs/545-hub-order-drag.patch` вернёт дерево, порядок,
словари и версию к состоянию 544.
