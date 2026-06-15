import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/store/__test-setup__/asyncStorageMock.js'],
  },
});
