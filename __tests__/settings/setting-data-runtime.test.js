import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTING } from '../../modules/fallout/index.js';
import { SETTING_MANIFEST } from '../../modules/fallout/manifest.js';
import {
  getCraftingRecipes,
  getDerivedStatsLogic,
  getEquipmentCatalogForLocale,
  getOrigins,
  getUserEquipmentStorageContract,
} from '../../domain/registry.js';
import {
  getFalloutDiseaseCatalog,
  getFalloutSceneRiskRules,
} from '../../modules/fallout/diseases/catalog.js';
import { getFalloutPowerArmorData } from '../../modules/fallout/logic/catalogLookup.js';
import { getEquipmentCatalog, getEquipmentData } from '../../i18n/equipmentCatalog.js';
import { setActiveSettingRuntime } from '../../src/engine/settings/activeSettingRuntime.js';

const activateFallout = () => setActiveSettingRuntime({
  id: SETTING_MANIFEST.id,
  manifest: SETTING_MANIFEST,
  setting: SETTING,
});

beforeEach(() => setActiveSettingRuntime(null));
afterEach(() => setActiveSettingRuntime(null));

describe('setting data is runtime-owned', () => {
  it('returns empty engine catalogues before a setting package is activated', () => {
    expect(getOrigins()).toEqual([]);
    expect(getEquipmentCatalog('ru-RU').weapons).toEqual([]);
    expect(getEquipmentCatalogForLocale('ru-RU').junk).toEqual([]);
    expect(getEquipmentData().weapons).toEqual([]);
    expect(getFalloutDiseaseCatalog('ru-RU')).toEqual([]);
    expect(getCraftingRecipes()).toEqual([]);
    expect(getFalloutPowerArmorData()).toEqual({});
    expect(getFalloutSceneRiskRules()).toEqual([]);
    expect(getDerivedStatsLogic()).toBeNull();
    expect(getUserEquipmentStorageContract()).toBeNull();
  });

  it('reads data and mechanics from the active setting package after activation', () => {
    activateFallout();

    expect(getOrigins().length).toBeGreaterThan(0);
    expect(getEquipmentCatalog('ru-RU').weapons.length).toBeGreaterThan(0);
    expect(getEquipmentData().robotLimbs.length).toBeGreaterThan(0);
    expect(getFalloutDiseaseCatalog('ru-RU').length).toBe(SETTING.data.conditions.diseases.length);
    expect(getCraftingRecipes().length).toBeGreaterThan(0);
    expect(getFalloutPowerArmorData()).toBe(SETTING.data.equipment.powerArmor);
    expect(getFalloutSceneRiskRules()).toEqual([SETTING.data.rules.diseaseExposure]);
    expect(getDerivedStatsLogic()).toBe(SETTING.logic.derivedStats);
    expect(getUserEquipmentStorageContract()).toBe(SETTING.userData.equipment);
  });
});
