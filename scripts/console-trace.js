/* eslint-disable no-console */
// ============================================================================
// ТРАССИРОВКА ПРИЛОЖЕНИЯ — инструмент разработчика (не подключается в коде).
//
// Использование: открыть приложение (web-превью), F12 → Console, вставить
// содержимое файла целиком, Enter. Трассировка включится.
//
// По умолчанию трассировка ВЫКЛЮЧЕНА и ничего никуда не пишет (ноль шума
// в консоли, ноль аллокаций). Включённая — пишет каждое событие в консоль
// и в кольцевой буфер (1000 записей) globalThis.__FALLOUT_DEBUG_LOGS.
//
// Управление дальше — напрямую через __fallout:
//   __fallout.on()                  включить все категории
//   __fallout.on(['equip','items']) включить только перечисленные категории
//   __fallout.off()                 выключить (буфер сохраняется)
//   __fallout.status()              состояние: { enabled, categories, buffered }
//   __fallout.mark('шаг 2')         маркер-разделитель этапов репро
//   __fallout.dump('equip')         JSON-строка буфера (фильтр по префиксу
//                                   события; без аргумента — весь буфер)
//   __fallout.clear()               очистить буфер
//
// Категории = префикс события до первой точки. Существующие:
//   character, weapon, skill, equip, items, kits, consumable,
//   store, i18n, catalog, sync, ctx, trace
//
// Репорт бага: __fallout.mark('начало') → воспроизвести →
//   copy(__fallout.dump('equip')) — и приложить к репорту.
// Runbook: docs/debug-tracing.md
// ============================================================================
(() => {
  const f = globalThis.__fallout;
  if (!f) {
    console.warn('[console-trace] __fallout не найден. Сборка без debug-модуля? Проверь, что приложение пересобрано.');
    return;
  }
  const status = f.on();
  console.log(
    '[console-trace] Трассировка ВКЛ\n' +
    `  категории: ${status.categories ? status.categories.join(', ') : 'все'}\n` +
    '  выкл: __fallout.off()\n' +
    '  категории-фильтр: __fallout.on([\'equip\',\'items\'])\n' +
    '  маркер: __fallout.mark(\'шаг 1\')   дамп: __fallout.dump(\'equip\')   очистка: __fallout.clear()'
  );
})();
