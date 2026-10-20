// Версия ядра — одна точка правды. Пакет объявляет requiresCore, клиент
// сравнивает с ENGINE_VERSION; расхождение с app.json сделало бы проверку
// совместимости ложной.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { ENGINE_VERSION } from '../../src/engine/version';
import { satisfiesVersionRequirement } from '../../src/engine/settings/settingRelease';

const ROOT = path.resolve(__dirname, '../..');

describe('версия ядра', () => {
  it('совпадает с expo.version в app.json', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    expect(app.expo.version).toBe(ENGINE_VERSION);
  });

  it('манифест Fallout требует совместимое ядро', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/fallout/manifest.json'), 'utf8'));
    expect(satisfiesVersionRequirement(manifest.requiresCore, ENGINE_VERSION)).toBe(true);
  });
});
