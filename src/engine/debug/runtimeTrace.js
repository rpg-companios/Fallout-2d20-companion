// Generic, engine-owned diagnostics gate. Setting packages may control the same
// logger through the runtime API without shipping or importing a setting logger.
export const RUNTIME_DEBUG_MARKER = 'engine-runtime-debug-2026-10-16-01';

const TRACE_TAG = '[RUNTIME_DEBUG]';
const BUFFER_LIMIT = 1000;
const BUFFER_KEY = '__RUNTIME_DEBUG_LOGS';
const traceState = { enabled: false, categories: null };

const safeClone = (value, depth = 0) => {
  if (depth > 5) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (type === 'function') return '[function]';
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => safeClone(entry, depth + 1));
  if (type === 'object') {
    const result = {};
    Object.keys(value).slice(0, 80).forEach((key) => {
      try { result[key] = safeClone(value[key], depth + 1); } catch { result[key] = '[unreadable]'; }
    });
    return result;
  }
  return String(value);
};

const categoryOf = (event) => {
  const value = String(event);
  const dot = value.indexOf('.');
  return dot === -1 ? value : value.slice(0, dot);
};

const bufferOf = (globalObject) => {
  globalObject[BUFFER_KEY] = globalObject[BUFFER_KEY] || [];
  return globalObject[BUFFER_KEY];
};

export function debugLog(event, data = {}) {
  if (!traceState.enabled) return;
  const category = categoryOf(event);
  if (traceState.categories && !traceState.categories.includes(category)) return;
  try {
    const globalObject = typeof globalThis !== 'undefined' ? globalThis : {};
    const entry = {
      ts: new Date().toISOString(),
      marker: RUNTIME_DEBUG_MARKER,
      category,
      event,
      data: safeClone(data),
    };
    const buffer = bufferOf(globalObject);
    buffer.push(entry);
    if (buffer.length > BUFFER_LIMIT) buffer.shift();
    globalObject.console?.log?.(TRACE_TAG, event, entry.data);
  } catch {
    // Diagnostics must never interrupt application behavior.
  }
}

export function enableRuntimeTrace(categories) {
  traceState.enabled = true;
  traceState.categories = Array.isArray(categories) && categories.length > 0 ? categories : null;
  return getRuntimeTraceStatus();
}

export function disableRuntimeTrace() {
  traceState.enabled = false;
  return getRuntimeTraceStatus();
}

export function getRuntimeTraceStatus() {
  const globalObject = typeof globalThis !== 'undefined' ? globalThis : {};
  return {
    enabled: traceState.enabled,
    categories: traceState.categories,
    buffered: bufferOf(globalObject).length,
  };
}

export function clearRuntimeTrace() {
  const globalObject = typeof globalThis !== 'undefined' ? globalThis : {};
  globalObject[BUFFER_KEY] = [];
}

export function dumpRuntimeTrace(eventPrefix) {
  const globalObject = typeof globalThis !== 'undefined' ? globalThis : {};
  return JSON.stringify(
    bufferOf(globalObject).filter((entry) => !eventPrefix || entry.event.startsWith(eventPrefix)),
    null,
    1,
  );
}

export function markRuntimeTrace(label) {
  debugLog('trace.mark', { label });
}
