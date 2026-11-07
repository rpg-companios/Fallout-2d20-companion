# Установка патча 562: длинные названия читаются целиком

Патч подготовлен от состояния **версии 561**. Файл установки:
`patchs/562-item-name-parts.patch`.

> **Слова владельца:** «Длинные названия должны читаться целиком. Обрати
> внимание на базовые имена из 2х слов, по типу боевой карабин, двуствольный
> дробовик и т.п».

## Что меняется

| Файл | Что сделано |
| --- | --- |
| `domain/itemNameParts.js` | **новый.** `getItemNameParts(item, modsById)` → `{ title, mods }`: из настоящего имени предмета снимаются префиксы установленных модов (в порядке склейки), остаток — качества, переименование прикладом и базовое имя целиком. `buildModsIndex(catalog)` — индекс «id мода → имя и префикс» |
| `components/lootTrade/ItemNameLines.js` | **новый.** Одна разметка имени на склад и торговца: заголовок 14px/600 + строка модов 12px серым. Никакого `numberOfLines` |
| `components/lootTrade/PartyStorageModal.js` | имя в трёх местах (выдача, приём, панель Мастера) рисует `ItemNameLines`; `modsIndex` считается один раз на окно |
| `components/lootTrade/PlayerLootTradeOverlay.js` | то же у торговца (продажа, покупка) и в списке лута; с `tradeRowBasics` снят `numberOfLines` |
| `components/lootTrade/tradeOverlayStyles.js` | `tradeRowName` 14px/600, новый `tradeRowMods`, `minWidth: 0` у `tradeRowInfo` и `lootRowInfo` |
| `__tests__/lootTrade/item-name-parts-562.test.js` | **новая приёмка** (9 проверок), включая инвариант на всём каталоге оружия |
| `__tests__/room/transfer-quantity-561.test.js` | проверка строки теперь смотрит на `ItemNameLines`, а не на разбор внутри окна склада |
| `__tests__/room/gm-decision-535.test.js`, `__tests__/room/lock-progress-532.test.js` | защёлки версии: 562 / `baseline` 562 / roadmap `**562**` |
| `patchs/baseline.json`, `public/version.json` | отсечка и версия 562 |
| `docs/changelog.ru.md`, `docs/changelog.en.md`, `docs/roadmap.md`, `docs/agents/state.md`, `docs/design-item-name-562.md` | записи патча, тезис 50, документ обсуждения |

## Как это выглядит

```
🔫 Unreliable Pipe Bolt-Action
   .38 Receiver · Finned · Bayonet · Large Magazine ·
   Long Night Vision Scope · Sharpshooter's Grip · Full Stock
```

Заголовок — то, что игрок называет предметом (качества + имя целиком, включая
двухсловные «Боевой карабин» и «Двуствольный дробовик», и переименование
прикладом). Строка ниже — моды, каждый читается отдельно. Ни одна строка не
обрезается: она переносится, и строка предмета растёт.

## Что НЕ менялось

- Сами имена в данных и правило склейки `enrichItem` — нетронуты.
- Количество, буфер и нижние кнопки (561), ключи и вкладки склада (557),
  протокол комнаты, транзакции.
- Цены, наценки, касса торговца.

## Установка через консоль

```bash
git fetch --no-tags origin arena/a97ebb5a-fallout-2d20-companion
git show FETCH_HEAD:apply-patch.sh > apply-patch.sh
chmod +x apply-patch.sh
./apply-patch.sh 562
```

После установки: `git add -A && git commit -m "Патч 562"`.

## Проверка

```bash
npx vitest run __tests__/lootTrade/item-name-parts-562.test.js \
  __tests__/lootTrade/party-storage-modal-507.test.js \
  __tests__/room/transfer-quantity-561.test.js \
  __tests__/room/storage-trader-parity-556.test.js
npm run typecheck
```

Глазами: открыть склад и торговца, найти оружие с модами — заголовок читается
целиком, моды идут отдельной серой строкой, многоточий нет; книга или броня
показываются полным названием без второй строки.
