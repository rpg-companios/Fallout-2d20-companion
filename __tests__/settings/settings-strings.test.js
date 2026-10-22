// Строки настроек сеттинга глазами движка.
//
// SettingsModal читает подписи из КОРНЯ names активного сеттинга
// (`settings.<ключ>`), а не из names.system: так устроен контракт
// labelKey/descriptionKey/sectionKey в modules/<id>/settings.json. Если
// перенести словарь внутрь system, окно настроек падает на первом же
// разделе («В активном сеттинге отсутствует строка "settings.survival"»).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import settings from '../../modules/fallout/settings.json';
import { SETTING } from '../../modules/fallout/index.js';
import { setActiveSettingRuntime } from '../../src/engine/settings/activeSettingRuntime';
import { getSettingNames } from '../../domain/registry';
import { getAllSettings } from '../../domain/settingsCatalog';

const LOCALES = ['ru-RU', 'en-EN'];

const resolve = (dictionary, key) => key
  .split('.')
  .reduce((value, part) => (value && typeof value === 'object' ? value[part] : undefined), dictionary);

const activateFallout = () => setActiveSettingRuntime({
  id: SETTING.meta.id,
  manifest: SETTING.meta,
  setting: SETTING,
  settings,
});

beforeEach(activateFallout);
afterEach(() => setActiveSettingRuntime(null));

describe('строки настроек Fallout', () => {
  it('каждый labelKey и descriptionKey находится в корне names', () => {
    const declared = new Set(settings.map((setting) => setting.id));
    const active = getAllSettings().filter((setting) => declared.has(setting.id));
    expect(active).toHaveLength(settings.length);
    for (const locale of LOCALES) {
      const names = getSettingNames(locale);
      expect(names.settings, `${locale}: нет корневого словаря settings`).toBeTruthy();
      for (const setting of active) {
        expect(resolve(names, setting.labelKey), `${locale}: ${setting.labelKey}`)
          .toEqual(expect.any(String));
        expect(resolve(names, setting.descriptionKey), `${locale}: ${setting.descriptionKey}`)
          .toEqual(expect.any(String));
        for (const option of setting.options ?? []) {
          if (!option.labelKey) continue;
          expect(resolve(names, option.labelKey), `${locale}: ${option.labelKey}`)
            .toEqual(expect.any(String));
        }
      }
    }
  });

  it('каждый раздел окна настроек подписан', () => {
    const sections = [...new Set(settings.map((setting) => setting.sectionKey))];
    expect(sections.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      const names = getSettingNames(locale);
      for (const section of sections) {
        expect(resolve(names, `settings.${section}`), `${locale}: settings.${section}`)
          .toEqual(expect.any(String));
      }
    }
  });

  it('словарь настроек живёт в одном месте — нет копии в system', () => {
    // getFalloutModuleI18n читает корневой settings; копия в system.settings
    // рано или поздно разошлась бы.
    for (const locale of LOCALES) {
      expect(SETTING.names[locale].system.settings).toBeUndefined();
    }
  });
});
