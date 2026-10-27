// ПРИЁМОЧНЫЙ (патч 429): слово владельца про мобильные экраны —
// «Отдельное окно, с чекбоксами категорий. И только когда выбран
// чекбокс — показать параметры категории, а не сразу всё, а потом
// отсекать параметры по фильтру. Наоборот, сначала параметры не видно,
// пока не выбрана категория». Фильтр переехал из встроенной панели в
// отдельное окно: до отметки категорий в окне ТОЛЬКО чекбоксы; отметил —
// появились «Редкость» и параметры отмеченных категорий. Внизу кнопка
// «Показать (N)» — сколько предметов найдётся. Шапка и кнопка на месте,
// содержимое прокручивается (скролл-закон 402).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCurrentLocale } from '../../i18n/locale';
import { tInventory } from '../../components/screens/InventoryScreen/logic/inventoryI18n';
import { countFilteredItems } from '../../modules/fallout/logic/equipmentFilter';

setCurrentLocale('ru-RU');

const windowCode = () => readFileSync('modules/fallout/screens/InventoryScreen/modals/EquipmentFilterModal.js', 'utf8');

describe('Патч 429: фильтр — отдельным окном', () => {
  it('фильтр рендерится как Modal поверх окна добавления; список не спрятан', () => {
    const modal = readFileSync('components/screens/InventoryScreen/modals/AddItemModal.js', 'utf8');
    expect(modal).toContain("import EquipmentFilterModal from '../../../../modules/fallout/screens/InventoryScreen/modals/EquipmentFilterModal'");
    expect(modal).toContain('visible={filterOpen}');
    expect(modal).toContain('foundCount={foundCount}');
    // встроенной панели больше нет нигде
    expect(modal).not.toContain('EquipmentFilterPanel');
    expect(readFileSync('styles/AddItemModal.styles.js', 'utf8')).toContain('listDivider');
  });

  it('окно по скролл-закону: шапка и кнопка «Показать» на месте, содержимое в ScrollView', () => {
    const code = windowCode();
    expect(code).toContain('ScrollView');
    // шапка до прокручиваемого содержимого, низ — после
    expect(code.indexOf('styles.header')).toBeGreaterThan(-1);
    expect(code.indexOf('<ScrollView')).toBeGreaterThan(code.indexOf('styles.header'));
    expect(code.indexOf('styles.footer')).toBeGreaterThan(code.indexOf('</ScrollView>'));
    expect(code).toContain('styles.showButton');
  });

  it('сначала параметры НЕ видно: без категорий — только чекбоксы', () => {
    const code = windowCode();
    // блок параметров существует только под условием «есть отмеченные»
    expect(code).toContain('anyKindChecked && (');
    // «Редкость» — общий параметр, тоже появляется только после отметки
    expect(code.indexOf('anyKindChecked && (')).toBeLessThan(code.indexOf("t('rarity')"));
    // старого правила «нет отметок — показывать все секции» больше нет
    expect(code).not.toContain('!kindPicked');
  });

  it('отметка категории раскрывает только её параметры (как в 427, но строго)', () => {
    const code = windowCode();
    expect(code).toContain("const showWeapon = kinds.includes('weapon')");
    expect(code).toContain("const showArmor = kinds.includes('armor') || kinds.includes('powerArmor') || kinds.includes('clothing')");
    expect(code).toContain('{showWeapon && (');
    expect(code).toContain('{showArmor && (');
  });

  it('кнопка «Показать (N)» — с числом найденных предметов', () => {
    const code = windowCode();
    expect(code).toContain("t('show')");
    expect(code).toContain('foundCount ?? 0');
    const ru = JSON.parse(readFileSync('modules/fallout/i18n/ru-RU/screens/inventory/modals/addItemModal.json', 'utf8'));
    const en = JSON.parse(readFileSync('modules/fallout/i18n/en-EN/screens/inventory/modals/addItemModal.json', 'utf8'));
    expect(ru.filter.show).toBe('Показать');
    expect(en.filter.show).toBe('Show');
    expect(ru.filter.categories).toBe('Категории');
    expect(en.filter.categories).toBe('Categories');
    // тот же резолвер, что весь UI (закон 422)
    expect(tInventory('modals.addItemModal.filter.show')).toBe('Показать');
    expect(tInventory('modals.addItemModal.filter.categories')).toBe('Категории');
  });
});

describe('Патч 429: счётчик найденных предметов', () => {
  it('считает предметы (объекты с именем), заголовки групп — нет', () => {
    const tree = {
      Оружие: { Лёгкое: [{ name: 'Клинок' }, { name: 'Пистолет' }] },
      Броня: { Всё: [{ name: 'Кожанка' }] },
      Пусто: {},
      Моды: { Всё: [{ name: 'Прицел', itemType: 'weaponMod' }] },
    };
    expect(countFilteredItems(tree)).toBe(4);
    expect(countFilteredItems({ Всё: ['Заголовок', 'Ещё заголовок'] })).toBe(0);
    expect(countFilteredItems(null)).toBe(0);
  });
});
