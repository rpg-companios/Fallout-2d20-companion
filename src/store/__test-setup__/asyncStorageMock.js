// Vitest setup: provide an in-memory AsyncStorage so importing the real
// Zustand store (which uses persist + AsyncStorage) does not crash in the
// Node test environment. Mirrors @react-native-async-storage/async-storage API.
// 446: __DEV__ — RN-глобал: экспо-модули (expo/src/async-require/setup.ts)
// выполняются при импорте и требуют флаг; под vitest его нет. Без него
// тесты, импортирующие цепочку expo-image-picker (аватары, 445), падали на
// коллекции: «ReferenceError: __DEV__ is not defined».
if (typeof globalThis.__DEV__ === 'undefined') {
  globalThis.__DEV__ = false;
}
import { vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map();
  return {
    default: {
      getItem: async (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: async (k, v) => { mem.set(k, v); },
      multiSet: async (pairs) => { pairs.forEach(([k, v]) => mem.set(k, v)); },
      removeItem: async (k) => { mem.delete(k); },
      clear: async () => { mem.clear(); },
      getAllKeys: async () => Array.from(mem.keys()),
    },
  };
});
