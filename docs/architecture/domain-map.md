# Карта домена: что универсально, что — специфика сеттинга

> Вопрос владельца (2026-09-21): «domain на 90% написан под текущий сеттинг, что там
> универсального, что подойдёт любому сеттингу — хрен пойми». Этот документ — ответ:
> карта слоёв, пер-файловая, с планом разделения. Дополняется при каждом переезде.

## Критерий разделения (слово владельца, дословно)

> «Система крафта относительно универсальна. Берём одни данные, проверяем их наличие,
> выдаём другие данные, старые списываем. А что это за данные — хлам, или еда, или
> детали оружия — скажет сеттинг на основе своей формулы».

То есть: **механика = универсальная формула** (живёт в движке/домене, значений сеттинга
в ней нет); **значения = данные сеттинга** (живут в `modules/<сеттинг>/`); **правила,
которые не выражаются данными, = специфика сеттинга** (место им — в модуле, не в домене).

InventoryScreen остаётся engine-owned стабильной таблицей; setting-specific функции добавляются через optional runtime features — см. [inventory-runtime-contract.md](inventory-runtime-contract.md).

## Слои

| Слой | Где | Что это | Судьба |
|---|---|---|---|
| 0. Ядро контрактов | `src/engine/contracts`, `src/engine/derivations` | Контракт выводимости, валидация сеттингов (МК-2). Про fallout не знает ничего; единственный клиент — `modules/test-setting` | Остаётся |
| 1. Универсальный домен | `domain/` | Не знает сеттинга вовсе: броски, ресурсы, сейвы, персонажи как записи | Остаётся |
| 2. Движки механик | `domain/` | Формула универсальна, значения приезжают из данных сеттинга через реестр | Остаётся |
| 3. Специфика Fallout | `domain/` (сейчас) | Правила, не выражаемые данными: роботы, перки, силовая броня, киты… | **Уезжает в `modules/fallout/logic/`** (фазы МК-3+; по образцу test-setting, где формулы внутри модуля) |

Замер на 292: domain/ = 49 файлов, ~9900 строк. Слой 3 ≈ 5500–6000 строк (робо-семейство
одино ~2000). По строкам «под сеттинг» ~60%; реестр остаётся отдельным долгом границы
(часть API повторяет Fallout-группы), а robot catalog projection уже принадлежит пакету.

## Пер-файловая карта

### Слой 1 — универсальный домен (остаётся)

| Файл | Назначение |
|---|---|
| types.js | JSDoc-типы движка, файл без рантайм-кода |
| counters.js | Числовые ресурсы персонажа: форма + действия («ни данных сеттинга» — их шапка) |
| d20Checks.js | Shared 2d20 check resolution (target, tagged-skill criticals, successes/complications); settings supply test inputs |
| diceRollsLogic.js | Standard dN, shared 2d20 Combat Dice rolls/effects, and neutral roll-type/config helpers; setting formula syntax and data interpretation stay package-owned |
| levelBands.js | Полосы уровней: механизм шкалы |
| premium.js | Премиум-статус (уровень приложения, не сеттинга) |
| moduleLocale.js | Локаль активного модуля |
| settingsCatalog.js | Каталог настроек: движковые + настройки активного сеттинга |
| i18n/equipmentCatalog.js | Generic compatibility adapter to `services.catalogs.equipment`; no setting catalog schema |
| db/catalogSource.js | Generic dispatcher to an optional setting-owned legacy database-row capability |
| packMerge.js | Generic deep merge and ID-based override helpers; setting-specific catalog variants are delegated |
| characterFolders.js | Папки персонажей в сейве |
| characterDuplication.js | Дублирование персонажей |
| characterTransfer.js | Перенос персонажей |
| characterAvatar.js | Аватары персонажей |
| equipEquip.js | Generic equipment eligibility adapters; setting denial reasons and policy are optional capabilities |
| itemfitRules.js | Правила посадки предметов (профили — данные сеттинга) |

### Слой 2 — движки механик (остаётся; механизм универсален, значения — из данных)

| Файл | Механика |
|---|---|
| craftingEngine.js | Generic check-and-transfer workflow; output-quantity schema/roll semantics are injected by the setting package |
| enrichItem.js | Compatibility adapters for setting-owned item-modifier capabilities; generic display-name/arithmetic helpers |
| modsEquip.js | Compatibility adapters plus neutral modifier-install delta/filter helpers |
| resolveItem.js | Generic item-enrichment adapter; catalog categories, type inference, instance payload fields, and modifiers are setting-owned |
| itemIdentity.js | Generic adapter to active-setting item identity; persisted key format and payload semantics are package-owned |
| numericModifier.js | Общая арифметика и применение числовых модификаторов по opaque target ID; цели и семантику объявляет сеттинг |
| effects.js | Shared timed-effect record creation/stacking, expiry and scene advancement; generic dose-window and condition-removal helpers, exposed to setting bundles as `engine:domain/effects`; setting payloads pass opaquely through the store/legacy bridge |
| randomItem.js | Универсальный выбор записи из коллекции |
| itemfit.js | Посадка предметов по fit-профилям |
| equippedArmor.js | Generic equipped-layer state plus optional setting-owned target-layer/overlay rules |
| protectionKind.js | Optional inventory-capability adapters; protection categories and catalog keys are setting-owned |
| itemBasics.js | Generic adapter to the setting's item-summary presentation; Fallout labels/fields live in the package |
| immunities.js | Общий поиск объявленного иммунитета по непрозрачному типу; конкретные типы объявляет setting package |
| range.js | Generic adapter to the active setting range capability; no range scale or labels are embedded |
| weaponDisplay.js | Generic adapters to setting-owned item/weapon labels, sorting, and modifier descriptions |
| skillCanonical.js | Канонизация имён навыков (долг: импорт экранного словаря) |
| sceneRiskChecks.js | Проверки риска сцены (правила — из реестра) |
| perks.js | Универсальный выбор/ранги перков; эффекты — через optional [`perks` capability](perks-runtime-contract.md) |
| saveSlimming.js | Generic catalog projection for shared save containers; setting-owned item fields and containers are supplied by save/inventory capabilities |

### Слой 3 — специфика Fallout (уезжает в modules/fallout/)

| Файл | Что делает |
|---|---|
| modules/fallout/logic/weaponDurability.js | Fallout ammo-use durability, quality multipliers and repair field defaults |
| modules/fallout/logic/actionPoints.js | Fallout 2d20 group action-point pool, cap, earn/spend and session reset rules |
| modules/fallout/crafting/outputQuantity.js | Fallout `{ base, cd }` recipe quantity validation/resolution, using the shared engine Combat Dice API through a port |
| modules/fallout/logic/diceRollsLogic.js | Fallout-specific formula encodings and legacy damage helpers over the shared engine dice API |
| modules/fallout/logic/itemIdentity.js | Fallout legacy catalog fields and stable persisted instance/stack-key format |
| modules/fallout/logic/meleeSlot.js | Fallout built-in unarmed-attack identification and visibility policy |
| modules/fallout/logic/storeItemModifiers.js | Fallout interpretation of stored weapon-mod payloads and damage-type overrides |
| modules/fallout/logic/storeSelectors.js | Fallout equipped-armor, weapon-display, and legacy modifier-selection projections |
| modules/fallout/logic/uniqQualities.js | Fallout quality catalog/name resolution and item-name composition |
| modules/fallout/logic/weaponRange.js | Fallout Close–Extreme range scale, catalog-letter mappings and ordinal modifier steps |
| modules/fallout/logic/weaponQualityConflicts.js | Fallout opposite-quality IDs and conflict normalization |
| modules/fallout/logic/bodyplan.js | Fallout body-plan interpretation and slot defaults, read from package-owned data |
| modules/fallout/logic/kitEquip.js | Fallout kit equipment eligibility and equip-state policy |
| modules/fallout/salvage/engine.js | Fallout item-breakdown composition, yield and transaction rules |
| modules/fallout/repair/engine.js | Fallout repair difficulty, time and complication rules; material IDs remain opaque |
| modules/fallout/alerts/catalog.js | Fallout-owned alert descriptors consumed through the generic alert host |
| modules/fallout/logic/robotSlots.js | Модель слотов роботов (~1000 строк) |
| modules/fallout/logic/robotMk2.js | Fallout Securitron Mk II transaction and optional inventory-row action/presentation |
| modules/fallout/logic/robotEquip.js | Экипировка роботов: правила, лимиты (~800 строк) |
| modules/fallout/logic/robotDamageResistance.js | Сопротивление урона брони роботов |
| modules/fallout/robotSlotLogic.js | Логика слотов роботов |
| modules/fallout/perks/loadAndFire.js | Fallout-перк «Заряжай и стреляй» и отображение бонуса |
| modules/fallout/perks/effects/ | Fallout effect registry, реализации перков и их каталог |
| modules/fallout/perks/attributeFilters.js | Порядок SPECIAL для фильтра Fallout-перков |
| modules/fallout/loot/foundItemBonus.js | Fallout-бонусы найденного из перков |
| modules/fallout/logic/traits.js | Fallout trait lookup, localization, legacy modifiers, sub-traits, and weapon-damage bonuses |
| modules/fallout/logic/timedEffectModifiers.js | Fallout interpretation of temporary attribute, HP, DR, defense, damage, and AP modifiers stored on effects |
| modules/fallout/logic/powerArmor.js | Правила силовой брони, legacy ID recognition, equip policy, and frame attribute modifiers |
| modules/fallout/store/powerArmorActions.js | Fallout-процессы СБ в сторе; движок оставляет только capability-мост |
| modules/fallout/diseases/diseaseConditions.js | Fallout-ранги, лечение и бросок сопротивления болезни |
| modules/fallout/diseases/orchestration.js | Fallout exposure, иммунитеты и лечение; подключается через optional `diseases` capability |
| modules/fallout/consumables/orchestration.js | Fallout consumable perk modifiers, chem-dose tracking, immunities, addiction flow, and optional timed-effect/item-payload store hooks |
| modules/fallout/consumables/effectApplication.js | Fallout consumable payload/duration interpretation and localized event notifications; delegates record creation and stacking to generic `domain/effects.js` |
| modules/fallout/logic/effectLabels.js | Fallout-localized defense-modifier labels and timed-effect time text |
| modules/fallout/consumables/addiction.js | Fallout addiction threshold and any-effect Combat Dice rule |
| modules/fallout/consumables/radiation.js | Fallout radiationModifier data parsing, Combat Dice rolls, preview, and reroll rules |
| modules/fallout/consumables/vitalChanges.js | Fallout healing fields and perk-adjusted target modifiers; engine applies them by opaque target ID |
| modules/fallout/logic/radiationResource.js | Fallout radiation extension field, counter semantics, and generic resource-mutation handler |
| modules/fallout/migrations/catalogHistory.js | Fallout weapon/skill/quality ID history, origin/item/perk history, and removed synth-mod IDs (v0–v2, v5–v8, v17, v25) |
| modules/fallout/migrations/legacyCharacter.js | Fallout v9–v14 character rules and deferred starting-kit grant |
| modules/fallout/migrations/robotEquipment.js | Fallout robot slot-stat normalization and robot equipment transitions (v8, v20–v22); direct helper imports target this package module |
| modules/fallout/migrations/runtimeRegistration.js | Registers Fallout-owned save transitions at reserved engine indexes without extending the schema chain |
| domain/characterCreation.js | Engine adapter to the active setting capability; no game rules |
| modules/fallout/logic/characterCreation.js | Fallout character creation (SPECIAL, skill catalog, limits) |
| modules/fallout/logic/startingEquipment.js | Fallout built-in unarmed-weapon selection by character archetype |
| modules/fallout/catalog/equipmentCatalog.js | Fallout equipment catalog projection, locale/mechanics joins, and legacy user-equipment overlay; published through the catalog capability |
| modules/fallout/catalog/databaseRows.js | Fallout's legacy relational row projection and query facade, published by the setting |
| modules/fallout/logic/itemType.js | Fallout type IDs, payload/legacy inference, item classification, and protection-kind data behind inventory services |
| modules/fallout/logic/itemInstanceFields.js | Fallout catalog-ID interpretation and instance-only item payload keys |
| modules/fallout/logic/itemParameters.js | Fallout item-stat field keys declared through the generic inventory parameter-field API |
| modules/fallout/logic/itemResolution.js | Fallout weapon enrichment and setting-owned effective-item resolution |
| modules/fallout/logic/itemBasics.js | Fallout item summary labels and stat-field presentation |
| modules/fallout/logic/armorMods.js | Fallout armor-mod eligibility, DR application, effects, and labels |
| modules/fallout/logic/weaponModifiers.js | Fallout weapon-mod arithmetic and catalog-to-display enrichment |
| modules/fallout/logic/weaponDisplay.js | Fallout quality/effect/damage labels, ammo presentation, sorting, and mod descriptions |
| modules/fallout/logic/packMerge.js | Fallout true-item variant inheritance and numeric/quality/effect modifier rules |
| modules/fallout/logic/equipEligibility.js | Fallout fit policy, denial reasons, protection layers, and armor-overlay rules |
| modules/fallout/logic/robotInventory.js | Fallout robot-specific item, body-plan, and weapon-catalog interpretation |
| modules/fallout/logic/inventoryPresentation.js | Fallout item-type labels, icons, category icons, and random-loot catalog mapping behind optional inventory services |
| modules/fallout/logic/inventoryCatalog.js | Fallout add-item category tree, weapon groups, filter labels, and searchable catalog selection behind optional inventory services |
| modules/fallout/logic/catalogLookup.js | Fallout power-armor data and setting-owned catalog lookup behind optional inventory service |
| modules/fallout/inventoryFeatures/powerArmorAcquisition.js | Fallout fusion-core/power-armor acquisition, stack keys, durability presentation, and packed-item recognition |
| modules/fallout/screens/InventoryScreen/powerArmorInventoryRows.js | Fallout power-armor container rows, labels, and row rendering supplied as an optional screen feature |
| modules/fallout/salvage/inventoryPresentation.js | Fallout breakdown button and localized material subline presentation |
| modules/fallout/logic/robotCatalog.js | Fallout robot equipment catalog projection (limbs, weapons, mods, and armor layers) |
| modules/fallout/saves/characterLoad.js | Fallout weapon/robot/armor restoration, chem-dose expiry, reward journal, and disease-timer hydration via optional runtime capability |
| modules/fallout/saves/characterSave.js | Fallout-owned robot and armor snapshot fields with unchanged legacy save keys |
| modules/fallout/saves/stateExtensions.js | Owns Fallout radiation, dose-log, and disease-cooldown state inside the opaque extension map while retaining legacy flat save keys |
| origins.js | Generic origin data lookup, localization, and package-provided enrichment |
| modules/fallout/logic/originTypes.js | Fallout character archetypes (human/mutant/robot/cyborg/ghoul) and robot body-plan default |
| modules/fallout/kitResolver.js | Fallout-specific сборка комплектов |
| modules/fallout/skillRewards.js | Награды Fallout за выбранные навыки |
| modules/fallout/migrations/kitItemCanonical.js | Fallout legacy kit-item ID canonicalization |
| modules/fallout/migrations/weaponModCanonical.js | Fallout weapon-mod ID remapping and legacy misrouting repair |
| equipmentKits.js | Доступ к комплектам |
| modules/fallout/logic/startingPurchase.js | Fallout starting-purchase cart and caps budget rules |

### Требуют решения (слои смешаны)

| Файл | Проблема |
|---|---|
| registry.js | Generic active-setting data/service access is now an explicit `engine:domain/registry` runtime API; continue checking projected fields and remove obsolete compatibility accessors |

## Долг границы (кто ещё тянет внутренности сеттинга напрямую)

Предохранитель — `__tests__/settings/settings-boundary.test.js` (allowlist ниже —
его же список; может только сокращаться).

| Файл | Что тянет | Категория |
|---|---|---|
| — | В engine-owned production-файлах больше нет прямых статических импортов `modules/<setting>/…`; это удерживает `settings-boundary.test.js` | Граница закрыта для исходников приложения |

Тестовая фикстура `src/store/__test-setup__/settingRuntimeFixture.js` намеренно открывает Fallout-данные для тестов и не входит в runtime bundle.

## План разделения (текущее состояние)

1. **Экстракция механик/данных/строк** — продолжается поэтапно. Уже вынесены optional
   inventory features, package settings, origins, salvage/quality/disease data, body-plan
   rules, kit equip policy, starting-purchase rules, salvage/repair/durability engines, Fallout alert
   descriptors, consumable reports, database namespaces, HomeScreen links and character-file
   labels. This pass also moved Fallout action-point, range, unarmed-slot, item-key,
   stored-modifier, and legacy weapon-projection rules behind package-owned modules/capabilities.
   Standard dN and shared 2d20 Combat Dice rolls remain engine APIs so compatible settings reuse them;
   Fallout-specific formula syntax stays in the package.
   Save keys and gameplay semantics are intentionally preserved.
2. **Межпакетный API-аудит** — статический обход исходников дал около 228 package→engine
   import edges в 92 файлах (89 specifiers; 43 разрешённых engine-файла; числа approximate).
   Runtime host теперь объявляет 41 `engine:` module; эти 41 id точно совпали с emitted
   external imports последней сборки. Builder проверяет это соответствие и падает при
   отсутствующем host-map entry. `domain/registry.js` закреплён как generic host API; крафтовая
   последовательность также generic; Fallout `{base, cd}` quantity schema/validation stays in
   `modules/fallout/crafting/outputQuantity.js`, which calls the shared engine Combat Dice API. Единственная runtime-цель из
   статического списка, оставленная вне host map, — `domain/userEquipment.js`; код не менялся
   по указанию не трогать пользовательское снаряжение до разделения. Manifest contract import
   type-only и в runtime не попадает.
3. **Статическая проверка** — сборка Fallout setting runtime прошла: 2,863,817 bytes;
   41 emitted `engine:` imports покрыты host map. Это setting bundle, не Google Play APK/AAB.
   Tests остаются запрещены; Java/Android SDK недоступны.
4. **Legacy identifiers / save contract** — `caps` остаётся неизменным on-disk ключом,
   но currency↔caps mapping принадлежит Fallout `characterSave`/`characterLoad` capability.
   Cloud-sync engine names are generic (`setting_cloud_sync_enabled`,
   `window.SETTING_GOOGLE_DRIVE_CLIENT_ID`, neutral multipart boundaries); old
   `fallout_cloud_sync_enabled` is read/migrated through the Fallout package capability.
   Dormant `packStore` uses `setting:pack`. User-equipment storage still has
   `fallout2d20:user-equipment:v1`; equipment data paths не менялись по прежнему ограничению.
   Google Drive subfolder уже использует active `settingId`. `app.json` сохраняет текущие
   slug/bundle/package/scheme, а public legal text и Play identity остаются Fallout-branded;
   нужно решение владельца, входят ли они в запрет «Fallout strings in engine».
5. **Физическое разделение репозиториев** — source/API boundary map уже достаточно оформлен для подготовки переноса; перед первой repo-level операцией запросить у владельца точные адреса engine/app (APK) и setting/TRPG репозиториев. Не создавать и не угадывать их.
6. **Интеграция и бинарная проверка после split** — APK собирать из engine/app repository, TRPG/setting — из отдельного repository, как указал владелец; затем проверить реальные сборки и убедиться, что в engine APK нет Fallout-кода, данных, ресурсов и строк. Артефакта пока нет, в текущем окружении нет Java/Android SDK; native verification переносится на доступную CI/build среду после указания репозиториев. Оценка до завершения: около 4–6 крупных этапов.
