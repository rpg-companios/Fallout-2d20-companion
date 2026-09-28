// ПРИЁМОЧНЫЙ (патч 392): репорт владельца из диагностики 390/391 — красные
// «Раньше приложение не установлено» и «Иконки не загружаются».
// Обе строки оказались дефектами самой диагностики:
//   • «не установлено» — норма, а рисовалось красным ✕ (стиль вешался на
//     любой false); теперь это зелёная ✓-строка, «уже установлено» —
//     янтарное ℹ-пояснение;
//   • проверка иконок делала new Image() в файле, где Image импортирован
//     из react-native: строился компонент RN, а не картинка, и проверка
//     ВСЕГДА рапортовала провал. Теперь конструктор берётся честно —
//     window.Image, обещанию не дать зависнуть (try/catch в executor).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import ru from '../../i18n/ru-RU/screens/home/screen.json';
import en from '../../i18n/en-EN/screens/home/screen.json';

const code = () => readFileSync('components/screens/HomeScreen/HomeScreen.js', 'utf8');

describe('патч 392: починка диагностики PWA (иконки и «не установлено»)', () => {
  it('проверка иконок использует window.Image, new Image() в файле нет', () => {
    const src = code();
    expect(src).toContain('new window.Image()');
    expect(src.includes('new Image()')).toBe(false);
    expect(src).toContain('resolve(false);');
  });

  it('«не установлено» не краснеет: installed вне списка ошибочных проверок', () => {
    const src = code();
    const list = /const INSTALL_DIAG_LINES = \[[\s\S]*?\];/.exec(src)[0];
    expect(list).not.toContain('installed');
    expect(list).toContain("'sw'");
    expect(list).toContain("'manifest'");
    expect(list).toContain("'icons'");
    expect(src).toContain("styles.diagTextInfo");
    expect(src).toContain("tHomeScreen('pwa.diagInstalledNo')");
  });

  it('строки пояснений на месте в обоих словарях', () => {
    expect(ru.pwa.diagInstalledNo).toContain('нормально');
    expect(ru.pwa.diagInstalledYes).toContain('УЖЕ установлен');
    expect(en.pwa.diagInstalledNo).toBeTruthy();
    expect(en.pwa.diagInstalledYes).toContain('ALREADY installed');
  });
});
