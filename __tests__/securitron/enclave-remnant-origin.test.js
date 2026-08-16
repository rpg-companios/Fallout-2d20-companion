/**
 * Ориджин «Осколок Анклава» (enclaveRemnant).
 *
 * Содержимое (трейт «Скрытный и преследуемый», доп. навык Скрытность/Выживание,
 * 100 стартовых крышек) живёт в модуле modules/fallout. Движковые механики
 * (репутация, враждебность, тайники за очки удачи, проверка тайника) будут
 * добавлены отдельно — тут проверяем только то, что уже реализовано данными.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

import { setCurrentLocale } from '../../i18n/locale';

beforeAll(() => {
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
import moduleOrigins from '../../modules/fallout/data/origins/origins.json';
import moduleTraits from '../../modules/fallout/data/traits/traits.json';

const ORIGIN_ID = 'enclaveRemnant';
const TRAIT_ID = 'enclaveRemnant-hidden';

const getOrigin = () => getOrigins().find((o) => o.id === ORIGIN_ID);
const getTrait = (id = TRAIT_ID) => getTraits().find((t) => t.id === id);

describe('Ориджин «Осколок Анклава»: данные (в модуле)', () => {
  it('ориджин лежит в модуле и читается реестром', () => {
    expect(moduleOrigins.some((o) => o.id === ORIGIN_ID)).toBe(true);
    const origin = getOrigin();
    expect(origin).toBeDefined();
    expect(origin.characterType).toBe('human');
    expect(origin.bodyPlan).toBe('humanoid');
    expect(origin.traitIds).toEqual([TRAIT_ID]);
    // Снаряжение сейчас — стартовый капс (100 крышек); новый комплект будет позже.
    expect(origin.equipmentKitIds).toEqual(['default_caps_only']);
  });

  it('трейт «Скрытный и преследуемый» даёт выбор 1 доп. навыка из Скрытность/Выживание', () => {
    expect(moduleTraits.some((t) => t.id === TRAIT_ID)).toBe(true);
    const trait = getTrait();
    expect(trait.originId).toBe(ORIGIN_ID);
    expect(trait.modifiers.skillPickChoice).toEqual({
      count: 1,
      from: ['SNEAK', 'SURVIVAL'],
    });
  });

  it('имена/описания локализованы (ru/en), без сырых ключей', () => {
    const ruName = getOriginI18n('ru-RU')[ORIGIN_ID];
    const enName = getOriginI18n('en-EN')[ORIGIN_ID];
    expect(ruName).toBe('Осколок Анклава');
    expect(enName).toBe('Enclave Remnant');

    const ruTrait = getTraitI18n('ru-RU').traits?.enclaveRemnant?.hidden;
    const enTrait = getTraitI18n('en-EN').traits?.enclaveRemnant?.hidden;
    expect(ruTrait?.name).toBe('Скрытный и преследуемый');
    expect(typeof ruTrait?.description).toBe('string');
    expect(ruTrait.description.length).toBeGreaterThan(20);
    expect(enTrait?.name).toBe('Hidden and Hunted');
    expect(typeof enTrait?.description).toBe('string');
  });

  it('стартовый комплект существует и выдаёт 100 крышек (currency)', async () => {
    const { resolveKitItems } = await import('../../domain/kitResolver');
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    const kit = catalog.equipmentKits.default_caps_only;
    expect(kit).toBeDefined();
    const resolved = await resolveKitItems({ id: 'default_caps_only', items: kit.items });
    const caps = resolved.items.find((i) => i.itemType === 'currency');
    expect(caps).toBeDefined();
    expect(caps.quantity).toBe(100);
  });
});
