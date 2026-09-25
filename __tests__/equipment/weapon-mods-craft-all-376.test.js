// ПРИЁМОЧНЫЙ (патч 376): крафт для всех модов + 23 новых улучшения +
// Посох Атома и Шахтерский перфоратор (владелец: «заводить»).
//   • у каждого мода каталога есть колонки крафта → рецепт (квадрат «Оружие»);
//   • новые улучшения применяются к оружию владельца (Динамо — энергия и
//     скорострельность у Минигана Гаусса; Пульсовый конденсатор — «Скачок»);
//   • Посох Атома (6, Проникающий 1, Парирование, Двуручное) и Шахтерский
//     перфоратор (2, Проникающий 2, Разрушающий, Двуручное) в каталоге;
//   • слоты новых модов появляются в окне улучшения.
import { describe, expect, it } from 'vitest';

import catalogData from '../../modules/fallout/data/equipment/weapon_mods.json';
import recipeData from '../../modules/fallout/data/recipes/weapons.json';
import weaponsData from '../../modules/fallout/data/equipment/weapons.json';
import slotsData from '../../modules/fallout/data/equipment/weapon_mod_slots.json';
import { resolveWeaponWithAppliedMods } from '../../domain/resolveItem';

const weaponById = (id) => weaponsData.find((w) => w.id === id);
const modById = (id) => catalogData.find((m) => m.id === id);

describe('патч 376: рецепты для всех, 23 новых мода, 2 новых оружия', () => {
  it('у каждого мода каталога есть рецепт крафта (164/164)', () => {
    expect(catalogData).toHaveLength(164);
    const ids = new Set(catalogData.map((m) => m.id));
    expect(recipeData.length).toBe(164);
    for (const m of catalogData) {
      expect(ids.has(m.id)).toBe(true);
      expect(modById(m.id).complexity).not.toBeNull();
    }
    for (const id of ids) expect(recipeData.some((r) => r.id === id)).toBe(true);
  });

  it('Динамо катушки Теслы: энергия + скорострельность +1 на Минигане Гаусса, вес 6', () => {
    const mod = modById('mod_tesla_coil_dynamo');
    expect(mod.damageType).toBe('energy');
    expect(mod.fireRateModifier).toEqual({ op: '+', value: 1 });
    expect(mod.weight).toBe(6);
    expect(mod.applies_to_ids).toContain('weapon_gauss_minigun');
    const base = weaponById('weapon_gauss_minigun');
    const resolved = resolveWeaponWithAppliedMods(
      { ...base, appliedMods: { Capacitor: 'mod_tesla_coil_dynamo' } },
      { weapons: weaponsData, weaponMods: catalogData },
    );
    expect(resolved.fireRate).toBe(base.fireRate + 1);
    expect(resolved.damageType).toEqual(['energy']);
  });

  it('Пульсовый конденсатор даёт качество «Скачок», Калиброванный — «Порочный»', () => {
    expect(modById('mod_pulse_capacitor').qualityChanges).toEqual([
      { op: 'gain', id: 'quality_surge' },
    ]);
    expect(modById('mod_calibrated_capacitor_pc').effectChanges).toEqual([
      { op: 'gain', id: 'effect_vicious' },
    ]);
  });

  it('Посох Атома и Шахтерский перфоратор в каталоге с качествами владельца', () => {
    const staff = weaponById('weapon_atom_staff');
    expect(staff.damage).toBe(6);
    expect(staff.qualities.map((q) => q.qualityId)).toEqual(
      expect.arrayContaining(['quality_parry', 'quality_two-handed']),
    );
    expect(staff.effects).toEqual([{ effectId: 'effect_piercing_x' }]);
    const drill = weaponById('weapon_mining_drill');
    expect(drill.damage).toBe(2);
    expect(drill.effects.map((e) => e.effectId)).toEqual(
      expect.arrayContaining(['effect_piercing_x', 'effect_breaking']),
    );
    // мод Посоха подходит только ему и имеет рецепт
    expect(modById('mod_shocking_coils').applies_to_ids).toEqual(['weapon_atom_staff']);
    expect(recipeData.some((r) => r.id === 'mod_shocking_coils')).toBe(true);
  });

  it('слоты новых модов видны в окне улучшения', () => {
    expect(slotsData.weapon_gauss_minigun.Capacitor).toContain('mod_tesla_coil_dynamo');
    expect(slotsData.weapon_plasma_caster.Capacitor).toContain('mod_pulse_capacitor');
    expect(slotsData.weapon_tear_gas_launcher.Camera).toEqual([
      'mod_3_charge_camera',
      'mod_6_charge_camera',
    ]);
    expect(slotsData.weapon_atom_staff.Unique).toEqual(['mod_shocking_coils']);
    expect(slotsData.weapon_auto_axe.Unique).toContain('mod_turbo');
    expect(slotsData.weapon_chainsaw.Unique).toContain('mod_flamer_chain');
  });
});

function modByIdSafe(id) {
  return catalogData.find((m) => m.id === id) ?? null;
}
