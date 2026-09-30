// ПРИЁМОЧНЫЙ (патч 405): доводка перков 404 по тексту книги.
// 1) «Заряжай и стреляй» — бонус только у тяжёлого оружия со
//    скорострельностью 2+ (медленные «Толстяк»/гранатомёты не усиливаются).
// 2) «В сияющих доспехах» ранг 2 — светозащитная оптика даёт ещё +1
//    к Сопротивляемости энергетическому урону (в каталоге — Щиток сварщика).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { applyLoadAndFireToWeapon, loadAndFireBonusByRank, MIN_FIRE_RATE_FOR_BONUS } from '../../domain/perks/loadAndFire';
import {
  GLARE_OPTICS_IDS,
  IN_SHINING_ARMOR_OPTICS_ENERGY_DR,
  isGlareOpticsCatalogId,
  wearingGlareOpticsInEquippedArmor,
} from '../../domain/perks/inShiningArmor';
import { calculateDerivedStats } from '../../modules/fallout/logic/derivedStats.js';
import weaponsData from '../../modules/fallout/data/equipment/weapons.json';
import clothesData from '../../modules/fallout/data/equipment/clothes.json';

const weaponsList = Array.isArray(weaponsData) ? weaponsData : Object.values(weaponsData);
const byId = (list, id) => list.find((x) => x.id === id);

describe('Патч 405: Заряжай и стреляй — условие «скорострельность 2+»', () => {
  it('медленное тяжёлое (0–1 очередей) не усиливается: Толстяк и Мусорный джет', () => {
    const fatMan = byId(weaponsList, 'weapon_fat_man'); // 0 очередей
    const junkJet = byId(weaponsList, 'weapon_junk_jet'); // 1 очередь
    expect(applyLoadAndFireToWeapon(fatMan, 2).fireRate).toBe(0);
    expect(applyLoadAndFireToWeapon(junkJet, 2).fireRate).toBe(1);
  });

  it('граница: автоматический гранатомёт (ровно 2) и миниган (5) усиливаются', () => {
    const launcher = byId(weaponsList, 'weapon_auto_grenade_launcher');
    expect(launcher.fireRate).toBe(2);
    expect(applyLoadAndFireToWeapon(launcher, 1).fireRate).toBe(3);
    expect(applyLoadAndFireToWeapon(launcher, 2).fireRate).toBe(4);

    const minigun = byId(weaponsList, 'weapon_minigun');
    expect(applyLoadAndFireToWeapon(minigun, 1).fireRate).toBe(6);
    expect(applyLoadAndFireToWeapon(minigun, 2).fireRate).toBe(7);
  });

  it('скорострельность берётся С МОДАМИ: мод поднял 1 → 2 — перк уже действует', () => {
    // Карточка приходит в хелпер уже обогащённой модами (единая точка),
    // поэтому «медленное» оружие с модом на скорострельность усиливается.
    const modded = { id: 'weapon_x', weaponType: 'Heavy', fireRate: 2, baseWeaponName: 'x' };
    expect(applyLoadAndFireToWeapon(modded, 1).fireRate).toBe(3);
    const stillSlow = { id: 'weapon_y', weaponType: 'Heavy', fireRate: 1 };
    expect(applyLoadAndFireToWeapon(stillSlow, 1).fireRate).toBe(1);
    expect(MIN_FIRE_RATE_FOR_BONUS).toBe(2);
    expect(loadAndFireBonusByRank(3)).toBe(2);
  });

  it('у помощника та же логика, точка входа одна', () => {
    for (const file of [
      '../../components/screens/InventoryScreen/InventoryScreen.js',
      '../../modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js',
    ]) {
      const src = readFileSync(resolve(__dirname, file), 'utf8');
      expect(src).toContain('applyLoadAndFireToWeapon');
    }
  });
});

describe('Патч 405: В сияющих доспехах — ранг 2, светозащитная оптика', () => {
  const ATTRS = Object.fromEntries(
    ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK'].map((id) => [id, { id, base: 5, modifiers: [], total: 5 }]),
  );

  const derive = ({ rank = 0, metal = false, optics = false } = {}) =>
    calculateDerivedStats(
      ATTRS,
      { perkBonuses: rank > 0 ? { inShiningArmorRank: rank } : {} },
      null,
      1,
      { wearingMetalArmor: metal, wearingGlareOptics: optics },
    );

  it('в каталоге есть Щиток сварщика — единственная светозащитная оптика', () => {
    // Формат clothes.json: группы { items: [...] } — id лежат на два уровня глубже.
    const ids = new Set();
    const walk = (x) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        if (x.id) ids.add(x.id);
        Object.values(x).forEach(walk);
      }
    };
    walk(clothesData);
    for (const opticsId of GLARE_OPTICS_IDS) {
      expect(ids.has(opticsId)).toBe(true);
    }
    expect(isGlareOpticsCatalogId('headwear_welding_mask')).toBe(true);
    expect(isGlareOpticsCatalogId('headwear_gas_mask')).toBe(false);
  });

  it('помощник находит оптику в слотах (одежда или броня)', () => {
    const withOptics = {
      head: { armor: null, clothing: { weaponId: 'headwear_welding_mask' } },
      body: { armor: { weaponId: 'armor_metal_chest_001' }, clothing: null },
    };
    expect(wearingGlareOpticsInEquippedArmor(withOptics)).toBe(true);
    expect(wearingGlareOpticsInEquippedArmor({
      head: { armor: null, clothing: { weaponId: 'headwear_gas_mask' } },
    })).toBe(false);
    expect(wearingGlareOpticsInEquippedArmor({})).toBe(false);
  });

  it('ранг 2 + металл + оптика: энергоСУ +3 (две строки модификаторов)', () => {
    const full = derive({ rank: 2, metal: true, optics: true });
    expect(full.damageResistance.energy.modifiers).toEqual([
      { source: 'perks.inShiningArmor', value: 2, operation: '+' },
      { source: 'perks.inShiningArmor.optics', value: IN_SHINING_ARMOR_OPTICS_ENERGY_DR, operation: '+' },
    ]);
    expect(full.damageResistance.energy.total).toBe(3);
  });

  it('ранг 1: оптика ещё не помогает; ранг 2 без оптики: только металл', () => {
    expect(derive({ rank: 1, optics: true }).damageResistance.energy.total).toBe(0);
    expect(derive({ rank: 2, metal: true }).damageResistance.energy.total).toBe(2);
    expect(derive({ rank: 2, optics: true }).damageResistance.energy.total).toBe(1);
    expect(derive({}).damageResistance.energy.total).toBe(0);
  });
});
