# Роботы: полный срез данных и механик

Справочный документ для внешней консультации. Описывает **фактическое состояние** на коммите `42e2de8`: планы тел, конечности, оружие, броню и правила установки в слоты. Все таблицы получены разбором JSON, не по памяти.

Документ фиксирует **как есть**, включая известные противоречия (§9). Предлагаемая модель — §10.

---

## 1. Из чего состоит робот

Робот в этом сеттинге — **конструктор**: набор слотов, в которые ставятся конечности, оружие и брони трёх слоёв.

```
План тела  →  задаёт список слотов (имена)
Слот       →  содержит конечность ИЛИ оружие
Конечность →  может держать оружие, может иметь встроенную атаку, имеет свою защиту
Броня      →  3 слоя (frame / plating / armor), адресуется «локацией», не именем слота
```

### Файлы данных

| Файл | Записей | Содержит |
|---|---|---|
| `modules/fallout/data/bodyplans/bodyplans.json` | 7 планов | списки слотов, конечности по умолчанию |
| `modules/fallout/data/equipment/robot/robotarms.json` | 21 | руки **и** конечности-оружие |
| `.../robotheads.json` | 7 | головы |
| `.../robotlegs.json` | 6 | движители (ноги, гусеницы, тяга, колесо) |
| `.../robotbody.json` | 6 | корпуса |
| `.../weapons.json` | 19 | атаки: встроенные, съёмные, моды |
| `.../frames.json` | 12 | слой `frame` |
| `.../armor_plating.json` | 28 | слой `plating` |
| `.../armor.json` | 5 | слой `armor` |

Основная логика: `domain/robotEquip.js` (~760 строк).

---

## 2. Планы тел

Слоты — просто **строки**. Поля «тип слота» в данных **нет**. Имена у каждого плана свои.

| План | Слоты |
|---|---|
| `humanoid` | `head, torso, leftArm, rightArm, leftLeg, rightLeg` |
| `protectron` | `leftArm, head, rightArm, leftLeg, body, rightLeg` |
| `assaultron` | `leftArm, head, rightArm, leftLeg, body, rightLeg` |
| `sentryBot` | `leftArm, head, rightArm, leftLeg, body, rightLeg` |
| `misterHandy` | `head, body, **arm1, arm2, arm3, thruster**` |
| `robobrain` | `leftArm, head, rightArm, body, **chassis**` |
| `securitron` | `head, leftArm, body, rightArm, **wheel**` |

**Мистер Хэнди — ключевой случай:** три руки (`arm1/arm2/arm3`), ни одной парной, движитель называется `thruster`. Любая логика, завязанная на имена `leftArm`/`rightArm`, на нём ломается.

### Структура плана

```json
"misterHandy": {
  "slots": ["head","body","arm1","arm2","arm3","thruster"],
  "defaults": {
    "head": "robot_head_mister_handy_eye_stalk",
    "body": "robot_body_mister_handy",
    "arm1": "robot_arm_mister_handy",
    "arm2": "robot_arm_mister_handy",
    "arm3": "robot_arm_mister_handy",
    "thruster": "robot_legs_mister_handy_thruster"
  },
  "defaultPlating": {},
  "slotCapabilities": {
    "arm1": { "canEquipWeapon": true },
    "arm2": { "canEquipWeapon": true },
    "arm3": { "canEquipWeapon": true }
  }
}
```

`slotCapabilities.canEquipWeapon` — способность **слота**. При этом у конечности есть своё поле `canHoldWeapons` (§3). Два поля об одном и том же с разных сторон.

---

## 3. Конечности: три независимых свойства

У конечности три **ортогональных** свойства. Их путали неоднократно, поэтому явно:

| Свойство | Поле | Смысл |
|---|---|---|
| **Хватка** | `canHoldWeapons`, `weaponSlots` | можно вложить съёмное оружие из каталога |
| **Своя атака** | `builtinWeaponId` | несъёмная атака, уходит вместе с конечностью |
| **Своя защита** | `physicalDR`, `energyDR`, `radDR` | защита независимо от надетой брони |

Все сочетания законны:

| Хватка | Встроенное | Пример | Комментарий |
|:---:|:---:|---|---|
| да | нет | `robot_arm_protectron` | манипулятор без своей атаки, просто держит ствол |
| да | да | `robot_arm_mister_handy` | держит ствол **и** бьёт манипулятором |
| нет | да | `robot_weapon_flamethrower` | оружие вместо руки |
| нет | нет | — | в каталоге нет, форма допускает |

> **Манипулятор — это `canHoldWeapons: true`, и только.** Наличие `builtinWeaponId` к определению манипулятора отношения не имеет.

### Полный разбор `robotarms.json` (21 запись)

| id | Хватка | wSlots | builtinWeaponId | physDR/enDR |
|---|:---:|:---:|---|:---:|
| `robot_arm_protectron` | ✔ | 1 | — | 2 / 1 |
| `robot_arm_robobrain` | ✔ | 1 | — | 2 / 3 |
| `robot_arm_sentry_bot` | ✔ | 1 | — | 4 / 3 |
| `robot_arm_mister_handy` | ✔ | 1 | `robot_weapon_manipulator` | 2 / 2 |
| `robot_arm_assaultron` | ✔ | 1 | `robot_weapon_claw` | 3 / 3 |
| `robot_arm_assaultron_shocker` | ✔ | 1 | `robot_weapon_shocker_arms` | 3 / 4 |
| `robot_arm_smoke_manipulator` | ✔ | 1 | `robot_weapon_smoke_claws` | 2 / 3 |
| `robot_arm_securitron` | ✔ | 1 | `robot_weapon_manipulator` | 2 / 1 |
| `robot_weapon_manipulator` | ✔ | 1 | *сам на себя* | — |
| `robot_weapon_protectron_manipulator` | ✔ | 1 | *сам на себя* | — |
| `robot_weapon_flamethrower` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_circular_saw` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_laser_cutter` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_auto_10mm` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_cryojet` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_shocker_arms` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_construction_claw` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_drill` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_vice_grip` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_claw` | ✘ | 0 | *сам на себя* | — |
| `robot_weapon_tesla_arm` | ✘ | 0 | *сам на себя* | — |

**Две границы совпадают идеально:** у всех 11 записей без хватки **нет `DR`**; у всех 10 с хваткой `DR` есть (кроме двух манипуляторов, у которых `DR` не задан). То есть «нет хватки» ⇔ «оружие вместо руки» ⇔ «своей брони нет».

### Головы, движители, корпуса

`compatibleSlots` есть **только у рук** (значение вида `["leftArm","rightArm","arm1","arm2","arm3"]` — перечисление всех известных имён). У голов, ног и корпусов поля нет.

| Файл | id |
|---|---|
| `robotlegs` | `..._mister_handy_thruster`, `..._protectron`, `..._assaultron`, `..._robobrain_treads`, `..._sentry_bot`, `..._securitron` |
| `robotheads` | `..._protectron`, `..._mister_handy_eye_stalk`, `..._assaultron`, `..._assaultron_laser`, `..._robobrain`, `..._sentry_bot`, `..._securitron` |
| `robotbody` | по одному на каждый корпус |

**Все шесть движителей имеют один `itemType: robotLegs`** — включая реактивную тягу и гусеницы. Тип «движитель» в данных де-факто уже существует.

Встроенные атаки есть и у голов: `robot_head_assaultron_laser → robot_weapon_assaultron_head_laser`, `robot_head_robobrain → robot_weapon_mesmetron`. У ног и корпусов встроенных атак нет.

---

## 4. Задвоение id: 13 записей в двух каталогах

13 id присутствуют **одновременно** в `robotarms.json` и `weapons.json`:

`manipulator`, `protectron_manipulator`, `claw`, `construction_claw`, `circular_saw`, `drill`, `flamethrower`, `cryojet`, `laser_cutter`, `auto_10mm`, `shocker_arms`, `tesla_arm`, `vice_grip`

Это **не дубликаты**. Две записи с одним id и разными наборами полей, для двух разных ролей:

```
robot_weapon_manipulator в robotarms.json  — КОНЕЧНОСТЬ (что стоит в слоте)
  itemType: "robotArm"
  compatibleSlots: ["leftArm","rightArm","arm1","arm2","arm3"]
  weaponSlots: 1, canHoldWeapons: true
  builtinWeaponId: "robot_weapon_manipulator"

robot_weapon_manipulator в weapons.json    — АТАКА (что она делает)
  itemType: "weapon"
  damage: 2, damageType: "physical", range: "C"
  mainSkill: "UNARMED", qualities: [close_quarters]
```

**Назначение задвоения (замысел автора данных):** движок должен понимать, что это оружие ставится **в слот руки**, а не в человеческие оружейные слоты. Версия-рука несёт данные установки, версия-оружие — боевые характеристики.

### `builtinWeaponId` — указатель, не тождество

13 записей ссылаются на себя, **7 — на другое оружие**:

| Конечность | → | Оружие |
|---|---|---|
| `robot_arm_mister_handy` | → | `robot_weapon_manipulator` |
| `robot_arm_assaultron` | → | `robot_weapon_claw` |
| `robot_arm_assaultron_shocker` | → | `robot_weapon_shocker_arms` |
| `robot_arm_smoke_manipulator` | → | `robot_weapon_smoke_claws` |
| `robot_arm_securitron` | → | `robot_weapon_manipulator` |
| `robot_head_assaultron_laser` | → | `robot_weapon_assaultron_head_laser` |
| `robot_head_robobrain` | → | `robot_weapon_mesmetron` |

Атаку конечности всегда брать по `builtinWeaponId`, **никогда** по id самой конечности.

### Обратная ссылка

В `weapons.json` есть встречные поля: `builtinToArm` (у `robot_weapon_smoke_claws` → `robot_arm_robobrain`) и `builtinToHead` (у `robot_weapon_assaultron_head_laser`, `robot_weapon_mesmetron`). Код читает их как reverse lookup (`robotEquip.js:67-69`).

Итого связь конечность↔атака выражена **двумя способами одновременно**, в обе стороны.

### Роль определяется положением, а не записью

`robot_weapon_shocker_arms` существует в двух ролях:
- стоит в слоте сам → **конечность-оружие** (заменяет руку)
- назван через `builtinWeaponId` руки `robot_arm_assaultron_shocker` → **встроенная атака**

Запись одна и та же. **Определить роль по записи невозможно** — только по тому, как она попала в слот. Это корневая причина, почему «встроенное не отличить от конечности-оружия».

---

## 5. Оружие

`weapons.json`, 19 записей. Три категории:

| Категория | Признак | Примеры |
|---|---|---|
| Встроенные/конечности-оружие | есть двойник в `robotarms` | `claw`, `drill`, `flamethrower` |
| Оружие головы | `builtinToHead` | `assaultron_head_laser`, `mesmetron` |
| Моды | `isMod: true` | `robot_weapon_mod_shock`, `robot_weapon_mod_stun` |
| Особое | — | `robot_weapon_self_destruct` (урон 6, `selfDestruct`) |

Поля: `damage`, `damageType`, `range`, `mainAttr`, `mainSkill`, `fireRate`, `ammoId`, `ammoConsumption`, `qualities`, `effects`, `meleeBonusApplies`, `installComplexity`, `installPerksRequired`, `installSkill`.

### Три способа получить атаку

| Способ | Что в слоте | Снимается | Занимает `weaponSlots` |
|---|---|---|---|
| Встроенная атака конечности | конечность | **нет**, уходит с ней | нет |
| Оружие вместо руки | оружие | да, целиком меняет слот | — |
| Оружие в ладони | конечность + вложенное | да, переставляется на другого робота | **да** |

**Первое и третье совместимы:** `robot_arm_mister_handy` имеет и `builtinWeaponId: manipulator`, и `weaponSlots: 1` → рука даёт **две** атаки одновременно. Таких рук 6 из 21. У Хэнди с тремя такими руками — до 6 атак.

---

## 6. Броня: три слоя и «локации»

Три слоя, взаимоисключающих (`incompatibleLayers`):

| Слой | Файл | Записей | Локации |
|---|---|---|---|
| `frame` | `frames.json` | 12 | Optics 3, Main Body 3, Arms 3, Thruster 3 |
| `plating` | `armor_plating.json` | 28 | Optics 7, Main Body 7, Arms 7, Thruster 7 |
| `armor` | `armor.json` | 5 | Optics 1, Main Body 2, Arms 1, Thruster 1 |

```json
{
  "id": "robot_plating_standard_optics",
  "templateId": "robot_plating_standard",
  "layer": "plating",
  "incompatibleLayers": ["armor", "frame"],
  "robotLocation": "Optics",
  "damageResistance": { "physical": 2, "energy": 0 },
  "carryWeightModifier": 0,
  "cost": 0
}
```

### Локация ≠ слот

Броня адресуется полем `robotLocation` — **четыре** значения: `Optics`, `Main Body`, `Arms`, `Thruster`. Слотов в планах 5–6, имена другие. Сопоставление сделано **вручную в коде** (`robotEquip.js:374-388`):

```js
if (location === 'Main Body' && slotKey === 'body') return true;
if (location === 'Optics'    && slotKey === 'head') return true;
if (location === 'Arms'      && slotKey.toLowerCase().includes('arm')) return true;
if (location === 'Thruster'  && (slotKey.toLowerCase().includes('leg')
    || slotKey === 'chassis' || slotKey === 'thruster' || slotKey === 'wheel')) return true;
// + точные совпадения 'Left Arm'→leftArm, 'Right Arm'→rightArm, ...
```

Это **и есть тип слота**, выраженный цепочкой сравнений строк: `Arms` покрывает `arm1/arm2/arm3/leftArm/rightArm` через `includes('arm')`, `Thruster` покрывает `thruster/chassis/wheel/leftLeg/rightLeg` перечислением.

Комментарий в коде говорит прямо: *«Thruster — обобщённая локация „средство передвижения“… Это не фолбэк, а маппинг типов шасси»*.

Правило «1 предмет = 1 слот» соблюдается: ищется первый подходящий слот со свободным слоем.

### Броня и оружие вместо руки

По текущей логике `Arms` матчится на **любой** слот, чьё имя содержит `arm`. Если в слоте стоит `robot_weapon_flamethrower` (оружие вместо руки), слот всё равно совпадёт и броня встанет. При этом у самой конечности-оружия `DR` нет.

**Так быть не должно:** оружие вместо руки не должно принимать раму, обшивку и броню — только свои характеристики. Признак для проверки в данных есть — `canHoldWeapons: false`, — но в проверке слоя брони он не участвует.

---

## 7. Прочие механики

**ОС / MkII.** `mk2Installed` — плоский булев флаг на роботе целиком (`src/store/robotSlice.js:37`), ни с каким слотом не связан. Часть оружия требует `requiresMkII` (`robotEquip.js:276`). Смысловое требование: слот, несущий ЦПУ/ОС, нельзя заменить на другой тип — сейчас невыразимо.

**Разрешение id по каталогам.** `domain/resolveItem.js:75-91` — по `itemType`: `robotArm → catalog.robotArms`, `robotHead → catalog.robotHeads` и т.д. Есть также `case 'robotPart'` — перебор каталогов подряд (`robotArms || robotBody || robotLegs || robotHeads || robotPlating || robotFrames`). Для 13 задвоенных id вернёт версию-руку независимо от намерения.

**Требования установки.** `complexity`, `perksRequired`, `skill` (`REPAIR`) у конечностей; `installComplexity`, `installPerksRequired`, `installSkill` у оружия.

---

## 8. Как это работает в коде

| Функция | Файл | Делает |
|---|---|---|
| `getRobotSlotKeys(bodyPlan)` | `robotEquip.js:31` | читает `plan.slots` — **из данных**, не хардкод |
| `buildArmLimb(armEntry, …)` | `robotEquip.js:93-115` | нормализует запись руки, резолвит `builtinWeaponId` |
| сбор атак слота | `robotEquip.js:585-600` | цепочка `builtinWeapons → builtinWeaponId → builtinManipulator` |
| `findFreeWeaponHand` | `robotEquip.js:86-87` | ищет свободную руку |
| матчинг брони | `robotEquip.js:365-395` | локация → слот |
| снятие парной конечности | `robotEquip.js:719-720` | требует `slots.leftArm && slots.rightArm` |
| `canEquipWeaponToSlot` | `robotEquip.js:~743` | вес, двуручность |
| `createEmptyEquippedArmor()` | `domain/equippedArmor.js` | **жёсткий литерал 6 человеческих слотов**, `bodyPlan` не принимает |
| раскладка `protectedAreas → слоты` | `src/store/selectors.js:30-50` | `Hand → [leftArm, rightArm]`, `Leg → [leftLeg, rightLeg]` |
| та же раскладка, копия | `InventoryScreen.js:618-634` | `getSlotsForArea`, `getSingleLimbCandidateSlots` |

---

## 9. Известные противоречия

**9.1 Две несвязанные модели слотов.** Слоты конечностей — из данных (`plan.slots`). Слоты брони — из литерала в коде (`createEmptyEquippedArmor()`, 6 человеческих позиций); `bodyPlan` в функцию не передаётся, в `selectors.js` слово `bodyPlan` не встречается. Следствие: у Хэнди броня на руки не ложится (нет `leftArm`/`rightArm`), `chassis` и `wheel` брони не получают.

**9.2 Третья модель слотов** — `robotLocation` с четырьмя значениями, сопоставляемая с именами слотов цепочкой `if` (§6).

**9.3 25 хардкодов `leftArm`/`rightArm`** вне тестов:

| Файл | Строки |
|---|---|
| `domain/robotEquip.js` | 86, 87, 232, 234, 384, 385, 719, 720 |
| `domain/powerArmor.js` | 31, 37 |
| `src/store/selectors.js` | 38 |
| `InventoryScreen.js` | 623, 631, 1043, 1044 |
| `LimbUpgradeModal.js` | 26, 27, 41 |

Часть залатана фолбэками `leftArm || arm1`, `rightArm || arm2`. **`arm3` не покрыт нигде** — третья рука Хэнди невидима для выбора оружия.

**9.4 Молчаливый баг.** `robotEquip.js:719` снимает парную конечность при `slots.leftArm && slots.rightArm`. У Хэнди условие никогда не истинно — ошибки нет, действие просто не происходит.

**9.5 Сбор атак обрывается.** `robotEquip.js:585-600` — ветки с `continue`. Рука со встроенным манипулятором **и** стволом в ладони отдаёт только манипулятор; вложенное оружие в список атак не попадает.

**9.6 Броня на обе руки сразу.** `Hand → ['leftArm','rightArm']` — правило скопировано в `selectors.js:38` и `InventoryScreen.js:623`. Броня применяется к обеим рукам и только к двум заранее известным.

**9.7 Оружие вместо руки принимает броню** (§6), хотя не должно.

**9.8 Дублирование способности.** `slotCapabilities.canEquipWeapon` в плане тела и `canHoldWeapons` у конечности описывают одно и то же с разных сторон.

**9.9 Четвёртый флаг манипулятора.** В `robotEquip.js:597` есть ветка `limb.builtinManipulator` / `isManipulator` — помимо `canHoldWeapons`, `weaponSlots`, `builtinWeaponId`.

**9.10 `compatibleSlots` перечисляет имена.** `["leftArm","rightArm","arm1","arm2","arm3"]` — новый корпус со слотом `arm7` потребует правки всех 21 записи рук. У голов/ног/корпусов поля нет вовсе.

---

## 10. Предлагаемая модель

Не реализована. Формулировка владельца проекта.

**10.1 Слот определяется типом, а не именем.** Типы: `arm`, `mover`, `head`, `body`. `mover` — любой движитель (нога, колесо, гусеница, тяга); в данных это уже отражено единым `itemType: robotLegs`. Имена (`arm1`, `wheel`, `chassis`) остаются ярлыками для UI и ключами сейва, логика их не читает.

**10.2 Количество слотов произвольно.** Одна голова и пять рук — законная конфигурация. Симметрия не предполагается.

**10.3 Способности принадлежат конечности**, а не слоту: хватка / своя атака / своя защита, независимо (§3).

**10.4 Роль содержимого определяется положением в слоте, а не записью** (§4). При установке слот получает признак: занят конечностью или занят оружием.

**10.5 Броня зависит от того, чем занят слот:**

| Слот занят | Броня/обшивка/рама |
|---|---|
| конечностью (`canHoldWeapons: true`) | принимает |
| оружием вместо руки (`canHoldWeapons: false`) | **не принимает**, только свои характеристики |

Встроенная атака на броню не влияет — слот занят рукой.

**10.6 Встроенное оружие и оружие в ладони не конкурируют.** Встроенное не занимает `weaponSlots`. Сбор атак со слота возвращает **список**, а не первое совпадение.

**10.7 Слот может отсутствовать.** Состояния `absent → empty → filled`. `absent` — слот ещё не скрафчен / не поставлен драйвер, в UI его нет. Сейчас невыразимо: слоты создаются сразу все из `defaults`.

**10.8 Слот с ОС нельзя заменить на другой тип.** Это свойство роли, не типа: в другом корпусе ЦПУ может стоять в торсе, и правило должно переехать вместе с ним.

### Граница движка

Робот — набор слотов; у каждого тип, роль, состояние и вместимость. Движок умеет: поместить (тип принят, есть место), убрать, спросить содержимое. Типы для движка — непрозрачные строки из сеттинга.

Движок **не знает**, что рука держит оружие или что ОС в голове — это правила сеттинга.

Проверка на общность — другая механика:

```
Fallout, рука Хэнди:  { id: "arm1",  accepts: ["arm"],               capacity: 1 }
Fallout, движитель:   { id: "wheel", accepts: ["mover"],             capacity: 1 }
BattleTech, торс:     { id: "ct",    accepts: ["weapon","heatSink"], capacity: 12 }
```

Fallout-конечность — частный случай вместимости 1. В BattleTech слот несёт несколько деталей, ограничение — вместимость, а план тела задаёт общий лимит.

### Критерий проверки

**Мистер Хэнди** — ломает всё, завязанное на имена. Ожидается: три руки доступны для оружия, `arm3` не теряется, `thruster` работает, броня ложится на руки **по одной**, рука с манипулятором и стволом даёт **две** атаки. Плюс 169 существующих тестов не краснеют.
