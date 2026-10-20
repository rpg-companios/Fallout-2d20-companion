import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveSettingRuntime } from '../../src/engine/settings/activeSettingRuntime';
import {
  getActiveModuleId,
  getModuleLocales,
  getModuleManifest,
  getRegisteredModuleIds,
  resolveModuleLocale,
  shouldOfferModuleLocaleChoice,
} from '../../domain/moduleLocale';

beforeEach(() => setActiveSettingRuntime(null));
afterEach(() => setActiveSettingRuntime(null));

describe('active setting locale metadata', () => {
  it('has no built-in setting locale or module while no package is active', () => {
    expect(getActiveModuleId()).toBeNull();
    expect(getRegisteredModuleIds()).toEqual([]);
    expect(getModuleLocales()).toEqual([]);
    expect(resolveModuleLocale({ engineLocale: 'en-EN' })).toBe('en-EN');
    expect(shouldOfferModuleLocaleChoice({ engineLocale: 'de-DE' })).toBe(false);
    expect(() => getModuleManifest()).toThrow('не активирован');
  });

  it('reads the locale manifest from the currently active package', () => {
    setActiveSettingRuntime({
      id: 'custom-setting',
      manifest: {
        id: 'custom-setting',
        defaultLocale: 'fr-FR',
        locales: ['fr-FR', 'en-EN'],
      },
    });

    expect(getActiveModuleId()).toBe('custom-setting');
    expect(getRegisteredModuleIds()).toEqual(['custom-setting']);
    expect(getModuleLocales()).toEqual(['fr-FR', 'en-EN']);
    expect(resolveModuleLocale({ engineLocale: 'en-EN' })).toBe('en-EN');
    expect(resolveModuleLocale({ engineLocale: 'ru-RU' })).toBe('fr-FR');
    expect(shouldOfferModuleLocaleChoice({ engineLocale: 'ru-RU' })).toBe(true);
  });

  it('switches locale metadata with the active package instead of retaining Fallout', () => {
    setActiveSettingRuntime({
      id: 'setting-one',
      manifest: { id: 'setting-one', defaultLocale: 'en-EN', locales: ['en-EN'] },
    });
    expect(getActiveModuleId()).toBe('setting-one');

    setActiveSettingRuntime({
      id: 'setting-two',
      manifest: { id: 'setting-two', defaultLocale: 'ru-RU', locales: ['ru-RU'] },
    });

    expect(getActiveModuleId()).toBe('setting-two');
    expect(getModuleLocales()).toEqual(['ru-RU']);
    expect(resolveModuleLocale({ engineLocale: 'en-EN' })).toBe('ru-RU');
  });
});
