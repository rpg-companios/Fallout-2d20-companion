import { describe, it, expect } from 'vitest';
import dataPowerArmor from '../../data/equipment/powerArmor.json';
import dataAmmo from '../../data/equipment/ammo.json';
import {
  FUSION_CORE_ID,
  applyFrameAttributeModifiers,
  isFusionCoreItem,
  fusionCoreStackKey,
} from '../../domain/powerArmor';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import ruInventoryScreen from '../../i18n/ru-RU/screens/inventory/screen.json';
import enInventoryScreen from '../../i18n/en-EN/screens/inventory/screen.json';
import ruWaasScreen from '../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enWaasScreen from '../../i18n/en-EN/screens/weaponsAndArmor/screen.json';

// Специфика: docs/architecture/power-armor-plan.md §5.6 (модификаторы атрибутов
// каркаса на отображении/производных) + контракт UI-данных пакета pa3.
// Тесты — белый список: можно то, что разрешено.

const FRAME_CATALOG = dataPowerArmor.frame.pieces[0];

describe('power-armor ui-integration: applyFrameAttributeModifiers', () => {
  it('надетый реальный каркас: СИЛА становится 11 (set из данных), прочие атрибуты не тронуты', () => {
    const attributes = [
      { name: 'STR', value: 6 },
      { name: 'PER', value: 5 },
      { name: 'END', value: 5 },
    ];
    const effective = applyFrameAttributeModifiers(attributes, FRAME_CATALOG);
    expect(effective.find((a) => a.name === 'STR').value).toBe(11);
    expect(effective.find((a) => a.name === 'PER').value).toBe(5);
    expect(effective.find((a) => a.name === 'END').value).toBe(5);
  });

  it('не мутирует входной массив и его элементы', () => {
    const attributes = [{ name: 'STR', value: 6 }];
    const effective = applyFrameAttributeModifiers(attributes, FRAME_CATALOG);
    expect(attributes[0].value).toBe(6);
    expect(effective).not.toBe(attributes);
    expect(effective[0]).not.toBe(attributes[0]);
  });

  it('каркаса/модификаторов нет → возвращается та же ссылка (Объект строго тот же)', () => {
    const attributes = [{ name: 'STR', value: 6 }];
    expect(applyFrameAttributeModifiers(attributes, null)).toBe(attributes);
    expect(applyFrameAttributeModifiers(attributes, { id: 'synthetic_no_mods' })).toBe(attributes);
  });

  it('белый список ключей: неканонические имена (СИЛ, str) НЕ получают модификатор', () => {
    const attributes = [{ name: 'СИЛ', value: 4 }, { name: 'str', value: 4 }, { name: 'STR', value: 4 }];
    const effective = applyFrameAttributeModifiers(attributes, FRAME_CATALOG);
    expect(effective[0].value).toBe(4);
    expect(effective[1].value).toBe(4);
    expect(effective[2].value).toBe(11); // канонический STR — единственное разрешённое совпадение
  });

  it('операции + и - прибавляют/отнимают от базы (синтетический предмет, белый список операций)', () => {
    const synthetic = { modifiers: { attributeModifier: { STR: { op: '+', value: 2 }, PER: { op: '-', value: 1 } } } };
    const effective = applyFrameAttributeModifiers(
      [{ name: 'STR', value: 6 }, { name: 'PER', value: 5 }],
      synthetic,
    );
    expect(effective[0].value).toBe(8);
    expect(effective[1].value).toBe(4);
  });
});

describe('power-armor ui-integration: контракт данных для UI', () => {
  it('Ядерный блок — боеприпас с maxCharges в данных (максимум живёт в предмете, не в коде)', () => {
    const walk = (node) => {
      if (Array.isArray(node)) return node.map(walk).find(Boolean) || null;
      if (node && typeof node === 'object') {
        if (node.id === FUSION_CORE_ID) return node;
        return walk(node.items ?? Object.values(node));
      }
      return null;
    };
    const core = walk(dataAmmo);
    expect(core).toBeTruthy();
    expect(core.maxCharges).toBe(20);
    expect(core.weight).toBe(4);
  });

  it('isFusionCoreItem признаёт и каталожный id, и стор-weaponId', () => {
    expect(isFusionCoreItem({ id: FUSION_CORE_ID })).toBe(true);
    expect(isFusionCoreItem({ weaponId: FUSION_CORE_ID })).toBe(true);
    expect(isFusionCoreItem({ id: 'ammo_fusion_core:charges:7', weaponId: FUSION_CORE_ID })).toBe(true);
    expect(isFusionCoreItem({ id: 'chem_stimpak' })).toBe(false);
  });

  it('разный заряд → разные стек-ключи, одинаковый → слияние (§2)', () => {
    expect(fusionCoreStackKey(7)).not.toBe(fusionCoreStackKey(20));
    expect(fusionCoreStackKey(7)).toBe(fusionCoreStackKey(7));
  });

  it('каталог отдаёт секцию powerArmor с именами частей в обеих локалях', () => {
    for (const locale of ['ru-RU', 'en-EN']) {
      const catalog = getEquipmentCatalog(locale);
      expect(Array.isArray(catalog.powerArmorList)).toBe(true);
      const frame = catalog.powerArmorList.find((p) => p.id === 'power_armor_frame');
      expect(frame).toBeTruthy();
      expect(frame.name).toBeTruthy();
      expect(frame.itemType).toBe('powerArmor');
      expect(catalog.powerArmorList.length).toBe(21); // каркас + 20 частей
    }
  });

  it('защита частей PA по слотам: рука и нога — общие части на пару', () => {
    const handAreas = Object.values(dataPowerArmor)
      .flatMap((set) => set.pieces)
      .filter((p) => (p.protectedAreas || [])[0] === 'Hand');
    expect(handAreas.length).toBe(5); // raider, t45, t51, t60, x01
  });
});

describe('power-armor ui-integration: i18n-ключи экранов (pa3)', () => {
  it('inventory: починка, выбор блока, запрет мутанта и робота — в обеих локалях', () => {
    const required = [
      'mutantCannotWearStandardArmorTitle',
      'mutantCannotWearStandardArmorMessage',
      'powerArmorChooseCoreTitle',
      'powerArmorBrokenPieceMessage',
      'robotArmorOnlyTitle',
      'robotArmorOnlyMessage',
      'powerArmorNeedsCoreTitle',
      'powerArmorNeedsCoreMessage',
      'powerArmorNeedsFrameMessage',
      'powerArmorDepletedTitle',
      'powerArmorDepletedMessage',
    ];
    for (const dict of [ruInventoryScreen, enInventoryScreen]) {
      for (const key of required) {
        expect(typeof dict.alerts[key], key).toBe('string');
        expect(dict.alerts[key].length, key).toBeGreaterThan(0);
      }
      expect(typeof dict.actions.repair).toBe('string');
      expect(typeof dict.labels.durability).toBe('string');
    }
  });

  it('weaponsAndArmor: секция powerArmor полная в обеих локалях', () => {
    for (const dict of [ruWaasScreen, enWaasScreen]) {
      const pa = dict.powerArmor;
      for (const key of ['layer', 'frame', 'durability', 'core', 'repair', 'unequip']) {
        expect(typeof pa[key], key).toBe('string');
      }
      for (const part of ['helmet', 'chest', 'arm', 'leg']) {
        expect(typeof pa.partNames[part], part).toBe('string');
      }
      // Строка блока — шаблон с плейсхолдером значения.
      expect(pa.core).toContain('{value}');
    }
  });
});
