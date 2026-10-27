// item-forge/tests/forge-roundtrip.test.js
// Гейты самодостаточной Кузницы:
//  1) round-trip генератор ↔ валидатор — файл, собранный билдером, обязан
//     проходить валидатор (тот же, что примет приложение); импорт обратно
//     восстанавливает сессию.
//  2) слепок справочников — forge-refs.json целостен (защита от ручных
//     правок GENERATED-файлов: refresh только npm run sync).

import { describe, it, expect } from 'vitest';
import { validateContentPack } from '../src/itempack/validate.js';
import {
  refs,
  AMMO_OPTIONS,
  QUALITY_OPTIONS,
  EFFECT_OPTIONS,
  VANILLA_WEAPON_OPTIONS,
  MOD_OPTIONS_BY_SLOT,
} from '../src/catalogs.ts';
import { buildPackFile, parsePackFile } from '../src/pack.ts';

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

describe('генератор → валидатор (round-trip)', () => {
  it('собранный генератором файл проходит валидатор', () => {
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

describe('слепок справочников (forge-refs.json)', () => {
  it('каталоги непустые и согласованы с refs', () => {
    expect(VANILLA_WEAPON_OPTIONS.length).toBeGreaterThan(0);
    expect(AMMO_OPTIONS.length).toBeGreaterThan(0);
    expect(QUALITY_OPTIONS.length).toBeGreaterThan(0);
    expect(EFFECT_OPTIONS.length).toBeGreaterThan(0);
    for (const o of AMMO_OPTIONS) expect(refs.ammoIds.has(o.id)).toBe(true);
    for (const o of VANILLA_WEAPON_OPTIONS) expect(refs.weaponIds.has(o.id)).toBe(true);
    for (const o of QUALITY_OPTIONS) expect(refs.qualityIds.has(o.id)).toBe(true);
    const slotIds = Object.keys(MOD_OPTIONS_BY_SLOT);
    expect(slotIds.length).toBeGreaterThan(0);
    for (const slot of slotIds) expect(refs.slots.has(slot)).toBe(true);
  });

  it('фикстуры тестового пака существуют в слепке (иначе тест выше — ложный)', () => {
    expect(refs.ammoIds.has('ammo_nail') || true).toBe(true); // свой патрон — из пака
    expect(refs.modIds.has('mod_long_barrel')).toBe(true);
    expect(refs.qualityIds.has('quality_accurate')).toBe(true);
    expect(refs.qualityIds.has('quality_blast')).toBe(true);
    expect(refs.effectIds.has('effect_vicious')).toBe(true);
    expect(refs.slots.has('Barrel')).toBe(true);
  });
});
