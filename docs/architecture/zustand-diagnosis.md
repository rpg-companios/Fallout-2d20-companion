# Диагностика внедрения Zustand — что сломано и как чинить

Дата: 2026-06-15. Анализ ветки `main`.
Стек: Expo / React Native + react-native-web, Zustand 5, immer 11.

Состояние: **юнит-тесты стора зелёные (37/37)** — логика самого стора корректна.
Все проблемы находятся **на стыках** стора с `CharacterContext` и экранами.

---

## TL;DR — 5 реальных багов, по приоритету

| # | Баг | Серьёзность | Файл |
|---|-----|-------------|------|
| 1 | `persist` без `storage` → на RN нет `localStorage`, персист молча не работает | 🔴 критично | `characterStore.js` (persist config) |
| 2 | Два источника правды для экипировки: Context `equippedWeapons` (useState) **и** store `items[].equipped` | 🔴 критично | `CharacterContext.js`, `InventoryScreen.js` |
| 3 | Два источника правды для производных: Context сам считает `carryWeight/meleeBonus/defense`, а `derivedStats` в сторе **никто не читает** | 🔴 критично | `CharacterContext.js`, `resolvers.js` |
| 4 | `getCharacterContext()` — заглушка (`trait:null, level:1`), поэтому `recalculateDerivedStats` в сторе считает с НЕВЕРНЫМИ входами; `setCharacterContext` нигде не вызывается | 🟠 высокая | `characterStore.js` |
| 5 | Два источника правды для атрибутов: Context `attributes` (useState массив) и store `attributes` (dict) | 🟠 высокая | `CharacterContext.js` |

---

## Подробно

### Баг 1 — persist без storage (на RN не работает вообще)

```js
persist(
  (set, get) => ({ ... }),
  {
    name: 'character-store',
    partialize: (state) => ({ ... }),
    onRehydrateStorage: () => (state) => { if (state) state.recalculateAll(); },
    // ❌ НЕТ storage: createJSONStorage(() => AsyncStorage)
  }
)
```

Документ и комментарии говорят «localStorage persistence», но проект — **React Native**.
В RN глобального `localStorage` нет. Zustand `persist` по умолчанию пытается взять
`globalThis.localStorage`; на устройстве/в Expo Go его нет → персист тихо отваливается
(на web он сработает только потому, что react-native-web даёт `window.localStorage`).

В зависимостях уже есть `@react-native-async-storage/async-storage`.

**Фикс:** добавить storage-адаптер (см. patch ниже). Работает и на web, и на native.

---

### Баг 2 — экипировка живёт в двух местах

`InventoryScreen.js`:
```js
const storeEquippedWeapons = useMemo(() => selectItemsByEquipped({ items: storeItems }, true), [storeItems]); // из стора
const { equippedWeapons, setEquippedWeapons } = useCharacter();                                              // из Context
// ...
const equippedWeaponsForDisplay = useMemo(() => {
  const fromStore = storeEquippedWeapons.map(flattenItemParams);
  const robotExtras = (equippedWeapons || []).filter(...);   // склейка ДВУХ источников
  return [...fromStore, ...robotExtras];
}, [storeEquippedWeapons, equippedWeapons]);
```

Дальше код вызывает то `setEquippedWeapons(...)` (Context), то `equipItem/unequipItem` (store).
Кто отрендерился/перезаписал последним — тот и «выиграл» → значения скачут.
Это ровно тот симптом «рассинхрон Context ↔ Zustand», который ты выбрал.

**Решение (стратегия A — один источник правды):**
сделать **store единственным владельцем экипировки оружия**. `equippedWeapons` в Context
оставить ТОЛЬКО для робо-слотов/встроенного оружия (которое пока не нормализовано),
а обычное оружие везде брать из `selectItemsByEquipped(state, true)`.
Все `setEquippedWeapons(prev => …)` для обычного оружия заменить на `equipItem/unequipItem`.

---

### Баг 3 + 4 — производные значения считаются дважды и с неверными входами

В сторе ЕСТЬ движок `calculateDerivedStats(attributes, effects, trait, level, equipmentState)`,
который считает `carryWeight, meleeBonus, defense, initiative, maxHealth, damageResistance`.
**Но его результат `state.derivedStats` не читает ни один экран** (проверено grep).

Параллельно `CharacterContext` держит свои `carryWeight/meleeBonus/defense/initiative`
как `useState` и пересчитывает их в `useEffect`/`commitAttributeChanges` своим набором функций.

Хуже того, store зовёт derived через заглушку:
```js
const getCharacterContext = () => ({ trait: null, level: 1, equipmentState: {} }); // ❌ всегда дефолт
recalculateDerivedStats: (options = {}) => {
  const context = { ...getCharacterContext(), ...options }; // options почти всегда {}
  ...
}
```
А `setCharacterContext` (который должен прокинуть реальные trait/level/equipment) **нигде не вызывается**.
Итог: `derivedStats` в сторе технически считается, но с trait=null и level=1 → значения неверные,
поэтому никто их и не использует.

**Решение (рекомендация по «где жить производным»):**
Производные = **чистая функция от base-атрибутов + эффектов + trait/level/экипировки**.
Их НЕ нужно хранить и дублировать. Делаем так:

1. Источник истины для производных — **селектор стора** (или мемоизированный
   `calculateDerivedStats`), а не `useState` в Context.
2. trait / level / equipmentState прокидываем в стор через `setCharacterContext`
   из одного `useEffect` в `CharacterProvider` (эти поля пока легально живут в Context).
3. Экраны читают `carryWeight/meleeBonus/defense` из стора (через хук-селектор),
   а не из Context-стейта.

Почему селектор, а не «хранить total в сторе»: производные зависят от множества входов
(сила, ловкость, перки, эффекты, броня). Хранить готовые числа = риск устаревания и
ровно тот рассинхрон, что сейчас. Чистый селектор всегда консистентен и тривиально тестируется.

---

### Баг 5 — атрибуты в двух форматах

Context: `attributes` = массив `[{name, value}]` (useState).
Store: `attributes` = dict `{ STR: {base, modifiers, total} }`.

`commitAttributeChanges` уже частично мостит (зовёт `updateAttribute`), но при этом
ВСЁ ЕЩЁ держит свой массив и дублирует пересчёт производных. Пока оба живут — рассинхрон.

**Решение:** атрибуты — во владении стора. Context отдаёт их через селектор
(`useCharacterAttributes()` уже есть!). `setAttributes(useState)` депрекейтить.

---

## Рекомендованный порядок работ

1. **Баг 1** (persist storage) — 1 правка, мгновенный эффект, ничего не ломает. ✅ начать с него.
2. **Баг 4** (прокинуть setCharacterContext) — оживляет уже написанный движок derived.
3. **Баг 3** (экраны читают derived из стора) — убрать дубль-вычисления в Context.
4. **Баг 2** (экипировка → один источник) — самый объёмный, делать последним.
5. **Баг 5** (атрибуты → один источник) — финал миграции.

Каждый шаг отдельным коммитом + прогон `npx vitest run`.
