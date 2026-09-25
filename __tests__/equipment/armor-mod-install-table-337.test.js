// ПРИЁМОЧНЫЙ (патч 337): таблица установки модов брони — данные совпадают.
// Слово владельца (диктовка таблицы книги, «Модификации для улучшения брони»):
//   1) у Парирующей и Мягкой подкладки (ноги) колонки СУ пустые — их эффекты
//      («+2 от ближнего боя», «+2 от падения») живут ТОЛЬКО в спецэффектах
//      (двойной учёт статов исправлен);
//   2) спецэффекты/веса/цены/перки 12 стандартных модов — книжные.
import { describe, expect, it } from 'vitest';

import armorMods from '../../modules/fallout/data/equipment/armor_mods.json';
import armorEffects from '../../modules/fallout/data/equipment/armor_effects.json';

const byId = new Map(armorMods.map((m) => [m.id, m]));

describe('патч 337: таблица установки модов — данные с книгой совпадают', () => {
  it('Парирующая: +2 от ближнего боя — спецэффект, в колонках СУ нули', () => {
    const m = byId.get('mod_std_parrying');
    expect(m.statModifiers).toEqual({
      physicalDamageRating: { op: '+', value: 0 },
      energyDamageRating: { op: '+', value: 0 },
      radiationDamageRating: { op: '+', value: 0 },
    });
    expect(m.specialEffects).toEqual([{ id: 'effect_melee_damage_resistance_2', value: 2 }]);
    expect(armorEffects.effect_melee_damage_resistance_2).toEqual({
      type: 'resistance', damageType: 'melee', value: 2,
    });
  });

  it('Мягкая подкладка (ноги): +2 от падения — спецэффект, в колонках СУ нули', () => {
    const m = byId.get('mod_std_soft_padding_legs');
    expect(m.statModifiers.physicalDamageRating.value).toBe(0);
    expect(m.specialEffects).toEqual([{ id: 'effect_fall_damage_resistance', value: 2 }]);
  });

  it('остальные 10 стандартных модов: книжные веса/цены/перки на месте', () => {
    const book = {
      mod_std_soft_padding:        { cost: 1, weight: 4, perk: '' },
      mod_std_asbestos_lining:     { cost: 3, weight: 4, perk: 'Бронник 1' },
      mod_std_dense:               { cost: 7, weight: 4, perk: 'Бронник 3' },
      mod_std_biocomponents_mesh:  { cost: 9, weight: 2, perk: 'Бронник 4, Наука! 2' },
      mod_std_pneumatic:           { cost: 9, weight: 2, perk: 'Бронник 4' },
      mod_std_melee:               { cost: 1, weight: 1, perk: 'Бронник 1' },
      mod_std_balanced:            { cost: 1, weight: 1, perk: 'Бронник 2' },
      mod_std_aerodynamic:         { cost: 1, weight: 0, perk: 'Бронник 3' },
      mod_std_lightweight_arms:    { cost: 3, weight: 1, perk: 'Бронник 4' },
      mod_std_soundproofed:        { cost: 2, weight: 0, perk: 'Бронник 2' },
    };
    for (const [id, want] of Object.entries(book)) {
      const m = byId.get(id);
      expect(m, id).toBeTruthy();
      expect(m.costModifier.value, `${id}: цена`).toBe(want.cost);
      expect(m.weightModifier.value, `${id}: вес`).toBe(want.weight);
      expect(m.requiredPerk, `${id}: перк`).toBe(want.perk);
    }
  });
});
