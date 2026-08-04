# Save Migrations — механизм конвертации сохранений персонажа

**Статус:** действует
**Контекст:** программа обновляется, формат сохранения персонажа меняется.
Чтобы не «плодить fallback» в `loadCharacter`, все изменения формата оформляются
как версионированные миграции.

---

## 1. Зачем это нужно

Сейчас при загрузке персонажа в `loadCharacter` накопились ручные fallback:
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

- `src/store/saveSchema.js`:
  ```js
  export const CURRENT_SCHEMA_VERSION = 0;
  export const LEGACY_SCHEMA_VERSION = 0;
  ```

Импортируется из:
- `src/store/characterStore.js` (persist middleware, `schemaVersion` в сериализаторе);
- `src/store/migrations.js` (`normalizeForStore`, `migrateCharacterState`);
- `components/CharacterContext.js` (`serializeState`, `deserializeState`).

> Никогда не хардкодь `schemaVersion: 1` вручную — бери из `saveSchema.js`.

---

## 3. Механизм

`src/store/migrations.js`:

```js
const MIGRATIONS = [
  // MIGRATIONS[0] — переход v0 -> v1
  // MIGRATIONS[1] — переход v1 -> v2
  // ...
];

export function migrateCharacterState(data) {
  if (!data || typeof data !== 'object') return data;
  let state = { ...data };
  const fromVersion = Number.isInteger(state.schemaVersion) ? state.schemaVersion : LEGACY_SCHEMA_VERSION;
  if (fromVersion >= CURRENT_SCHEMA_VERSION) return state;
  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (typeof migrate !== 'function') break; // не знаем — не ломаем
    state = migrate(state) || state;
    version += 1;
    state.schemaVersion = version;
  }
  return state;
}
```

Точка входа — `deserializeState` в `CharacterContext.js`: при загрузке
сохранение прогоняется через `migrateCharacterState` **до** всех `set*`.

---

## 4. Правила добавления новой миграции

Когда формат меняется:

1. Подними `CURRENT_SCHEMA_VERSION` в `saveSchema.js` на единицу.
2. Добавь в `MIGRATIONS` в `migrations.js` новую функцию `(state) => state'`,
   которая переводит сохранение с предыдущей версии на новую.
3. Миграция должна быть:
   - **чистой** — без сайд-эффектов, только `state -> state'`;
   - **идемпотентной** — повторный прогон не ломает;
   - **полной** — заполняет отсутствующие поля, а не оставляет их на fallback.
4. **Не удаляй старые миграции** — только добавляй новые в конец массива.
5. Перенеси логику из `loadCharacter` в миграцию и **убери** fallback из кода.

---

## 5. Пример

Будущее изменение: добавить поле `inventoryCapacity` (по умолчанию 150).

```js
// saveSchema.js
export const CURRENT_SCHEMA_VERSION = 1;

// migrations.js
const MIGRATIONS = [
  // v0 -> v1: добавить inventoryCapacity
  (state) => {
    if (state.inventoryCapacity === undefined) {
      return { ...state, inventoryCapacity: 150 };
    }
    return state;
  },
];
```

В `loadCharacter` — просто `setInventoryCapacity(data.inventoryCapacity)`,
без `?? 150` прямо в коде. Старый персонаж получит значение через миграцию.

---

## 6. Что НЕ является fallback (важно)

- `data.x ?? defaultValue` в `loadCharacter` **после** миграции — это нормальная
  защита от отсутствия поля у самой свежей версии, а не «костыль».
- Настоящий «fallback» (по определению владельца) — это когда функция **ссылается
  на старый/кривой хардкод** через обходной вызов, чтобы не править по-нормальному.
  Именно такие обходы должны переезжать в миграции, а не оставаться в UI-слое.
