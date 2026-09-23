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
        ├──► domain/registry.js         (единая точка чтения: геттеры, робо-каталог)
        ├──► i18n/equipmentCatalog.js   (слияние данных+имён, робо-оружие → общий пул)
        └──► db/catalogSource.js        (строки «как ряды старой БД»: weapons, mods,
                                         modSlots, perks, items) → экраны/модалки
```

Правила: файл без объявления в двери = файла нет (ошибка, не пустой
список); «вариант» оружия — `trueItemId` (механика от истинного предмета,
имя своё: «Опасная бритва» ← бритва-переключатель).

## 2. Моды оружия (единая правда, патч 311)

```
ФОРМА ПРАВДЫ (src/engine/items/weaponMods.ts):
  экземпляр несёт СПИСОК id модов (modIds);
  карта «слот → id» (appliedMods) — выводимый вид для окна/карточки.
  modIdList()  — читает любую из двух форм (appliedMods приоритетнее);
  modIdMap()   — строит карту по каталогу (мод сам знает свой слот).

ПЛАН ЗАПИСИ (classifyModWritePlan):
  карточка (sourceSlot/attackRole/storeItemId/uniqueId)
        → план: robotSlot{role: held|installed|ownAttack}
              | storeItem | equippedWeapon
  экран (WeaponsAndArmorScreen) только ИСПОЛНЯЕТ план:
    held       → запись оружия в слоте робота (heldWeapon)
    installed  → запись в limb.builtinWeapons (setInstalledWeaponMods)
    ownAttack  → на саму конечность (setOwnWeaponMods, поле ownWeaponMods)
    storeItem  → updateItem (предмет инвентаря)
    equippedWeapon → список надетого оружия человека

ЧТЕНИЕ: domain/enrichItem.js (applyWeaponMods, enrichWeaponItem) — база
из каталога + моды; карточки роботов — domain/robotSlots.js
(materializeWeapon: база + заводские modIds записи + моды экземпляра).
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

СОСТОЯНИЕ СЛОТА (domain/robotSlots.js):
  худая форма (сейв): { content, armorLayers, heldWeaponId,
                        heldWeaponMods, installedWeapons[],
                        ownWeaponMods? }
  живая форма (экран): { limb, armor, plating, frame, heldWeapon }
  normalizeSlot / serializeSlot / deserializeSlot — мосты; каталог важнее
  экземпляра для механики, экземпляр — для модов/имени.

КАРТОЧКИ АТАК: attacksFromSlot → collectAttacks (instanceKey = слот:
источник:id; дедуп — правило экрана). Роль карточки: attackRole =
held | installed | ownAttack — её читает план записи модов.
```

## 4. Сохранения (паспорта и миграции)

```
СТОРА → СЕЙВ: src/saves/characterSaves.js пишет снимок по паспорту
src/saves/saveSnapshot.ts (CHARACTER_SAVE_KEYS); реальный persist-JSON
стора сверяется с CHARACTER_PERSISTED_KEYS (characterState.ts) — тест
data-passports в обе стороны.

ЗАГРУЗКА СТАРОГО: src/store/migrations.js — цепочка версий
(schemaVersion); чтение legacy ТОЛЬКО здесь; после миграции рантайм
видит современный формат. migrations.js задним числом не правят.

РОБО-СЛОТЫ В СЕЙВЕ: худая форма (id + списки id модов); восстановление —
deserializeSlot по каталогу; локализованные имена дообогащает
restoreSaveData.
```

## 5. Выживание (прецедент сеттингового расширения)

```
modules/fallout/survival/  (голод/жажда/сон/усталость)
  → зарегистрировано через реестр расширений состояния
    (src/store/stateExtensions.js: {id, fieldKey, factory, hydrate, reset})
  → слушает расходники (применение еды/питья) и часы (SurvivalClock)
Движок расширения исполняет, не зная их содержимого. Новые сеттинговые
поля состояния — через этот же реестр, не прямо в стор.
```

## 6. Производные параметры (МК-3: правила — в сеттинге, каскад — в хранилище)

```
modules/fallout/logic/derivedStats.js    (формулы: ОЗ, инициатива, защита,
        │                                 ближний бой, грузоподъёмность; 316)
        │
        ▼
domain/registry.js → getDerivedStatsLogic()   (дверь: движок не импортирует
        │                                      модуль напрямую)
        ▼
src/store/characterStore.js
  withDerivedCascade (317): любое действие, меняющее вход (атрибуты, эффекты,
  перк-бонусы, трейт, уровень, ориджин, робо-слоты, зеркало экипировки),
  пересчитывает derivedStats САМО — синхронно, единой функцией
  deriveFromSnapshot. Ручных вызовов пересчёта больше нет (26 удалено);
  recalculateDerivedStats — публичная точка форс-пересчёта.
Экраны модуля читают формулы напрямую из logic/derivedStats (316),
хранилище — только через дверь.
```

## 7. Установщик патчей (доставка правок владельцу)

```
patchs/<N>-имя.patch  (файлы патчей в ветке Arena)
./apply-patch.sh N    (установщик: истина в содержимом файлов;
                       --status — сводка; проверка целостности JSON)
Бутстрап: git show <ветка>:apply-patch.sh > apply-patch.sh — ДО цепочки.
Ветки: правки программы — в ветку движка; правки данных/экранов
Fallout — по слову владельца (сеттинг пока живёт здесь).
```

## 8. Обновления PWA (патчи 320–321)

```
public/version.json   (версия = номер последнего патча, чейнджлог ru/en;
                       обновляется В ТОМ ЖЕ ПАТЧЕ, что и changelogs)
        │  fetch cache:'reload' при каждом запуске (веб)
        ▼
src/utils/appVersion.js  (чистая логика: версия новее запомненной?)
        ▼
components/UpdateNotice/UpdateNoticeModal.js  (окно «Что нового»,
  галочка «больше не показывать» → localStorage app_version_ack)
Установка: manifest.json — PNG 192+512 обязательны (SVG не считается).
Застрявшие клиенты: /sw.js меняется намеренно (compat-worker revision) —
воркер переустанавливается и самоуничтожается, кэши чистятся.
```

## 9. Моды брони: крафт → установка → снятие (патчи 341–343)

```
КРАФТ (окно «Крафт», квадрат «Броня»):
  recipes/armor.json (генератор build-crafting-data.mjs)
        │  domain/resolveItem.js case 'armorMod' (каталог armorMods/uniqArmorMods)
        ▼
  мод-ПРЕДМЕТ в сумке (items[instanceKey], weaponId = id мода)

УСТАНОВКА (WeaponsAndArmorScreen → ArmorModificationModal):
  выбор в окне → setEquippedArmor(slot, modifiedItem)  — запись id модов
  на предмет брони (appliedUniqueArmorModId / appliedArmorModId /
  appliedClothingModId; форма правды — см. §1 справочника armor-mods)
        │  ПАРАЛЛЕЛЬНО (343, слово владельца):
        ▼
  installArmorMod({modId, hostKey}) — экземпляр мода в сумке:
    equipped: true (невидим в сумке: selectItemsByEquipped(false),
    вес не задваивается — вес брони уже включает weightModifier)
    installedOn: hostKey (ключ экземпляра носителя, иначе «слот.слой»)
    экземпляра в сумке нет (гейт ВЫКЛ) → null, просто запись на броне

СНЯТИЕ/ЗАМЕНА (окно установки):
  uninstallArmorMod({modId, hostKey}) — equipped: false, installedOn
  стирается → мод снова виден в сумке

УДАЛЕНИЕ НОСИТЕЛЯ — одна копия правила В СТОРЕ (344):
  adjustItemQuantity(itemId, delta) — кнопки «Продать»/«Потратить»/
  «Выбросить» инвентаря (UI-хелпер делегирует) и крафт-расход
  (spendItemStacks, боеприпас spendAmmoForWeapon): при удалении предмета
  collectModsBoundTo уводит его моды («продали предмет с модом —
  ушли оба»); releaseModsBoundTo — действие для будущих точек.
  ПРИВЯЗКА — К ПРЕДМЕТУ (344): id модов пишутся и на слот-копию, и на
  ЭКЗЕМПЛЯР в сумке (updateItem в handleApplyArmorModification) —
  снятие/надевание брони моды не теряет. Слот без ключа экземпляра
  (только старые сохранения/перенос файлом; предметы комплектов создания
  ВСЕГДА имеют экземпляры) — мод не флагается, остаётся видимым (345).

ПАСПОРТ: installedOn — в SAVE_STATE_FIELDS (saveSlimming) и
INSTANCE_FIELDS (resolveItem); действия — в CRUD_OP_KEYS
(characterActions.ts, fuse action-passports).
```
