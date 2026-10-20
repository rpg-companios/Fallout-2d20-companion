// Fallout adds its familiar console API on top of the engine's generic logger.
// The engine never imports this file; the wrapper exists only in the setting package.
import {
  clearRuntimeTrace,
  debugLog,
  disableRuntimeTrace,
  dumpRuntimeTrace,
  enableRuntimeTrace,
  getRuntimeTraceStatus,
} from '../../src/engine/debug/runtimeTrace.js';

export const FALLOUT_DEBUG_MARKER = 'fallout-runtime-debug-2026-06-23-01';
export { debugLog };

/** Install the Fallout console alias only while this setting runtime is active. */
export function activateFalloutDebug() {
  if (typeof globalThis === 'undefined') return () => {};
  const globalObject = globalThis;
  const previousFalloutApi = globalObject.__fallout;
  const previousMarker = globalObject.__FALLOUT_DEBUG_MARKER;
  const api = {
    on: (categories) => enableRuntimeTrace(categories),
    off: () => disableRuntimeTrace(),
    status: () => getRuntimeTraceStatus(),
    clear: clearRuntimeTrace,
    mark: (label) => debugLog('trace.mark', { label }),
    dump: (eventPrefix) => dumpRuntimeTrace(eventPrefix),
  };

  globalObject.__FALLOUT_DEBUG_MARKER = FALLOUT_DEBUG_MARKER;
  globalObject.__fallout = api;

  return () => {
    disableRuntimeTrace();
    if (globalObject.__fallout === api) {
      if (previousFalloutApi === undefined) delete globalObject.__fallout;
      else globalObject.__fallout = previousFalloutApi;
    }
    if (globalObject.__FALLOUT_DEBUG_MARKER === FALLOUT_DEBUG_MARKER) {
      if (previousMarker === undefined) delete globalObject.__FALLOUT_DEBUG_MARKER;
      else globalObject.__FALLOUT_DEBUG_MARKER = previousMarker;
    }
  };
}
