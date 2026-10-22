import { describe, expect, it } from 'vitest';

import { commonJsHostModule } from '../../src/engine/settings/hostModule.js';

// Пакет сеттинга грузит host-модули через require() и оборачивает результат
// в esbuild-овский __toESM (копия собственных свойств). Babel/Metro отдают
// CommonJS-пакет как namespace-обёртку, и её копия на Hermes теряла функции —
// «Object is not a function» в CharacterScreen (setting.cjs:65459).
describe('commonJsHostModule', () => {
  it('returns module.exports for a CommonJS package handed over as a namespace', () => {
    const moduleExports = { useMemo: () => 'memo', createElement: () => null };
    // Так Babel собирает `import * as React from 'react'` для CJS-модуля.
    const namespace = { ...moduleExports, default: moduleExports };

    expect(commonJsHostModule(namespace)).toBe(moduleExports);
    expect(typeof commonJsHostModule(namespace).useMemo).toBe('function');
  });

  it('keeps an ES module namespace as is', () => {
    const component = () => null;
    const namespace = { __esModule: true, default: component, named: () => 1 };

    expect(commonJsHostModule(namespace)).toBe(namespace);
    expect(commonJsHostModule(namespace).default).toBe(component);
  });

  it('keeps a namespace whose default is not a module', () => {
    const namespace = { __esModule: false, default: 'text', value: 1 };

    expect(commonJsHostModule(namespace)).toBe(namespace);
  });

  it('passes non-object values through untouched', () => {
    expect(commonJsHostModule(undefined)).toBeUndefined();
    expect(commonJsHostModule(null)).toBeNull();
    expect(typeof commonJsHostModule(() => null)).toBe('function');
  });
});
