// ПРИЁМОЧНЫЙ (патч 395): «серым про нативный диалог, а вот красным
// "установка работает и без диалога"» (владелец). Строка обходного пути
// была в янтарном стиле diagTextInfo (#b45309) — на экране читается как
// красная ошибка, хотя по смыслу это хорошая новость и инструкция.
// 395: строка переведена в зелёный ряд «✓ это работает» (diagText);
// янтарный остался только у честного предупреждения «уже установлено».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import ru from '../../i18n/ru-RU/screens/home/screen.json';
import en from '../../i18n/en-EN/screens/home/screen.json';

const code = () => readFileSync('components/screens/HomeScreen/HomeScreen.js', 'utf8');

describe('патч 395: обходной путь установки — зелёная строка, не «красная»', () => {
  it('строка обходного пути — зелёная ✓ (diagText), не diagTextInfo', () => {
    const src = code();
    expect(src).toContain("✓ {tHomeScreen('pwa.diagPromptWorkaround')}");
    expect(src).not.toContain("ℹ {tHomeScreen('pwa.diagPromptWorkaround')}");
    expect(src).not.toContain("<Text style={styles.diagTextInfo}>✓ {tHomeScreen('pwa.diagPromptWorkaround')}");
  });

  it('диагностика честно называет возможности браузеров (репорт владельца: Mi — никак, Яндекс — ярлык)', () => {
    const src = code();
    expect(src).toContain("tHomeScreen('pwa.diagStaleShortcut')");
    expect(ru.pwa.diagStaleShortcut).toContain('Mi Browser');
    expect(ru.pwa.diagStaleShortcut).toContain('Яндекс');
    expect(en.pwa.diagStaleShortcut).toContain('Mi Browser');
    expect(ru.pwa.diagPromptWorkaround).toContain('Chrome');
    expect(en.pwa.diagPromptWorkaround).toContain('Chrome');
  });

  it('Mi Browser распознаётся по userAgent до Chrome-ядра', () => {
    const src = code();
    expect(src.indexOf('MiuiBrowser')).toBeGreaterThan(-1);
    expect(src.indexOf("return 'mi'")).toBeGreaterThan(src.indexOf('MiuiBrowser'));
    expect(src.indexOf("return 'chrome'")).toBeGreaterThan(src.indexOf("return 'mi'"));
    expect(ru.pwa.browserMi).toBe('Mi Browser');
  });

  it('янтарный остался только у предупреждения «уже установлено»', () => {
    const src = code();
    expect(src).toContain("styles.diagTextInfo");
    // Два вхождения: комментарий 395 (почему цвет сменили) и единственный
    // рендер — предупреждение «уже установлено». Стиль определён в другом файле.
    expect((src.match(/diagTextInfo/g) || []).length).toBe(2);
    expect(src).toContain("<Text style={styles.diagTextInfo}>ℹ {tHomeScreen('pwa.diagInstalledYes')}</Text>");
  });
});
