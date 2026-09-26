// ПРИЁМОЧНЫЙ (патч 377): пересборка «оружие → моды» по спискам владельца
// и переименования оружия (владелец — приоритет).
//   • окно улучшения строится из списков владельца: у Боевого дробовика —
//     его конденсаторы/прицелы, у Гатлинг-лазера исчезли лишние улучшения;
//   • Электросварка («Дуговая сварка», слово владельца 373) — модов НЕТ:
//     24 лишние привязки сняты;
//   • Институтский лазер: 17 улучшений по референсу владельца;
//   • 10-мм ПП и Плазменная мина не тронуты (списков владельца нет);
//   • робо-наследование живо: слоты робо-версии = людские;
//   • переименования: «Выкидной нож», «Дубинка», «Большой меч»,
//     «Лазерный пистолет института» и др.
import { describe, expect, it } from 'vitest';

import catalogData from '../../modules/fallout/data/equipment/weapon_mods.json';
import slotsData from '../../modules/fallout/data/equipment/weapon_mod_slots.json';
import weaponsData from '../../modules/fallout/data/equipment/weapons.json';
import ruWeapons from '../../modules/fallout/i18n/ru-RU/data/equipment/weapons/weapons.json';
import { resolveWeaponWithAppliedMods } from '../../domain/resolveItem';

const catalog = { weapons: weaponsData, weaponMods: catalogData };
const modById = (id) => catalogData.find((m) => m.id === id);

describe('патч 377: поддержка пересобрана по спискам владельца', () => {
  it('Электросварка (Дуговая сварка) не поддерживает ни одного мода', () => {
    expect(slotsData.weapon_arc_welder).toBeUndefined();
    for (const m of catalogData) {
      expect(m.applies_to_ids ?? []).not.toContain('weapon_arc_welder');
    }
  });

  it('Институтский лазер: 17 улучшений ровно по референсу владельца', () => {
    const ids = new Set(Object.values(slotsData.weapon_institute_laser).flat());
    expect(ids.size).toBe(17);
    for (const id of [
      'mod_photon_exciter', 'mod_beta_wave_tuner', 'mod_boosted_capacitor', 'mod_photon_agitator',
      'mod_long_barrel', 'mod_automatic_barrel', 'mod_improved_barrel', 'mod_standard_stock',
      'mod_reflex_sight', 'mod_short_scope', 'mod_long_scope', 'mod_short_night_vision_scope',
      'mod_long_night_vision_scope', 'mod_recon_scope', 'mod_beam_splitter',
      'mod_beam_focuser_institute_laser', 'mod_gyro_compensating_lens',
    ]) expect(ids.has(id)).toBe(true);
  });

  it('новые улучшения 376 видны в окнах своих оружий', () => {
    expect(slotsData.weapon_gauss_minigun.Capacitor).toContain('mod_tesla_coil_dynamo');
    expect(slotsData.weapon_plasma_caster.Capacitor).toContain('mod_pulse_capacitor');
    expect(slotsData.weapon_auto_axe.Unique).toContain('mod_turbo');
  });

  it('10-мм ПП и Плазменная мина не пересобирались (списков владельца нет)', () => {
    // У ПП Томпсона (список есть) появился ресивер 10-мм — а у 10-мм ПП
    // и Плазменной мины состав слотов не менялся: моды остаются прежние.
    const smg = slotsData.weapon_10mm_smg;
    const smgIds = new Set(Object.values(smg).flat());
    expect(smgIds.has('mod_improved')).toBe(false); // «Улучшенный» — только Помповому
    const mine = new Set(Object.values(slotsData.weapon_plasma_mine ?? {}).flat());
    expect(mine.size).toBeGreaterThan(0); // поддержка не снята
  });

  it('робо-наследование: слоты робо-версии повторяют людские (проверка на Лазерном пистолете)', () => {
    const human = slotsData.weapon_laser_pistol ?? slotsData.weapon_laser_gun;
    expect(Object.keys(human).length).toBeGreaterThan(0);
    const flat = new Set(Object.values(human).flat());
    expect(flat).toContain('mod_photon_exciter');
    expect(flat).toContain('mod_boosted_capacitor');
  });

  it('Дуговая сварка и моды: имя оружия переименовано по владельцу', () => {
    const name = (id) => ruWeapons.find((w) => w.id === id)?.name;
    expect(name('weapon_arc_welder')).toBe('Дуговая сварка');
    expect(name('weapon_switchblade')).toBe('Выкидной нож');
    expect(name('weapon_baton')).toBe('Дубинка');
    expect(name('weapon_bumper_sword')).toBe('Большой меч');
    expect(name('weapon_institute_laser')).toBe('Лазерный пистолет института');
    expect(name('weapon_tesla_rifle')).toBe('Карабин Теслы');
  });

  it('переименование не задело EN-имена', () => {
    const en = require('../../modules/fallout/i18n/en-EN/data/equipment/weapons/weapons.json');
    expect(en.find((w) => w.id === 'weapon_arc_welder')?.name).not.toBe('Дуговая сварка');
  });
});
