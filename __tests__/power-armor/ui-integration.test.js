import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import dataPowerArmor from '../../modules/fallout/data/equipment/powerArmor.json';
import dataAmmo from '../../modules/fallout/data/equipment/ammo.json';
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

  it('weaponsAndArmor: powerArmor — только используемые ключи (мёртвых данных нет)', () => {
    for (const dict of [ruWaasScreen, enWaasScreen]) {
      const pa = dict.powerArmor;
      // Используются ячейками сетки и панелью эффектов.
      for (const key of ['durability', 'core']) {
        expect(typeof pa[key], key).toBe('string');
      }
      expect(pa.core).toContain('{value}');
      // Редизайн (владелец): отдельного блока СБ нет — мёртвые ключи удалены.
      // pa4: починка переехала в инвентарь-контейнер → ключ repair здесь мёртв, удалён.
      expect(pa.layer).toBeUndefined();
      expect(pa.frame).toBeUndefined();
      expect(pa.partNames).toBeUndefined();
      expect(pa.unequip).toBeUndefined();
      expect(pa.repair).toBeUndefined();
    }
  });
});

describe('power-armor ui-integration: контейнер в инвентаре (pa4, ПРАВИЛО владельца)', () => {
  it('inventory: кнопки «Содержание»/«Свернуть» и секция powerArmor — в обеих локалях', () => {
    for (const dict of [ruInventoryScreen, enInventoryScreen]) {
      expect(typeof dict.actions.contents).toBe('string');
      expect(typeof dict.actions.collapse).toBe('string');
      const pa = dict.powerArmor;
      // Родитель контейнера — системный заголовок «Силовая броня» (ПРАВИЛО владельца).
      expect(pa.containerTitle.length).toBeGreaterThan(0);
      expect(pa.summary).toContain('{parts}');
      expect(pa.summary).toContain('{core}');
      expect(pa.coreRow).toContain('{value}');
      expect(pa.pieceInSlot).toContain('{name}');
      expect(pa.pieceInSlot).toContain('{slot}');
      // Слоты — левая/правая рука и нога отдельно (как у обычной брони), 6 ключей.
      for (const slot of ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
        expect(typeof pa.slots[slot], slot).toBe('string');
        expect(pa.slots[slot].length, slot).toBeGreaterThan(0);
      }
    }
  });

  it('inventory: мёртвых pa-ключей нет — секция ровно containerTitle/summary/coreRow/pieceInSlot/slots', () => {
    for (const dict of [ruInventoryScreen, enInventoryScreen]) {
      expect(Object.keys(dict.powerArmor).sort()).toEqual(['containerTitle', 'coreRow', 'pieceInSlot', 'slots', 'summary']);
      expect(Object.keys(dict.powerArmor.slots).sort()).toEqual(['body', 'head', 'leftArm', 'leftLeg', 'rightArm', 'rightLeg']);
    }
  });

  // Конвенция vitest: запуск из корня проекта — пути исходников относительно cwd.
  it('структура: инвентарь — контейнер-аккордеон только НАДЕТОГО пакета; системное имя; каркас — элемент контейнера', () => {
    const src = readFileSync('components/screens/InventoryScreen/InventoryScreen.js', 'utf8');
    expect(src).not.toContain('equippedPowerArmorRows');
    expect(src).toContain('paContainerRows');
    // Родитель — системный заголовок «Силовая броня»; каркас — строка-элемент содержания.
    expect(src).toContain('screen.powerArmor.containerTitle');
    for (const marker of ['item.paContainer', 'item.paFrameContent', 'item.paPieceContent', 'item.paCoreContent']) {
      expect(src).toContain(marker);
    }
    // В инвентаре прочность не меняется: счётчика нет, значение — текстом + «Починить».
    expect(src).toContain("tInventory('screen.labels.durability')");
  });

  it('структура: ПРАВИЛО владельца — снятый пакет НЕ контейнер; обычный предмет; в инвентаре прочность не меняется', () => {
    const src = readFileSync('components/screens/InventoryScreen/InventoryScreen.js', 'utf8');
    // Наличие каркаса (любого: свежего или со снятым содержимым) — обычная строка
    // предмета. Контейнер «Силовая броня» существует только на персонаже
    // (каркас надет с ядерным блоком): механики контейнера снятого пакета нет совсем.
    for (const marker of ['paExpandPackage', 'item.paPackage', 'paOpenPackages', 'isPowerArmorPackage', 'paStoreId']) {
      expect(src).not.toContain(marker);
    }
    // Счётчик прочности в инвентаре запрещён: ни «−», ни «+» — только «Починить».
    expect(src).not.toContain('adjustPowerArmorDurability');
    expect(src).not.toContain('paDurability');
    const stylesSrc = readFileSync('styles/InventoryScreen.styles.js', 'utf8');
    expect(stylesSrc).not.toContain('paDurability');
    const ctx = readFileSync('components/CharacterContext.js', 'utf8');
    // Починка части внутри снятого пакета — мёртвая механика, удалена.
    expect(ctx).not.toContain('repairPowerArmorPackagePiece');
    const domain = readFileSync('domain/powerArmor.js', 'utf8');
    expect(domain).not.toContain('isPowerArmorPackage');
  });

  it('структура: экран экипировки — у счётчика только «−», «+» не нужен (ремонт в инвентаре)', () => {
    const src = readFileSync('components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js', 'utf8');
    expect(src).toContain("adjustPowerArmorDurability(slotKey, -1)");
    expect(src).not.toContain("adjustPowerArmorDurability(slotKey, 1)");
  });

  it('структура: прочность в ячейке — ДВЕ строки на всю ширину, часть ячейки (footer ArmorPart)', () => {
    // ПРАВИЛО (владелец): строка 1 — заголовок «Прочность (ОЗ)» белым на тёмном,
    // строка 2 — счётчик; строки внутри ячейки, не отдельно.
    const src = readFileSync('components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js', 'utf8');
    expect(src).toContain('footer');
    expect(src).toContain('paDurabilityBlock');
    expect(src).toContain('paDurabilityHeaderRow');
    expect(src).toContain('paDurabilityCounterRow');
    expect(src).toContain("tWeaponsAndArmorScreen('powerArmor.durability')");
    const stylesSrc = readFileSync('styles/WeaponsAndArmorScreen.styles.js', 'utf8');
    for (const marker of ['paDurabilityBlock', 'paDurabilityHeaderRow', 'paDurabilityHeader', 'paDurabilityCounterRow', 'paDurabilityValue']) {
      expect(stylesSrc).toContain(marker);
    }
    // белый шрифт на тёмном фоне
    expect(stylesSrc).toMatch(/paDurabilityHeaderRow:\s*\{[^}]*'#333'/s);
    expect(stylesSrc).toMatch(/paDurabilityHeader:\s*\{[^}]*'#fff'/s);
    // ПРАВИЛО (владелец): фон всей области счётчика — белый, не только у значения.
    expect(stylesSrc).toMatch(/paDurabilityBlock:\s*\{[^}]*backgroundColor: '#fff'/s);
    // ПРАВИЛО (владелец): у значения счётчика левой границы нет — свой стиль
    // без borderLeft (armorStatValue с borderLeftWidth в счётчике не используется).
    expect(src).toContain('localStyles.paDurabilityValue');
    const valueStyle = stylesSrc.slice(
      stylesSrc.indexOf('paDurabilityValue: {'),
      stylesSrc.indexOf('},', stylesSrc.indexOf('paDurabilityValue: {')),
    );
    expect(valueStyle).not.toContain('borderLeft');
  });

  it('структура: экран экипировки — починки нет (только инвентарь), счётчик — стиль патронов', () => {
    const src = readFileSync('components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js', 'utf8');
    expect(src).not.toContain('repairPowerArmorPieceAt');
    expect(src).not.toContain("powerArmor.repair");
    expect(src).toContain('weaponAmmoBtn');
  });
});
