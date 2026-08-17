import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ENGINE_SETTINGS,
  getSettingById,
  getSettingsForSurface,
  SETTING_CONTROL_SURFACES,
} from '../../domain/settingsCatalog';
import useAppSettingsStore from '../../src/store/appSettingsStore';

const root = process.cwd();
const ids = (settings) => settings.map((setting) => setting.id);

beforeEach(() => {
  useAppSettingsStore.getState().setValue('bootScreenEnabled', false);
});

describe('boot screen engine setting', () => {
  it('is engine-owned, disabled by default, and controlled from general settings', () => {
    expect(ids(ENGINE_SETTINGS)).toContain('bootScreenEnabled');
    expect(getSettingById('bootScreenEnabled')).toMatchObject({
      type: 'boolean',
      controlSurface: SETTING_CONTROL_SURFACES.SETTINGS,
      sectionKey: 'appearance',
      defaultValue: false,
    });
    expect(ids(getSettingsForSurface(SETTING_CONTROL_SURFACES.SETTINGS)))
      .toContain('bootScreenEnabled');
  });

  it('has engine translations in both supported interface languages', () => {
    const expected = {
      'ru-RU': ['Экран запуска Positronium', 'Показывать заставку движка при запуске приложения.'],
      'en-EN': ['Positronium startup screen', 'Show the engine startup screen when the application launches.'],
    };

    for (const [locale, strings] of Object.entries(expected)) {
      const dictionary = JSON.parse(readFileSync(
        path.join(root, `i18n/${locale}/screens/home/screen.json`),
        'utf8',
      ));
      expect([
        dictionary.settings.bootScreenTitle,
        dictionary.settings.bootScreenDescription,
      ]).toEqual(strings);
    }
  });

  it('stores manual enabling in the engine scope', () => {
    expect(useAppSettingsStore.getState().getSettingValue('bootScreenEnabled')).toBe(false);

    useAppSettingsStore.getState().setValue('bootScreenEnabled', true);

    expect(useAppSettingsStore.getState().values.engine.bootScreenEnabled).toBe(true);
    expect(useAppSettingsStore.getState().getSettingValue('bootScreenEnabled')).toBe(true);
  });

  it('adds the disabled default while migrating older nested settings', () => {
    const migrate = useAppSettingsStore.persist.getOptions().migrate;
    const migrated = migrate({
      values: {
        engine: { language: 'ru-RU' },
        fallout: { weaponCardsDisplayMode: 'cards' },
      },
    }, 1);

    expect(migrated.values.engine.bootScreenEnabled).toBe(false);
  });

  it('signals the application when persisted settings are hydrated', async () => {
    useAppSettingsStore.setState({ settingsHydrated: false });
    expect(useAppSettingsStore.getState().settingsHydrated).toBe(false);

    await useAppSettingsStore.persist.rehydrate();

    expect(useAppSettingsStore.getState().settingsHydrated).toBe(true);
  });
});
