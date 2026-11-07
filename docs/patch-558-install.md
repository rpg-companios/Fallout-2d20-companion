# Установка патча 558: сообщения Мастера приходят лично персонажу

Патч подготовлен от состояния **версии 557**. Файл установки:
`patchs/558-character-notices.patch`.

> **Слово владельца (четыре ответа на вопросы обсуждения):**
> 1. «На списке персонажей ничего не всплывает — меняется цвет иконки сервера
>    (например, синий)».
> 2. «Списком, что происходит. Трансляции и разовые команды. Если мастер прислал
>    уровень — окно по типу релиза с кнопкой ок, а трансляцию держать, как
>    сейчас, но только конкретному персонажу».
> 3. «Трансляция не даёт "доставлено", у поднятия уровня — факт отправки.
>    Фактическая доставка — за столом».
> 4. «Ключи не трогаем».

## Что меняется

Только показ результатов Мастера у игрока и подпись в панели комнаты. Протокол
комнаты, ack-очередь, склад и ключи не трогались.

| Файл | Что сделано |
| --- | --- |
| `src/room/playerNoticesStore.js` | **новый.** Клиентский склад уведомлений: `{ id, characterId, roomCode, roomName, kind, text, read, at }` в AsyncStorage (`positronium_player_notices_v1`), дедупликация по `id`, `addNotice` / `markReadForCharacter` / `hydrate`, хелперы `unreadNoticesFor` и `unreadNoticeCountFor`. Вид записи: `translation` (локация/торговец) или `command` (разовая команда) |
| `src/room/playerFocusStore.js` | **новый.** `homeFocused`: `null` — неизвестно, `true` — игрок на списке персонажей, `false` — внутри персонажа |
| `components/gm/PlayerNoticesModal.js` | **новый.** Окно-список в стиле «Что нового»: заголовок «Сообщения Мастера», подпись с именем персонажа, раздел «Трансляции», раздел «Разовые команды», кнопка «Понятно» (= всё прочитано). Показывается только когда игрок внутри персонажа и есть непрочитанное именно у него |
| `components/gm/PlayerDirectiveOverlay.js` | команда больше не всплывает окном (`showRawAlert` убран): применяется как раньше, ack и снапшот остались, а факт ложится в уведомление **этого** персонажа. Ключ дедупликации прежний — `roomCode:directiveId:characterId` |
| `components/lootTrade/PlayerLootTradeOverlay.js` | трансляция адресуется только открытому персонажу (`focusedBindings`) и не висит на списке; новая сессия пишет уведомление «Мастер открыл: …» |
| `components/gm/gmI18n.js` | блок `notices` (ru/en); в панели комнаты вместо `deliveryBadge`/`deliveryDone` — `sentBadge` («Отправлено: N» / «Sent: N») и `sentHint` |
| `components/screens/HomeScreen/HomeScreen.js` | у карточки — `noticesCount`; цвет иконки сервера `#3b82f6` (синий) при непрочитанном, иначе прежние зелёный/серый. На фокусе списка поднимается `homeFocused`. В панели комнаты — «Отправлено: N» вместо счётчика доставки |
| `styles/HomeScreen.styles.js` | убраны стили «доставлено» (`gmDeliveryPillDone`, `gmDeliveryPillTextDone`) |
| `App.js` | `<PlayerNoticesModal />` рядом с оверлеями |
| `__tests__/room/player-notices-558.test.js` | **новая приёмка** (9 проверок) |
| `__tests__/room/gm-navbar2-spoilers-directives-481.test.js` | вместо алерта проверяется уведомление персонажа (`alertsLog` пуст) |
| `__tests__/room/room-character-sync-456.test.js` | защёлка трёхзначного цвета иконки |
| `__tests__/room/gm-decision-535.test.js`, `__tests__/room/lock-progress-532.test.js` | защёлки версии: 558 / `baseline` 558 / roadmap `**558**` |
| `patchs/baseline.json`, `public/version.json` | отсечка и версия 558, заметки релиза 5 обновлены |
| `docs/changelog.ru.md`, `docs/changelog.en.md`, `docs/roadmap.md`, `docs/agents/state.md` | запись патча 558, тезис 46 |

## Как это выглядит

1. Игрок на списке персонажей. Никаких окон: у карточки, кому что-то пришло,
   иконка сервера **синяя**. Зелёная — в сети, серая — не в сети.
2. Игрок открыл этого персонажа — сверху одно окно «Сообщения Мастера» с его
   именем и двумя разделами: «Трансляции» (Мастер открыл локацию/торговца) и
   «Разовые команды» (уровень, крышки, лечение, увечья), строки с названием
   комнаты.
3. «Понятно» закрывает окно и гасит синюю иконку.
4. Локация или торговец по-прежнему открываются плашкой — но только у того
   персонажа, за которого играют; на списке плашки нет.
5. У Мастера в панели комнаты — «Отправлено: N». Счётчика «Доставлено» больше
   нет: доставку разбирают за столом.
6. Ключи и склад работают точно как после 557.

## Установка через консоль

```bash
git fetch --no-tags origin arena/a97ebb5a-fallout-2d20-companion
git show FETCH_HEAD:apply-patch.sh > apply-patch.sh
chmod +x apply-patch.sh
./apply-patch.sh 558
```

После установки: `git add -A && git commit -m "Патч 558"`.

## Проверка

```bash
npx vitest run __tests__/room/player-notices-558.test.js \
  __tests__/room/gm-navbar2-spoilers-directives-481.test.js \
  __tests__/room/room-character-sync-456.test.js \
  __tests__/room/storage-pane-tabs-557.test.js
npm run typecheck
```
