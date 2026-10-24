// Проверка пути сохранения на WEB-адаптере (PWA, браузер, WebView).
//
// На телефоне в APK база — expo-sqlite, в браузере — db/adapters/WebAdapter.js
// поверх AsyncStorage (localStorage). Один и тот же движок, разное хранилище;
// поэтому «а не работает ли оно и в браузере» проверяется здесь, без браузера.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// AsyncStorage в браузере — это localStorage: держим его в памяти.
const store = new Map();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn(async (key, value) => { store.set(key, value); }),
    removeItem: vi.fn(async (key) => { store.delete(key); }),
  },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn(async () => {}),
  showAlert: vi.fn(async () => null),
  confirmAlert: vi.fn(async () => false),
}));
vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn(async () => {}),
}));

import * as db from '../../db';
import { getCharactersList, loadCharacter, saveCharacter, getLastSaveError } from '../../src/saves/characterSaves';

describe('PWA: персонаж сохраняется через веб-адаптер', () => {
  beforeEach(async () => {
    store.clear();
    await db.initDatabase();
  });

  it('сохранение пишет строку и снимает флаг «не сохранён»', async () => {
    const id = await saveCharacter('Пилигрим');
    expect(getLastSaveError()).toBeNull();
    expect(typeof id).toBe('string');

    const rows = await db.getCharactersList();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, name: 'Пилигрим' });
  });

  it('сохранённый персонаж читается обратно', async () => {
    const id = await saveCharacter('Пилигрим');
    const ok = await loadCharacter(id);
    expect(ok).toBe(true);
    const rounds = await getCharactersList();
    expect(rounds.map((row) => row.name)).toEqual(['Пилигрим']);
  });
});
