// ПРИЁМОЧНЫЙ (патч 347)
// Слово владельца: конденсаторы оставить как есть («?» снят с их материалов).
// Ревизия редкости по присланным таблицам (с. 222): Large Mag и
// Quick-Eject Mag — Uncommon (было «?Common»); «?» аудита снят со всех
// колонок файла — знаков сомнения в данных модов оружия больше нет.
import { describe, it, expect } from 'vitest';
import data from '../../modules/fallout/data/equipment/weapon_mods.json';
import en from '../../modules/fallout/i18n/en-EN/data/equipment/weapon_mods.json';

const mods = Array.isArray(data) ? data : Object.values(data).find(Array.isArray);
const enList = Array.isArray(en) ? en : Object.values(en).find(Array.isArray);
const mod = (name) => mods.find((m) => m.id === enList.find((x) => x.name === name)?.id);

describe('ПРИЁМОЧНЫЙ (патч 347): редкость по книге, «?» в данных нет', () => {
  it('«Большой» и «Быстросъёмный» магазины — редкость Uncommon (было «?Common»)', () => {
    expect(mod('Large Magazine').rarity).toBe('Uncommon');
    expect(mod('Quick-Eject Mag').rarity).toBe('Uncommon');
  });

  it('конденсаторы оставлены как есть: материалы без «?», прежние числа', () => {
    expect(mod('Full Capacitors').materials).toBe('Common x 6 Uncommon x 4 Rare x 2');
    expect(mod('Capacitor Boosting Coil').materials).toBe('Common x 3');
    expect(mod('Full Capacitors').complexity).toBe(5);
    expect(mod('Capacitor Boosting Coil').complexity).toBe(2);
  });

  it('ни одного «?» ни в одном поле всех 205 модов', () => {
    for (const m of mods) {
      for (const [key, value] of Object.entries(m)) {
        if (typeof value === 'string') expect(value.includes('?'), `${m.id}.${key}`).toBe(false);
      }
    }
  });
});
