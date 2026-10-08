// ПРИЁМОЧНЫЙ (патч 430): слово владельца — «а фильтр то показывает
// отсортированные материалы? У меня нет. Я выбрал броню, выбрал
// редкость 5. Нажал показать и снова я на экране каталога». Дефект:
// фильтр применялся к дереву, но после «Показать» окно возвращалось на
// экран каталога категорий — отфильтрованные предметы надо было ещё
// искать вручную. Теперь при активном фильтре окно показывает ПЛОСКИЙ
// ОТСОРТИРОВАННЫЙ список находок с заголовком «Найдено: N»; каталог —
// только без фильтра. Заодно: секция «Моды» (425) теперь попадает и в
// плоский список поиска (раньше терялась).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCurrentLocale } from '../../i18n/locale';
import { tInventory, formatInventoryText } from '../../components/screens/InventoryScreen/logic/inventoryI18n';
import { emptyEquipmentFilter, isEquipmentFilterEmpty } from '../../modules/fallout/logic/equipmentFilter';

setCurrentLocale('ru-RU');

const modal = () => readFileSync('components/screens/InventoryScreen/modals/AddItemModal.js', 'utf8');

describe('Патч 430: «Показать» ведёт к результатам, а не к каталогу', () => {
  it('при активном фильтре — плоский список (общий сборщик с поиском)', () => {
    const code = modal();
    expect(code).toContain('const filterActive = !isEquipmentFilterEmpty(equipmentFilter)');
    expect(code).toContain('if (searchTerm || filterActive) {');
    // плоский список сортируется по имени («отсортированные материалы»)
    expect(code).toContain("visible.sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')))");
  });

  it('заголовок окна при активном фильтре — «Найдено: N», кнопки «Назад» нет', () => {
    const code = modal();
    expect(code).toContain("formatInventoryText(tInventory('modals.addItemModal.filter.resultsFound'), { n: foundCount })");
    // каталог и «Назад» — только без фильтра
    expect(code).toContain('currentPath.length > 0 && !searchTerm && !filterActive && (');
  });

  it('секция «Моды» входит в плоский список (поиск и фильтр)', () => {
    const code = modal();
    const start = code.indexOf('const flatKeys');
    expect(start).toBeGreaterThan(-1);
    const block = code.slice(start, code.indexOf('flatKeys.forEach'));
    expect(block).toContain("tInventory('modals.addItemModal.filter.modsSection')");
  });

  it('зависимости useMemo включают фильтр (432 добавил filterActive)', () => {
    const code = modal();
    expect(code).toContain('[engineLocale, filteredData, currentPath, searchTerm, equipmentFilter, filterActive]');
  });

  it('словарь: «Найдено: {n}» тем же резолвером (закон 422)', () => {
    expect(tInventory('modals.addItemModal.filter.resultsFound')).toBe('Найдено: {n}');
    expect(formatInventoryText(tInventory('modals.addItemModal.filter.resultsFound'), { n: 7 })).toBe('Найдено: 7');
    const en = JSON.parse(readFileSync('modules/fallout/i18n/en-EN/screens/inventory/modals/addItemModal.json', 'utf8'));
    expect(en.filter.resultsFound).toBe('Found: {n}');
  });

  it('пустой фильтр — по-прежнему каталог, ничего не сломано', () => {
    expect(isEquipmentFilterEmpty(emptyEquipmentFilter())).toBe(true);
    expect(isEquipmentFilterEmpty({ ...emptyEquipmentFilter(), kinds: ['armor'] })).toBe(false);
  });
});
