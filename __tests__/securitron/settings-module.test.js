/**
 * Настройки как часть сеттинга (патч 120).
 *
 * Модель (решения владельца):
 * - механики сеттинга описываются в modules/fallout/settings.json
 *   (данные: id, type, секции, дефолты, dependsOn);
 * - движковые UI-настройки (каталоги персонажей, вид карточек) —
 *   ENGINE_SETTINGS в domain/settingsCatalog.js;
 * - значения хранятся по модулям: { [moduleId]: { [settingId]: value } },
 *   разные сеттинги не смешиваются; язык — настройка сеттинга.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  ENGINE_SETTINGS,
  getModuleSettings,
  getAllSettings,
  getSettingById,
} from '../../domain/settingsCatalog';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { getCurrentLocale } from '../../i18n/locale';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

describe('Настройки сеттинга (modules/fallout/settings.json)', () => {
  it('описание в модуле: 5 настроек, типы и дефолты', () => {
    const settings = getModuleSettings();
    expect(settings).toHaveLength(5);
    expect(settings.map((s) => s.id)).toEqual([
      'weaponDurabilityLossEnabled',
      'weaponDurabilityLossPer10Shots',
      'randomWeaponQualityEnabled',
      'unarmedAttackVisible',
      'language',
    ]);
    expect(settings.find((s) => s.id === 'language').type).toBe('select');
    expect(settings.find((s) => s.id === 'weaponDurabilityLossPer10Shots').min).toBe(1);
    expect(settings.find((s) => s.id === 'weaponDurabilityLossPer10Shots').dependsOn)
      .toBe('weaponDurabilityLossEnabled');
  });

  it('движковые настройки — отдельно (каталоги, вид карточек)', () => {
    expect(ENGINE_SETTINGS.map((s) => s.id).sort()).toEqual([
      'characterDeleteActionPlacement',
      'characterFoldersEnabled',
      'weaponCardsDisplayMode',
    ]);
    expect(getAllSettings()).toHaveLength(8);
    expect(getSettingById('characterDeleteActionPlacement')).toMatchObject({
      type: 'select',
      defaultValue: 'menu',
      options: [{ value: 'menu' }, { value: 'card' }],
    });
    expect(getSettingById('characterFoldersEnabled')).not.toBeNull();
    expect(getSettingById('language')).not.toBeNull();
  });

  it('i18n тексты настроек присутствуют в модуле обеих локалей', () => {
    for (const loc of ['ru-RU', 'en-EN']) {
      const dict = JSON.parse(readFileSync(
        path.join(root, `modules/fallout/i18n/${loc}/data/system/settings.json`), 'utf-8'));
      expect(dict.survivalMode).toBeTruthy();
      expect(dict.durabilityTitle).toBeTruthy();
      expect(dict.lossTitle).toBeTruthy();
      expect(dict.qualityTitle).toBeTruthy();
      expect(dict.unarmedTitle).toBeTruthy();
      expect(dict.languageTitle).toBeTruthy();
      expect(dict.language.ru).toBeTruthy();
      expect(dict.language.en).toBeTruthy();
    }
  });

  it('i18n тексты движковой настройки удаления присутствуют в обеих локалях', () => {
    for (const loc of ['ru-RU', 'en-EN']) {
      const dict = JSON.parse(readFileSync(
        path.join(root, `i18n/${loc}/screens/home/screen.json`), 'utf-8'));
      expect(dict.settings.appearanceTitle).toBeTruthy();
      expect(dict.settings.characterDeleteActionPlacementTitle).toBeTruthy();
      expect(dict.settings.characterDeleteActionPlacementDescription).toBeTruthy();
      expect(dict.settings.characterDeleteActionPlacement.menu).toBeTruthy();
      expect(dict.settings.characterDeleteActionPlacement.card).toBeTruthy();
    }
  });
});

describe('Стор настроек: значения по модулям', () => {
  beforeAll(() => {
    useAppSettingsStore.setState({ values: {
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
    } });
  });

  it('getSettingValue возвращает значения из своего модуля', () => {
    const state = useAppSettingsStore.getState();
    expect(state.getSettingValue('weaponDurabilityLossEnabled')).toBe(true);
    expect(state.getSettingValue('weaponDurabilityLossPer10Shots')).toBe(3);
    expect(state.getSettingValue('characterFoldersEnabled')).toBe(true);
    expect(state.getSettingValue('characterDeleteActionPlacement')).toBe('card');
    expect(state.getSettingValue('weaponCardsDisplayMode')).toBe('tabs');
    expect(state.getSettingValue('unarmedAttackVisible')).toBe(false);
    expect(state.getSettingValue('language')).toBe('en-EN');
  });

  it('числовые настройки клампятся диапазоном', () => {
    const state = useAppSettingsStore.getState();
    state.setValue('weaponDurabilityLossPer10Shots', 500);
    expect(state.getSettingValue('weaponDurabilityLossPer10Shots')).toBe(100);
    state.setValue('weaponDurabilityLossPer10Shots', 0);
    expect(state.getSettingValue('weaponDurabilityLossPer10Shots')).toBe(1);
  });

  it("язык — настройка сеттинга: setValue('language') меняет локаль", () => {
    const before = getCurrentLocale();
    useAppSettingsStore.getState().setValue('language', 'ru-RU');
    expect(getCurrentLocale()).toBe('ru-RU');
    // вернуть как было
    useAppSettingsStore.getState().setValue('language', before);
    expect(getCurrentLocale()).toBe(before);
  });
});
