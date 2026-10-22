// Иконка APK: app.json ссылается на настоящие PNG 1024×1024.
//
// Раньше expo.icon смотрел на картинку из assets/images, а android.adaptiveIcon
// — на заглушку Expo (сетка с кругами). На Android 8+ лаунчер берёт именно
// adaptiveIcon, поэтому установленное приложение выглядело без иконки.
// Тест ловит битые пути и неверный размер до сборки APK.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

const readPngSize = (file) => {
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(1, 4).toString('latin1'), `${file}: не PNG`).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

describe('иконка приложения', () => {
  const expo = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;

  it('icon, adaptiveIcon и splash указывают на PNG 1024×1024', () => {
    const files = [
      expo.icon,
      expo.android?.adaptiveIcon?.foregroundImage,
      expo.splash?.image,
    ];
    expect(files.every((file) => typeof file === 'string' && file.endsWith('.png'))).toBe(true);
    for (const relative of files) {
      const absolute = path.join(ROOT, relative);
      expect(fs.existsSync(absolute), relative).toBe(true);
      expect(readPngSize(absolute), relative).toEqual({ width: 1024, height: 1024 });
    }
  });
});
