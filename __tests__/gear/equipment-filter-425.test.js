// ПРИЁМОЧНЫЙ (патч 425): фильтры снаряжения в окнах добычи/покупки.
// Слово владельца: «по параметрам снаряжения (кроме веса)»; диапазоны
// «от–до» с серыми подсказками-границами (пропадают при касании);
// качества — ВСЕ из словаря (вопрос владельца про «не встречаются»
// решён проверкой модов: 10 из 22 «мёртвых» на оружии дают моды,
// кроме Бомбарды); «моды это моды — только когда поставят, тогда и
// будут эффекты»: оружие фильтруется по СВОИМ качествам/эффектам,
// выбранное, чего на оружии нет, раскрывает секцию МОДОВ.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildEquipmentFilterOptions,
  emptyEquipmentFilter,
  isEquipmentFilterEmpty,
  applyEquipmentFilter,
  pruneTreeByEquipmentFilter,
  weaponModsProviding,
  readDamageTotal,
} from '../../modules/fallout/logic/equipmentFilter';

const labels = {
  ammoNames: [],
  damageTypes: { physical: 'Ф', energy: 'Э', radiation: 'Р', special: 'О', poison: 'Я' },
  weaponTypes: { Light: 'Л', Melee: 'Б', Energy: 'Эн', Explosive: 'В', Heavy: 'Т', Unarmed: 'Рук', Thrown: 'Мет' },
  distances: { C: 'Б', M: 'С', L: 'Д' },
  bodyParts: { Head: 'Г', Body: 'Т', Hand: 'Р', Leg: 'Н' },
};
const options = buildEquipmentFilterOptions('ru-RU', labels);

describe('Патч 425: варианты фильтра из каталогов (аудит 424)', () => {
  it('границы диапазонов — фактические по каталогу', () => {
    expect(options.rarity).toEqual({ min: 0, max: 6 });
    expect(options.damage).toEqual({ min: 0, max: 21 });
    expect(options.fireRate).toEqual({ min: 0, max: 7 });
  });

  it('качества — ВСЕ 32 из словаря (слово владельца), эффекты — все 10', () => {
    expect(options.qualities.length).toBe(32);
    expect(options.qualities.find((q) => q.id === 'quality_night_vision')?.name).toBe('Ночное Видение');
    expect(options.effects.length).toBe(10);
  });

  it('патроны — уникальные из каталога оружия (включая «два сразу»)', () => {
    expect(options.ammoOptions.some((a) => a.id === 'ammo_energy_cell')).toBe(true);
    // редкий случай списка «energy_cell,fusion_core» — оба варианта в списке.
    expect(options.ammoOptions.some((a) => a.id === 'ammo_fusion_core')).toBe(true);
    expect(options.ammoOptions.every((a) => !a.id.includes(','))).toBe(true);
  });

  it('веса в фильтре НЕТ (слово владельца)', () => {
    expect(Object.keys(emptyEquipmentFilter())).not.toContain('weight');
  });
});

describe('Патч 425: оружие — по СВОИМ качествам/эффектам («моды это моды»)', () => {
  it('оружие без врождённого Ночного Видения НЕ проходит фильтр', () => {
    const weapon = { itemType: 'weapon', qualities: [{ qualityId: 'quality_accurate' }] };
    const filter = { ...emptyEquipmentFilter(), qualities: ['quality_night_vision'] };
    expect(applyEquipmentFilter(weapon, filter)).toBe(false);
  });

  it('выбранное, чего на оружии нет, дают моды: ночное видение → 3 прицела', () => {
    const mods = weaponModsProviding(
      { ...emptyEquipmentFilter(), qualities: ['quality_night_vision'] }, 'ru-RU',
    );
    expect(mods.map((m) => m.id).sort()).toEqual([
      'mod_long_night_vision_scope', 'mod_night_vision_scope', 'mod_short_night_vision_scope',
    ]);
    expect(mods[0].itemType).toBe('weaponMod');
    expect(mods[0].name.length).toBeGreaterThan(0);
  });

  it('компьютер наведения → его мод; Бомбарда не покрыта ничем (пусто)', () => {
    const tc = weaponModsProviding({ ...emptyEquipmentFilter(), qualities: ['quality_targetting_computer'] }, 'ru-RU');
    expect(tc.map((m) => m.id)).toEqual(['mod_targeting_computer']);
    const bombard = weaponModsProviding({ ...emptyEquipmentFilter(), qualities: ['quality_bombard'] }, 'ru-RU');
    expect(bombard).toEqual([]);
  });

  it('эффекты от модов тоже находятся (Устойчивый дают 13 модов)', () => {
    const mods = weaponModsProviding({ ...emptyEquipmentFilter(), effects: ['effect_persistent'] }, 'ru-RU');
    expect(mods.length).toBe(13);
  });
});

describe('Патч 425: предикат фильтра по параметрам', () => {
  it('редкость «от 3»: 0-й не проходит, 3-й проходит; безредкостный не прячется', () => {
    const filter = { ...emptyEquipmentFilter(), rarity: { from: '3', to: '' } };
    expect(applyEquipmentFilter({ itemType: 'weapon', rarity: 0 }, filter)).toBe(false);
    expect(applyEquipmentFilter({ itemType: 'weapon', rarity: 3 }, filter)).toBe(true);
    expect(applyEquipmentFilter({ itemType: 'weapon' }, filter)).toBe(true); // нет поля — не прячем
  });

  it('урон «от 2 до 5»; прочее снаряжение фильтром урона не трогается', () => {
    const filter = { ...emptyEquipmentFilter(), damage: { from: '2', to: '5' } };
    expect(applyEquipmentFilter({ itemType: 'weapon', damage: 6 }, filter)).toBe(false);
    expect(applyEquipmentFilter({ itemType: 'weapon', damage: { total: 3 } }, filter)).toBe(true);
    expect(applyEquipmentFilter({ itemType: 'ammo' }, filter)).toBe(true); // не снаряжение-оружие
  });

  it('тип урона — «любое из»; качества — «все выбранные»', () => {
    const dt = { ...emptyEquipmentFilter(), damageTypes: ['energy'] };
    expect(applyEquipmentFilter({ itemType: 'weapon', damageType: 'physical' }, dt)).toBe(false);
    expect(applyEquipmentFilter({ itemType: 'weapon', damageType: ['physical', 'energy'] }, dt)).toBe(true);
    const q = { ...emptyEquipmentFilter(), qualities: ['quality_accurate', 'quality_reliable'] };
    expect(applyEquipmentFilter({ itemType: 'weapon', qualities: [{ qualityId: 'quality_accurate' }] }, q)).toBe(false);
    expect(applyEquipmentFilter({
      itemType: 'weapon',
      qualities: [{ qualityId: 'quality_accurate' }, { qualityId: 'quality_reliable' }],
    }, q)).toBe(true);
  });

  it('броня: СУ диапазонами, части тела — все выбранные; патрон-фильтр броню не прячет', () => {
    const dr = { ...emptyEquipmentFilter(), energy: { from: '3', to: '' } };
    expect(applyEquipmentFilter({ itemType: 'armor', energyDamageRating: { total: 2 } }, dr)).toBe(false);
    expect(applyEquipmentFilter({ itemType: 'armor', energyDamageRating: { total: 4 } }, dr)).toBe(true);
    const parts = { ...emptyEquipmentFilter(), bodyParts: ['Head', 'Body'] };
    expect(applyEquipmentFilter({ itemType: 'armor', protectedAreas: ['Body'] }, parts)).toBe(false);
    expect(applyEquipmentFilter({ itemType: 'armor', protectedAreas: ['Head', 'Body'] }, parts)).toBe(true);
    const ammo = { ...emptyEquipmentFilter(), ammo: ['ammo_10mm'] };
    expect(applyEquipmentFilter({ itemType: 'armor', physicalDamageRating: 2 }, ammo)).toBe(true);
  });

  it('не-снаряжение проходит всегда (патроны, еда и пр.)', () => {
    const filter = { ...emptyEquipmentFilter(), rarity: { from: '5', to: '' }, qualities: ['quality_blast'] };
    expect(applyEquipmentFilter({ itemType: 'ammo' }, filter)).toBe(true);
    expect(applyEquipmentFilter({ itemType: 'chems' }, filter)).toBe(true);
  });

  it('обрезка дерева прячет пустые ветки', () => {
    const tree = {
      'Оружие': { 'Лёгкое': [{ itemType: 'weapon', damage: 1 }], 'Тяжёлое': [{ itemType: 'weapon', damage: 9 }] },
      'Броня': { 'Всё': [{ itemType: 'armor', physicalDamageRating: 2 }] },
      'Патроны': { 'Все': [{ itemType: 'ammo' }] },
    };
    const pruned = pruneTreeByEquipmentFilter(tree, { ...emptyEquipmentFilter(), damage: { from: '5', to: '' } });
    expect(pruned['Оружие']['Лёгкое']).toBeUndefined();
    expect(pruned['Оружие']['Тяжёлое'].length).toBe(1);
    // СУ-фильтры пусты → броня проходит (укороченного СУ у неё нет — не прячем).
    expect(pruned['Броня']['Всё'].length).toBe(1); 
  });
});

describe('Патч 425: проводка окна и подсказки', () => {
  const modal = () => readFileSync('components/screens/InventoryScreen/modals/AddItemModal.js', 'utf8');
  const panel = () => readFileSync('modules/fallout/screens/InventoryScreen/modals/EquipmentFilterPanel.js', 'utf8');

  it('панель спойлером как в перках, диапазоны с серыми подсказками (исчезают при касании)', () => {
    const code = panel();
    // 427: своей шапки у панели больше нет — кнопка «Фильтр» совмещена
    // с поиском в окне (см. защёлку 427). Тело панели по-прежнему под
    // флагом open.
    expect(code).not.toContain('spoilerHeader');
    expect(code).toContain('open && (');
    expect(code).toContain('placeholder={touchedFrom ? \'\' : String(hint?.min ?? \'\')}');
    expect(code).toContain('placeholder={touchedTo ? \'\' : String(hint?.max ?? \'\')}');
    expect(code).toContain('placeholderTextColor="#999"');
    // сброс — через проп родителя
    expect(code).toContain('onPress={onReset}');
  });

  it('секция модов появляется от выбранного качества/эффекта; словарь на месте', () => {
    const code = modal();
    expect(code).toContain('weaponModsProviding(equipmentFilter, moduleLocale)');
    expect(code).toContain("tInventory('modals.addItemModal.filter.modsSection')");
    const ru = JSON.parse(readFileSync('modules/fallout/i18n/ru-RU/screens/inventory/modals/addItemModal.json', 'utf8'));
    const en = JSON.parse(readFileSync('modules/fallout/i18n/en-EN/screens/inventory/modals/addItemModal.json', 'utf8'));
    expect(ru.filter.modsSection).toBe('Моды');
    expect(en.filter.modsSection).toBe('Mods');
    expect(ru.filter.title).toBe('Фильтр');
    expect(ru.filter.qualities).toBe('Качества');
    expect(ru.filter.effects).toBe('Эффекты');
  });

  it('DB-ветка мержит оружие с каталогом ПОЛНОСТЬЮ (поля фильтра не теряются)', () => {
    expect(modal()).toContain('...(catalogEntry ?? {})');
  });
});
