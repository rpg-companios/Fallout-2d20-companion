// Vitest setup: provide an in-memory AsyncStorage so importing the real
// Zustand store (which uses persist + AsyncStorage) does not crash in the
// Node test environment. Mirrors @react-native-async-storage/async-storage API.
import { vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map();
  return {
    default: {
      getItem: async (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: async (k, v) => { mem.set(k, v); },
      removeItem: async (k) => { mem.delete(k); },
      clear: async () => { mem.clear(); },
      getAllKeys: async () => Array.from(mem.keys()),
    },
  };
});
