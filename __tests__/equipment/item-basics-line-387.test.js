// ПРИЁМОЧНЫЙ (патч 387): в модалке выбора предметов (лут/торговля,
// AddItemModal) у предмета — его базовые характеристики ОДНОЙ СТРОКОЙ
// (слово владельца: «подстрокой … в строчку»). Строка собирается из данных
// каталога (domain/itemBasics.js): оружие — урон/скорострельность/дальность;
// броня — СУ физ/энерг/рад; препараты/еда/напитки — готовый эффект;
// всё — вес/цена. Пустых значений в строке нет.
import { describe, expect, it } from 'vitest';

import { describeItemBasics } from '../../domain/itemBasics';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { readFileSync } from 'node:fs';

const catalog = getEquipmentCatalog('ru-RU');
const catalogEn = getEquipmentCatalog('en-EN');
const weapon = (id) => catalog.weapons.find((w) => w.id === id);
const armorPiece = () => (catalog.armor?.armor || []).flatMap((g) => g.items || [])[0];
const chem = (id) => catalog.chems.find((c) => c.id === id);
const junk = () => catalog.junk.find((j) => j.cost > 0);
const drink = () => catalog.drinks.find((d) => d.positiveEffectLabel);

describe('патч 387: базовые характеристики предмета одной строкой', () => {
  it('оружие: Урон · Скорострельность · Дальность · Вес · Цена', () => {
    expect(describeItemBasics(weapon('weapon_44_pistol'), 'ru-RU'))
      .toBe('Урон 6 · Скорострельность 1 · Дальность: Близкая · Вес 4 · Цена 99');
    const en10 = catalogEn.weapons.find((w) => w.id === 'weapon_10mm_pistol');
    expect(describeItemBasics(en10, 'en-EN'))
      .toBe('Damage 4 · Fire rate 2 · Range: Close · Weight 4 · Cost 50');
  });

  it('броня: СУ по трём типам (ноль СУ показываем), вес, цена', () => {
    const line = describeItemBasics(armorPiece(), 'ru-RU');
    expect(line).toContain('Физ 1');
    expect(line).toContain('Энерг 1');
    expect(line).toContain('Рад 0'); // ноль СУ — характеристика, не пустота
    expect(line).toContain('Вес');
    expect(line).toContain('Цена');
  });

  it('препарат/напиток: эффект каталога, вес, цена; хлам: вес и цена', () => {
    const chemLine = describeItemBasics(chem('chem_addictol'), 'ru-RU');
    expect(chemLine).toContain('Снимает зависимость');
    expect(chemLine).toContain('Вес 0.5');
    expect(chemLine).toContain('Цена 125');
    expect(describeItemBasics(drink(), 'ru-RU')).toContain('+1 AP');
    const junkLine = describeItemBasics(junk(), 'ru-RU');
    expect(junkLine).toContain('Вес');
    expect(junkLine).toContain('Цена');
  });

  it('пустые/кривые входы и нули не шумят', () => {
    expect(describeItemBasics(null)).toBe('');
    expect(describeItemBasics({})).toBe('');
    expect(describeItemBasics({ weight: 0, cost: 0 })).toBe('');
    expect(describeItemBasics('Просто папка')).toBe('');
  });

  it('проводка: AddItemModal рисует подстроку (itemBasics)', () => {
    const src = readFileSync('components/screens/InventoryScreen/modals/AddItemModal.js', 'utf8');
    expect(src).toContain('describeItemBasics(item, moduleLocale)');
    expect(src).toContain('styles.itemBasics');
  });
});
