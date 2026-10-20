# Потоки данных: как что откуда и куда идёт

> Дополнение к `docs/agents/README.md`. Каждый поток проверен по коду;
> при переезде потока править и этот файл (в том же патче).

## 1. Каталог предметов (источник правды — JSON сеттинга)

```
modules/fallout/data/**/*.json          (механика: id, статы, цены)
modules/fallout/i18n/<локаль>/**.json   (имена/тексты; зеркало объявленных файлов)
        │
        ▼
modules/fallout/index.js                (дверь SETTING: data + names по локалям)
        │
        ├──► domain/registry.js         (generic service access; package data adapters)
        ├──► i18n/equipmentCatalog.js   (проектирование каталога активного пакета)
        └──► db/catalogSource.js        (rows из optional setting projection) → экраны/модалки
```

Правила: файл без объявления в двери = файла нет (ошибка, не пустой
список); «вариант» оружия — `trueItemId` (механика от истинного предмета,
имя своё: «Опасная бритва» ← бритва-переключатель).

## 2. Модификаторы предметов (общая операция + opaque setting targets)

```
ФОРМА ID (src/engine/items/weaponMods.ts):
  modIdList() / modIdMap() работают со списком id и выводимой картой
  appliedMods; каталог и значение target ID принадлежат setting capability.

ОБЩИЕ МЕСТА ЗАПИСИ (classifyModWritePlan):
  storeItem → updateItem для общего экземпляра в инвентаре
  equippedWeapon → запись общего экипированного экземпляра
  engine не знает роботизированные или иные setting-owned поля.

FALLOUT TARGET PLANNING (modules/fallout/logic/robotWeaponMods.js):
  classifyFalloutModWritePlan добавляет robotSlot{role, slotKey, weaponId};
  robotWeaponHostKey строит стабильный opaque target ID.
  WeaponsAndArmorScreen исполняет Fallout-ветку установки/снятия.

LOAD RECONCILIATION:
  engine domain/weaponModInstances.js — общий алгоритм сверки экземпляров
  по недостатку, идемпотентность, связывание/освобождение записей;
  Fallout `inventory.features.modifierStorage` поставляет catalog IDs,
  роли `{ targetId, modifierId, slotId }`, поля record ID/creation и
  политику orphan targets. Домен не читает `robot`, `weaponId` или слоты.
```

## 3. Робо-слоты (анатомия робота — из данных)

```
ДАННЫЕ (modules/fallout/data/equipment/robot/):
  limbs.json        конечности: limbType (arm/head/body/mover),
                    canHoldWeapons, weaponSlots, builtinWeaponId,
                    replaceable, compatibleBodyPlans
  weaponAsLimb.json конечность-оружие (attackId, установка: сложность/
                    перки/навык)
  weapons.json      робо-оружие; trueItemId → ПОЛНЫЙ вариант людского
                    (314): робо-запись несёт только личность (id, имя,
                    weaponType, handheld) и заводские modIds «из коробки»;
                    боевые характеристики — от людской базы
  weapon_mods.json  моды робо-оружия (slot + applies_to_ids — слоты
                    ВЫВОДЯТСЯ из модов; файла-перечня больше нет)

СОСТОЯНИЕ СЛОТА (modules/fallout/logic/robotSlots.js):
  худая форма (сейв): { content, armorLayers, heldWeaponId,
                        heldWeaponMods, installedWeapons[],
                        ownWeaponMods? }
  живая форма (экран): { limb, armor, plating, frame, heldWeapon }
  normalizeSlot / serializeSlot / deserializeSlot — мосты; каталог важнее
  экземпляра для механики, экземпляр — для модов/имени.

КАРТОЧКИ АТАК: attacksFromSlot → collectAttacks (instanceKey = слот:
источник:id; дедуп — правило экрана). Роль карточки: attackRole =
held | installed | ownAttack — её читает Fallout planner, не engine.
```

## 4. Сохранения (паспорта и миграции)

```
СТОРА → СЕЙВ: src/saves/characterSaves.js пишет generic snapshot;
settingSave capability проецирует package state на legacy save keys.
Общие item containers обходит domain/saveSlimming.js; setting-owned nested
containers и compact encodings передаются `services.characterSave`.

ЗАГРУЗКА СТАРОГО: src/store/migrations.js — цепочка версий
(schemaVersion); чтение legacy ТОЛЬКО здесь или в package-owned migration;
после миграции рантайм видит современный формат.

ROBOT SLOT FILE FORMAT: текущие compact slot keys сохраняются/восстанавливаются
Fallout save codec; engine не типизирует и не переинтерпретирует эти слоты.
```

## 5. Выживание (прецедент сеттингового расширения)

```
modules/fallout/survival/  (голод/жажда/сон/усталость)
  → зарегистрировано через реестр расширений состояния
    (src/store/stateExtensions.js: {id, fieldKey, factory, hydrate, reset})
  → слушает расходники (применение еды/питья) и часы (SurvivalClock)
Движок расширения исполняет, не зная их содержимого. Новые setting-поля
состояния — через этот же реестр, не прямо в store.
```
