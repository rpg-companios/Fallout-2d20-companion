# Установка патча 560: каждый персонаж видит свою трансляцию

Патч подготовлен от состояния **версии 559**. Файл установки:
`patchs/560-transmission-per-character.patch`.

> **Слово владельца:** «Трансляция доступна только тому персонажу, за которого
> вошли. Если 2 персонажа в 2 серверных комнатах получают 2 трансляции, каждый
> персонаж видит свою… пока не войдёшь другим — ничего не увидишь. А сигнал о
> новой трансляции или эффекте — цвет иконки сервера».

## Что меняется

Вид плашки и окна локации/торговца не менялся — меняется только адресат и
сигнал на карточке в списке.

| Файл | Что сделано |
| --- | --- |
| `components/lootTrade/PlayerLootTradeOverlay.js` | окно показывает сессию, адресованную **только открытому** персонажу (`focusedBindings`); на списке персонажей плашки нет. Показав свою сессию, окно помечает её просмотренной |
| `src/room/transmissionSeenStore.js` | **новый.** Память «персонаж → последняя показанная сессия» (AsyncStorage `positronium_transmission_seen_v1`), хелперы `sessionTargetsCharacter` и `hasUnseenTransmission` |
| `components/screens/HomeScreen/HomeScreen.js` | сигнал на карточке = непрочитанный эффект **или** новая трансляция этого персонажа (`signalCount` → синяя иконка `#3b82f6`) |
| `__tests__/room/transmission-per-character-560.test.js` | **новая приёмка** (7 проверок): настоящий монтаж окна с двумя персонажами в двух комнатах — своя трансляция видна, чужая нет; на списке тишина; просмотр гасит сигнал; хелперы адресата |
| `__tests__/room/effects-window-559.test.js` | блок про трансляцию переписан: в склад эффектов она не пишется (адресат — 560) |
| `__tests__/room/gm-decision-535.test.js`, `__tests__/room/lock-progress-532.test.js` | защёлки версии: 560 / `baseline` 560 / roadmap `**560**` |
| `patchs/baseline.json`, `public/version.json` | отсечка и версия 560, заметки релиза 5 поправлены |
| `docs/changelog.ru.md`, `docs/changelog.en.md`, `docs/roadmap.md`, `docs/agents/state.md` | запись патча 560, тезис 48 |

## Как это выглядит

1. У игрока два персонажа в двух комнатах; Мастер открыл локацию Нику.
2. Пайпер играет — её окно чистое, чужой локации она не видит.
3. В списке персонажей у карточки Ника **синяя** иконка сервера, у Пайпер
   обычная (зелёная в сети / серая не в сети).
4. Вошли за Ника — открылась его локация, иконка погасла.
5. Присланный эффект (уровень, крышки, лечение, увечья) сигналит той же синей
   иконкой и показывается окном «Что прислал Мастер» при входе в персонажа.
6. Вид плашки и окна локации — как раньше.

## Установка через консоль

```bash
git fetch --no-tags origin arena/a97ebb5a-fallout-2d20-companion
git show FETCH_HEAD:apply-patch.sh > apply-patch.sh
chmod +x apply-patch.sh
./apply-patch.sh 560
```

После установки: `git add -A && git commit -m "Патч 560"`.

## Проверка

```bash
npx vitest run __tests__/room/transmission-per-character-560.test.js \
  __tests__/room/effects-window-559.test.js \
  __tests__/room/hub-player-window-542.test.js \
  __tests__/room/player-lock-overlay-524.test.js \
  __tests__/room/room-character-sync-456.test.js
npm run typecheck
```
