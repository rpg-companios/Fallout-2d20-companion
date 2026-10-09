// ПРИЁМОЧНЫЙ (патч 427): улучшение фильтра по слову владельца —
// «в модалках поиск и фильтр совместить. Фильтр не скролится, отделить
// чертой фильтр и поиск от списка предметов… сделать чекбоксы категорий.
// Броня, Оружие, Силовая броня». Поиск и кнопка «Фильтр» — одна строка;
// панель закреплена над чертой, отделяющей её от списка (сам прокрутку
// не водит); чекбоксы категорий показывают только свои параметры.
// Одежду добавил четвёртой: она есть в окне (32 предмета), без своей
// галочки она пряталась бы при любой отметке.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCurrentLocale } from '../../i18n/locale';
import { tInventory } from '../../components/screens/InventoryScreen/logic/inventoryI18n';
import {
  GEAR_KINDS,
  activeEquipmentFilterCount,
  applyEquipmentFilter,
  buildEquipmentFilterOptions,
  emptyEquipmentFilter,
  pruneTreeByEquipmentFilter,
} from '../../modules/fallout/logic/equipmentFilter';

setCurrentLocale('ru-RU');

const gear = (itemType, extra = {}) => ({ itemType, ...extra });
const weapon = () => gear('weapon', { damage: 3, rarity: 1 });
const armor = () => gear('armor', { physicalDamageRating: { total: 2 }, rarity: 1 });
const powerArmor = () => gear('powerArmor', { physicalDamageRating: { total: 5 }, rarity: 3 });
const clothing = () => gear('clothing', { physicalDamageRating: { total: 0 }, rarity: 0 });
const ammo = () => ({ itemType: 'ammo', name: 'Патрон' });
const weaponMod = () => ({ itemType: 'weaponMod', name: 'Мод' });

describe('Патч 427: чекбоксы категорий в фильтре', () => {
  it('пустой фильтр знает kinds; без отметок работает как раньше', () => {
    const empty = emptyEquipmentFilter();
    expect(empty.kinds).toEqual([]);
    expect(applyEquipmentFilter(weapon(), empty)).toBe(true);
    expect(applyEquipmentFilter(armor(), empty)).toBe(true);
    expect(applyEquipmentFilter(ammo(), empty)).toBe(true);
  });

  it('отмеченная категория прячет остальные виды снаряжения', () => {
    const filter = { ...emptyEquipmentFilter(), kinds: ['armor'] };
    expect(applyEquipmentFilter(armor(), filter)).toBe(true);
    expect(applyEquipmentFilter(weapon(), filter)).toBe(false);
    expect(applyEquipmentFilter(powerArmor(), filter)).toBe(false);
    expect(applyEquipmentFilter(clothing(), filter)).toBe(false);
  });

  it('неснаряжение и моды проходят при любых категориях (моды про «что даёт мод»)', () => {
    const filter = { ...emptyEquipmentFilter(), kinds: ['weapon'] };
    expect(applyEquipmentFilter(ammo(), filter)).toBe(true);
    expect(applyEquipmentFilter(weaponMod(), filter)).toBe(true);
    expect(applyEquipmentFilter(weapon(), filter)).toBe(true);
  });

  it('обрезка дерева: чужие ветки исчезают целиком, моды остаются', () => {
    const tree = {
      Оружие: { Всё: [weapon()] },
      Броня: { Всё: [armor()] },
      Одежда: { Всё: [clothing()] },
      Моды: { Всё: [weaponMod()] },
    };
    const pruned = pruneTreeByEquipmentFilter(tree, { ...emptyEquipmentFilter(), kinds: ['weapon'] });
    expect(Object.keys(pruned).sort()).toEqual(['Моды', 'Оружие']);
  });

  it('варианты категорий — ровно виды снаряжения, с подписями из словаря окна', () => {
    const options = buildEquipmentFilterOptions('ru-RU', {
      ammoNames: [],
      damageTypes: { physical: 'Ф', energy: 'Э', radiation: 'Р', special: 'О', poison: 'Я' },
      weaponTypes: { Light: 'Л', Melee: 'Б', Energy: 'Эн', Explosive: 'В', Heavy: 'Т', Unarmed: 'Рук', Thrown: 'Мет' },
      distances: { C: 'Б', M: 'С', L: 'Д' },
      bodyParts: { Head: 'Г', Body: 'Т', Hand: 'Р', Leg: 'Н' },
      kinds: {
        weapon: tInventory('modals.addItemModal.categories.weapon'),
        armor: tInventory('modals.addItemModal.categories.armor'),
        powerArmor: tInventory('modals.addItemModal.categories.powerArmor'),
        clothing: tInventory('modals.addItemModal.categories.clothing'),
      },
    });
    expect(options.kinds.map((kind) => kind.id)).toEqual(GEAR_KINDS);
    expect(options.kinds.map((kind) => kind.name)).toEqual(['Оружие', 'Броня', 'Силовая броня', 'Одежда']);
  });
});

describe('Патч 427: счётчик активных условий на кнопке «Фильтр»', () => {
  it('пустой фильтр — ноль; каждая отметка/диапазон/пункт считается', () => {
    expect(activeEquipmentFilterCount(null)).toBe(0);
    expect(activeEquipmentFilterCount(emptyEquipmentFilter())).toBe(0);
    const filter = {
      ...emptyEquipmentFilter(),
      kinds: ['weapon', 'armor'], // +2
      rarity: { from: '2', to: '' }, // +1
      damageTypes: ['energy', 'radiation'], // +2
    };
    expect(activeEquipmentFilterCount(filter)).toBe(5);
  });
});

describe('Патч 427: проводка окна — поиск+фильтр одной строкой, черта, панель закреплена', () => {
  const modal = () => readFileSync('components/screens/InventoryScreen/modals/AddItemModal.js', 'utf8');
  // 429: панель переехала в отдельное окно EquipmentFilterModal.
  const panel = () => readFileSync('modules/fallout/screens/InventoryScreen/modals/EquipmentFilterModal.js', 'utf8');
  const modalStyles = () => readFileSync('styles/AddItemModal.styles.js', 'utf8');

  it('в окне поиск и кнопка «Фильтр» в одной строке (тулбар), черта перед списком', () => {
    const code = modal();
    expect(code).toContain('styles.filterToolbar');
    expect(code).toContain('styles.searchInputInToolbar');
    expect(code).toContain('styles.filterToggle');
    // 437 (слово владельца): иконка-воронка — из того же набора, что
    // иконки категорий крафта (MaterialCommunityIcons), имя «filter»
    expect(code).toContain("import { MaterialCommunityIcons } from '@expo/vector-icons';");
    expect(code).toContain('<MaterialCommunityIcons name="filter" style={styles.filterIcon} />');
    expect(code).toContain('activeFilterCount > 0');
    expect(code).toContain('styles.filterBadge');
    expect(code).toContain('styles.listDivider');
    // кнопка открывает/закрывает окно фильтра (429)
    expect(code).toContain('setFilterOpen((prev) => !prev)');
    expect(code).toContain('activeEquipmentFilterCount(equipmentFilter)');
    expect(code).toContain('visible={filterOpen}');
    expect(code).not.toContain('onToggleOpen');
    expect(code).not.toContain('EquipmentFilterPanel');
  });

  it('в стилях окна есть тулбар и черта', () => {
    const code = modalStyles();
    expect(code).toContain('filterToolbar');
    expect(code).toContain('searchInputInToolbar');
    // 436 (владелец: «поиск и фильтр не влезают… фильтр ушёл за границу
    // модалки»): на вебе поле не сжималось ниже врождённой ширины и
    // выталкивало кнопку — minWidth: 0 разрешает сжатие
    expect(code).toContain('minWidth: 0');
    expect(code).toContain('filterToggle');
    expect(code).toContain('listDivider');
    // 437 (слово владельца): квадратная кнопка с воронкой и кружком-счётчиком
    expect(code).toContain('width: 40, height: 40');
    expect(code).toContain('filterIcon: { fontSize: 20, color:');
    expect(code).toContain("backgroundColor: '#22c55e'");
    expect(code).toContain('filterBadge');
    // текстовая кнопка ушла — вместо неё воронка из символов
    expect(code).not.toContain('filterToggleText');
  });

  it('панель: чекбоксы категорий, секции показываются по категориям', () => {
    const code = panel();
    expect(code).toContain('styles.kindsRow');
    expect(code).toContain('options.kinds');
    // адаптивные секции: отмечено — показывается только своё
    expect(code).toContain('showWeapon');
    expect(code).toContain('showArmor');
    expect(code).toContain('kinds.includes');
  });

  it('стили окна: ряд категорий и ячейки-чекбоксы на месте (по 3 в ряд)', () => {
    const stylesCode = readFileSync('modules/fallout/styles/EquipmentFilterModal.styles.js', 'utf8');
    expect(stylesCode).toContain('kindsRow');
    // квадраты по 3 в ряд — ширина ячейки 31% + отступ 2%
    expect(stylesCode).toContain("width: '31%'");
    expect(stylesCode).toContain("marginRight: '2%'");
    expect(stylesCode).toContain('kindBox');
    expect(stylesCode).toContain('kindCheck');
    expect(stylesCode).toContain('kindName');
    expect(stylesCode).not.toContain('spoilerHeader');
  });

  it('кнопка «Фильтр» подписана из словаря (тот же резолвер, что весь UI)', () => {
    expect(tInventory('modals.addItemModal.filter.title')).toBe('Фильтр');
    expect(tInventory('modals.addItemModal.categories.powerArmor')).toBe('Силовая броня');
    expect(tInventory('modals.addItemModal.categories.clothing')).toBe('Одежда');
  });
});
