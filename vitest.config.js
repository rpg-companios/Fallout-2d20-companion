import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import babel from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

// В репозитории движка папки modules/ нет: фикстура сеттинга подключается
// только там, где кошелёк лежит рядом (совмещённый checkout).
const SETTING_FIXTURE = './src/store/__test-setup__/settingRuntimeFixture.js';
const setupFiles = [
  './src/store/__test-setup__/asyncStorageMock.js',
  './src/store/__test-setup__/reactNativeMock.js',
  ...(fs.existsSync(new URL(SETTING_FIXTURE, import.meta.url)) ? [SETTING_FIXTURE] : []),
];

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Кошелёк сеттинга обращается к движку через `engine:<id>` — так пакет
// собирается без исходников движка. В приложении эти модули отдаёт хост
// (settingRuntimeHost.js), а в тестах — этот резолвер.
const ENGINE_SPECIFIER = /^engine:(.+)$/;
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.js'];

const engineSpecifiers = {
  name: 'setting-engine-specifiers',
  enforce: 'pre',
  resolveId(source) {
    const match = ENGINE_SPECIFIER.exec(source);
    if (!match) return null;
    for (const suffix of RESOLVE_SUFFIXES) {
      const candidate = path.join(ROOT, `${match[1]}${suffix}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
  },
};

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
    if (id.includes('node_modules')) return undefined;
    const isJs = id.endsWith('.js');
    const isTsLike = id.endsWith('.ts') || id.endsWith('.tsx');
    if (!isJs && !isTsLike) return undefined;

    // require('<ассет>') в node уходит в нативный лоадер (мимо плагинов vite)
    // и падает «Invalid or unexpected token» при парсинге PNG как JS. Заменяем
    // такие require на {} — для рендер-смоков картинки не нужны. С патча 280
    // замена работает и в .ts/.tsx (саму трансформацию TS делает vite/esbuild).
    const stripped = code.replace(ASSET_REQUIRE_RE, '{}');
    const changed = stripped !== code;

    if (isTsLike) {
      return changed ? { code: stripped, map: null } : undefined;
    }

    if (!JSX_LIKE.test(stripped)) {
      return changed ? { code: stripped, map: null } : undefined;
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
  plugins: [engineSpecifiers, jsxInJs],
  test: {
    environment: 'node',
    // В репозитории движка тестов нет (они живут в совмещённом репозитории).
    passWithNoTests: true,
    setupFiles,
  },
});
