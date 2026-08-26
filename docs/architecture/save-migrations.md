# Save Migrations — механизм конвертации сохранений персонажа

**Статус:** действует  
**Контекст:** программа обновляется, формат сохранения персонажа меняется.
Чтобы не «плодить fallback» в `loadCharacter`, все изменения формата оформляются
как версионированные миграции.

---

## 1. Зачем это нужно

При загрузке персонажа в `loadCharacter` накапливаются ручные fallback:
`|| []`, `?? 0`, `migrateSkillsToCanonical`, `getBuiltinBaseWeapon`, фильтрация
`null`-оружий и т.д. Каждый новый параметр = ещё одна строка fallback прямо в
коде. Это:
- размазывает логику конвертации по UI-слою;
- не даёт гарантии, что старый персонаж корректно «доживёт» до новой схемы;
- плодит «костыли» вместо аккуратного перехода формата.

Механизм миграций переносит всю конвертацию в одно место — реестр чисто
функциональных преобразований по версиям.

---

## 2. Единый источник версии

Все места, которые пишут/читают `schemaVersion`, используют единую константу:

```js
// src/store/saveSchema.js
export const CURRENT_SCHEMA_VERSION = 0;  // ← поднять при изменении формата
export const LEGACY_SCHEMA_VERSION = 0;
```

Импортируется из:
- `src/store/characterStore.js` — persist middleware (`version:` и `partialize`);
- `src/store/migrations.js` — `normalizeForStore`, `migrateCharacterState`;
- `components/CharacterContext.js` — `serializeState`, `deserializeState`.

> Никогда не хардкодь `schemaVersion: 1` вручную — бери из `saveSchema.js`.

---

## 3. Два хранилища — одна функция миграции

Персонаж живёт **в двух местах**, оба нуждаются в миграции при обновлении:

| Хранилище | Когда читается | Где мигрируется |
|-----------|---------------|-----------------|
| SQLite (`characters.data`) | при открытии персонажа | `CharacterContext.deserializeState` → `migrateCharacterState` |
| AsyncStorage (`character-store`) | при запуске приложения (Zustand rehydrate) | `persist.migrate` в `characterStore.js` → `migrateCharacterState` |

Обе точки используют **одну и ту же функцию** `migrateCharacterState` из `migrations.js`.
Добавляешь миграцию один раз — она покрывает оба пути автоматически.

### Как работает Zustand-путь

Zustand `persist` хранит в AsyncStorage версию (`version: N`) рядом с данными.
При запуске приложения:
1. Загружает сохранённое состояние.
2. Сравнивает сохранённую версию с `CURRENT_SCHEMA_VERSION`.
3. Если версии различаются — вызывает `migrate(persistedState, storedVersion)`.
4. `migrate` передаёт данные в `migrateCharacterState` и возвращает результат.
5. Только после миграции вызывается `onRehydrateStorage` (пересчёт totals).

---

## 4. Механизм (код)

```js
// src/store/migrations.js

const MIGRATIONS = [
  // MIGRATIONS[0] — переход v0 -> v1
  // MIGRATIONS[1] — переход v1 -> v2
  // ...
];

export function migrateCharacterState(data) {
  if (!data || typeof data !== 'object') return data;
  let state = { ...data };
  const fromVersion = Number.isInteger(state.schemaVersion)
    ? state.schemaVersion
    : LEGACY_SCHEMA_VERSION;
  if (fromVersion >= CURRENT_SCHEMA_VERSION) return state; // уже актуально
  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (typeof migrate !== 'function') break; // нет функции — не ломаем
    state = migrate(state) || state;
    version += 1;
    state.schemaVersion = version;
  }
  return state;
}
```

---

## 5. Чек-лист: как добавить новую миграцию

> Делай строго по порядку — иначе данные не смигрируются.

1. **Подними `CURRENT_SCHEMA_VERSION`** в `saveSchema.js` на единицу.
2. **Добавь функцию в конец `MIGRATIONS[]`** в `migrations.js`:
   ```js
   // MIGRATIONS[N] — переход vN -> v(N+1)
   (state) => {
     // Только чистая трансформация: state → state'
     // Без сайд-эффектов, идемпотентная, заполняет все новые поля
     return { ...state, newField: state.newField ?? defaultValue };
   },
   ```
3. **Не удаляй старые миграции** — только добавляй новые в конец.
4. **Убери fallback из `loadCharacter`** — перенеси логику в миграцию.

Правила для функции миграции:
- **Чистая** — нет обращений к API, хранилищам, Date.now() (только к `state`).
- **Идемпотентная** — повторный прогон одного и того же сохранения не ломает данные.
- **Полная** — заполняет все отсутствующие поля, не оставляет их на `??` в UI.

---

## 6. Пример

Изменение: добавить поле `inventoryCapacity` (по умолчанию 150).

```js
// 1. saveSchema.js
export const CURRENT_SCHEMA_VERSION = 1; // было 0

// 2. migrations.js
const MIGRATIONS = [
  // v0 -> v1: добавить inventoryCapacity
  (state) => ({
    ...state,
    inventoryCapacity: state.inventoryCapacity ?? 150,
  }),
];
```

В `loadCharacter`:
```js
setInventoryCapacity(data.inventoryCapacity); // без ?? 150 — миграция уже заполнила
```

---

## 7. Что НЕ является fallback (важно)

- `data.x ?? defaultValue` в `loadCharacter` **после** миграции — нормальная
  защита от отсутствия поля у текущей версии (не «костыль»).
- Настоящий «fallback» — когда функция **ссылается на старый/кривой хардкод**
  через обходной вызов, чтобы не менять формат по-нормальному.
  Именно такие обходы должны переезжать в миграции, а не оставаться в UI-слое.
