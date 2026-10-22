// Проверка обновлений движка: сеть (fetch) и решения стора.
// fetch внедряется через параметр — в тестах никакой реальной сети.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAppRelease } from '../../src/engine/updates/appReleaseClient';
import useAppUpdateStore, {
  APP_UPDATE_CHECK_INTERVAL_HOURS,
  shouldCheckAppUpdate,
} from '../../src/store/appUpdateStore';
import { ENGINE_VERSION } from '../../src/engine/version';

const INDEX = {
  schemaVersion: 1,
  version: '9.9.9',
  tag: 'engine-v9.9.9',
  repository: 'rpg-companios/ttrpg-engine',
  asset: 'positronium.apk',
  notes: { 'ru-RU': ['Новая версия'], 'en-EN': ['New version'] },
};

const response = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

const reset = () => {
  useAppUpdateStore.setState({
    hydrated: true,
    status: 'idle',
    error: null,
    lastCheckedAt: 0,
    dismissedVersion: null,
    plan: null,
  });
};

describe('fetchAppRelease', () => {
  it('валидный индекс возвращается разобранным', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(INDEX));
    const result = await fetchAppRelease({ fetchImpl });
    expect(result.release.version).toBe('9.9.9');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('404 и кривой JSON — исключения с понятным текстом', async () => {
    await expect(fetchAppRelease({ fetchImpl: vi.fn().mockResolvedValue(response(null, { ok: false, status: 404 })) }))
      .rejects.toThrow(/HTTP 404/);
    await expect(fetchAppRelease({
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('boom'); } }),
    })).rejects.toThrow(/not valid JSON/);
    await expect(fetchAppRelease({ fetchImpl: vi.fn().mockResolvedValue(response({ version: 'latest' })) }))
      .rejects.toThrow(/not a recognized app-release index/);
  });
});

describe('стор обновлений приложения', () => {
  beforeEach(reset);

  it('новая версия → план с постоянной ссылкой на APK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(INDEX));
    const plan = await useAppUpdateStore.getState().checkForUpdate({ fetchImpl, now: 1000 });

    expect(plan.status).toBe('available');
    expect(plan.downloadUrl).toContain('/releases/latest/download/positronium.apk');
    const state = useAppUpdateStore.getState();
    expect(state.plan?.version).toBe('9.9.9');
    expect(state.lastCheckedAt).toBe(1000);
  });

  it('та же версия → план пуст, «нет новее»', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ ...INDEX, version: ENGINE_VERSION }));
    const plan = await useAppUpdateStore.getState().checkForUpdate({ fetchImpl });
    expect(plan.status).toBe('current');
    expect(useAppUpdateStore.getState().plan).toBeNull();
  });

  it('повторная проверка раньше интервала не ходит в сеть', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(INDEX));
    const now = 10 * 60 * 60 * 1000;
    await useAppUpdateStore.getState().checkForUpdate({ fetchImpl, now });
    await useAppUpdateStore.getState().checkForUpdate({ fetchImpl, now: now + 60 * 1000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('интервал: 6 часов, force и пустая история проверяются', () => {
    expect(APP_UPDATE_CHECK_INTERVAL_HOURS).toBe(6);
    expect(shouldCheckAppUpdate({ lastCheckedAt: 0, now: 1 })).toBe(true);
    expect(shouldCheckAppUpdate({ lastCheckedAt: 1000, now: 1000 + 60 * 60 * 1000 })).toBe(false);
    expect(shouldCheckAppUpdate({ lastCheckedAt: 1000, now: 1000 + 7 * 60 * 60 * 1000 })).toBe(true);
    expect(shouldCheckAppUpdate({ lastCheckedAt: 1000, now: 1001, force: true })).toBe(true);
  });

  it('«Позже» скрывает версию, следующая снова показывается', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(INDEX));
    await useAppUpdateStore.getState().checkForUpdate({ fetchImpl, now: 1000 });
    useAppUpdateStore.getState().dismissUpdate();

    expect(useAppUpdateStore.getState().dismissedVersion).toBe('9.9.9');
    expect(useAppUpdateStore.getState().plan).toBeNull();

    const again = await useAppUpdateStore.getState().checkForUpdate({ fetchImpl, now: 2000, force: true });
    expect(again.status).toBe('dismissed');
    expect(useAppUpdateStore.getState().plan).toBeNull();
  });

  it('ручная проверка показывает отложенную версию', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(INDEX));
    await useAppUpdateStore.getState().checkForUpdate({ fetchImpl, now: 1000 });
    useAppUpdateStore.getState().dismissUpdate();
    const plan = await useAppUpdateStore
      .getState()
      .checkForUpdate({ fetchImpl, now: 2000, force: true, includeDismissed: true });
    expect(plan.status).toBe('available');
    expect(useAppUpdateStore.getState().plan?.version).toBe('9.9.9');
  });

  it('сеть упала → статус error, игра продолжается', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    const plan = await useAppUpdateStore.getState().checkForUpdate({ fetchImpl });
    expect(plan.status).toBe('error');
    const state = useAppUpdateStore.getState();
    expect(state.status).toBe('error');
    expect(state.plan).toBeNull();
    expect(state.error).toMatch(/offline/);
  });
});
