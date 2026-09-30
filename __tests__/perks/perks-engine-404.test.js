// ПРИЁМОЧНЫЙ (патч 404): три перка из адаптируемой четвёрки 403 встроены в движок.
// - Гурман старого мира: preserved-еда — +2 ОЗ к лечению, радиация еды на 1 меньше.
// - Заряжай и стреляй: тяжёлое оружие — скорострельность +1/+2 по рангам.
// - В сияющих доспехах: в металлической брони СУ энергия +2 (ранг 2 — текст перка).
// Ломовые патроны — отдельно, следующим патчем (владелец просил «разом», но крафт
// требует своей точки подстановки материалов; гурман/заряжай/доспехи — разом здесь).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveConsumableVitalChanges } from '../../domain/effects';
import { calculateDerivedStats } from '../../modules/fallout/logic/derivedStats.js';
import { selectPerkBonuses } from '../../domain/perks.js';
import { oldWorldGourmetPerk } from '../../domain/perks/oldWorldGourmet';
import { inShiningArmorPerk, isMetalArmorCatalogId } from '../../domain/perks/inShiningArmor';
import { loadAndFirePerk, applyLoadAndFireToWeapon, loadAndFireBonusByRank } from '../../domain/perks/loadAndFire';
import catalog from '../../modules/fallout/data/perks/perks.json';
import foodData from '../../modules/fallout/data/consumables/food.json';
import weaponsData from '../../modules/fallout/data/equipment/weapons.json';

const foodList = Array.isArray(foodData) ? foodData : Object.values(foodData);
const weaponsList = Array.isArray(weaponsData) ? weaponsData : Object.values(weaponsData);
const byId = (list, id) => list.find((x) => x.id === id);

// --- Гурман старого мира -------------------------------------------------

describe('Патч 404: Гурман старого мира (preserved-еда)', () => {
  const GOURMET = { hpBonus: 2, radiationReduction: 1 };

  it('консервов без лечения: перк даёт +2 ОЗ и снижает радиацию −2 → −1', () => {
    // Формат как у настоящих консервов (food_cram): фиксированная радиация, лечения нет.
    const canned = {
      id: 'test_canned',
      itemType: 'food',
      preserved: true,
      positiveEffect: null,
      radiationModifier: { op: '+', value: 2 },
    };
    const withPerk = resolveConsumableVitalChanges(canned, {
      currentHealth: 10, maxHealth: 12, radiation: 0,
      oldWorldGourmet: GOURMET,
    });
    expect(withPerk.healAmount).toBe(2);
    expect(withPerk.healthAfter).toBe(12);
    expect(withPerk.radiationAmount).toBe(1); // −2 → −1: радиация всё же есть

    const withoutPerk = resolveConsumableVitalChanges(canned, {
      currentHealth: 10, maxHealth: 12, radiation: 0,
    });
    expect(withoutPerk.healAmount).toBe(0);
    expect(withoutPerk.radiationAmount).toBe(2);
  });

  it('лечащая еда: 4 ОЗ → 6 ОЗ (сахарные бомбы, реальные данные каталога)', () => {
    const sugarBombs = byId(foodList, 'food_sugar_bombs');
    expect(sugarBombs.preserved).toBe(true);
    const result = resolveConsumableVitalChanges(sugarBombs, {
      currentHealth: 5, maxHealth: 12, radiation: 0,
      radiationRequestedAmount: 3, // как будто АГНИ-бросок дал 3 радиации
      oldWorldGourmet: GOURMET,
    });
    expect(result.healAmount).toBe(6); // 4 + 2
    expect(result.radiationAmount).toBe(2); // 3 → 2
  });

  it('радиация −1 становится 0, чистая еда не портится, очистка радиации не разворачивается', () => {
    const light = {
      id: 'test_light', itemType: 'food', preserved: true,
      radiationModifier: { op: '+', value: 1 },
    };
    expect(resolveConsumableVitalChanges(light, {
      currentHealth: 5, maxHealth: 12, radiation: 1, oldWorldGourmet: GOURMET,
    }).radiationAmount).toBe(0); // 1 радиация → 0 (прирост обнулился)

    // Чистая еда без радиации: перк не создаёт радиацию из ничего.
    const clean = { id: 'test_clean', itemType: 'food', preserved: true, radiationModifier: null };
    expect(resolveConsumableVitalChanges(clean, {
      currentHealth: 5, maxHealth: 12, radiation: 0, oldWorldGourmet: GOURMET,
    }).radiationAmount).toBe(null);

    // Предмет, СНИМАЮЩИЙ радиацию (op '−'): перк не должен ослаблять очистку.
    const cleansing = {
      id: 'test_cleansing', itemType: 'food', preserved: true,
      radiationModifier: { op: '-', value: 3 },
    };
    expect(resolveConsumableVitalChanges(cleansing, {
      currentHealth: 5, maxHealth: 12, radiation: 5, oldWorldGourmet: GOURMET,
    }).radiationAmount).toBe(-3); // снято 3 радиации, перк не помешал
  });

  it('непресервированная еда и напитки перком не трогаются', () => {
    const grilled = byId(foodList, 'food_grilled_bloatfly');
    expect(grilled.preserved).toBe(false);
    const food = resolveConsumableVitalChanges(grilled, {
      currentHealth: 5, maxHealth: 20, radiation: 0, oldWorldGourmet: GOURMET,
    });
    // Жареная стрекоза лечит 6; перк НЕ добавил свои +2 (она не preserved).
    expect(food.healAmount).toBe(6);

    const drink = {
      id: 'test_drink', itemType: 'drink', preserved: true,
      positiveEffect: null, radiationModifier: { op: '+', value: 2 },
    };
    const drinkResult = resolveConsumableVitalChanges(drink, {
      currentHealth: 5, maxHealth: 12, radiation: 0, oldWorldGourmet: GOURMET,
    });
    expect(drinkResult.healAmount).toBe(0);
    expect(drinkResult.radiationAmount).toBe(2); // −2 у напитков не работает
  });

  it('перк кладёт в perkBonuses параметры гурмана; хелпер металла работает', () => {
    const bonuses = selectPerkBonuses(
      { selectedPerks: [{ id: 'oldWorldGourmet', rank: 1 }] },
      catalog,
    );
    expect(bonuses.oldWorldGourmet).toEqual({ hpBonus: 2, radiationReduction: 1 });
  });
});

// --- Заряжай и стреляй ---------------------------------------------------

describe('Патч 404: Заряжай и стреляй (скорострельность тяжёлого)', () => {
  it('ранг 1 даёт +1, ранг 2+ даёт +2', () => {
    expect(loadAndFireBonusByRank(1)).toBe(1);
    expect(loadAndFireBonusByRank(2)).toBe(2);
    expect(loadAndFireBonusByRank(3)).toBe(2);
    expect(loadAndFirePerk.apply({ state: { rank: 2 } })).toEqual({ loadAndFireBonus: 2 });
  });

  it('миниган (реальный id): 5 → 6/7; «Толстяк» с 0 очередей: 0 → 1/2', () => {
    const minigun = byId(weaponsList, 'weapon_minigun');
    expect(minigun.weaponType).toBe('Heavy');
    expect(applyLoadAndFireToWeapon(minigun, 1).fireRate).toBe(6);
    expect(applyLoadAndFireToWeapon(minigun, 2).fireRate).toBe(7);

    const fatMan = byId(weaponsList, 'weapon_fat_man');
    expect(fatMan.fireRate).toBe(0);
    expect(applyLoadAndFireToWeapon(fatMan, 1).fireRate).toBe(1);
    expect(applyLoadAndFireToWeapon(fatMan, 2).fireRate).toBe(2);
  });

  it('не-тяжёлое оружие и предметы без очередей не трогаются; вход не мутируется', () => {
    const pistol = byId(weaponsList, 'weapon_10mm_pistol');
    expect(pistol.weaponType).not.toBe('Heavy');
    expect(applyLoadAndFireToWeapon(pistol, 2).fireRate).toBe(pistol.fireRate);

    const noRate = { id: 'weapon_x', weaponType: 'Heavy' }; // нет поля fireRate
    expect(applyLoadAndFireToWeapon(noRate, 2)).toBe(noRate);

    const minigun = byId(weaponsList, 'weapon_minigun');
    const before = minigun.fireRate;
    applyLoadAndFireToWeapon(minigun, 2);
    expect(minigun.fireRate).toBe(before);
  });

  it('селектор перка: ранг 2 → loadAndFireBonus 2', () => {
    const bonuses = selectPerkBonuses(
      { selectedPerks: [{ id: 'loadAndFire', rank: 2 }] },
      catalog,
    );
    expect(bonuses.loadAndFireBonus).toBe(2);
  });

  it('проводка UI: обе точки показа оружия зовут единый хелпер', () => {
    const inv = readFileSync(resolve(__dirname, '../../components/screens/InventoryScreen/InventoryScreen.js'), 'utf8');
    expect(inv).toContain("from '../../../domain/perks/loadAndFire'");
    const waa = readFileSync(resolve(__dirname, '../../modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js'), 'utf8');
    expect(waa).toContain("from '../../../../domain/perks/loadAndFire'");
  });
});

// --- В сияющих доспехах --------------------------------------------------

describe('Патч 404: В сияющих доспехах (энергоСУ в металле)', () => {
  const ATTRS = Object.fromEntries(
    ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK'].map((id) => [id, { id, base: 5, modifiers: [], total: 5 }]),
  );

  const derive = ({ rank = 0, metal = false } = {}) =>
    calculateDerivedStats(
      ATTRS,
      { perkBonuses: rank > 0 ? { inShiningArmorRank: rank } : {} },
      null,
      1,
      { wearingMetalArmor: metal },
    );

  it('перк кладёт ранг в perkBonuses', () => {
    expect(inShiningArmorPerk.apply({ state: { rank: 2 } })).toEqual({ inShiningArmorRank: 2 });
    const bonuses = selectPerkBonuses(
      { selectedPerks: [{ id: 'inShiningArmor', rank: 1 }] },
      catalog,
    );
    expect(bonuses.inShiningArmorRank).toBe(1);
  });

  it('металл + перк: энергоСУ +2; без металла или без перка — ничего', () => {
    const withBoth = derive({ rank: 1, metal: true });
    expect(withBoth.damageResistance.energy.modifiers).toEqual([
      { source: 'perks.inShiningArmor', value: 2, operation: '+' },
    ]);
    expect(withBoth.damageResistance.energy.total).toBe(2);

    expect(derive({ rank: 1, metal: false }).damageResistance.energy.total).toBe(0);
    expect(derive({ rank: 0, metal: true }).damageResistance.energy.total).toBe(0);
    expect(derive({ rank: 2, metal: true }).damageResistance.energy.total).toBe(2); // ранг 2 = тот же +2 (текст про слепящий свет)
  });

  it('хелпер металла: все 4 детали metalArmor опознаются, чужие id — нет', () => {
    ['head', 'chest', 'leg', 'hand'].forEach((part) => {
      expect(isMetalArmorCatalogId(`armor_metal_${part}_001`)).toBe(true);
    });
    expect(isMetalArmorCatalogId('armor_leather_chest_001')).toBe(false);
    expect(isMetalArmorCatalogId('weapon_10mm_pistol')).toBe(false);
    expect(isMetalArmorCatalogId(undefined)).toBe(false);
  });
});
