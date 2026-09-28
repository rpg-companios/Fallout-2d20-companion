// ПРИЁМОЧНЫЙ (патч 389): «всё ещё не могу установить PWA — сообщение про
// ярлык, но само PWA не ставится» (владелец; сборка 388 на replit).
// Манифест/воркер в порядке → самая частая причина «диалога нет» — Chrome
// считает приложение уже установленным (жив старый ярлык). Патч:
//   • manifest.json: related_applications [{platform web_app, id '/'}] —
//     открывает navigator.getInstalledRelatedApps();
//   • окна инструкции (iOS/Android/десктоп) показывают ЖИВУЮ диагностику:
//     установлено? воркер? манифест? иконки? нативный диалог доступен?
//     версия приложения;
//   • ключи pwa.diag* в обоих словарях (правило: без фолбэков).
import { describe, expect, it } from 'vitest';

import manifest from '../../public/manifest.json';
import ru from '../../i18n/ru-RU/screens/home/screen.json';
import en from '../../i18n/en-EN/screens/home/screen.json';
import { readFileSync } from 'node:fs';

const src = () => readFileSync('components/screens/HomeScreen/HomeScreen.js', 'utf8');

describe('патч 389: диагностика установки PWA', () => {
  it('манифест объявляет related_applications (web_app, id "/")', () => {
    expect(manifest.prefer_related_applications).toBe(false);
    expect(manifest.related_applications).toContainEqual({ platform: 'web_app', id: '/' });
  });

  it('в окнах инструкции трижды рендерится диагностика, читается installed-state', () => {
    const code = src();
    expect((code.match(/PwaInstallDiagnostics installPrompt=/g) || []).length).toBe(3);
    expect(code).toContain('getInstalledRelatedApps');
    expect(code).toContain('diagIconsNo');
  });

  it('ключи диагностики есть в ru и en (без фолбэков)', () => {
    for (const dict of [ru, en]) {
      expect(dict.pwa.diagnosticsTitle).toBeTruthy();
      expect(dict.pwa.diagSwNo).toBeTruthy();
      expect(dict.pwa.diagManifestNo).toBeTruthy();
      expect(dict.pwa.diagIconsNo).toBeTruthy();
      expect(dict.pwa.diagPromptAvailable).toBeTruthy();
      expect(dict.pwa.diagVersion).toBeTruthy();
    }
    expect(ru.pwa.diagInstalledYes).toContain('УЖЕ установлен');
    expect(en.pwa.diagInstalledYes).toContain('ALREADY installed');
  });
});
