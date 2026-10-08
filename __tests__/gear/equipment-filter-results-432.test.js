// ПРИЁМОЧНЫЙ (патч 432): слово владельца — «Я выбрал в нём оружие с
// редкостью от 6 до 6. А мне в списке показаны боеприпасы, химия, хлам
// и т.д.» Дефект 430: плоский список результатов собирал ВСЕ категории,
// а не-снаряжение фильтр пропускает всегда (закон 425) — в результаты
// попадали расходники. Теперь в результатах фильтра только снаряжение,
// прошедшее условия, и секция модов; расходники/хлам — в обычном
// каталоге и в поиске. Счётчик «Показать (N)» считает те же группы
// (прежде был завышен). Заодно Силовая броня добавлена в плоские
// списки (фильтр и поиск) — раньше её там не было.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCurrentLocale } from '../../i18n/locale';
import { countFilteredItems } from '../../modules/fallout/logic/equipmentFilter';

setCurrentLocale('ru-RU');

const modal = () => readFileSync('components/screens/InventoryScreen/modals/AddItemModal.js', 'utf8');

describe('Патч 432: в результатах фильтра — только снаряжение и моды', () => {
  it('сборщик списка: при фильтре группы снаряжения, при поиске — плюс роботы', () => {
    const code = modal();
    expect(code).toContain("const gearGroupKeys = ['weapon', 'armor', 'powerArmor', 'clothing'];");
    expect(code).toContain("const groupKeys = filterActive ? gearGroupKeys : [...gearGroupKeys, 'robotEquipment']");
  });

  it('расходники/хлам — только при поиске, в фильтре не участвуют', () => {
    const code = modal();
    expect(code).toContain("...(filterActive ? [] : ['ammo', 'chems', 'drinks', 'food', 'items', 'materials', 'junk']");
  });

  it('счётчик «Показать (N)» считает те же группы, что и список', () => {
    const code = modal();
    expect(code).toContain('countFilteredItems(countTree, true)');
    expect(code).toContain('[...[\'weapon\', \'armor\', \'powerArmor\', \'clothing\'], tInventory(\'modals.addItemModal.filter.modsSection\')]');
    expect(code).toContain('[filteredData, filterActive, engineLocale]');
  });

  it('зависимости useMemo включают filterActive', () => {
    const code = modal();
    expect(code).toContain('[engineLocale, filteredData, currentPath, searchTerm, equipmentFilter, filterActive]');
  });
});

describe('Патч 432: счётчик с gearOnly — снаряжение и моды, без расходников', () => {
  const tree = {
    Оружие: { Всё: [{ name: 'Гаусс-миниган', itemType: 'weapon' }, { name: 'Патрон', itemType: 'ammo' }] },
    Хлам: { Всё: [{ name: 'Банка', itemType: 'junk' }, { name: 'Химия', itemType: 'chems' }] },
    Моды: { Всё: [{ name: 'Прицел', itemType: 'weaponMod' }] },
  };

  it('gearOnly: снаряжение и моды считаются, расходники — нет', () => {
    expect(countFilteredItems(tree, true)).toBe(2);
  });

  it('без gearOnly (обычный каталог/поиск) — считаются все предметы', () => {
    expect(countFilteredItems(tree)).toBe(5);
    expect(countFilteredItems(null)).toBe(0);
  });
});
