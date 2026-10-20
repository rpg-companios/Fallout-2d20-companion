// Запуск проверки обновлений при старте приложения (слово владельца
// 2026-10-20): сеттинг смотрит в свой репозиторий. Здесь — правила запуска:
// один раз за сессию, только после гидратации, и подтверждение первой
// установки независимо от autoInstall.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showAlert: vi.fn(),
  checkForUpdates: vi.fn(),
  installUpdate: vi.fn(),
  dismissUpdate: vi.fn(),
  hydrated: true,
}));

vi.mock('../../components/alerts/alertService', () => ({ showAlert: mocks.showAlert }));

vi.mock('../../src/store/settingUpdateStore', () => {
  const useSettingUpdateStore = () => undefined;
  useSettingUpdateStore.getState = () => ({
    hydrated: mocks.hydrated,
    checkForUpdates: mocks.checkForUpdates,
    installUpdate: mocks.installUpdate,
    dismissUpdate: mocks.dismissUpdate,
  });
  return { default: useSettingUpdateStore };
});

vi.mock('../../src/engine/debug/runtimeTrace', () => ({ debugLog: vi.fn() }));

vi.mock('../../settings/release-sources.json', () => ({
  default: {
    defaults: { checkIntervalHours: 6 },
    settings: {
      fallout: { repository: 'rpg-companios/positronium-game-settings', branch: 'main', autoInstall: true },
      community: { repository: 'someone/community-setting', branch: 'main' },
    },
  },
}));

import {
  resetSettingUpdateBootstrap,
  runSettingUpdateCheck,
  startSettingUpdateBootstrap,
} from '../../src/utils/settingUpdates';

const plan = (overrides = {}) => ({
  settingId: 'fallout',
  fromVersion: 1,
  toVersion: 2,
  installed: true,
  release: { asset: 'fallout.trpg' },
  ...overrides,
});

describe('обновление сеттинга при запуске', () => {
  beforeEach(() => {
    resetSettingUpdateBootstrap();
    mocks.hydrated = true;
    mocks.showAlert.mockReset();
    mocks.checkForUpdates.mockReset();
    mocks.installUpdate.mockReset();
    mocks.dismissUpdate.mockReset();
    mocks.checkForUpdates.mockResolvedValue([]);
    mocks.installUpdate.mockResolvedValue({ version: 2 });
  });

  it('обновление установленного Fallout ставится без вопроса (autoInstall)', async () => {
    mocks.checkForUpdates.mockResolvedValue([plan()]);
    const results = await runSettingUpdateCheck({ notify: false });
    expect(mocks.showAlert).not.toHaveBeenCalled();
    expect(mocks.installUpdate).toHaveBeenCalledWith('fallout', expect.any(Object));
    expect(results).toEqual([{ settingId: 'fallout', version: 2, installed: true }]);
  });

  it('первую установку спрашиваем даже при autoInstall', async () => {
    mocks.checkForUpdates.mockResolvedValue([plan({ installed: false, fromVersion: 0 })]);
    mocks.showAlert.mockResolvedValue(false);
    const results = await runSettingUpdateCheck({ notify: false });
    expect(mocks.showAlert).toHaveBeenCalledWith('settingUpdateAvailable', expect.any(Object));
    expect(mocks.installUpdate).not.toHaveBeenCalled();
    expect(mocks.dismissUpdate).toHaveBeenCalledWith('fallout');
    expect(results[0].installed).toBe(false);
  });

  it('коммьюнити-сеттинг без autoInstall спрашивает и ставится после согласия', async () => {
    mocks.checkForUpdates.mockResolvedValue([plan({ settingId: 'community' })]);
    mocks.showAlert.mockResolvedValue(true);
    await runSettingUpdateCheck({ notify: false });
    expect(mocks.installUpdate).toHaveBeenCalledWith('community', expect.any(Object));
  });

  it('сбой установки не рвёт запуск: результат installed=false и уведомление', async () => {
    mocks.checkForUpdates.mockResolvedValue([plan()]);
    mocks.installUpdate.mockRejectedValue(new Error('sha256 mismatch'));
    const results = await runSettingUpdateCheck({ prompt: false });
    expect(results[0].installed).toBe(false);
    expect(mocks.showAlert).toHaveBeenCalledWith('settingUpdateFailed', expect.any(Object));
  });

  it('сбой проверки (нет сети) не мешает запуску', async () => {
    mocks.checkForUpdates.mockRejectedValue(new Error('network down'));
    await expect(runSettingUpdateCheck()).resolves.toEqual([]);
    expect(mocks.installUpdate).not.toHaveBeenCalled();
  });

  it('проверка идёт один раз за сессию', async () => {
    await startSettingUpdateBootstrap();
    await startSettingUpdateBootstrap();
    expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('до гидратации стора проверка не стартует', async () => {
    mocks.hydrated = false;
    await expect(startSettingUpdateBootstrap()).resolves.toEqual([]);
    expect(mocks.checkForUpdates).not.toHaveBeenCalled();
  });
});
