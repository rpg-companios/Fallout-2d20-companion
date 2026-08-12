/**
 * Ориджин «Три семьи» (TreeFamilies) — первый контент в модуле modules/fallout.
 *
 * Правило владельца: новый контент пишется в модуль (modules/fallout/data),
 * реестр подмешивает его поверх базы. Тут проверяем и контент, и сам механизм.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

import { setCurrentLocale } from '../../i18n/locale';

beforeAll(() => {
  // catalogSource строит каталог по текущей локали (в CI Intl даёт en-EN).
  setCurrentLocale('ru-RU');
});

vi.mock('../../db/Database', async () => {
  const catalog = await import('../../db/catalogSource');
  return {
    getWeaponById: async (id) => catalog.catalogGetWeaponById(id),
    getWeaponModById: async (id) => catalog.catalogGetWeaponModById(id),
    getAmmoById: async (id) => catalog.catalogGetAmmoById(id),
    getItemByName: async (name) => catalog.catalogGetItemByName(name),
  };
});
import { getOrigins, getTraits, getOriginI18n, getTraitI18n, getEquipmentCatalogForLocale } from '../../domain/registry';
import { MULTI_TRAIT_ORIGIN_IDS } from '../../domain/characterCreation';
import { getSelectedSubTraits, hasTraitEffect, getTraitKitId, isKitControlledByTrait } from '../../domain/traits';
import { resolveKitItems } from '../../domain/kitResolver';
import moduleOrigins from '../../modules/fallout/data/origins.json';
import moduleTraits from '../../modules/fallout/data/traits.json';

const getOrigin = () => getOrigins().find((o) => o.id === 'TreeFamilies');
const getTrait = (id) => getTraits().find((t) => t.id === id);

describe('Ориджин Три семьи: данные (в модуле)', () => {
  it('ориджин лежит в модуле и читается реестром', () => {
    expect(moduleOrigins.some((o) => o.id === 'TreeFamilies')).toBe(true);
    const origin = getOrigin();
    expect(origin).toBeDefined();
    expect(origin.characterType).toBe('human');
    expect(origin.bodyPlan).toBe('humanoid');
    expect(origin.traitIds).toEqual(['treefamilies-family']);
    expect(origin.equipmentKitIds).toEqual([
      'treefamilies_chairmen',
      'treefamilies_omerta',
      'treefamilies_white_glove',
    ]);
    expect(origin.image).toBe('3families');
  });

  it('трейты лежат в модуле; обёртка — мульти-трейт с 3 семьями', () => {
    expect(moduleTraits.some((t) => t.id === 'treefamilies-family')).toBe(true);
    const wrapper = getTrait('treefamilies-family');
    expect(wrapper.modifiers.isMultiTrait).toBe(true);
    expect(wrapper.modifiers.subTraitIds).toEqual([
      'treefamilies-chairmen',
      'treefamilies-omerta',
      'treefamilies-white-glove',
    ]);
    for (const id of wrapper.modifiers.subTraitIds) {
      expect(getTrait(id), id).toBeDefined();
    }
  });

  it('эффекты-метки (механика на будущее) у семей', () => {
    expect(getTrait('treefamilies-chairmen').modifiers.effects).toEqual(['chairmen_reroll_cha']);
    expect(getTrait('treefamilies-omerta').modifiers.effects).toEqual(['omerta_addiction_boost']);
    expect(getTrait('treefamilies-white-glove').modifiers.effects).toEqual([
      'white_glove_food_heal_plus',
      'white_glove_butcher_extra',
      'white_glove_cha_complication',
    ]);
  });

  it('i18n из модуля (ru/en)', () => {
    expect(getOriginI18n('ru-RU').TreeFamilies).toBe('Три семьи');
    expect(getOriginI18n('en-EN').TreeFamilies).toBe('Strip Families');
    expect(getTraitI18n('ru-RU').traits.treeFamilies.chairmen.name).toBe('Председатели');
    expect(getTraitI18n('ru-RU').traits.treeFamilies.whiteGlove.name).toBe('Общество «Белая перчатка»');
    expect(getTraitI18n('en-EN').traits.treeFamilies.chairmen.name).toBe('The Chairmen');
    expect(getTraitI18n('en-EN').traits.treeFamilies.omerta.name).toBe('Omerta');
  });
});

describe('Ориджин Три семьи: интеграция', () => {
  it('мульти-трейт список производный — содержит TreeFamilies', () => {
    expect(MULTI_TRAIT_ORIGIN_IDS).toContain('TreeFamilies');
  });

  it('hasTraitEffect находит метку выбранной семьи', () => {
    const trait = { id: 'treefamilies-family', ids: ['treefamilies-family', 'treefamilies-chairmen'] };
    expect(hasTraitEffect(trait, 'chairmen_reroll_cha')).toBe(true);
    expect(hasTraitEffect(trait, 'omerta_addiction_boost')).toBe(false);
  });

  it('getSelectedSubTraits возвращает выбранную семью', () => {
    const trait = { id: 'treefamilies-family', ids: ['treefamilies-family', 'treefamilies-omerta'] };
    const subs = getSelectedSubTraits(trait);
    expect(subs.some((t) => t.id === 'treefamilies-omerta')).toBe(true);
  });

  it('реестр не ломает старые данные (tribal на месте)', () => {
    expect(getOrigins().some((o) => o.id === 'tribal')).toBe(true);
    expect(getTraits().some((t) => t.id === 'tribal-tribal')).toBe(true);
  });
});

describe('Комплекты семей (в модуле) и новые предметы', () => {

  it('каталог содержит новые предметы модуля: бритва, фишки, колода', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const razor = catalog.weapons.find((w) => w.id === 'weapon_straight_razor');
    expect(razor).toBeDefined();
    expect(razor.name).toBe('Опасная бритва');
    expect(razor.damage).toBe(2); // характеристики от выкидного ножа
    expect(razor.qualities.some((q) => q.qualityId === 'quality_concealed')).toBe(true);
    // оригинальный нож не заменён
    expect(catalog.weapons.find((w) => w.id === 'weapon_switchblade')).toBeDefined();
    // фишки и колода
    expect(catalog.generalGoods.some((i) => i.id === 'CasinoTopsChip' && i.value === 100)).toBe(true);
    expect(catalog.generalGoods.some((i) => i.id === 'item_marked_cards' && i.value === 5)).toBe(true);
  });

  it('комплекты семей есть в каталоге с именами', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.equipmentKits.treefamilies_chairmen.name).toBe('Председатели');
    expect(catalog.equipmentKits.treefamilies_omerta).toBeDefined();
    expect(catalog.equipmentKits.treefamilies_white_glove).toBeDefined();
  });

  it('origin TreeFamilies ссылается на три комплекта', () => {
    const origin = getOrigin();
    expect(origin.equipmentKitIds).toEqual([
      'treefamilies_chairmen',
      'treefamilies_omerta',
      'treefamilies_white_glove',
    ]);
  });

  it('трейты семей несут equipmentKitId (комплект от трейта)', () => {
    expect(getTrait('treefamilies-chairmen').modifiers.equipmentKitId).toBe('treefamilies_chairmen');
    expect(getTrait('treefamilies-omerta').modifiers.equipmentKitId).toBe('treefamilies_omerta');
    expect(getTrait('treefamilies-white-glove').modifiers.equipmentKitId).toBe('treefamilies_white_glove');
  });
});

describe('Комплект Председателей: резолв', () => {
  it('даёт формальную одежду, 9мм с патронами, бритву, фишки, колоду и безделушку', async () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.treefamilies_chairmen;
    const resolved = await resolveKitItems({ id: 'treefamilies_chairmen', items: kit.items });
    const ids = resolved.items.map((i) => i.itemId || i.weaponId || i.clothingId || i.id || i.tableId);
    expect(ids).toContain('clothing_fancy_clothes');
    expect(ids).toContain('headwear_fancy_hat');
    expect(ids).toContain('weapon_9mm_pistol');
    expect(ids).toContain('CasinoTopsChip');
    expect(ids).toContain('item_marked_cards');
    // бритва — вариант выкидного ножа: выдаётся под истинным id с именем-скином
    const razor = resolved.items.find((i) => i.itemType === 'weapon' && i.name === 'Опасная бритва');
    expect(razor).toBeDefined();
    expect(razor.weaponId).toBe('weapon_switchblade');
    expect(razor.baseName).toBe('Опасная бритва');
    // патроны 9мм вложены в оружие: 12 + 4 CD (0..8) → [12, 20]
    const pistol = resolved.items.find((i) => i.weaponId === 'weapon_9mm_pistol');
    expect(pistol.resolvedAmmunition).toBeDefined();
    expect(pistol.resolvedAmmunition.id).toBe('ammo_9mm');
    expect(pistol.resolvedAmmunition.quantity).toBeGreaterThanOrEqual(12);
    expect(pistol.resolvedAmmunition.quantity).toBeLessThanOrEqual(20);
    // безделушка — бросок по таблице: зарезолвилась в конкретный предмет
    // (rollTable заменён на предмет из таблицы oddity, tableId исчезает).
    const resolvedIds = resolved.items.map((i) => i.itemId || i.weaponId || i.clothingId || i.id);
    const extraMisc = resolved.items.filter(
      (i) => i.itemType === 'misc' && i.id !== 'CasinoTopsChip' && i.id !== 'item_marked_cards',
    );
    expect(extraMisc.length).toBeGreaterThanOrEqual(1); // личная безделушка
    void resolvedIds;
  });
});

describe('Комплект от трейта: единый сценарий модалки (данные, не логика)', () => {
  it('getTraitKitId — equipmentKitId выбранного трейта (семьи)', () => {
    expect(getTraitKitId({ id: 'treefamilies-omerta', modifiers: { equipmentKitId: 'treefamilies_omerta' } }))
      .toBe('treefamilies_omerta');
    expect(getTraitKitId({ id: 'treefamilies-omerta' })).toBeNull();
  });

  it('isKitControlledByTrait — по данным: TreeFamilies да, обычные ориджины нет', () => {
    const treeFamilies = getOrigins().find((o) => o.id === 'TreeFamilies');
    expect(isKitControlledByTrait(treeFamilies)).toBe(true);
    // ориджин без трейт-комплектов — false
    const tribal = getOrigins().find((o) => o.id === 'tribal');
    expect(isKitControlledByTrait(tribal)).toBe(false);
    expect(isKitControlledByTrait({})).toBe(false);
  });
});
