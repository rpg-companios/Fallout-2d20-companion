# Дизайн: единый конвейер обогащения предмета

Дата: 2026-08-15. Статус: черновик на утверждение владельца.

## 1. Проблема

Имя и статы предмета с модами собираются в **трёх независимых местах** с разными правилами:

| Место | Имя | Учёт качеств | Учёт stockNames | Префикс ложи |
|---|---|---|---|---|
| `domain/kitResolver.js` `resolveWeaponItem` (выдача комплектов) | префиксы (без Stocks) + качества + baseName (stockNames.with → weaponData.name) | да, добавляются | with | скрыт |
| `domain/resolveItem.js` `getWeaponNameWithAppliedMods` (обогащение) | префиксы + (baseName \|\| name \|\| baseWeaponName) | нет | нет | показывается |
| `components/.../WeaponsAndArmorScreen.js` `getLocalizedModifiedWeaponName` (карточка) | префиксы + (baseName \|\| имя-качеств \|\| stockNames.without \|\| base.name) | только как замена имени | without | показывается |

Плюс легаси-дубли в `domain/modsEquip.js` (`getModifiedWeaponName`, `applyMultipleModifications`, `createWeaponConfig`, `parseWeaponWithModifications` и др.), почти не используемые.

**Следствие (баг владельца):** модифицированное оружие из комплекта в одном месте называется так, словно модов нет; в другом — с модами, но статы не считались и новые моды не ставились. Класс «в одном месте так, в другом иначе».

## 2. Принципы (из аудита движок/сеттинг)

- Сейв хранит только состояние экземпляра (`id`, `appliedMods`, `uniqQualities`, экземплярные поля). Обогащение — всегда при чтении, **в одном месте**.
- Данные динамичны: меняются, обогащаются, влияют друг на друга, подменяют.
- Данные в приоритете; переводы — только строки; фолбэки запрещены.
- Фундамент для будущего: условные моды (по типу/параметрам/перкам/модам) и свойства (крафт и т.п., прикрепляемые к предметам).

## 3. Целевой конвейер

Новый чистый модуль **`domain/enrichItem.js`** (без React/БД):

```
instance (стор/сейв)                     catalog (data + i18n модуля)
{ id, itemType, appliedMods,        +   { запись предмета, моды, качества, эффекты }
  uniqQualities, properties?, ... }
        │
        ▼
  enrichItem(instance, catalog)   ←  ЕДИНСТВЕННАЯ точка обогащения
        │
        ├─ 1. BASE       — каталожная запись по canonicalId;
        │                  варианты: trueItemId → механика истинного предмета;
        │                  базовое имя: baseName (вариант) → stockNames → i18n name
        ├─ 2. MODS       — применённые моды: статы через единые операции
        │                  (damage/fireRate/range/ammo/weight/cost/qualities/damageType);
        │                  имя: префиксы модов (кроме Stocks) + базовое имя;
        │                  stock-мод → имя из stockNames.with (пистолет → винтовка)
        ├─ 3. QUALITIES  — uniqQualities: имена качеств в displayName;
        │                  эффекты — резерв (данные уже есть в uniq_qualities)
        └─ 4. PROPERTIES — свойства (future: крафт/прикрепление):
                           имена/эффекты по фильтрам применимости — резерв
        │
        ▼
  { ...instance, ...effective, displayName, baseName, appliedModsMeta, ... }
```

### Единое имя — `getItemDisplayName(enriched)`

Одна функция, все экраны. Правила (УТВЕРЖДЕНЫ владельцем, 2026-08-15):

1. Итог: `[префиксы модов] [имена качеств] [базовое имя]` (моды → качества → база).
2. Качества **всегда добавляются** к имени (не заменяют его).
3. Мод слота Stocks меняет базовое имя на `stockNames.with` **только если оно задано в данных** (единичные случаи: пистолет → винтовка; у 90% оружия его нет — тогда ложа обычный мод со своим префиксом).
4. Базовое имя: `baseName` варианта → `stockNames.with` (stock-мод) → `stockNames.without` → i18n-имя из каталога.

### Единые статы — `applyModifiers(base, mods)` / `removeModifiers`

Единые операции для weapon_mods и armor_mods форматов (op: `+`/`-`/`set`, диапазоны range, qualityChanges gain/lose, damageTypeOverride set, ammoOverride, weight/cost). Инверсия для снятия мода.

### Единая применимость — `getAvailableMods(item, catalog)`

Оружие: `weapon_mod_slots` + `appliesToIds` (без фолбэка «слоты не заполнены → appliesToIds» — вопрос решается данными: у оружия без записей в weapon_mod_slots — моды не предлагаются, или данные дополняются). Броня: существующие `getAvailableArmorMods` / `isUniqueModAllowedForArmor`. Здесь же появится место для будущих условных модов (условия по типу/параметрам/перкам/модам).

### Сейвы и миграции

Формат инстанса не меняется. Любое изменение формата данных или инстанса — миграция сейва при загрузке (существующий механизм `src/store/migrations.js`). Сейвы не зависят от того, как устроено обогащение.

## 4. Этапы реализации

1. **Патч 106 — ядро конвейера (оружие) — ВЫПОЛНЕН**:
   - `domain/enrichItem.js`: BASE + MODS (полная механика модов: damage,
     fireRate, range-shift, qualityChanges/effectChanges gain/lose,
     damageTypeOverride set/add, ammoOverride, weight/cost) +
     `getItemDisplayName` (моды → качества → база; варианты trueItemId
     разворачиваются в каталоге; ложа — только при stockNames.with).
   - `resolveWeaponWithAppliedMods` — обёртка конвейера (resolveItem).
   - `WeaponsAndArmorScreen.findLocalizedWeapon` — конвейер,
     `getLocalizedModifiedWeaponName` удалена (локальная сборка имени).
   - Тесты: `__tests__/equipment/enrichment-pipeline.test.js` — вариант+мод,
     качества, обёртка == конвейер, полная механика, range-клэмп.
2. **Патч 107 — качества в конвейере — ВЫПОЛНЕН**: `kitResolver.resolveWeaponItem.displayName` — через единый конвейер (`enrichWeaponItem`): имя [префиксы] [качества] [база] строится в одном месте; контракт выдачи (`_weapon`, `_mods`, `baseName`, `appliedMods`, `resolvedWeaponId`) сохранён.
   - Найден ещё один дубль механики модов: `domain/robotEquip.js applyWeaponMods` (локальная копия для встроенного оружия роботов) — переводится на конвейер в патче 108.
3. **Патч 108 — применимость модов — ВЫПОЛНЕН**: источник слотов — ТОЛЬКО `weapon_mod_slots` (фолбэк на `appliesToIds` удалён из WeaponModificationModal); данные дополнены для всех оружий с модами (сгенерировано 54 записи: 38 → 92 оружия); `domain/robotEquip.js` переведён на конвейер `applyWeaponMods` (удалена локальная копия механики); мёртвые легаси-функции оружия удалены из `domain/modsEquip.js` (388 строк: applyModification, getModifiedWeaponName, createWeaponConfig, parseWeaponWithModifications и др.).
4. **Патч 109 — свойства (future)**: дизайн с владельцем (формат данных, фильтры применимости, прикрепление).

## 5. Решения владельца (2026-08-15)

1. Порядок имени: `[префиксы модов] [качества] [базовое имя]` — подтверждён.
2. Качества всегда добавляются — подтверждено.
3. Ложа меняет имя только при наличии `stockNames.with` (единичные случаи); иначе — обычный префикс. — подтверждено.
4. Применимость модов (патч 108): **строго по данным** — у оружия без записей в `weapon_mod_slots` моды не предлагаются; фолбэк на `appliesToIds` удаляется; данные дополняются при необходимости.
