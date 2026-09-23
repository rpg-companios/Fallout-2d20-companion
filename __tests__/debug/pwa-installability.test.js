// ПРИЁМОЧНЫЙ (патч 320): PWA должен проходить критерии установки Chromium
// (Яндекс.Браузер, Mi Browser и пр. — те же критерии). История дефекта: в
// манифесте была только иконка 512 PNG, а 192 существовал лишь как SVG,
// который Chromium иконкой установки не считает → браузер не предлагал
// «Установить», а показывал инструкцию «как добавить ярлык». Второй дефект:
// у части давних пользователей застрял старый воркер /sw.js, который никогда
// не просыпался (файл не менялся) и раздавал вечно старый кэш — патч меняет
// файл, чтобы воркер переустановился и самоуничтожился.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const pub = (name) => readFileSync(new URL(`./public/${name}`, `file://${ROOT}/`));

/** Размер PNG из заголовка IHDR (байты 16..24). */
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

describe('PWA: критерии установки и будильник застрявшего воркера (320)', () => {
  it('манифест объявляет PNG-иконки 192 и 512 (файлы существуют и настоящие PNG)', () => {
    const manifest = JSON.parse(pub('manifest.json').toString('utf-8'));
    const declared = manifest.icons.map((i) => `${i.sizes} ${i.type} ${i.src}`);
    expect(declared).toContain('192x192 image/png /pwa-icon-192.png');
    expect(declared).toContain('512x512 image/png /pwa-icon.png');

    expect(pngSize(pub('pwa-icon-192.png'))).toEqual({ w: 192, h: 192 });
    expect(pngSize(pub('pwa-icon.png'))).toEqual({ w: 512, h: 512 });
  });

  it('манифест установочный: имя, start_url, standalone', () => {
    const manifest = JSON.parse(pub('manifest.json').toString('utf-8'));
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(typeof manifest.start_url).toBe('string');
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display);
  });

  it('файл /sw.js получил новую ревизию (будильник для застрявших клиентов)', () => {
    const sw = pub('sw.js').toString('utf-8');
    expect(sw).toContain('compat-worker revision: 320');
    // саморазрегистрация при активации — смысл будильника
    expect(sw).toContain('self.registration.unregister()');
  });
});
