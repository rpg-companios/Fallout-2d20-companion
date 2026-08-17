/**
 * Контракт владения настройками и независимых языков движка/сеттинга.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  ENGINE_SETTINGS,
  getAllSettings,
  getModuleSettings,
  getSettingById,
  getSettingsForSurface,
  SETTING_CONTROL_SURFACES,
} from '../../domain/settingsCatalog';
import {
  getActiveModuleId,
  getModuleManifest,
  resolveLocaleFromManifest,
  resolveModuleLocale,
  shouldOfferLocaleChoiceForManifest,
} from '../../domain/moduleLocale';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import {
  getCurrentLocale,
  getCurrentModuleLocale,
} from '../../i18n/locale';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const ids = (settings) => settings.map((setting) => setting.id);

const resetStore = () => {
  useAppSettingsStore.setState({
    values: {
      engine: {
        characterFoldersEnabled: false,
        characterDeleteActionPlacement: 'menu',
        language: 'ru-RU',
      },
      fallout: {
        weaponDurabilityLossEnabled: false,
        weaponDurabilityLossPer10Shots: 1,
        randomWeaponQualityEnabled: false,
        unarmedAttackVisible: true,
        weaponCardsDisplayMode: 'cards',
      },
    },
    moduleLocales: {},
  });
  useAppSettingsStore.getState().setValue('language', 'ru-RU');
};

describe('Владение настройками и экраны управления', () => {
  it('движок владеет менеджером персонажей и языком интерфейса', () => {
    expect(ids(ENGINE_SETTINGS)).toEqual([
      'characterFoldersEnabled',
      'characterDeleteActionPlacement',
      'language',
    ]);
    expect(getSettingById('language')).toMatchObject({
      controlSurface: SETTING_CONTROL_SURFACES.CHARACTERS,
      defaultValue: 'ru-RU',
    });
  });

  it('Fallout владеет механиками оружия и показывает только cards/spoilers', () => {
    const settings = getModuleSettings();
    expect(ids(settings)).toEqual([
      'weaponDurabilityLossEnabled',
      'weaponDurabilityLossPer10Shots',
      'randomWeaponQualityEnabled',
      'unarmedAttackVisible',
      'weaponCardsDisplayMode',
    ]);
    expect(getSettingById('weaponCardsDisplayMode')).toMatchObject({
      controlSurface: SETTING_CONTROL_SURFACES.EQUIPMENT,
      options: [{ value: 'cards' }, { value: 'spoilers' }],
    });
    expect(getAllSettings()).toHaveLength(8);
  });

  it('общее окно получает только назначенные ему движковые и Fallout-настройки', () => {
    expect(ids(getSettingsForSurface(SETTING_CONTROL_SURFACES.SETTINGS))).toEqual([
      'characterFoldersEnabled',
      'characterDeleteActionPlacement',
      'weaponDurabilityLossEnabled',
      'weaponDurabilityLossPer10Shots',
      'randomWeaponQualityEnabled',
    ]);
    expect(ids(getSettingsForSurface(SETTING_CONTROL_SURFACES.CHARACTERS))).toEqual(['language']);
    expect(ids(getSettingsForSurface(SETTING_CONTROL_SURFACES.EQUIPMENT))).toEqual([
      'unarmedAttackVisible',
      'weaponCardsDisplayMode',
    ]);
  });

  it('неиспользуемые тексты сохранены, а локализованные подписи режима добавлены', () => {
    for (const locale of ['ru-RU', 'en-EN']) {
      const moduleDict = JSON.parse(readFileSync(
        path.join(root, `modules/fallout/i18n/${locale}/data/system/settings.json`),
        'utf-8',
      ));
      expect(moduleDict.combat).toBeTruthy();
      expect(moduleDict.unarmedTitle).toBeTruthy();
      expect(moduleDict.unarmedDescription).toBeTruthy();
      expect(moduleDict.interface).toBeTruthy();
      expect(moduleDict.languageTitle).toBeTruthy();
      expect(moduleDict.languageDescription).toBeTruthy();
      expect(moduleDict.cardsTitle).toBeTruthy();
      expect(moduleDict.cards.cards).toBeTruthy();
      expect(moduleDict.cards.spoilers).toBeTruthy();

      const engineDict = JSON.parse(readFileSync(
        path.join(root, `i18n/${locale}/screens/home/screen.json`),
        'utf-8',
      ));
      expect(engineDict.language.russian).toBe('Ru');
      expect(engineDict.language.english).toBe('En');
      expect(engineDict.language.settingTitle).toBeTruthy();
      expect(engineDict.language.localeCode).toContain('{code}');
    }
  });
});

describe('Разрешение языка сеттинга', () => {
  it('manifest Fallout явно объявляет локали и defaultLocale', () => {
    expect(getActiveModuleId()).toBe('fallout');
    expect(getModuleManifest()).toMatchObject({
      id: 'fallout',
      locales: ['ru-RU', 'en-EN'],
      defaultLocale: 'ru-RU',
    });
  });

  it('одна локаль всегда принудительна и не показывает второй переключатель', () => {
    const manifest = { id: 'single', locales: ['xx-XX'], defaultLocale: 'xx-XX' };
    expect(resolveLocaleFromManifest({
      manifest,
      engineLocale: 'ru-RU',
      manualLocale: 'unsupported-manual-value',
    })).toBe('xx-XX');
    expect(shouldOfferLocaleChoiceForManifest({ manifest, engineLocale: 'ru-RU' })).toBe(false);
  });

  it('ручной выбор приоритетнее совпадающего языка движка', () => {
    const manifest = {
      id: 'multi',
      locales: ['ru-RU', 'en-EN'],
      defaultLocale: 'ru-RU',
    };
    expect(resolveLocaleFromManifest({
      manifest,
      engineLocale: 'en-EN',
      manualLocale: 'ru-RU',
    })).toBe('ru-RU');
  });

  it('без ручного выбора использует совпадение, иначе defaultLocale и переключатель', () => {
    expect(resolveModuleLocale({ engineLocale: 'en-EN' })).toBe('en-EN');

    const manifest = {
      id: 'multi',
      locales: ['aa-AA', 'bb-BB'],
      defaultLocale: 'bb-BB',
    };
    expect(resolveLocaleFromManifest({ manifest, engineLocale: 'ru-RU' })).toBe('bb-BB');
    expect(shouldOfferLocaleChoiceForManifest({ manifest, engineLocale: 'ru-RU' })).toBe(true);
    expect(shouldOfferLocaleChoiceForManifest({ manifest, engineLocale: 'aa-AA' })).toBe(false);
  });
});

describe('Стор и миграция настроек', () => {
  beforeEach(resetStore);

  it('хранит язык в engine, а режим карточек в Fallout', () => {
    const state = useAppSettingsStore.getState();
    state.setValue('language', 'en-EN');
    state.setValue('weaponCardsDisplayMode', 'spoilers');

    expect(useAppSettingsStore.getState().values.engine.language).toBe('en-EN');
    expect(useAppSettingsStore.getState().values.engine.weaponCardsDisplayMode).toBeUndefined();
    expect(useAppSettingsStore.getState().values.fallout.weaponCardsDisplayMode).toBe('spoilers');
    expect(useAppSettingsStore.getState().values.fallout.language).toBeUndefined();
    expect(getCurrentLocale()).toBe('en-EN');
    expect(getCurrentModuleLocale()).toBe('en-EN');
  });

  it('помнит ручной язык по модулю и сохраняет его при смене языка движка', () => {
    const state = useAppSettingsStore.getState();
    state.setModuleLocale('fallout', 'ru-RU');
    state.setValue('language', 'en-EN');

    expect(useAppSettingsStore.getState().moduleLocales).toEqual({ fallout: 'ru-RU' });
    expect(getCurrentLocale()).toBe('en-EN');
    expect(getCurrentModuleLocale()).toBe('ru-RU');
  });

  it('не позволяет Fallout выбрать неактивный tabs', () => {
    useAppSettingsStore.getState().setValue('weaponCardsDisplayMode', 'tabs');
    expect(useAppSettingsStore.getState().getSettingValue('weaponCardsDisplayMode')).toBe('cards');
  });

  it('v1 переносит владельцев и мигрирует сохранённый tabs в cards', () => {
    const migrate = useAppSettingsStore.persist.getOptions().migrate;
    const migrated = migrate({
      values: {
        engine: {
          characterFoldersEnabled: true,
          characterDeleteActionPlacement: 'card',
          weaponCardsDisplayMode: 'tabs',
        },
        fallout: {
          weaponDurabilityLossEnabled: true,
          weaponDurabilityLossPer10Shots: 3,
          randomWeaponQualityEnabled: true,
          unarmedAttackVisible: false,
          language: 'en-EN',
        },
      },
    }, 1);

    expect(migrated.values.engine).toMatchObject({
      characterFoldersEnabled: true,
      characterDeleteActionPlacement: 'card',
      language: 'en-EN',
    });
    expect(migrated.values.engine.weaponCardsDisplayMode).toBeUndefined();
    expect(migrated.values.fallout).toMatchObject({
      weaponDurabilityLossEnabled: true,
      weaponDurabilityLossPer10Shots: 3,
      randomWeaponQualityEnabled: true,
      unarmedAttackVisible: false,
      weaponCardsDisplayMode: 'cards',
    });
    expect(migrated.values.fallout.language).toBeUndefined();
  });
});
