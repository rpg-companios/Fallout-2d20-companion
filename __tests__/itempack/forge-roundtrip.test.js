// __tests__/itempack/forge-roundtrip.test.js
// Гейт прототипа P: файл, собранный генератором (item-forge/src/pack.ts),
// обязан проходить валидатор приложения; импорт обратно в генератор —
// восстанавливать сессию. Правило одного поведения: валидатор общий.

import { describe, it, expect } from 'vitest';
import { validateContentPack } from '../../src/itempack/validate';
import { buildFalloutRefs } from '../../src/itempack/refsFallout';
import { buildPackFile, parsePackFile } from '../../item-forge/src/pack';

const refs = buildFalloutRefs();

const session = {
  manifest: { packId: 'nail_shop', name: 'Скобяная лавка', author: 'Agent', locale: 'ru-RU' },
  items: [
    {
      collection: 'ammo',
      data: { id: 'ammo_nail', rarity: 1, cost: 1, weight: 0.01 },
      namePrimary: 'Гвоздь',
      descriptionPrimary: '',
      nameOther: 'Nail',
      descriptionOther: '',
    },
    {
      collection: 'weapons',
      data: {
        id: 'weapon_nailgun', weaponType: 'Light', damage: 5, fireRate: 2, range: 'C',
        ammoId: 'hb_nail_shop_ammo_nail', mainAttr: 'AGI', mainSkill: 'SMALL_GUNS',
        weight: 3, cost: 120, rarity: 1,
        damageType: ['physical'],
        qualities: [{ qualityId: 'quality_accurate' }],
        effects: [{ effectId: 'effect_vicious' }],
        audience: ['human', 'mutant'],
        modSlots: { Barrel: ['mod_long_barrel', 'hb_nail_shop_mod_nail_drum'] },
      },
      namePrimary: 'Гвоздомёт',
      descriptionPrimary: 'Стреляет гвоздями.',
      nameOther: 'Nailgun',
      descriptionOther: '',
    },
    {
      collection: 'weaponMods',
      data: {
        id: 'mod_nail_drum', slot: 'Barrel', cost: 45, weight: 1, rarity: 'Common',
        complexity: 2, perk1: '', perk2: '', skill: 'REPAIR', materials: 'Common x 4',
        applies_to_ids: ['hb_nail_shop_weapon_nailgun'],
        damageModifier: { op: '+', value: 1 },
        qualityChanges: [{ op: 'gain', id: 'quality_blast', value: 1 }],
        effectChanges: [],
      },
      namePrimary: 'Барабан гвоздей',
      descriptionPrimary: '',
      nameOther: 'Nail drum',
      descriptionOther: '',
    },
  ],
};

describe('генератор → приложение (round-trip)', () => {
  it('собранный генератором файл проходит валидатор приложения', () => {
    const pack = buildPackFile(session);
    const result = validateContentPack(pack, refs);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('имена уходят в зеркало локали, вторая локаль заполняется, id получает префикс', () => {
    const pack = buildPackFile(session);
    expect(pack.items.weapons[0].id).toBe('hb_nail_shop_weapon_nailgun');
    expect(pack.names['ru-RU'].hb_nail_shop_weapon_nailgun.name).toBe('Гвоздомёт');
    expect(pack.names['en-EN'].hb_nail_shop_weapon_nailgun.name).toBe('Nailgun');
  });

  it('без второй локали она не создаётся (закон: одна локаль достаточна)', () => {
    const s = {
      ...session,
      items: session.items.map((i) => ({ ...i, nameOther: '', descriptionOther: '' })),
    };
    const pack = buildPackFile(s);
    expect(pack.names['en-EN']).toBeUndefined();
    expect(validateContentPack(pack, refs).ok).toBe(true);
  });

  it('импорт в генератор восстанавливает сессию (правка итеративно)', () => {
    const pack = buildPackFile(session);
    const restored = parsePackFile(pack);
    expect(restored).toBeTruthy();
    expect(restored.manifest.packId).toBe('nail_shop');
    expect(restored.items).toHaveLength(3);
    const weapon = restored.items.find((i) => i.collection === 'weapons');
    expect(weapon.data.id).toBe('weapon_nailgun'); // префикс снят
    expect(weapon.namePrimary).toBe('Гвоздомёт');
    expect(weapon.nameOther).toBe('Nailgun');
    // повторная сборка из восстановленной сессии — тот же валидный пак
    const again = buildPackFile(restored);
    expect(validateContentPack(again, refs).ok).toBe(true);
  });
});
