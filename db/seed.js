// db/seed.js
//
// Каталог (оружие/моды/патроны/качества/перки/предметы) больше НЕ копируется в SQLite —
// он читается напрямую из JSON через db/catalogSource.js (i18n/equipmentCatalog).
// Поэтому сидирование каталога удалено. SQLite используется только для СОХРАНЁНОК
// персонажей (таблица characters).
//
// Функция оставлена (её зовёт App.js), но теперь она ничего не сеет — таблицы
// создаются в initDatabase (schema.js). Это no-op для обратной совместимости вызова.

export async function seedDatabase(_isFirstRun) {
  // Намеренно пусто: каталог в JSON, таблице characters сид не нужен.
  return;
}
