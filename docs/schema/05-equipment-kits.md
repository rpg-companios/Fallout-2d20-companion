# Схема: Equipment Kits (комплекты снаряжения)

Файлы: `data/equipmentKits/*.json` (по ориджинам/фракциям).
Структура: `{ <kitId>: { items: [ ...entries ] } }`.

## Формат записи комплекта (факт)
Каждый entry:
```jsonc
{
  "type": "fixed",                 // тип записи: сейчас встречается 'fixed'
  "itemType": "weapon|robotArm|robotHead|robotBody|robotLeg|plating|module|misc|currency|...",
  "itemId": "robot_head_protectron",   // ИЛИ weaponId / armorId — зависит от itemType
  "slot": "left|right",            // опц. (для рук/оружия роботов)
  "weaponId": "weapon_laser_gun",  // для оружия
  "ammo": { "ammoId": "...", "quantity": {...} }, // опц.
  "requiresWeaponId": "..."        // (роботы) — будет пересмотрено в редизайне рук
}
```

## Поток (факт)
Kit JSON → `resolveKitItems` (domain/kitResolver) → разрешение из каталога (JSON!) →
`flattenKitItems`/`toInventoryItems` (EquipmentKitModal) → `summarizeItems` →
`CharacterScreen.handleSelectKit` → `addNewItem` (стор) / robot → `initRobotSlots`.

## itemType, встречающиеся в данных
`weapon, robotArm, robotHead, robotBody, robotLeg, plating, module, misc, currency`.
- `currency` (крышки) — НЕ инвентарный предмет, идёт в caps (есть гард в handleSelectKit).

## Связи с другими схемами
- Робо-части кита (`robotArm` и т.д.) → раскладываются по слотам робота
  (см. ../architecture/robot-arms-redesign.md — будущий weaponIds-редизайн).
- `requiresWeaponId` (лазер на манипуляторе) — в редизайне рук заменится на
  «рука несёт несколько weaponIds» (решение владельца).

## Решения
❓ K-1: нужны ли НЕ-fixed записи (выбор/рандом)? сейчас только `type:"fixed"`.
   (в EquipmentKitModal есть flattenKitItems с выбором — проверить, какие type бывают).
❓ K-2: унифицировать идентификатор предмета (itemId vs weaponId vs armorId) → один `id`?
   (перекликается с canonical-id из normalized-store.md).
❓ K-3: валюта — всегда `itemType:"currency"`? стандартизировать поле количества.

## Что НЕ делаем сейчас
Контракт. Реализация kits — последняя в порядке (после origins/traits/attrs/derived).
