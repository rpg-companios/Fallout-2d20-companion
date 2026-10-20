// Стор обновлений: что находится, что ставится и что не предлагается повторно.
// Сеть, скачивание и установка пакета замоканы — проверяются решения стора.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSettingReleaseIndex: vi.fn(),
  downloadSettingRelease: vi.fn(),
  verifySettingRelease: vi.fn(),
  installLocalPackage: vi.fn(),
  selectSetting: vi.fn(),
  packState: { installed: [], activeId: null },
}));

vi.mock('../../src/engine/settings/settingReleaseClient', () => ({
  fetchSettingReleaseIndex: mocks.fetchSettingReleaseIndex,
  downloadSettingRelease: mocks.downloadSettingRelease,
  verifySettingRelease: mocks.verifySettingRelease,
}));

vi.mock('../../src/store/settingPackStore', () => {
  const useSettingPackStore = () => mocks.packState;
  useSettingPackStore.getState = () => mocks.packState;
  return { default: useSettingPackStore };
});

vi.mock('../../settings/release-sources.json', () => ({
  default: {
    defaults: { checkIntervalHours: 6 },
    settings: {
      fallout: {
        repository: 'rpg-companios/positronium-game-settings',
        branch: 'main',
        autoInstall: true,
      },
    },
  },
}));

import useSettingUpdateStore, {
  listReleaseSources,
  selectSettingUpdatePlans,
} from '../../src/store/settingUpdateStore';

const release = {
  id: 'fallout',
  name: 'Fallout 2d20',
  version: 2,
  packFormat: 1,
  requiresCore: '>=1.0',
  tag: 'fallout-v2',
  asset: 'fallout.trpg',
  bytes: 4,
  sha256: 'c'.repeat(64),
  assetUrl: 'https://github.com/rpg-companios/positronium-game-settings/releases/download/fallout-v2/fallout.trpg',
  latestUrl: 'https://github.com/rpg-companios/positronium-game-settings/releases/latest/download/fallout.trpg',
};

const reset = () => {
  useSettingUpdateStore.setState({
    hydrated: true,
    status: 'idle',
    error: null,
    lastCheckedAt: 0,
    plans: {},
    dismissed: {},
    installingId: null,
  });
  mocks.packState.installed = [{ id: 'fallout', version: 1 }];
  mocks.packState.activeId = 'fallout';
  mocks.packState.installLocalPackage = mocks.installLocalPackage;
  mocks.packState.selectSetting = mocks.selectSetting;
  mocks.fetchSettingReleaseIndex.mockReset();
  mocks.downloadSettingRelease.mockReset();
  mocks.verifySettingRelease.mockReset();
  mocks.installLocalPackage.mockReset();
  mocks.selectSetting.mockReset();
};

const indexWith = (entry) => ({ index: { schemaVersion: 1, settings: { fallout: entry } } });

describe('стор обновлений сеттинга', () => {
  beforeEach(reset);

  it('источник из settings/release-sources.json читается', () => {
    const sources = listReleaseSources();
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ id: 'fallout', autoInstall: true });
  });

  it('новая версия попадает в план; старая — нет', async () => {
    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith(release));
    const plans = await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    expect(plans).toHaveLength(1);
    expect(selectSettingUpdatePlans(useSettingUpdateStore.getState()).fallout.toVersion).toBe(2);

    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith({ ...release, version: 1 }));
    const second = await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    expect(second).toEqual([]);
  });

  it('несовместимое ядро не превращается в предложение обновиться', async () => {
    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith({ ...release, requiresCore: '>=99.0' }));
    const plans = await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    expect(plans).toEqual([]);
  });

  it('не чаще интервала; force игнорирует интервал', async () => {
    const now = Date.now();
    useSettingUpdateStore.setState({ lastCheckedAt: now });
    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith(release));
    await useSettingUpdateStore.getState().checkForUpdates({ now: now + 1000 });
    expect(mocks.fetchSettingReleaseIndex).not.toHaveBeenCalled();

    await useSettingUpdateStore.getState().checkForUpdates({ now: now + 1000, force: true });
    expect(mocks.fetchSettingReleaseIndex).toHaveBeenCalledTimes(1);
  });

  it('сеттинг без установленного пакета не проверяется', async () => {
    mocks.packState.installed = [];
    const plans = await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    expect(plans).toEqual([]);
    expect(mocks.fetchSettingReleaseIndex).not.toHaveBeenCalled();
  });

  it('сбой сети не роняет стор: статус error и текст ошибки', async () => {
    mocks.fetchSettingReleaseIndex.mockRejectedValue(new Error('HTTP 404'));
    await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    expect(useSettingUpdateStore.getState().status).toBe('error');
    expect(useSettingUpdateStore.getState().error).toMatch(/HTTP 404/);
  });

  it('отклонённая версия не предлагается снова, пока не выйдет следующая', async () => {
    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith(release));
    await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    useSettingUpdateStore.getState().dismissUpdate('fallout');

    expect(await useSettingUpdateStore.getState().checkForUpdates({ force: true })).toEqual([]);

    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith({ ...release, version: 3 }));
    const later = await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    expect(later[0].toVersion).toBe(3);
  });

  it('установка: скачать → проверить сумму → поставить → перезапустить активный', async () => {
    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith(release));
    await useSettingUpdateStore.getState().checkForUpdates({ force: true });

    const bytes = new Uint8Array([1, 2, 3, 4]);
    mocks.downloadSettingRelease.mockResolvedValue({ bytes, name: 'fallout.trpg' });
    mocks.verifySettingRelease.mockResolvedValue('verified');
    mocks.installLocalPackage.mockResolvedValue(undefined);
    mocks.selectSetting.mockResolvedValue(undefined);

    const result = await useSettingUpdateStore.getState().installUpdate('fallout');

    expect(mocks.verifySettingRelease).toHaveBeenCalledWith(bytes, release);
    expect(mocks.installLocalPackage).toHaveBeenCalledWith({ name: 'fallout.trpg', bytes });
    expect(mocks.selectSetting).toHaveBeenCalledWith('fallout');
    expect(result).toEqual({ version: 2 });
    expect(selectSettingUpdatePlans(useSettingUpdateStore.getState())).toEqual({});
  });

  it('неактивный сеттинг ставится, но не выбирается', async () => {
    mocks.packState.activeId = 'other';
    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith(release));
    await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    mocks.downloadSettingRelease.mockResolvedValue({ bytes: new Uint8Array(4), name: 'fallout.trpg' });
    mocks.verifySettingRelease.mockResolvedValue('verified');

    await useSettingUpdateStore.getState().installUpdate('fallout');
    expect(mocks.installLocalPackage).toHaveBeenCalled();
    expect(mocks.selectSetting).not.toHaveBeenCalled();
  });

  it('проверка суммы не прошла — пакет не устанавливается, ошибка сохраняется', async () => {
    mocks.fetchSettingReleaseIndex.mockResolvedValue(indexWith(release));
    await useSettingUpdateStore.getState().checkForUpdates({ force: true });
    mocks.downloadSettingRelease.mockResolvedValue({ bytes: new Uint8Array(4), name: 'fallout.trpg' });
    mocks.verifySettingRelease.mockRejectedValue(new Error('sha256 mismatch'));

    await expect(useSettingUpdateStore.getState().installUpdate('fallout')).rejects.toThrow(/sha256/);
    expect(mocks.installLocalPackage).not.toHaveBeenCalled();
    expect(useSettingUpdateStore.getState().error).toMatch(/sha256/);
  });

  it('установка без найденного плана — явная ошибка', async () => {
    await expect(useSettingUpdateStore.getState().installUpdate('fallout')).rejects.toThrow(/no pending update/);
  });
});
