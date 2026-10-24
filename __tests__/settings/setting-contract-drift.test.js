import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SETTING_CAPABILITY_IDS } from '../../src/engine/settings/settingCapabilities.js';
import {
  checkDeclaredServices,
  checkSettingCompatibility,
  compareEngineVersions,
} from '../../src/engine/settings/settingCompatibility.js';
import { ENGINE_VERSION } from '../../src/engine/version.js';
import { readHostModuleIds } from '../../scripts/lib/host-modules.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WALLET = path.join(ROOT, 'modules/fallout');
const MANIFEST = JSON.parse(readFileSync(path.join(WALLET, 'manifest.json'), 'utf8'));
const HOST_FILE = path.join(ROOT, 'src/engine/settings/settingRuntimeHost.js');

const walk = (directory, files = []) => {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, files);
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
};

/** Все `engine:*`-импорты кошелька Fallout — то, что попадёт в бандл как external. */
const engineImportsOfWallet = () => {
  const found = new Set();
  for (const file of walk(WALLET)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from ['"](engine:[^'"]+)['"]/g)) found.add(match[1]);
  }
  return [...found].sort();
};

describe('setting contract does not drift from the code', () => {
  it('declares exactly the host modules the wallet imports', () => {
    // Тот самый дефект, из-за которого пакет падал на устройстве: бандл требовал
    // модуль, которого движок не отдавал. Список в манифесте обязан совпадать с
    // импортами — расхождение валит тест, а не телефон.
    expect([...MANIFEST.hostModules].sort()).toEqual(engineImportsOfWallet());
  });

  it('declares only capabilities this engine knows', () => {
    expect(checkSettingCompatibility({ manifest: MANIFEST })).toEqual([]);
    for (const capability of MANIFEST.capabilities) {
      expect(SETTING_CAPABILITY_IDS).toContain(capability);
    }
  });

  it('declares a version range that includes the current engine', () => {
    const { minimum, maximum } = MANIFEST.compatibility;
    expect(compareEngineVersions(ENGINE_VERSION, minimum)).toBeGreaterThanOrEqual(0);
    if (maximum) expect(compareEngineVersions(ENGINE_VERSION, maximum)).toBeLessThanOrEqual(0);
  });

  it('names only host modules that exist in the engine host map', () => {
    const available = new Set(readHostModuleIds(HOST_FILE));
    expect(available.size).toBeGreaterThan(0);
    expect(MANIFEST.hostModules.filter((id) => !available.has(id))).toEqual([]);
  });
});

describe('declared services match what Fallout returns', () => {
  it('every declared capability with a service is provided by the runtime', async () => {
    const { FALLOUT_RUNTIME_SERVICES } = await import('../../modules/fallout/runtimeServices.js');
    expect(checkDeclaredServices({ manifest: MANIFEST, services: FALLOUT_RUNTIME_SERVICES })).toEqual([]);
  });
});
