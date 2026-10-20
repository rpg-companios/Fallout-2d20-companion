// db/seed.js
//
// Static catalog rows are supplied by the active setting's catalog capability;
// this initializer is retained for legacy call sites. SQLite stores character
// saves and folders, not a duplicated copy of the setting catalog.
//
// Функция оставлена (её зовёт App.js), но теперь она ничего не сеет — таблицы
// создаются в initDatabase (schema.js). Это no-op для обратной совместимости вызова.

export async function seedDatabase(_isFirstRun) {
  // Намеренно пусто: каталог в JSON, таблице characters сид не нужен.
  return;
}
