// Экран не должен поменяться от того, что Fallout начал объявлять слоты и тему.
// Этот тест фиксирует: четыре экрана Fallout занимают слоты 1–4 в прежнем
// порядке, «создать персонажа» по-прежнему ведёт на лист, а палитра вкладок
// совпадает с той, что раньше была зашита в App.js.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../modules/fallout/debug.js', () => ({ activateFalloutDebug: () => () => {} }));
vi.mock('../../modules/fallout/screens/WeaponsAndArmorScreen/textUtils.js', () => ({
  setupRichText: () => () => {},
}));
vi.mock('../../modules/fallout/saves/stateExtensions.js', () => ({
  activateFalloutSaveStateExtensions: () => () => {},
}));
vi.mock('../../modules/fallout/survival/runtimeRegistration.js', () => ({
  activateFalloutSurvival: () => () => {},
}));
vi.mock('../../modules/fallout/migrations/runtimeRegistration.js', () => ({
  activateFalloutSaveMigrations: () => () => {},
}));
vi.mock('../../modules/fallout/diseases/runtimeRegistration.js', () => ({
  activateDiseaseRankMigration: () => () => {},
}));

import {
  findSettingScreenByRole,
  normalizeSettingGlobalComponents,
  normalizeSettingScreens,
  normalizeSettingTheme,
  resolveCharacterScreenRoute,
} from '../../src/engine/settings/settingScreens';

const activate = async () => {
  const createFalloutRuntime = (await import('../../modules/fallout/runtimeEntry')).default;
  return createFalloutRuntime({ settingId: 'fallout', modules: {}, apiVersion: 1 });
};

describe('экраны Fallout в слотах движка', () => {
  it('занимает слоты 1–4 в прежнем порядке', async () => {
    const runtime = await activate();
    const screens = normalizeSettingScreens(runtime.screens);
    expect(screens.map((screen) => [screen.slot, screen.id, screen.route])).toEqual([
      ['screen:1', 'character', 'SettingScreen1'],
      ['screen:2', 'equipment', 'SettingScreen2'],
      ['screen:3', 'inventory', 'SettingScreen3'],
      ['screen:4', 'perks', 'SettingScreen4'],
    ]);
  });

  // Вкладки в APK engine-v1.0.1 строятся по `screen.route` и `screen.labelKey`.
  // Летом контракт сменился на слоты, и пакет, отдающий только новую форму,
  // ставился на старый APK без экранов: `name={undefined}`. Обе формы должны
  // быть в одной записи — это и есть «старые сборки не ломаются».
  it('отдаёт и старый маршрут, и новую пару слот/titleKey', async () => {
    const runtime = await activate();
    const byId = Object.fromEntries(runtime.screens.map((screen) => [screen.id, screen]));
    expect(byId.character).toMatchObject({
      slot: 'screen:1',
      titleKey: 'tabs.character',
      route: 'CharacterTab',
      labelKey: 'tabs.character',
    });
    expect(byId.equipment).toMatchObject({ route: 'EquipmentTab', labelKey: 'tabs.equipment' });
    expect(byId.inventory).toMatchObject({ route: 'InventoryTab', labelKey: 'tabs.inventory' });
    expect(byId.perks).toMatchObject({ route: 'PerksTab', labelKey: 'tabs.perks' });
  });

  it('старый разбор вкладок получает осмысленные маршруты', async () => {
    const runtime = await activate();
    // Ровно то, что делает App.js из APK 1.0.1: имя вкладки — screen.route,
    // подпись — screen.labelKey. Ни одно не должно быть undefined.
    for (const screen of runtime.screens) {
      expect(typeof screen.route).toBe('string');
      expect(screen.route.length).toBeGreaterThan(0);
      expect(typeof screen.labelKey).toBe('string');
    }
  });

  it('объявляет роли, которые ищет движок', async () => {
    const runtime = await activate();
    const screens = normalizeSettingScreens(runtime.screens);
    expect(findSettingScreenByRole(screens, 'character')?.id).toBe('character');
    expect(findSettingScreenByRole(screens, 'equipment')?.id).toBe('equipment');
    expect(findSettingScreenByRole(screens, 'inventory')?.id).toBe('inventory');
    expect(resolveCharacterScreenRoute(screens)).toBe('SettingScreen1');
  });

  it('подписи вкладок берутся из словаря Fallout', async () => {
    const runtime = await activate();
    const screens = normalizeSettingScreens(runtime.screens);
    expect(screens.map((screen) => screen.titleKey)).toEqual([
      'tabs.character', 'tabs.equipment', 'tabs.inventory', 'tabs.perks',
    ]);
    expect(screens.map((screen) => screen.icon)).toEqual([
      'person', 'shield', 'briefcase', 'star',
    ]);
  });

  it('палитра вкладок совпадает с прежней зашитой в App.js', async () => {
    const runtime = await activate();
    expect(normalizeSettingTheme(runtime.theme).tabBar).toEqual({
      background: '#1a1a1a',
      active: '#f0e68c',
      inactive: 'gray',
    });
  });

  it('глобальные наложения остаются компонентами', async () => {
    const runtime = await activate();
    expect(Object.keys(normalizeSettingGlobalComponents(runtime.globalComponents))).toEqual([
      'survivalClock', 'fusionCoreChoice', 'powerCoreClock',
    ]);
  });
});
