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
import { tInventory } from '../../components/screens/InventoryScreen/logic/inventoryI18n';
import { countFilteredItems, countFoundItems } from '../../modules/fallout/logic/equipmentFilter';

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

  it('счётчик «Показать (N)» — countFoundItems по словарным подписям (урок 433)', () => {
    const code = modal();
    // 433: служебные ключи «weapon» промахивались мимо дерева с подписями
    // («Оружие») — счётчик показывал всегда 0. Теперь подписи из того же
    // словаря, что ключи дерева, а счёт — поведенческим тестом ниже.
    expect(code).toContain('countFoundItems(filteredData, filterLabels, filterActive)');
    expect(code).toContain("tInventory(`modals.addItemModal.categories.${key}`)");
    // 438: моды в счётчике больше не участвуют
    expect(code).not.toContain('modsSection');
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

  it('438: gearOnly — только снаряжение (модов в результатах больше нет), расходники — нет', () => {
    expect(countFilteredItems(tree, true)).toBe(1);
  });

  it('без gearOnly (обычный каталог/поиск) — считаются все предметы', () => {
    expect(countFilteredItems(tree)).toBe(5);
    expect(countFilteredItems(null)).toBe(0);
  });
});

// 433: поведенческий тест счётчика «Показать (N)» — на ТЕХ ЖЕ словарных
// подписях, которыми окно строит дерево. Поймал бы баг «всегда 0».
describe('Патч 433: счётчик «Показать (N)» считается по словарным подписям дерева', () => {
  const gearLabel = (key) => tInventory(`modals.addItemModal.categories.${key}`);
  const labels = {
    gear: ['weapon', 'armor', 'powerArmor', 'clothing'].map(gearLabel),
  };

  it('снаряжение считается, расходники — нет; ключи — словарные (438: без модов)', () => {
    const tree = {
      [gearLabel('weapon')]: { 'Лёгкое': [{ name: 'Пистолет', itemType: 'weapon' }] },
      [gearLabel('armor')]: { 'Всё': [{ name: 'Кожанка', itemType: 'armor' }] },
      [gearLabel('ammo')]: { [tInventory('modals.addItemModal.categories.all')]: [{ name: 'Патрон', itemType: 'ammo' }] },
      [gearLabel('junk')]: { [tInventory('modals.addItemModal.categories.all')]: [{ name: 'Банка', itemType: 'junk' }] },
    };
    expect(countFoundItems(tree, labels, true)).toBe(2);
    expect(countFoundItems(tree, labels, false)).toBe(4);
  });

  it('пустые и отсутствующие группы не ломают счёт', () => {
    expect(countFoundItems({ [gearLabel('weapon')]: { 'Лёгкое': [] } }, labels, true)).toBe(0);
    expect(countFoundItems(null, labels, true)).toBe(0);
    expect(countFoundItems({ [gearLabel('weapon')]: { 'Лёгкое': [{ name: 'Нож', itemType: 'weapon' }] } }, labels, false)).toBe(1);
  });
});
