// ПРИЁМОЧНЫЙ (патч 394): «в тесте на установку pwa всё серое, всё с
// галочкой. А самого pwa нигде не установилось» (владелец; после 392/393).
// Всё зелёное = сайт валиден (воркер/манифест/иконки), приложения нет,
// нативного диалога нет. Диагностика раньше молчала, ПОЧЕМУ диалога нет:
// событие установки шлют не все браузеры, а Chrome держит паузу после
// отмен. 394: строка «Браузер: …» (Edge/Opera/Samsung/Yandex распознаются
// ДО Chrome — они содержат «Chrome/» в userAgent), строки «диалога пока
// нет — это нормально» и обходной путь через меню браузера.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import ru from '../../i18n/ru-RU/screens/home/screen.json';
import en from '../../i18n/en-EN/screens/home/screen.json';

const code = () => readFileSync('components/screens/HomeScreen/HomeScreen.js', 'utf8');

describe('патч 394: диагностика называет браузер и путь без диалога', () => {
  it('браузер определяется по userAgent, производные Chrome — раньше ядра', () => {
    const src = code();
    // В исходнике слэши экранированы («Edg\/»), порядок проверяем по индексам.
    expect(src.indexOf('SamsungBrowser')).toBeGreaterThan(-1);
    expect(src.indexOf('YaBrowser')).toBeGreaterThan(src.indexOf('SamsungBrowser'));
    expect(src.indexOf('Edg\\/')).toBeGreaterThan(src.indexOf('YaBrowser'));
    expect(src.indexOf("return 'chrome'")).toBeGreaterThan(src.indexOf('Edg\\/'));
    expect(src).toContain("return 'chrome'");
    expect(src).toContain('BROWSER_LABEL_KEYS[detectBrowserId()]');
  });

  it('когда диалога нет — явные строки «пока не приходил» и обходной путь', () => {
    const src = code();
    expect(src).toContain("tHomeScreen('pwa.diagPromptAbsent')");
    expect(src).toContain("tHomeScreen('pwa.diagPromptWorkaround')");
    // строка «диалог доступен» осталась
    expect(src).toContain("tHomeScreen('pwa.diagPromptAvailable')");
  });

  it('строки есть в обоих словарях', () => {
    expect(ru.pwa.diagBrowser).toBe('Браузер');
    expect(ru.pwa.browserYandex).toBe('Яндекс Браузер');
    expect(ru.pwa.diagPromptAbsent).toContain('пока не приходил');
    expect(ru.pwa.diagPromptWorkaround).toContain('меню браузера');
    expect(en.pwa.diagBrowser).toBe('Browser');
    expect(en.pwa.diagPromptAbsent).toContain("hasn't arrived");
    expect(en.pwa.diagPromptWorkaround).toContain('browser menu');
    for (const key of ['browserChrome','browserSamsung','browserYandex','browserFirefox','browserOpera','browserEdge','browserSafari','browserOther']) {
      expect(ru.pwa[key]).toBeTruthy();
      expect(en.pwa[key]).toBeTruthy();
    }
  });
});
