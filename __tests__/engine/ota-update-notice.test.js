import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showRawAlert } = vi.hoisted(() => ({ showRawAlert: vi.fn() }));

vi.mock('../../components/alerts/alertService', () => ({ showRawAlert }));
vi.mock('../../i18n/appI18n', () => ({ tApp: (key) => key }));
vi.mock('../../src/engine/debug/runtimeTrace', () => ({ debugLog: () => {} }));

import { checkForOtaUpdate, resetOtaUpdateCheck } from '../../src/utils/otaUpdates';

const fakeUpdates = (overrides = {}) => ({
  isEnabled: true,
  checkForUpdateAsync: vi.fn(async () => ({ isAvailable: true })),
  fetchUpdateAsync: vi.fn(async () => ({ isNew: true })),
  reloadAsync: vi.fn(async () => {}),
  ...overrides,
});

describe('OTA update notice', () => {
  beforeEach(() => {
    resetOtaUpdateCheck();
    showRawAlert.mockReset();
    showRawAlert.mockResolvedValue(1);
  });

  it('skips the web platform', async () => {
    await expect(checkForOtaUpdate({ platform: 'web' })).resolves.toEqual({ status: 'skipped' });
  });

  it('stays quiet when updates are disabled in the binary', async () => {
    const updates = fakeUpdates({ isEnabled: false });
    await expect(checkForOtaUpdate({ Updates: updates, platform: 'android' }))
      .resolves.toEqual({ status: 'disabled' });
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('stays quiet when there is nothing new', async () => {
    const updates = fakeUpdates({ checkForUpdateAsync: vi.fn(async () => ({ isAvailable: false })) });
    await expect(checkForOtaUpdate({ Updates: updates, platform: 'android' }))
      .resolves.toEqual({ status: 'none' });
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(showRawAlert).not.toHaveBeenCalled();
  });

  it('downloads in the background and asks before restarting', async () => {
    const updates = fakeUpdates();
    showRawAlert.mockResolvedValue(1);

    await expect(checkForOtaUpdate({ Updates: updates, platform: 'android' }))
      .resolves.toEqual({ status: 'downloaded' });

    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(showRawAlert).toHaveBeenCalledTimes(1);
    expect(showRawAlert.mock.calls[0][0]).toMatchObject({
      title: 'otaUpdate.title',
      message: 'otaUpdate.message',
      kind: 'choice',
    });
    // «Позже»: бандл применится на следующем холодном старте.
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('reloads when the player chooses to restart now', async () => {
    const updates = fakeUpdates();
    showRawAlert.mockResolvedValue(0);

    await checkForOtaUpdate({ Updates: updates, platform: 'android' });

    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('checks only once per session', async () => {
    const updates = fakeUpdates();
    await checkForOtaUpdate({ Updates: updates, platform: 'android' });
    await checkForOtaUpdate({ Updates: updates, platform: 'android' });

    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('survives check and fetch failures', async () => {
    const failingCheck = fakeUpdates({ checkForUpdateAsync: vi.fn(async () => { throw new Error('offline'); }) });
    await expect(checkForOtaUpdate({ Updates: failingCheck, platform: 'android' }))
      .resolves.toEqual({ status: 'error' });

    resetOtaUpdateCheck();
    const failingFetch = fakeUpdates({ fetchUpdateAsync: vi.fn(async () => { throw new Error('offline'); }) });
    await expect(checkForOtaUpdate({ Updates: failingFetch, platform: 'android' }))
      .resolves.toEqual({ status: 'error' });
    expect(showRawAlert).not.toHaveBeenCalled();
  });
});
