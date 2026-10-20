# Известные падения тестов (2026-10-20)

Этот checkout собран из диффа мёртвой ветки `arena/e015864a-fallout-2d20-companion`
(433 файла) поверх `main` (`6b6cde1`). Дифф меняет архитектуру: Fallout-слайсы
(`powerArmorSlice`, `robotSlice`, радиация, голод) переехали в state extensions
сеттинга, `domain/saveSlimming` перестал знать про слоты робота, каталог
расходников стал runtime-owned. Часть тестов на ветке не была обновлена —
поэтому в этом дереве они красные. На `main` (`/tmp/base-wt`) этот набор зелёный.

Ниже — что именно осталось, чтобы не искать причину заново. Это не регрессия
новых правок: падения существовали до добавления публикации релизов и сетевого
обновления (`__tests__/settings/*` — зелёные).

| Причина | Файлы |
| --- | --- |
| Состояние сеттинга теперь засеяно при создании стора (`stateExtensions.radiation`, `falloutPowerArmor`, `robot`, `chemDosesLog`), тесты ждут `{}` и старые экшены (`setRadiation`, `addRadiation`, `previewConsumableRadiation`) | `saves/survival-store-slice`, `saves/counters-store-slice`, `saves/effects-scene-actions`, `saves/action-passports`, `saves/orchestrators-slice`, `saves/character-profile-store-slice`, `saves/character-context-demolished`, `saves/character-saves-module`, `saves/power-armor-store-slice`, `perks/perks-engine-405` |
| `slimRobotSlots`/`slimSaveData` для слотов робота уехали в setting service (`characterSave.mapItemContainers`), тесты зовут удалённые функции | `saves/save-slimming`, `saves/robot-slot-slim-roundtrip`, `robot/arm-laser-pistol-old-saves-386` |
| Моды оружия/роботов: дефолты теперь берутся из `appliedMods` сеттинга, тесты не передают адаптеры и получают 0 записей (`robotWeaponHostKey`/`boundEntries`) | `equipment/weapon-mod-sync-399`, `equipment/robot-weapon-mod-flag-359`, `equipment/robot-mod-load-replay-360`, `equipment/weapon-mod-item-canonical-398`, `equipment/mods-universal-law-400`, `robot/own-attack-mods-clear-385`, `robot/weapon-mods-one-truth` |
| Перк +2 к лечению протекает на непрепарируемую еду (в тесте `healAmount` 8 вместо 6) | `perks/perks-engine-404` |
| Эффекты/сопротивления болезням после переносов в пакет | `perks/perks-engine-407`, `perks/perks-engine-408`, `repair/repair-book-413`, `repair/jury-rigging-416`, `scrap/scrap-catalog-visibility` |
| `AddItemModal` в диффе без панели фильтров и без `i18n/*/screens/inventory/modals/addItemModal.json`, тесты ждут тулбар и счётчики | `gear/equipment-filter-427`, `gear/equipment-filter-modal-429`, `gear/equipment-filter-results-430`, `gear/equipment-filter-results-432` |
| Крой патчей: ожидания «до/после» конкретного патча | `patches/baseline-cutoff` |
| Рецепты крафта: словарь категорий стал runtime-owned | `crafting/category-rules-registry`, `crafting/crafting-rules` |

Сравнение прогонов (полный `npx vitest run`):

| Дерево | Файлы | Тесты |
| --- | --- | --- |
| `main` @ `6b6cde1` (`/tmp/base-wt`) | 160 passed / 1 failed | — |
| этот checkout после диффа | 35 failed / 140 passed | 79 failed / 1651 passed |
| этот checkout после правок 2026-10-20 | 33 failed / 143 passed | 77 failed / 1660 passed |

Причина, по которой набор с `main` не совпадает буквально: дифф удаляет
`src/store/powerArmorSlice.js` и переносит Fallout-механику в пакет, поэтому
тесты, написанные под старую раскладку, проверяют несуществующие экшены.

Не «чинить» это подгонкой продакшн-кода под старые ожидания: правильный путь —
переписать перечисленные тесты на новые двери (`characterStore.stateExtensions`,
`SETTING.services.characterSave`, каталог активного сеттинга).
