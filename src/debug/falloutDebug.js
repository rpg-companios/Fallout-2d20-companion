// Единая трассировка приложения. ПРАВИЛО: по умолчанию ВЫКЛЮЧЕНА —
// ноль шума в консоли и ноль аллокаций в проде.
//
// Включение — только из консоли браузера через глобал __fallout
// (удобная обёртка-скрипт: scripts/console-trace.js, runbook: docs/debug-tracing.md):
//   __fallout.on()                  — включить все категории
//   __fallout.on(['equip','items']) — только перечисленные категории
//   __fallout.off()                 — выключить
//   __fallout.status()              — состояние
//   __fallout.dump('equip')         — JSON-дамп буфера (фильтр по префиксу события)
//   __fallout.clear()               — очистить буфер
//   __fallout.mark('шаг 1')         — маркер-запись (разделитель этапов репро)
//
// Категория события — префикс до первой точки: 'equip.armor:entry' → 'equip'.
// Плоские вызовы console.* в коде запрещены инвариант-тестом
// __tests__/debug/console-trace.test.js — только debugLog.

export const FALLOUT_DEBUG_MARKER = 'fallout-runtime-debug-2026-06-23-01';
const TRACE_TAG = '[FALLOUT_DEBUG]';
const BUFFER_LIMIT = 1000;

const safeClone = (value, depth = 0) => {
  if (depth > 5) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (t === 'function') return '[function]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => safeClone(v, depth + 1));
  if (t === 'object') {
    const out = {};
    Object.keys(value).slice(0, 80).forEach((key) => {
      try { out[key] = safeClone(value[key], depth + 1); } catch (_) { out[key] = '[unreadable]'; }
    });
    return out;
  }
  return String(value);
};

const traceState = {
  enabled: false,
  categories: null, // null = все категории
};

const categoryOf = (event) => {
  const s = String(event);
  const dot = s.indexOf('.');
  return dot === -1 ? s : s.slice(0, dot);
};

const bufferOf = (g) => {
  g.__FALLOUT_DEBUG_LOGS = g.__FALLOUT_DEBUG_LOGS || [];
  return g.__FALLOUT_DEBUG_LOGS;
};

export function debugLog(event, data = {}) {
  if (!traceState.enabled) return;
  const category = categoryOf(event);
  if (traceState.categories && !traceState.categories.includes(category)) return;
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    const entry = {
      ts: new Date().toISOString(),
      marker: FALLOUT_DEBUG_MARKER,
      category,
      event,
      data: safeClone(data),
    };
    const buffer = bufferOf(g);
    buffer.push(entry);
    if (buffer.length > BUFFER_LIMIT) buffer.shift();
    g.console?.log?.(TRACE_TAG, event, entry.data);
  } catch (_) {}
}

if (typeof globalThis !== 'undefined') {
  const g = globalThis;
  g.__FALLOUT_DEBUG_MARKER = FALLOUT_DEBUG_MARKER;
  g.__fallout = {
    on: (categories) => {
      traceState.enabled = true;
      traceState.categories = Array.isArray(categories) && categories.length > 0 ? categories : null;
      return g.__fallout.status();
    },
    off: () => {
      traceState.enabled = false;
      return g.__fallout.status();
    },
    status: () => ({
      enabled: traceState.enabled,
      categories: traceState.categories,
      buffered: bufferOf(g).length,
    }),
    clear: () => {
      g.__FALLOUT_DEBUG_LOGS = [];
    },
    mark: (label) => {
      debugLog('trace.mark', { label });
    },
    dump: (eventPrefix) => JSON.stringify(
      bufferOf(g).filter((entry) => !eventPrefix || entry.event.startsWith(eventPrefix)),
      null,
      1,
    ),
  };
}
