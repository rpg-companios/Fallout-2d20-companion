# План: «Сложность нанесения урона» (Отдача / Двуручное)

Статус: **спроектировано, НЕ реализовано** (ждём применения текущего патча).
Это новая механика — её нет в текущем патче (там только фикс крашей + дальность + роботы).

## Подтверждённые правила (от пользователя)

### Отдача (quality_recoil_x)
- Требование силы хранится в качестве: `{ qualityId: 'quality_recoil_x', value: <требуемая Сила> }`.
- Сложность = `max(0, требуемаяСила − текущаяСила)`.
  - Пример: нужно 9, есть 8 → +1. Нужно 9, есть 7 → +2. Есть ≥9 → 0 (не показывать).
- Метка: «Сложность нанесения урона {N} из-за {Отдача}».

### Двуручное (quality_two-handed)
- Срабатывает, когда экипировано двуручное оружие, а у носителя НЕТ второй рабочей руки:
  - Робот: одна рука / вторая отсутствует / рука не может держать оружие (`canHoldWeapons`/`weaponSlots`).
  - Люди: задел на будущее (состояние конечности «повреждено» — будет позже). Сейчас правило
    готово, но для людей фактически не триггерится, пока нет «повреждённых» конечностей.
- Сложность: **+1** (фиксированная).
- Метка: «Сложность нанесения урона {1} из-за {Двуручное}».

### Несколько источников
- Показывать **каждую причину отдельной строкой** (не суммировать в одну).
- Все строки — в области эффектов экрана «Броня и оружие».

### Задел на будущее (важно для архитектуры)
- «Сложность» в перспективе может стать «Диапазоном осложнений»:
  `1→(19-20), 2→(18-20), 3→(17-20), 4→(16-20), 5→(15-20)`.
- Поэтому расчёт ВОЗВРАЩАЕТ числовое значение сложности (`difficulty: number`) + код причины,
  а отображение строит строку. Переключение на «диапазон» = только смена форматтера, без
  изменения логики расчёта.

## Дизайн (чистая функция, без React)

Новый модуль `domain/weaponDifficulty.js`:

```js
// Возвращает массив осложнений, по одному на причину.
// [{ source: 'recoil'|'twoHanded', difficulty: number, requiredStr?, currentStr? }]
export const calculateWeaponDifficulties = (weapon, context) => {
  // context = { strength, isRobot, hasSecondUsableHand }
  const out = [];

  // --- Отдача ---
  const recoil = findQuality(weapon, 'quality_recoil_x'); // {value: requiredStr}
  if (recoil && recoil.value != null) {
    const diff = Math.max(0, Number(recoil.value) - Number(context.strength ?? 0));
    if (diff > 0) out.push({ source: 'recoil', difficulty: diff, requiredStr: recoil.value, currentStr: context.strength });
  }

  // --- Двуручное ---
  const twoHanded = hasQuality(weapon, 'quality_two-handed');
  if (twoHanded && context.hasSecondUsableHand === false) {
    out.push({ source: 'twoHanded', difficulty: 1 });
  }

  return out;
};

// Форматтер сейчас (число), позже легко заменить на «диапазон осложнений».
export const formatDifficulty = (n) => String(n);
// будущий вариант:
// const RANGES = {1:'19-20',2:'18-20',3:'17-20',4:'16-20',5:'15-20'};
// export const formatComplicationRange = (n) => RANGES[Math.min(5,n)] ?? '';
```

Тесты: `domain/weaponDifficulty.test.js`
- recoil 9 vs str 8 → +1; vs str 7 → +2; vs str 9 → нет строки
- two-handed + одна рука → +1; two-handed + две руки → нет
- обе причины вместе → две отдельные записи

## Точки интеграции (UI)

В `components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js` (`WeaponCard`):
- Уже доступны: `attributes`, `hasTrait`, `getAttributeValue`, `displayWeapon`.
- Сила: `getAttributeValue(attributes, 'STR')`.
- `hasSecondUsableHand`: для робота — посчитать по `robot.slots` (число рук с
  `canHoldWeapons`/`weaponSlots>0` и наличием limb); для человека — пока `true`
  (до внедрения «повреждённых» конечностей).
- Вызвать `calculateWeaponDifficulties(...)`, и каждую запись добавить в массив `stats`
  как строку рядом с `effectsValue` (или отдельным блоком «Осложнения»):
  ```
  «Сложность нанесения урона {formatDifficulty(d.difficulty)} из-за {labelFor(d.source)}»
  ```

## i18n (нужно добавить ключи)
В `i18n/*/screens/weaponsAndArmor/screen.json`:
```json
"difficulty": {
  "template": "Сложность нанесения урона {value} из-за {reason}",
  "reasons": { "recoil": "Отдача", "twoHanded": "Двуручное" }
}
```
(+ английский вариант)

## Замечания по данным
- Сейчас `quality_recoil_x` есть в i18n («Отдача X»), но НЕ проставлено ни на одном оружии
  в `data/equipment/weapons.json` и отсутствует в `data/equipment/weapon_qualities.json`.
  Перед включением механики нужно: (1) добавить запись в `weapon_qualities.json`,
  (2) проставить `{ qualityId:'quality_recoil_x', value:N }` нужному оружию.
- Гатлинг/пожиратель → «патроны за выстрел»: отдельная задача (не входит сюда),
  тоже потребует расчётной функции + поле в данных.
