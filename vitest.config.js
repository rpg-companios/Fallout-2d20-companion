import { defineConfig } from 'vitest/config';
import babel from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

// Кодовая база — React Native: компоненты лежат в .js с JSX (Metro это
// переваривает, а rolldown-парсер vitest — нет). Преобразуем JSX в .js через
// babel до трансформации, чтобы компоненты можно было реально рендерить
// в тестах (см. __tests__/securitron/weaponcard-render.test.js).
const JSX_LIKE = /(?:<\/?[A-Za-z][^>]*>|<>|<\/>)/;

const jsxInJs = {
  name: 'transform-jsx-in-js',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.js') || id.includes('node_modules')) return;
    if (!JSX_LIKE.test(code)) return;
    const out = babel.transformSync(code, {
      filename: id,
      babelrc: false,
      configFile: false,
      plugins: [[jsxPlugin, { runtime: 'automatic' }]],
    });
    return { code: out.code, map: null };
  },
};

export default defineConfig({
  plugins: [jsxInJs],
  test: {
    environment: 'node',
    setupFiles: ['./src/store/__test-setup__/asyncStorageMock.js'],
  },
});
