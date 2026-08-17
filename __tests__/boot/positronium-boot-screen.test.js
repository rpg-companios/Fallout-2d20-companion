import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath));
const readText = (relativePath) => read(relativePath).toString('utf8');
const sha256 = (relativePath) => createHash('sha256').update(read(relativePath)).digest('hex');

describe('Positronium boot screen integration', () => {
  it('uses the original illustration and progress bar from positronium-boot', () => {
    expect(sha256('assets/boot/annihilation.png')).toBe(
      '8a5c90ee0cb713ccbc1279c8cc11af6c3858aad2a09e25b02b7dac2098d1e0fd',
    );
    expect(sha256('assets/boot/bar-fill.png')).toBe(
      'f231ee7eb2b5a48ff231fb136b3f31295a5d322c8931f63779995debd057dde6',
    );
  });

  it('keeps the archive timing and reports real database initialization stages', () => {
    const bootSource = readText('components/boot/PositroniumBootScreen.js');
    const appSource = readText('App.js');

    expect(bootSource).toContain('const MIN_VISIBLE_MS = 2400;');
    expect(bootSource).toContain('driveFill(1, 320);');
    expect(appSource).toContain('setBootProgress(0.2);');
    expect(appSource).toContain('setBootProgress(0.62);');
    expect(appSource).toContain('setBootProgress(1);');
    expect(appSource).toContain('ready={dbReady}');
  });

  it('does not replace the native Expo splash with the runtime boot artwork', () => {
    const appConfig = JSON.parse(readText('app.json'));

    expect(appConfig.expo.splash).toEqual({
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    });
    expect(sha256('assets/splash-icon.png')).not.toBe(sha256('assets/boot/annihilation.png'));
  });
});
