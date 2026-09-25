// ПРИЁМОЧНЫЙ (патч 339): уточнения владельца по трём модам — эффекты
// записаны ЕГО СЛОВАМИ и показываются в окне эффектов, колонки СУ пусты.
//   • Парирующая: +2 Физ. СУ, только против атак с навыком «Ближний бой»;
//   • Мягкая подкладка (ноги): +2 Физ. СУ, только когда персонаж падает;
//   • Облегчённая (руки): надетая броня даёт держимому оружию
//     (Ближний бой / Рукопашная) «Проникающий» 1, складывается.
import { describe, expect, it } from 'vitest';

import armorMods from '../../modules/fallout/data/equipment/armor_mods.json';
import ruMods from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/armor_mods.json';

const byId = new Map(armorMods.map((m) => [m.id, m]));
const ruById = new Map(ruMods.map((m) => [m.id, m]));

describe('патч 339: условные эффекты — словами владельца, без плоских СУ', () => {
  it('у всех трёх колонки СУ пустые (эффект живёт в спецэффектах)', () => {
    for (const id of ['mod_std_parrying', 'mod_std_soft_padding_legs', 'mod_std_lightweight_arms']) {
      const st = byId.get(id).statModifiers;
      expect(st.physicalDamageRating.value, `${id}: физ`).toBe(0);
      expect(st.energyDamageRating.value, `${id}: энерго`).toBe(0);
      expect(st.radiationDamageRating.value, `${id}: рад`).toBe(0);
      expect(byId.get(id).specialEffects.length, `${id}: эффект есть`).toBeGreaterThan(0);
    }
  });

  it('описания — слова владельца (ru; их читает окно эффектов)', () => {
    const desc = (id) => ruById.get(id).specialEffects[0].description;
    expect(desc('mod_std_parrying')).toContain('навыка «Ближний бой»');
    expect(desc('mod_std_parrying')).toContain('+2 Физ. СУ');
    expect(desc('mod_std_soft_padding_legs')).toContain('падает');
    expect(desc('mod_std_lightweight_arms')).toContain('«Проникающий» 1');
    expect(desc('mod_std_lightweight_arms')).toContain('складывается');
  });

  it('id эффектов неизменны (механика цепляется к тем же ключам)', () => {
    expect(byId.get('mod_std_parrying').specialEffects[0].id).toBe('effect_melee_damage_resistance_2');
    expect(byId.get('mod_std_soft_padding_legs').specialEffects[0].id).toBe('effect_fall_damage_resistance');
    expect(byId.get('mod_std_lightweight_arms').specialEffects[0].id).toBe('effect_melee_piercing_1');
  });
});
