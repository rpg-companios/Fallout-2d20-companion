let activeSettingRuntime = null;
const listeners = new Set();

export const getActiveSettingRuntime = () => activeSettingRuntime;

export const setActiveSettingRuntime = (runtime) => {
  if (runtime !== null && (!runtime || typeof runtime !== 'object')) {
    throw new Error('[active-setting] runtime must be an object or null');
  }
  if (activeSettingRuntime === runtime) return runtime;
  activeSettingRuntime = runtime;
  listeners.forEach((listener) => {
    try {
      listener(runtime);
    } catch {
      // A subscriber must not prevent other engine services from observing activation.
    }
  });
  return activeSettingRuntime;
};

export const subscribeToActiveSettingRuntime = (listener) => {
  if (typeof listener !== 'function') {
    throw new Error('[active-setting] listener must be a function');
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
};
