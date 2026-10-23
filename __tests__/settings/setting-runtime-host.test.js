import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HOST_FILE = fileURLToPath(new URL('../../src/engine/settings/settingRuntimeHost.js', import.meta.url));
const HOST_SOURCE = readFileSync(HOST_FILE, 'utf8');

/** Keys of the frozen map, read statically: the host pulls react-native and cannot load in Node. */
function readHostModuleIds() {
  const start = HOST_SOURCE.indexOf('SETTING_RUNTIME_HOST_MODULES = Object.freeze({');
  const end = HOST_SOURCE.indexOf('\n});', start);
  const block = HOST_SOURCE.slice(start, end);
  return new Set(
    [...block.matchAll(/(?:^|\n)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/g)]
      .map((match) => match[1] ?? match[2] ?? match[3]),
  );
}

describe('setting runtime host modules', () => {
  it('exposes the automatic JSX runtime the package builder compiles against', () => {
    // tools/build-setting-runtime.mjs bundles with `jsx: 'automatic'`, so every
    // package bundle requires `react/jsx-runtime`. Missing host keys used to fail
    // activation with "runtime requested unavailable host module".
    const hostModuleIds = readHostModuleIds();
    expect(hostModuleIds.has('react/jsx-runtime')).toBe(true);
    expect(hostModuleIds.has('react/jsx-dev-runtime')).toBe(true);
  });

  it('keeps the bare package modules packages may import', () => {
    const hostModuleIds = readHostModuleIds();
    for (const moduleId of ['react', 'react-native', '@expo/vector-icons', 'zustand/react/shallow']) {
      expect(hostModuleIds.has(moduleId)).toBe(true);
    }
  });

  it('wraps every host module in hostModule()', () => {
    // Пакет сеттинга копирует модуль через __toESM, а на Hermes такая копия
    // теряет функции (баг привязки в цикле). Фасад hostModule() отдаёт объект
    // без собственных свойств, поэтому копировать нечего — см. hostModule.js.
    const start = HOST_SOURCE.indexOf('SETTING_RUNTIME_HOST_MODULES = Object.freeze({');
    const end = HOST_SOURCE.indexOf('\n});', start);
    const entries = HOST_SOURCE.slice(start, end)
      .split('\n')
      .filter((line) => /^\s*(?:'[^']+'|[A-Za-z_$][\w$]*)\s*:/.test(line));

    expect(entries.length).toBeGreaterThanOrEqual(49);
    for (const entry of entries) {
      expect(entry).toMatch(/^\s*(?:'[^']+'|[A-Za-z_$][\w$]*)\s*: hostModule\([A-Za-z_$][\w$]*\),$/);
    }
  });

  it('only exposes engine modules through the host map', () => {
    const hostModuleIds = readHostModuleIds();
    expect([...hostModuleIds].filter((moduleId) => moduleId.startsWith('engine:')).length).toBeGreaterThan(0);
    expect([...hostModuleIds].filter((moduleId) => moduleId.includes('modules/'))).toEqual([]);
  });
});
