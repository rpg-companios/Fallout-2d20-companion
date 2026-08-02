import { describe, it, expect } from 'vitest';
import dataPowerArmor from '../../data/equipment/powerArmor.json';
import dataAmmo from '../../data/equipment/ammo.json';
import { PA_CORE_DRAIN_PER_HOUR, FUSION_CORE_CHARGES_ROLL } from '../../domain/powerArmor';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import ruAddItemModal from '../../i18n/ru-RU/screens/inventory/modals/addItemModal.json';
import enAddItemModal from '../../i18n/en-EN/screens/inventory/modals/addItemModal.json';
import ruWaAScreen from '../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enWaAScreen from '../../i18n/en-EN/screens/weaponsAndArmor/screen.json';
import ruInvScreen from '../../i18n/ru-RU/screens/inventory/screen.json';
import enInvScreen from '../../i18n/en-EN/screens/inventory/screen.json';

// Контракт данных силовой брони (docs/architecture/power-armor-plan.md §3).
// Цены — по официальной эррате Modiphius от 06.09.2022; блок — по GM Toolkit.
// Тесты — белый список: разрешено ровно то, что записано в плане.

const pieceOf = (setKey, idSuffix) =>
  dataPowerArmor[setKey].pieces.find((p) => p.id === `power_armor_${idSuffix}`);

const EXPECTED_COSTS = {
  power_armor_frame: 4500,
  power_armor_raider_helmet: 50, power_armor_raider_chest: 100,
  power_armor_raider_arm: 75, power_armor_raider_leg: 75,
  power_armor_t45_helmet: 60, power_armor_t45_chest: 140,
  power_armor_t45_arm: 100, power_armor_t45_leg: 100,
  power_armor_t51_helmet: 80, power_armor_t51_chest: 180,
  power_armor_t51_arm: 130, power_armor_t51_leg: 130,
  power_armor_t60_helmet: 130, power_armor_t60_chest: 250,
  power_armor_t60_arm: 170, power_armor_t60_leg: 170,
  power_armor_x01_helmet: 140, power_armor_x01_chest: 280,
  power_armor_x01_arm: 200, power_armor_x01_leg: 200,
};

const ALL_PIECES = Object.values(dataPowerArmor).flatMap((set) => set.pieces);

describe('powerArmor.json — каркас', () => {
  const frame = dataPowerArmor.frame.pieces[0];

  it('вес/цена по эррате: вес 150, цена 4500 (в первой печати колонки были перепутаны)', () => {
    expect(frame.weight).toBe(150);
    expect(frame.cost).toBe(4500);
  });

  it('модификатор СИЛ записан данными: attributeModifier.STR = set 11', () => {
    expect(frame.modifiers).toEqual({ attributeModifier: { STR: { op: 'set', value: 11 } } });
    expect(Array.isArray(frame.effects)).toBe(true);
  });

  it('у каркаса прочности нет, покрывает все 4 зоны', () => {
    expect('hp' in frame).toBe(false);
    expect(frame.protectedAreas).toEqual(['Head', 'Body', 'Hand', 'Leg']);
  });
});

describe('powerArmor.json — части комплектов', () => {
  it('все 6 комплектов на месте, частей ровно 20; у каждой прочность > 0', () => {
    expect(Object.keys(dataPowerArmor).sort()).toEqual(['frame', 'raiderPower', 't45', 't51', 't60', 'x01']);
    const pieces = ALL_PIECES.filter((p) => p.id !== 'power_armor_frame');
    expect(pieces).toHaveLength(20);
    pieces.forEach((p) => {
      expect(Number.isInteger(p.hp) && p.hp > 0).toBe(true);
      expect(['Head', 'Body', 'Hand', 'Leg']).toContain(p.protectedAreas[0]);
    });
  });

  it('цены всех 21 предмета — точно по таблице (эррата)', () => {
    ALL_PIECES.forEach((p) => expect(p.cost).toBe(EXPECTED_COSTS[p.id]));
  });

  it('наручи и поножи — одна часть на пару конечностей', () => {
    expect(pieceOf('t45', 't45_arm').protectedAreas).toEqual(['Hand']);
    expect(pieceOf('t45', 't45_leg').protectedAreas).toEqual(['Leg']);
  });
});

describe('ammo.json — Ядерный Блок', () => {
  it('позиция ammo_fusion_core: цена 200, редкость 3, вес 4, maxCharges 20', () => {
    const core = dataAmmo.find((a) => a.id === 'ammo_fusion_core');
    expect(core).toEqual({ id: 'ammo_fusion_core', rarity: 3, cost: 200, weight: 4, maxCharges: 20 });
  });
});

describe('domain/powerArmor — константы', () => {
  it('расход и бросок нового блока (белый список значений из плана)', () => {
    expect(PA_CORE_DRAIN_PER_HOUR).toBe(5);
    expect(FUSION_CORE_CHARGES_ROLL).toEqual({ rollType: 'rollD20', rollValue: 1 });
  });
});

describe('equipmentCatalog — силовая броня подключена (ru и en)', () => {
  it.each(['ru-RU', 'en-EN'])('%s: 6 групп, 21 предмет, статы из данных + имя из локали', (locale) => {
    const catalog = getEquipmentCatalog(locale);
    const groups = catalog.powerArmor.powerArmor;
    expect(groups.map((g) => g.items.length)).toEqual([1, 4, 4, 4, 4, 4]);
    expect(catalog.powerArmorList).toHaveLength(21);
    groups.forEach((g) => expect(typeof g.type).toBe('string'));
    const t60chest = catalog.powerArmorList.find((i) => i.id === 'power_armor_t60_chest');
    expect(t60chest.cost).toBe(250);
    expect(t60chest.hp).toBe(21);
    expect(t60chest.powerArmorSetKey).toBe('t60');
    expect(t60chest.name).not.toBe('power_armor_t60_chest');
  });

  it('заголовки групп по локалям', () => {
    expect(getEquipmentCatalog('ru-RU').powerArmor.powerArmor[0].type).toBe('Каркас');
    expect(getEquipmentCatalog('en-EN').powerArmor.powerArmor[0].type).toBe('Frame');
  });

  it('Ядерный Блок в боеприпасах с именем по локали (иначе сборка каталога падает)', () => {
    expect(getEquipmentCatalog('ru-RU').ammoTypes.find((a) => a.id === 'ammo_fusion_core').name).toBe('Ядерный блок');
    expect(getEquipmentCatalog('en-EN').ammoTypes.find((a) => a.id === 'ammo_fusion_core').name).toBe('Fusion Core');
  });
});

describe('i18n экранов — строки силовой брони на месте', () => {
  it('категория и ярлык типа в модалке добавления/покупки', () => {
    expect(ruAddItemModal.categories.powerArmor).toBe('Силовая броня');
    expect(enAddItemModal.categories.powerArmor).toBe('Power Armor');
    expect(ruAddItemModal.itemTypes.powerArmor).toContain('Силовая броня');
    expect(enAddItemModal.itemTypes.powerArmor).toContain('Power Armor');
  });

  it('экран брони: «Прочн»/«HP», блок; починки нет — переехала в инвентарь (pa4)', () => {
    // ПРАВИЛО (владелец, pa3-редизайн): СБ — не отдельный блок, а модернизация
    // существующей сетки; слоты/заголовки — общие с бронёй (armor.slots.*), имя
    // части — из equipmentCatalog. ПРАВИЛО (владелец, pa4): починка только через
    // инвентарь → ключ repair здесь мёртв и удалён, как layer/frame/partNames/unequip.
    // ПРАВИЛО (владелец, pa8): подпись прочности элемента СБ сокращена до «Прочн».
    expect(ruWaAScreen.powerArmor.durability).toBe('Прочн');
    expect(enWaAScreen.powerArmor.durability).toBe('HP');
    expect(typeof ruWaAScreen.powerArmor.core).toBe('string');
    expect(ruWaAScreen.powerArmor.core).toContain('{value}');
    expect(ruWaAScreen.powerArmor.repair).toBeUndefined();
    expect(enWaAScreen.powerArmor.repair).toBeUndefined();
    expect(ruWaAScreen.powerArmor.layer).toBeUndefined();
    expect(ruWaAScreen.powerArmor.frame).toBeUndefined();
    expect(ruWaAScreen.powerArmor.partNames).toBeUndefined();
    expect(ruWaAScreen.powerArmor.unequip).toBeUndefined();
  });

  it('алерты инвентаря: нужен блок, нужен каркас, питание исчерпано', () => {
    ['ru', 'en'].forEach((lang) => {
      const d = lang === 'ru' ? ruInvScreen : enInvScreen;
      ['powerArmorNeedsCoreMessage', 'powerArmorNeedsFrameMessage', 'powerArmorDepletedMessage']
        .forEach((key) => expect(typeof d.alerts[key]).toBe('string'));
    });
  });
});
