// Temporary runtime diagnostics. Remove before final release.
export const FALLOUT_DEBUG_MARKER = 'fallout-runtime-debug-2026-06-23-01';

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

export function debugLog(event, data = {}) {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    const entry = {
      ts: new Date().toISOString(),
      marker: FALLOUT_DEBUG_MARKER,
      event,
      data: safeClone(data),
    };
    g.__FALLOUT_DEBUG_LOGS = g.__FALLOUT_DEBUG_LOGS || [];
    g.__FALLOUT_DEBUG_LOGS.push(entry);
    if (g.__FALLOUT_DEBUG_LOGS.length > 1000) g.__FALLOUT_DEBUG_LOGS.shift();
    if (g.console?.log) g.console.log('[FALLOUT_DEBUG]', event, entry.data);
  } catch (_) {}
}

if (typeof globalThis !== 'undefined') {
  globalThis.__FALLOUT_DEBUG_MARKER = FALLOUT_DEBUG_MARKER;
}
