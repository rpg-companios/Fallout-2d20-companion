# Design Document: robot-limb-rendering

## Overview

Фича унифицирует визуальный рендер конечностей роботов с рендером конечностей людей на экране `WeaponsAndArmorScreen`. Текущий компонент `RobotSlot` визуально отличается от `ArmorPart` — он использует собственные стили, badge-элементы для слоёв брони и блок кнопок внизу. Цель — переработать `RobotSlot` так, чтобы он использовал ту же структуру карточки, что и `ArmorPart`: заголовок, подзаголовок, строки характеристик (`statsRow`), кнопки модификации в строках.

Изменения затрагивают только слой представления (`RobotSlot.js` и рендер в `WeaponsAndArmorScreen.js`). Логика данных, модальные окна и структура `equippedRobotSlots` остаются без изменений.

## Architecture

```
WeaponsAndArmorScreen
├── (human) ArmorPart × 6          — без изменений
└── (robot) RobotSlot × N          — переработан визуально
    ├── Заголовок (slotTitle + limbName)   — как в ArmorPart
    ├── Строки характеристик (stats)       — как в ArmorPart
    │   ├── Plating DR
    │   ├── Armor DR
    │   ├── Frame DR
    │   ├── Оружие (если есть)
    │   ├── Кнопка апгрейда конечности
    │   ├── Кнопка апгрейда plating
    │   ├── Кнопка апгрейда armor
    │   └── Кнопка апгрейда frame
    └── (модалки без изменений)
        ├── LimbUpgradeModal
        └── ArmorLayerModal
```

Раскладка слотов в `WeaponsAndArmorScreen` для роботов переходит с вертикального списка на ту же сетку `statsRow`, что используется для людей:

```
Row 1: [leftArm | head | rightArm]
Row 2: [leftLeg | body | rightLeg]
```

Для нестандартных `bodyPlan` (например, `misterHandy` с 6 слотами другой конфигурации) используется та же сетка, но с адаптированными ключами слотов из `getRobotSlotKeys(bodyPlan)`.

## Components and Interfaces

### RobotSlot (переработан)

Компонент принимает те же пропсы, что и раньше — изменяется только JSX и стили.

```js
RobotSlot({
  slotKey,       // string — ключ слота
  slotData,      // { limb, plating, armor, frame, heldWeapon }
  bodyPlan,      // string
  onUpgradeLimb, // (slotKey) => void
  onUpgradeArmor,// (layer) => void
  onWeaponPress, // (weapon) => void | undefined
})
```

Новая структура JSX повторяет `ArmorPart`:

```jsx
<View style={localStyles.armorPartContainer}>
  {/* Заголовок — как в ArmorPart */}
  <View style={[styles.sectionHeader, { flexDirection: 'column', alignItems: 'center' }]}>
    <Text style={styles.sectionTitle}>{slotTitle}</Text>
    {limbName && <Text style={localStyles.armorItemNameTitle}>{limbName}</Text>}
  </View>
  {/* Строки характеристик — как в ArmorPart */}
  <View style={localStyles.armorStatsContainer}>
    {stats.map((stat, index) => (
      <View key={index} style={localStyles.armorStatRow}>
        <Text style={localStyles.armorStatLabel}>{stat.label}</Text>
        {stat.type === 'button'
          ? <TouchableOpacity onPress={stat.onPress}><Text>⋯</Text></TouchableOpacity>
          : <Text style={localStyles.armorStatValue}>{stat.value}</Text>
        }
      </View>
    ))}
  </View>
</View>
```

Массив `stats` формируется из данных слота:

| Строка | Условие | Тип |
|--------|---------|-----|
| Plating DR | всегда | value |
| Armor DR | всегда | value |
| Frame DR | всегда | value |
| Оружие (название + урон) | если есть оружие | value / button |
| Апгрейд конечности | всегда | button |
| Апгрейд plating | всегда | button |
| Апгрейд armor | всегда | button |
| Апгрейд frame | всегда | button |

### WeaponsAndArmorScreen (изменение раскладки)

Блок рендера роботов меняется с вертикального списка на сетку:

```jsx
// Было:
{getRobotSlotKeys(bodyPlan).map((slotKey) => (
  <RobotSlot key={slotKey} ... />
))}

// Станет:
<View style={localStyles.statsRow}>
  <RobotSlot slotKey="leftArm" ... />
  <RobotSlot slotKey="head" ... />
  <RobotSlot slotKey="rightArm" ... />
</View>
<View style={[localStyles.statsRow, { marginTop: 8 }]}>
  <RobotSlot slotKey="leftLeg" ... />
  <RobotSlot slotKey="body" ... />
  <RobotSlot slotKey="rightLeg" ... />
</View>
```

Для нестандартных `bodyPlan` слоты разбиваются на строки по 3 с помощью вспомогательной функции `chunkSlotKeys(keys, 3)`.

### Вспомогательная функция getDrValue

```js
// Извлекает значение DR из объекта слоя брони
const getDrValue = (layerItem) => {
  if (!layerItem) return null;
  return layerItem.physicalDamageRating ?? layerItem.dr ?? null;
};
```

## Data Models

Структура данных не меняется. `RobotSlot` продолжает читать данные из `equippedRobotSlots[slotKey]`:

```js
// equippedRobotSlots[slotKey]:
{
  limb: {
    id: string,
    name: string,
    builtinWeaponId?: string,
    _builtinWeapon?: object,
    // ...
  } | null,
  plating: { id, name, physicalDamageRating?, dr?, ... } | null,
  armor:   { id, name, physicalDamageRating?, dr?, ... } | null,
  frame:   { id, name, physicalDamageRating?, dr?, ... } | null,
  heldWeapon: object | null,
}
```

Значение DR для отображения: `item?.physicalDamageRating ?? item?.dr ?? null`. Если `null` — отображается `'—'`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Заголовок слота всегда отображается

*For any* допустимого `slotKey`, рендер `RobotSlot` должен содержать локализованное название слота в заголовке карточки.

**Validates: Requirements 1.3**

### Property 2: Название конечности отображается под заголовком

*For any* объекта `limb` с полем `name`, рендер `RobotSlot` должен содержать это имя в области подзаголовка карточки.

**Validates: Requirements 1.4**

### Property 3: Все три значения DR присутствуют в рендере

*For any* набора данных слота (`plating`, `armor`, `frame` — каждый может быть null или объектом с DR), рендер `RobotSlot` должен содержать ровно три строки характеристик защиты, каждая из которых отображает либо числовое значение DR, либо `'—'`.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 4: Кнопки апгрейда всегда присутствуют

*For any* допустимого `slotKey`, рендер `RobotSlot` должен содержать кнопку апгрейда конечности и три кнопки апгрейда слоёв брони (`plating`, `armor`, `frame`).

**Validates: Requirements 3.1, 3.2**

### Property 5: Callback апгрейда конечности вызывается с правильным slotKey

*For any* допустимого `slotKey`, нажатие на кнопку апгрейда конечности должно вызывать `onUpgradeLimb` с аргументом, равным этому `slotKey`.

**Validates: Requirements 3.3**

### Property 6: Callback апгрейда слоя вызывается с правильным layer

*For any* допустимого `slotKey` и любого из трёх слоёв (`plating`, `armor`, `frame`), нажатие на соответствующую кнопку должно вызывать `onUpgradeArmor` с аргументом, равным этому слою.

**Validates: Requirements 3.4**

### Property 7: Строка оружия отображается тогда и только тогда, когда оружие есть

*For any* данных слота, строка оружия должна присутствовать в рендере тогда и только тогда, когда `slotData` содержит `heldWeapon` или `limb.builtinWeaponId`.

**Validates: Requirements 4.1, 4.3**

### Property 8: Количество рендеримых слотов соответствует bodyPlan

*For any* допустимого `bodyPlan`, количество рендеримых `RobotSlot` в `WeaponsAndArmorScreen` должно быть равно `getRobotSlotKeys(bodyPlan).length`.

**Validates: Requirements 5.2**

### Property 9: Null-безопасность при отсутствии equippedRobotSlots

*For any* `slotKey`, рендер `RobotSlot` с `slotData={null}` или `slotData={undefined}` должен завершаться без ошибок и отображать пустые значения (`'—'`) для всех строк характеристик.

**Validates: Requirements 6.3**

## Error Handling

- `slotData` может быть `null` или `undefined` — все поля читаются через optional chaining (`slotData?.limb`, `slotData?.plating` и т.д.)
- `limb` может быть `null` — в этом случае отображается локализованная строка «нет конечности» (`tWeaponsAndArmorScreen('robotSlot.noLimb')`)
- DR-значение может отсутствовать в объекте слоя — используется `item?.physicalDamageRating ?? item?.dr ?? null`, при `null` отображается `'—'`
- `onUpgradeLimb` и `onUpgradeArmor` могут быть `undefined` — кнопки рендерятся, но `onPress` защищён через `onUpgradeLimb && onUpgradeLimb(slotKey)`
- `getRobotSlotKeys(bodyPlan)` при неизвестном `bodyPlan` возвращает стандартный набор ключей — это существующее поведение, не меняется

## Testing Strategy

### Unit-тесты (example-based)

- Snapshot-тест `RobotSlot` с полными данными — проверяет визуальное соответствие `ArmorPart`
- Snapshot-тест `RobotSlot` с пустыми данными (`slotData=null`)
- Тест раскладки: для `bodyPlan=protectron` рендерится 6 слотов в двух строках по 3

### Property-тесты (property-based)

Используется библиотека **fast-check** (JavaScript/React Native).

Каждый тест запускается минимум **100 итераций**.

Теги формата: `Feature: robot-limb-rendering, Property N: <текст>`

- **Property 1** — генерируются случайные `slotKey` из допустимого набора; проверяется наличие заголовка в рендере
- **Property 2** — генерируются случайные объекты `limb` с произвольным `name`; проверяется наличие имени в рендере
- **Property 3** — генерируются случайные комбинации `plating/armor/frame` (null или объект с DR); проверяется наличие трёх строк DR
- **Property 4** — генерируются случайные `slotKey`; проверяется наличие 4 кнопок (1 + 3)
- **Property 5** — генерируются случайные `slotKey`; проверяется аргумент callback
- **Property 6** — генерируются случайные `slotKey`; проверяется аргумент callback для каждого layer
- **Property 7** — генерируются случайные данные слота с оружием и без; проверяется наличие/отсутствие строки оружия
- **Property 8** — генерируются случайные `bodyPlan`; проверяется количество слотов
- **Property 9** — `slotData=null/undefined`; проверяется отсутствие ошибок рендера
