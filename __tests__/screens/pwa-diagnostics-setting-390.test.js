// ПРИЁМОЧНЫЙ (патч 390): «диагностику можешь сделать отдельной настройкой?
// Чтобы не все видели про версию и пр., а только кто её включил» (владелец).
// Блок диагностики из 389 скрыт настройкой pwaInstallDiagnostics
// (движок, раздел «Внешний вид», по умолчанию ВЫКЛ); включившие видят
// в окне установки проверку из 389.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ENGINE_SETTINGS,
  getSettingsForSurface,
  SETTING_CONTROL_SURFACES,
} from '../../domain/settingsCatalog';
import ru from '../../i18n/ru-RU/screens/home/screen.json';
import en from '../../i18n/en-EN/screens/home/screen.json';

const src = () => readFileSync('components/screens/HomeScreen/HomeScreen.js', 'utf8');

describe('патч 390: диагностика установки — отдельная настройка', () => {
  it('настройка pwaInstallDiagnostics: движок, «Внешний вид», по умолчанию ВЫКЛ', () => {
    const setting = ENGINE_SETTINGS.find((item) => item.id === 'pwaInstallDiagnostics');
    expect(setting).toBeTruthy();
    expect(setting.type).toBe('boolean');
    expect(setting.defaultValue).toBe(false);
    expect(setting.controlSurface).toBe(SETTING_CONTROL_SURFACES.SETTINGS);
    expect(setting.sectionKey).toBe('appearance');
    expect(setting.labelKey).toBe('settings.pwaDiagnosticsTitle');
    expect(setting.descriptionKey).toBe('settings.pwaDiagnosticsDescription');
    expect(getSettingsForSurface(SETTING_CONTROL_SURFACES.SETTINGS))
      .toContainEqual(expect.objectContaining({ id: 'pwaInstallDiagnostics' }));
  });

  it('селектор стора заведён', () => {
    const storeSrc = readFileSync('src/store/appSettingsStore.js', 'utf8');
    expect(storeSrc).toContain("export const selectPwaInstallDiagnosticsEnabled");
  });

  it('блок диагностики гейтится настройкой, окна инструкции на месте', () => {
    const code = src();
    expect(code).toContain('selectPwaInstallDiagnosticsEnabled');
    expect(code).toContain("!diagnosticsEnabled || !results");
    expect(code).toContain('[diagnosticsEnabled]);');
    expect((code.match(/PwaInstallDiagnostics installPrompt=/g) || []).length).toBe(3);
  });

  it('строки настройки есть в ru и en', () => {
    expect(ru.settings.pwaDiagnosticsTitle).toContain('Диагностика');
    expect(ru.settings.pwaDiagnosticsDescription).toContain('Включайте');
    expect(en.settings.pwaDiagnosticsTitle).toBe('Install diagnostics');
    expect(en.settings.pwaDiagnosticsDescription).toContain('troubleshooting');
  });
});
