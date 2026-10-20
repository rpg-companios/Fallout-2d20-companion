# Пользовательское снаряжение Fallout 2d20

[English version](README.en.md)

Версия формата: **`schemaVersion: 1`**. Это описание относится к активному сеттингу `fallout` и к четырём файлам пользовательских данных.

## Готовые JSON-файлы

Каждый файл ниже содержит рабочие примеры записей — их можно импортировать как есть, а затем заменить или удалить примеры и внести свои данные. Это обычные JSON без комментариев.

- [Оружие — `usrdataWeapon.json`](templates/usrdataWeapon.json)
- [Броня — `usrdataArmor.json`](templates/usrdataArmor.json)
- [Моды оружия — `usrdataWeaponMods.json`](templates/usrdataWeaponMods.json)
- [Моды брони — `usrdataArmorMods.json`](templates/usrdataArmorMods.json)

Файл загружается через импорт соответствующего типа в настройках приложения. Для нового набора данных можно скопировать нужный файл-шаблон и отредактировать его.

## Общая структура файла

```json
{
  "schemaVersion": 1,
  "settingId": "fallout",
  "kind": "weapons",
  "items": []
}
```

| Поле | Тип | Правило |
|---|---|---|
| `schemaVersion` | integer | Сейчас обязательно `1`. |
| `settingId` | string | Должен совпадать с ID активного сеттинга; в этом проекте это `fallout`. |
| `kind` | string | `weapons`, `armor`, `weaponMods` или `armorMods`. Должен соответствовать имени файла. |
| `items` | array | Записи одного типа. Пустой массив допустим. |

Имена файлов задаются регистрозависимым соглашением приложения: `usrdataWeapon.json`, `usrdataArmor.json`, `usrdataWeaponMods.json`, `usrdataArmorMods.json`. Не переименовывай их при синхронизации.

## Общие поля записи

| Поле | Тип | Правило |
|---|---|---|
| `id` | string | Обязательно. Латинские буквы, цифры, `_` и `-`; первый символ — буква или цифра; максимум 96 символов. ID должен быть уникален внутри своего файла. |
| `names` | object | Обязательно: непустые `ru-RU` и `en-EN`. Эти значения — имена записи в приложении. |
| `itemType` | string | Необязательно для `weapons`/`armor`; если указано, должно быть соответственно `weapon`/`armor`. |
| `_updatedAt` | number | Внутреннее поле синхронизации; вручную не добавляй. |

Неизвестные поля записи отклоняются. Имена исходного JSON хранятся отдельно для каждой локали. Если имя совпадёт с уже существующим, приложение добавит к конфликтующему отображаемому имени ` (ver.)`; исходный файл не переписывается.

Повторный импорт записи с тем же исходным `id` обновляет её. Записи, отсутствующие в следующем файле, автоматически не удаляются. Если пользовательский ID конфликтует с ID каталога, приложению назначается детерминированный ID вида `<id>__usr_<суффикс>`; такой ID и имена остаются стабильными между устройствами.

## Связанный вариант через `trueItemId`

`trueItemId` создаёт отдельный именованный предмет на базе существующего предмета — это **не устанавливаемый мод**.

```json
{
  "id": "usr_weapon_variant",
  "names": { "ru-RU": "Мой вариант", "en-EN": "My Variant" },
  "trueItemId": "weapon_44_pistol",
  "modifiers": {
    "damageModifier": { "op": "+", "value": 2 }
  }
}
```

- `trueItemId` — ID базового предмета активного каталога. Варианты могут ссылаться и на другие записи того же пользовательского файла; циклические цепочки запрещены.
- Неуказанные характеристики и списки качеств/эффектов наследуются от базы. Явно указанное поле заменяет унаследованное поле.
- Вариант обязан иметь собственный `id` и собственные имена на обоих языках.
- Не добавляй копию унаследованных характеристик без необходимости. В частности, пропусти `range`/`ammoId`, если хочешь унаследовать их. Пустая строка `""`, если она указана явно, означает пустое значение, а не «возьми из базы».
- Числовые изменения задаются внутри `modifiers`. Для оружия и брони поддерживаются `qualityChanges` и `effectChanges`; допустимые ID приведены ниже.

## Числовые операции

Форма любого числового модификатора:

```json
{ "op": "+", "value": 2 }
```

Допустимые операции: `+`, `-`, `*`, `/`. `set` для пользовательских файлов не поддерживается. `value` — конечное JSON-число; делить на ноль нельзя. Результат не может быть отрицательным. Если характеристика целочисленная, дробный результат отклоняется, а не округляется.

| Пример | Результат |
|---|---|
| `{ "op": "+", "value": 2 }` | прибавить 2 |
| `{ "op": "-", "value": 1 }` | вычесть 1 |
| `{ "op": "*", "value": 1.5 }` | умножить на 1,5 |
| `{ "op": "/", "value": 2 }` | разделить на 2; для целочисленного поля результат обязан быть целым |

Вес может быть дробным. Урон, скорострельность, цена, редкость, рейтинги защиты, `ammoPerShot` и дальность — целочисленные характеристики. Дальность оружия — порядковая шкала: `C` / `M` / `L` / `E` (индексы 0–3); пустая строка допустима для оружия без дальности. Изменение дальности ограничивается краями шкалы.

## Оружие — `kind: "weapons"`

### Самостоятельное оружие

Без `trueItemId` укажи все основные характеристики:

| Поле | Тип | Требование |
|---|---|---|
| `damage`, `fireRate`, `weight`, `cost`, `rarity` | number | Обязательны, неотрицательны; целочисленные поля должны быть целыми. Вес может быть дробным. |
| `ammoId` | string | Обязательно. ID патрона из каталога; `""` допустимо для оружия без боеприпаса. |
| `range` | string | Обязательно. Обычно `C`, `M`, `L` или `E`; `""` допустимо. |
| `mainAttr` | string | Обязательно; допустимые значения текущего каталога: `AGI`, `PER`, `STR`. |
| `mainSkill` | string | Обязательно; ID навыка из списка ниже. |
| `weaponType` | string | Обязательно; значение из списка ниже. |
| `damageType` | string или array | Обязательно; тип или типы урона из списка ниже. |
| `qualities`, `effects` | array | Необязательно; ID из каталогов качеств и эффектов. |
| `range_index` | integer | Необязательно; от `0` до `3`. Если задано, используется как индекс дальности. |
| `ammoPerShot` | number | Необязательно; целое неотрицательное число. |
| `imageName`, `hasStockVariant`, `withoutMods`, `stockNames` | — | Необязательные дополнительные поля предмета. |

`mainSkill`: `BIG_GUNS`, `ENERGY_WEAPONS`, `EXPLOSIVES`, `MELEE_WEAPONS`, `SMALL_GUNS`, `THROWING`, `UNARMED`.

`weaponType`: `Energy`, `Explosive`, `Heavy`, `Light`, `Melee`, `Thrown`, `Unarmed`.

Типы урона текущего каталога: `physical`, `energy`, `radiation`, `special`, `poison`. Эти наборы берутся из данных сеттинга; при их изменении актуален каталог приложения.

### Модификаторы связанного оружия

В `modifiers` разрешены числовые изменения для `damage`, `fireRate`, `weight`, `cost`, `rarity`, `ammoPerShot`, `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, а также `rangeModifier`. Например:

```json
"modifiers": {
  "damageModifier": { "op": "/", "value": 2 },
  "weightModifier": { "op": "*", "value": 1.5 },
  "qualityChanges": [
    { "op": "gain", "qualityId": "quality_accurate" }
  ],
  "effectChanges": [
    { "op": "lose", "effectId": "effect_vicious" }
  ]
}
```

`qualityChanges` и `effectChanges` принимают массив объектов с `op: "gain" | "lose"` и существующим ID. Для качеств можно указывать `value`, если качество ранговое.

## Броня — `kind: "armor"`

Без `trueItemId` обязательны `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, `weight`, `cost`, `rarity`, непустой `protectedAreas` и существующий `armorCategoryKey`.

Текущие ключи категории: `raiderArmor`, `leatherArmor`, `metalArmor`, `combatArmor`, `synthArmor`, `vaultSecurityArmor`.

Допустимые зоны: `Body`, `Head`, `Hand`, `Leg`. `specialEffects`, если заданы, — массив объектов `{ "id": "<armor-effect-id>", "value": 1 }`; ID должен быть из списка «Эффекты брони» ниже.

Для связанного варианта используй числовые изменения `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, `weight`, `cost` и `rarity`. `qualityChanges` и `effectChanges` валидируются по тем же каталогам ID, что и для оружия.

## Моды оружия — `kind: "weaponMods"`

Обязательные поля: `id`, `names`, `modType: "weapon"`, `slot` и массив `applies_to_ids`.

| Поле | Описание |
|---|---|
| `slot` | Слот, существующий в каталоге. Текущие значения: `Barrel`, `Camera`, `Canister`, `Capacitor`, `Concentrate`, `Container`, `Dish`, `Frame`, `Fuel`, `Grip`, `Launcher`, `Magazine`, `Muzzle`, `Nozzle`, `Receiver`, `Sight`, `Stock`, `Tank`, `Unique`, `Winch`. Кроме существования слота, проверь, что он подходит указанному оружию. |
| `applies_to_ids` | Массив ID оружия, к которому применим мод. Если мод ссылается на пользовательское оружие из `usrdataWeapon.json`, сначала импортируй оружие. |
| `damageModifier`, `fireRateModifier`, `rangeModifier`, `weightModifier`, `costModifier` | Числовые операции соответствующего поля оружия. `weightModifier` может дать дробный вес; целочисленные поля проверяются после операции. |
| `qualityChanges`, `effectChanges` | Массивы изменений качеств/эффектов по ID. |
| `damageTypeOverride` | Необязательно: `{ "op": "set" | "add", "value": "energy" }` (значение может быть массивом типов). |
| `damageType` | Необязательно: один допустимый тип урона. |
| `ammoOverride` | Необязательно: ID боеприпаса из каталога. |
| `ammoPerShotDelta` | Необязательно: целочисленная добавка к расходу патронов за выстрел. |
| `cost`, `weight`, `complexity` | Необязательные стоимость, вес и сложность самого мода. Цена и сложность — целые неотрицательные числа, вес может быть дробным. |
| `perk1`, `perk2`, `skill`, `rarity`, `materials`, `prefix` | Необязательные сведения для отображения/крафта; копируй принятый формат из существующих записей модов сеттинга. |

## Моды брони — `kind: "armorMods"`

Обязательные поля: `id`, `names`, `modType` (`"armor"` или `"armorUnique"`), `modCategory` и непустой массив `protectedAreas`.

| Поле | Описание |
|---|---|
| `protectedAreas` | Одна или несколько зон из `Body`, `Head`, `Hand`, `Leg`. |
| `modCategory` | Категория из существующего каталога модификаций брони; совместимость категории зависит от `armorCategoryKey` предмета. Текущие ID категорий: `standardMods`, `combatUniqueMods`, `costumeUniqueMods`, `leatherUniqueMods`, `metalUniqueMods`, `raiderUniqueMods`, `synthUniqueMods`, `vaultSuitUniqueMods`. |
| `costModifier`, `weightModifier` | Числовые операции над ценой и весом брони. Вес может стать дробным. |
| `statModifiers` | Объект с необязательными ключами `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`; значения — числовые операции. Результат рейтинга защиты должен быть целым. |
| `specialEffects` | Массив `{ "id": "<armor-effect-id>", "value": 1 }`; ID проверяется по каталогу эффектов брони. |
| `complexity` | Необязательная целая неотрицательная сложность. |
| `requiredPerk`, `requiredSkill` | Необязательные требования для установки/крафта. Значения не переводятся и должны соответствовать формату используемых в приложении данных. |

## Допустимые ID качеств и эффектов

Эти списки взяты из текущих каталогов Fallout. При импорте ID качеств и боевых эффектов проверяется по `qualities.json` / `damageEffects.json`; `specialEffects` брони — по ключам `armor_effects.json`. Названия ниже приведены из словарей приложения ru-RU и en-EN.

### Качества оружия (`qualityChanges`, `qualities`)

Источник ID: `modules/fallout/i18n/<locale>/data/system/qualities.json`.

| ID | ru-RU | en-EN |
|---|---|---|
| `quality_accurate` | Точное | Accurate |
| `quality_blast` | Врыв | Blast |
| `quality_close_quarters` | Вплотную | Close Quarters |
| `quality_concealed` | Скрытное | Concealed |
| `quality_debilitating` | Изнуряющий | Debilitating |
| `quality_gatling` | Гатлинг | Gatling |
| `quality_inaccurate` | Неточное | Inaccurate |
| `quality_mine` | Мина | Mine |
| `quality_night_vision` | Ночное Видение | Night Vision |
| `quality_parry` | Паррирование | Parry |
| `quality_recon` | Разведовательный | Recon |
| `quality_reliable` | Надежное | Reliable |
| `quality_suppressed` | Тихое | Suppressed |
| `quality_two-handed` | Двуручное | Two-Handed |
| `quality_unreliable` | Ненадежное | Unreliable |
| `quality_re-roll_hit_location` | Перевыбрать конечность | Re-roll Hit Location |
| `quality_bayonet` | Штык | Bayonet |
| `quality_crank_x` | Ствол X | Crank X |
| `quality_shredder` | Крушащий | Shredder |
| `quality_disarm` | Обезоруживающий | Disarm |
| `quality_sneak_attack` | Скрытная атака | Sneak Attack |
| `quality_targetting_computer` | Компьютер наведения | Targetting Computer |
| `quality_slow_load` | Медленная перезарядка | Slow Load |
| `quality_recoil_x` | Отдача X | Recoil X |
| `quality_ammo-hungry_x` | Пожиратель патронов | Ammo-Hungry |
| `quality_surge` | Импульс | Surge |
| `quality_bombard` | Бомбарда | Bombard |
| `quality_thrown` | Метательное | Thrown |
| `quality_underwater` | Подводное | Underwater |
| `quality_tranq_x` | Усмирение X | Tranquilizer X |
| `quality_delay_x` | Задержка X | Delay X |
| `quality_placed` | Закладываемое | Placed |

### Боевые эффекты (`effectChanges`, `effects`)

Источник ID: `modules/fallout/i18n/<locale>/data/system/damageEffects.json`.

| ID | ru-RU | en-EN |
|---|---|---|
| `effect_arc` | Дуга | Arc |
| `effect_breaking` | Разрушающий | Breaking |
| `effect_burst` | Очередь | Burst |
| `effect_freeze` | Замораживающий | Freeze |
| `effect_persistent` | Устойчивый | Persistent |
| `effect_piercing_x` | Проникающий | Piercing |
| `effect_radioactive` | Радиоактивный | Radioactive |
| `effect_spread` | Разброс | Spread |
| `effect_stun` | Оглушающий | Stun |
| `effect_vicious` | Порочный | Vicious |

### Эффекты брони (`specialEffects`)

Источник механики: `modules/fallout/data/equipment/armor_effects.json`; локализованные описания — `modules/fallout/i18n/<locale>/data/equipment/armor/armor_effects.json`.

| ID | ru-RU | en-EN |
|---|---|---|
| `effect_explosive_resistance_2` | +2 к сопротивлению взрывным повреждениям. | +2 resistance to explosive damage. |
| `effect_explosive_resistance_4` | +4 к сопротивлению взрывным повреждениям. | +4 resistance to explosive damage. |
| `effect_ignore_energy_persistent` | Игнорировать стойкие энергетические повреждения. | Ignore persistent energy damage. |
| `effect_chems_duration_double` | Удвоить длительность действия химикатов. | Double the duration of chems effects. |
| `effect_stun_immunity` | Иммунитет к оглушению (порог 2). | Immunity to stun (threshold 2). |
| `effect_unarmed_melee_damage_1` | +1 к урону безоружного ближнего боя. | +1 to unarmed melee damage. |
| `effect_melee_damage_resistance_2` | +2 к сопротивлению урону ближнего боя. | +2 resistance to melee damage. |
| `effect_aimed_ranged_damage_1` | +1 к урону прицельной стрельбы. | +1 to aimed ranged damage. |
| `effect_ap_bonus_damage_melee` | +4 к бонусному урону ближнего боя за AP. | +4 AP bonus damage for melee. |
| `effect_melee_piercing_1` | Атаки ближнего боя получают качество «Пробивание 1». | Melee attacks gain the Piercing 1 quality. |
| `effect_fall_damage_resistance` | +2 к сопротивлению урону от падения. | +2 resistance to fall damage. |
| `effect_sneak_reroll` | Один раз за сцену перебросить проверку скрытности. | Once per scene, reroll a Sneak check. |

## Каталог ID для ссылок

- `trueItemId`: ID предмета из активного каталога оружия или брони. Источники механики Fallout — `modules/fallout/data/equipment/weapons.json`, `modules/fallout/data/equipment/robot/weapons.json` и `modules/fallout/data/equipment/armor.json`.
- `ammoId` / `ammoOverride`: ID из `modules/fallout/data/equipment/ammo.json`; у самостоятельного оружия пустая строка допустима.
- `applies_to_ids`: ID оружия из каталога. Если это пользовательское оружие, загрузи `usrdataWeapon.json` первым.
- `armorCategoryKey`: ключ из `modules/fallout/data/equipment/armor.json`.
- `slot`: слот из каталога оружейных модов; он должен подходить указанному оружию.
- `modCategory`: категория из `armor_mods.json` / `uniq_armor_mods.json`; приложение дополнительно проверяет, допускает ли её категория брони.

Не придумывай локализованные имена и ID для эффектов/качеств: добавление новых ID в эти каталоги — изменение данных сеттинга, а не пользовательского JSON.

## Локально и Google Drive

Локальные записи хранятся в `src/store/userEquipmentStore.js` отдельно для каждого `settingId`; каталог читает их через `domain/userEquipment.js` и `i18n/equipmentCatalog.js`. Google Drive-копии лежат рядом с сейвами в скрытом `appDataFolder/<settingId>`; отдельная общая или видимая папка не создаётся. Полная синхронизация восстанавливает и объединяет пользовательские JSON до обработки сейвов персонажей. См. также [потоки данных](../agents/data-flows.md#14-пользовательское-снаряжение).
