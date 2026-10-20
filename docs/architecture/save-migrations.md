# Save Migrations — механизм конвертации сохранений персонажа

**Статус:** действует  
**Контекст:** программа обновляется, формат сохранения персонажа меняется.
Чтобы не «плодить fallback» в `loadCharacter`, все изменения формата оформляются
как версионированные миграции.

---

## 1. Зачем это нужно

`loadCharacter` отвечает за общую гидрацию и store-dispatch, а не за setting-owned
правила. Форматные преобразования идут через `migrateCharacterState`; если
правило принадлежит настройке, пакет регистрирует его на зарезервированном
переходе через `registerStateMigration`. Регистрация компонуется с переходом
того же индекса и не меняет длину цепочки или `CURRENT_SCHEMA_VERSION`.

Fallout catalog-ID repairs (weapon mods and legacy kit items) идут через
optional `saveMigrations`; post-load rules (built-in weapon, robot slots,
armor mapping, dose-log expiry and setting journals) идут через optional
`characterLoad` capability;
асинхронная выдача legacy starting kit — через `saveMigrations.afterCharacterLoad`.
Setting-owned snapshot fields добавляются через optional
`characterSave.getSnapshotFields`, с сохранением legacy key names. Engine
оставляет общие store-действия и форматные преобразования, не знает
setting-owned IDs.

---

## 2. Единый источник версии

Все места, которые пишут/читают `schemaVersion`, используют единую константу:

```js
// src/store/saveSchema.js
export const CURRENT_SCHEMA_VERSION = 26;  // current repository value
export const LEGACY_SCHEMA_VERSION = 0;
```

Импортируется из:
- `src/store/characterStore.js` — persist middleware (`version:` и `partialize`);
- `src/store/migrations.js` — `normalizeForStore`, `migrateCharacterState`;
- `src/saves/characterSaves.js` — `serializeState`, `deserializeState` для сейвов в базе данных.

> Никогда не хардкодь `schemaVersion: 1` вручную — бери из `saveSchema.js`.

---

## 3. Два хранилища — одна функция миграции

Персонаж живёт **в двух местах**, оба нуждаются в миграции при обновлении:

| Хранилище | Когда читается | Где мигрируется |
|-----------|---------------|-----------------|
| SQLite (`characters.data`) | при открытии персонажа | `src/saves/characterSaves.js::deserializeState` → `migrateCharacterState` |
| AsyncStorage (`character-store`) | при запуске приложения (Zustand rehydrate) | `persist.migrate` в `src/store/characterStore.js` → `migrateCharacterState` |

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
// src/store/migrations.js — схематично
const migrationsWithExtensions = () => {
  const chain = [...MIGRATIONS];
  for (const { migration, index } of getRegisteredStateMigrations()) {
    const engineMigration = chain[index];
    chain[index] = (input) => {
      let state = engineMigration ? engineMigration(input) || input : input;
      state = migration(state) || state;
      return state;
    };
  }
  return chain;
};

export function migrateCharacterState(data) {
  if (!data || typeof data !== 'object') return data;
  let state = { ...data };
  const fromVersion = Number.isInteger(state.schemaVersion)
    ? state.schemaVersion
    : LEGACY_SCHEMA_VERSION;
  if (fromVersion >= CURRENT_SCHEMA_VERSION) return state;
  const chain = migrationsWithExtensions();
  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = chain[version];
    if (typeof migrate !== 'function') break;
    state = migrate(state) || state;
    version += 1;
    state.schemaVersion = version;
  }
  return state;
}
```

---

## 5. Чек-лист: как добавить или перенести миграцию

1. **Определи владельца.** Общий форматный переход живёт в engine `MIGRATIONS[]`; правило, зависящее от IDs или каталога сеттинга, — в миграциях пакета.
2. **Для нового engine schema transition** добавь один переход в конец `MIGRATIONS[]` и синхронно увеличь `CURRENT_SCHEMA_VERSION`.
3. **Для package-owned перехода** регистрируй функцию через `registerStateMigration(migration, index)` в активируемом runtime пакета; index должен указывать на зарезервированный переход. Registration компонуется в этот переход и не удлиняет chain.
4. **Не удаляй и не перенумеровывай исторические engine slots.** При extraction setting logic заменяй её engine-owned реализацию нейтральным slot placeholder, сохраняя индекс.
5. **Не переноси catalog rules в `loadCharacter`.** Используй optional character-load/save services, оставляя engine общего decode и store-dispatch.

Проверяй сохранность исходного поведения и idempotence там, где она была частью старого контракта. Не поднимай schema version только ради переноса кода.

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
