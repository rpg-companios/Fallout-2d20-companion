# Установка патча 561: «Сколько переместить?» в складе и у торговца

Патч подготовлен от состояния **версии 560**. Файл установки:
`patchs/561-transfer-quantity.patch`.

> **Слова владельца:** «тап по назначению или клик автоматически переносят
> предмет… откроется модалка поверх: сколько переместить? А ниже ячейка с
> числом. Ещё ниже ползунок… Ниже 2 кнопки "подтвердить" "отмена"».
> «"−" появляется при количестве предметов отданных более 1х».
> «Торговец и склад работают по одному дизайну. Править их раздельно
> бессмысленно».

## Что меняется

| Файл | Что сделано |
| --- | --- |
| `components/lootTrade/TransferQuantityModal.js` | **новый.** Одно окно на склад и торговца: заголовок «Сколько переместить?», предмет, направление и «доступно N», ячейка с числом, `+` всегда, `−` только при значении больше 1 (место под неё зарезервировано), ползунок, «Подтвердить» / «Отмена». Ввод зажимается в 1…остаток |
| `components/lootTrade/PartyStorageModal.js` | долгое нажатие на строку открывает окно количества и кладёт выбранное в буфер; построчные кнопки «Положить»/«Все»/«Забрать» убраны; название до двух строк, количество — бейджем `×N` |
| `components/lootTrade/PlayerLootTradeOverlay.js` | то же окно у торговца для покупки и продажи; итог считается от цены; построчные кнопки убраны, количество бейджем |
| `components/lootTrade/tradeOverlayStyles.js` | стили бейджа количества |
| `i18n/ru-RU|en-EN/screens/lootTrade/screen.json` | подписи окна: заголовок, «доступно», «Подтвердить», «Отмена», «Итого» |
| `__tests__/room/transfer-quantity-561.test.js` | **новая приёмка** (10 проверок) |
| `__tests__/room/storage-trader-parity-556.test.js` | «Всё» заменено на долгое нажатие + окно количества; в мок react-native добавлен `TextInput` |
| `__tests__/lootTrade/party-storage-modal-507.test.js`, `__tests__/room/storage-pane-tabs-557.test.js` | в моки добавлен `TextInput` |
| `__tests__/room/gm-decision-535.test.js`, `__tests__/room/lock-progress-532.test.js` | защёлки версии: 561 / `baseline` 561 / roadmap `**561**` |
| `patchs/baseline.json`, `public/version.json` | отсечка и версия 561 |
| `docs/changelog.ru.md`, `docs/changelog.en.md`, `docs/roadmap.md`, `docs/agents/state.md`, `docs/design-storage-quantity-561.md` | записи патча, тезис 49, документ обсуждения |

## Как это работает

1. Тап по строке — одна штука уходит в буфер (как раньше).
2. Долгое нажатие — окно «Сколько переместить?»: ячейка с числом, `+`, `−`
   появляется с двойки, ползунок, «Подтвердить» / «Отмена».
3. Выбранное количество добавляется в буфер; в буфере по-прежнему `−1` и `✕`.
4. Окончательный обмен — нижняя кнопка «Перенести» (у торговца «Купить» /
   «Продать»). До неё ничего не списано.
5. У торговца в окне видно итог по деньгам от выбранного количества.

## Установка через консоль

```bash
git fetch --no-tags origin arena/a97ebb5a-fallout-2d20-companion
git show FETCH_HEAD:apply-patch.sh > apply-patch.sh
chmod +x apply-patch.sh
./apply-patch.sh 561
```

После установки: `git add -A && git commit -m "Патч 561"`.

## Проверка

```bash
npx vitest run __tests__/room/transfer-quantity-561.test.js \
  __tests__/room/storage-trader-parity-556.test.js \
  __tests__/room/storage-pane-tabs-557.test.js \
  __tests__/lootTrade/party-storage-modal-507.test.js
npm run typecheck
```
