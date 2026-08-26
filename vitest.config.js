import { defineConfig } from 'vitest/config';
import babel from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

// Кодовая база — React Native: компоненты лежат в .js с JSX (Metro это
// переваривает, а rolldown-парсер vitest — нет). Преобразуем JSX в .js через
// babel до трансформации, чтобы компоненты можно было реально рендерить
// в тестах (см. __tests__/securitron/*-render.test.js).
const JSX_LIKE = /(?:<\/?[A-Za-z][^>]*>|<>|<\/>)/;

// require('<ассет>') в node уходит в нативный лоадер (мимо плагинов vite) и
// падает «Invalid or unexpected token» при парсинге PNG как JS. Заменяем такие
// require на {} — для рендер-смоков картинки не нужны.
const ASSET_REQUIRE_RE = /require\(\s*['"][^'"]+\.(?:png|jpe?g|gif|webp|svg|ico|ttf|otf|woff2?)['"]\s*\)/gi;

const jsxInJs = {
  name: 'transform-jsx-in-js',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.js') || id.includes('node_modules')) return;
    const stripped = code.replace(ASSET_REQUIRE_RE, '{}');
    if (!JSX_LIKE.test(stripped)) {
      return stripped !== code ? { code: stripped, map: null } : undefined;
    }
    const out = babel.transformSync(stripped, {
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
