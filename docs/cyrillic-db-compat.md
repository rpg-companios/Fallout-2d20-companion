# Кириллица в коде — совместимость со старой БД

Этот файл — единственное место, где задокументированы все оставшиеся кириллические строки в JS/TS коде.
Они существуют **не как UI-строки**, а как ключи/значения для совместимости со старой схемой БД.
Когда БД будет мигрирована — каждый пункт здесь должен быть удалён.

---

## 1. `components/screens/WeaponsAndArmorScreen/WeaponModificationModal.js`

### 1.1 `translateModTokenToRu` — словарь перевода префиксов модов
```js
// строки 73–95
const map = {
  Hardened: 'Укреплённый',
  Improved: 'Улучшенный',
  // ... и т.д.
};
```
**Причина:** префиксы модов в БД хранятся на английском, но `range_name` и имена оружия — на русском.
Этот маппинг нужен, пока БД не переведена на единую схему с английскими ключами.
**Что сделать при миграции БД:** удалить функцию `translateModTokenToRu` целиком, брать локализованное имя из i18n по английскому ключу.

### 1.2 `rangeOrder` — порядок дистанций
```js
// строка 173
const rangeOrder = ['Близкая', 'Средняя', 'Дальняя', 'Экстремальная'];
const currentRangeName = String(baseWeapon.range_name ?? 'Близкая').trim();
```
**Причина:** поле `range_name` в БД хранится по-русски. Массив используется для вычисления сдвига дистанции при применении эффектов модов.
**Что сделать при миграции БД:** заменить на английские ключи (`['Close', 'Medium', 'Long', 'Extreme']`), `range_name` в БД тоже мигрировать.

### 1.3 Фолбэки `'Близкая'` в JSX
```js
// строки 374, 418
weapon?.range_name ?? 'Близкая'
modifiedWeapon.range_name || 'Близкая'
```
**Причина:** те же данные из БД. Фолбэк совпадает с дефолтным значением в БД.
**Что сделать при миграции БД:** заменить на `tWeaponsAndArmorScreen('weapon.rangeDefault')` или убрать фолбэк если поле станет обязательным.

---

## ~~2. `domain/modsEquip.js`~~ ✅ РЕШЕНО

~~Кириллические ключи объекта оружия (`weapon.Название`, `mod['Префикс имени']`, `result.Урон`, `result['Скорость стрельбы']`) убраны. Используются только camelCase: `name`, `prefix`, `damage`, `fireRate`.~~

---

## ~~3. `i18n/equipmentNormalizer.js`~~ ✅ РЕШЕНО

~~`AREA_LABELS_RU`, `normalizeProtectedArea`, `toLegacyArmor` удалены. Поле `Название` больше не создаётся. `WEAPON_TYPE_ALIASES` очищен от кириллических алиасов.~~

---

## ~~4. `i18n/equipmentCatalog.js`~~ ✅ РЕШЕНО

~~Поле `Название` больше не создаётся в `validateConsumablesContract`. Используется только `name`.~~

---

## 5. `i18n/appI18n.js`

### 5.1 Фолбэк ошибки ключа
```js
// строка 17
if (current === undefined) return fallback || 'Ошибка ключа';
```
**Причина:** дефолтный текст для отсутствующего i18n-ключа. Это не данные из БД, а dev-хелпер.
**Что сделать:** добавить i18n ключ.

---

## 6. `domain/perks.js`

### 6.1 Комментарий
```js
// строка 55
// Other requirements (e.g., "не робот") are ignored for now per scope
```
**Причина:** просто комментарий, не влияет на логику.
**Что сделать:** перевести комментарий на английский при случае.

---

## ~~7. `data/traits/traits.json`~~ ✅ РЕШЕНО

~~Поле `cyrillicName` удалено. `forcedSkills` и `skillModifiers` используют латинские id навыков (`"energy_weapons"`, `"science"`, `"repair"`, `"survival"` и т.д.).~~

---

## ~~8. `components/CharacterContext.js`~~ ✅ РЕШЕНО

~~Кириллический ключ `Название` убран из `getItemId`. Используются только латинские поля идентификатора.~~

---

## 9. `data/equipment/weapons.json`

### 9.1 Поле `imageName` — кириллица в названии ассета

```json
{ "id": "weapon_023", "imageName": "Гатлинг Laser" },
{ "id": "weapon_097", "imageName": "Гатлинг Gun" },
{ "id": "weapon_098", "imageName": "Гатлинг Plasma" }
```
**Причина:** `imageName` используется как ключ для поиска изображения в ассетах. Файлы изображений названы с кириллицей (`Гатлинг` — торговая марка/имя собственное). Переименование ассетов требует отдельной задачи.
**Что сделать при миграции:** переименовать файлы изображений на латиницу (`Gatling Laser`, `Gatling Gun`, `Gatling Plasma`), обновить `imageName` в `data/equipment/weapons.json`.

---

## 10. `data/equipment/mods.json`

### 10.1 Поле `requiredPerk` — кириллические имена перков в броне-модах

```json
{ "id": "mod_std_rubberized", "requiredPerk": "Бронник 1" },
{ "id": "mod_std_microcarbon", "requiredPerk": "Бронник 1" },
...
```
**Причина:** имена перков в данных брони хранятся по-русски (как в БД). `requiredPerk` используется для проверки требований при установке мода.
**Что сделать при миграции:** мигрировать имена перков на латинские `id` (`"armorer_1"` и т.д.), обновить логику проверки в `domain/modsEquip.js`.

---

## ~~11. `domain/kitResolver.js`~~ ✅ РЕШЕНО

~~Кириллические ключи `Название`, `Цена`, `Редкость` убраны из всех возвращаемых объектов. Используются только `name`, `cost`, `rarity`.~~

---

## 12. Переименование числовых ID предметов

В рамках рефакторинга данных все числовые ID вида `type_NNN` были переименованы в человекочитаемые:

- `weapon_001..101` → `weapon_44_pistol`, `weapon_assault_rifle`, `weapon_gatling_plasma` и т.д.
- `ammo_001..036` → `ammo_357_magnum`, `ammo_energy_cell`, `ammo_fusion_core` и т.д.
- `chem_001..032` → `chem_addictol`, `chem_stimpak`, `chem_psycho_jet` и т.д.
- `drink_001` → `drink_nuka_cola`

**Затронутые файлы каталогов:** `data/equipment/weapons.json`, `data/equipment/ammo.json`, `data/equipment/mods.json`, `data/consumables/chems.json`, `data/consumables/drinks.json`, все `i18n/*/weapons.json`, `i18n/*/ammo_types.json`, `i18n/*/chems.json`, `i18n/*/drinks.json`, `i18n/*/weapon_mods.json`, `i18n/*/equipmentKits.json`, `i18n/*/mods_overrides.json`, `i18n/*/robotWeapons.json`.

**Риск при миграции БД:** если в БД в полях инвентаря персонажей хранятся строки вида `weapon_001` как ссылки на предметы каталога — их нужно мигрировать на новые ID. Если идентификация идёт только через `Название`/`Name`/`code` — миграция не требуется.

**Что сделать при миграции БД:** проверить поля `weaponId`, `itemId`, `code` и аналогичные в схеме БД на наличие старых числовых ID, при необходимости выполнить UPDATE-скрипт по таблице маппинга выше.

---

## Порядок очистки при миграции БД

1. Мигрировать поля в БД: `range_name` → английские значения, убрать русские ключи объектов
2. Удалить `translateModTokenToRu` в `WeaponModificationModal.js`, добавить i18n-ключи для префиксов модов
3. Обновить `rangeOrder` и фолбэки `'Близкая'`
4. Исправить фолбэк в `appI18n.js`
5. Удалить этот файл
