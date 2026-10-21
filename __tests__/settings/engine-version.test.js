// Версия ядра — одна точка правды. Пакет объявляет requiresCore, клиент
// сравнивает с ENGINE_VERSION; расхождение с app.json сделало бы проверку
// совместимости ложной.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { ENGINE_VERSION } from '../../src/engine/version';
import { satisfiesVersionRequirement } from '../../src/engine/settings/settingRelease';

const ROOT = path.resolve(__dirname, '../..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));

describe('версия ядра', () => {
  it('совпадает с expo.version в app.json', () => {
    expect(app.expo.version).toBe(ENGINE_VERSION);
  });

  it('APK собирается как Positronium, а не как Fallout-сборка', () => {
    expect(app.expo.name).toBe('Positronium');
    expect(app.expo.slug).toBe('positronium');
    expect(app.expo.scheme).toBe('positronium');
    expect(app.expo.android.package).toBe('com.rpgcompanios.positronium');
    expect(app.expo.ios.bundleIdentifier).toBe('com.rpgcompanios.positronium');
  });

  it('профиль APK объявлен в eas.json', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
    expect(eas.build.preview.android.buildType).toBe('apk');
    expect(eas.build.production.android.buildType).toBe('app-bundle');
  });

  it('манифест Fallout требует совместимое ядро', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/fallout/manifest.json'), 'utf8'));
    expect(satisfiesVersionRequirement(manifest.requiresCore, ENGINE_VERSION)).toBe(true);
  });
});
