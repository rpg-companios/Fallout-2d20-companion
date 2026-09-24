// ПРИЁМОЧНЫЙ (патч 346)
// Ревизия колонок крафта модов оружия по присланным владельцем таблицам книги
// (стр. 222–223): Большой магазин, Быстросъёмный магазин, конденсаторы.
// Знак «?» аудита снят со всех подтверждённых колонок; конденсаторные
// материалы остаются под «?» до слова владельца о их сложности.
import { describe, it, expect } from 'vitest';
import data from '../../modules/fallout/data/equipment/weapon_mods.json';
import en from '../../modules/fallout/i18n/en-EN/data/equipment/weapon_mods.json';

const mods = Array.isArray(data) ? data : Object.values(data).find(Array.isArray);
const enList = Array.isArray(en) ? en : Object.values(en).find(Array.isArray);
const idByName = (name) => enList.find((m) => m.name === name)?.id;
const mod = (name) => mods.find((m) => m.id === idByName(name));

describe('ПРИЁМОЧНЫЙ (патч 346): колонки крафта модов оружия — по книге', () => {
  it('«Большой» магазин: сложность 4, Фанатик оружия 1 (было 3 и Фанатик 2)', () => {
    const m = mod('Large Magazine');
    expect(m.complexity).toBe(4);
    expect(m.perk1).toBe('Gun Nut 1');
    expect(m.materials).toBe('Common x 5 Uncommon x 3'); // кривая сложности 4
  });

  it('«Быстросъёмный» магазин: сложность 5, материалы — кривая 5', () => {
    const m = mod('Quick-Eject Mag');
    expect(m.complexity).toBe(5);
    expect(m.materials).toBe('Common x 6 Uncommon x 4 Rare x 2');
    expect(m.perk1).toBe('Gun Nut 1');
  });

  it('«Полные конденсаторы»: оба перка книги (Фанатик оружия 3 + Наука! 2)', () => {
    const m = mod('Full Capacitors');
    expect(m.perk1).toBe('Gun Nut 3');
    expect(m.perk2).toBe('Science! 2');
  });

  it('«Катушка усиления конденсатора»: Фанатик оружия 4 + Наука! 3', () => {
    const m = mod('Capacitor Boosting Coil');
    expect(m.perk1).toBe('Gun Nut 4');
    expect(m.perk2).toBe('Science! 3');
  });

  it('«?» аудита снят со всех материалов, кроме двух конденсаторных (вопрос 1)', () => {
    const withQ = mods.filter((m) => typeof m.materials === 'string' && m.materials.includes('?'));
    expect(withQ.map((m) => m.id).sort()).toEqual(['mod_031', 'mod_032']);
  });

  it('перки без «?» во всех 205 модах', () => {
    for (const m of mods) {
      expect(String(m.perk1 || '')).not.toContain('?');
      expect(String(m.perk2 || '')).not.toContain('?');
    }
  });
});
