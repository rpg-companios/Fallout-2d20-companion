import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import moduleArmor from '../../modules/fallout/data/equipment/armor.json';
import ruArmorFile from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/armor.json';
import enArmorFile from '../../modules/fallout/i18n/en-EN/data/equipment/armor/armor.json';

// Инвариант исправления «молчаливой» неэкипировки брони (EN):
// единый источник механики брони — data/equipment/armor.json; i18n-файлы
// несут только отображаемые поля. Любая локаль обязана давать броне
// protectedAreas — иначе handleEquipArmor не сможет вычислить слоты.
// И молчаливый no-op при пустых слотах заменён алертом (структурный чек C).

const MECHANICS = [
  'protectedAreas',
  'physicalDamageRating',
  'energyDamageRating',
  'radiationDamageRating',
  'weight',
  'cost',
  'rarity',
  'imageName',
];

const dataPiecesById = Object.fromEntries(
  Object.values(moduleArmor).flatMap((category) =>
    Object.values(category?.tiers || {}).flatMap((tier) => (tier?.pieces || [])),
  ).map((piece) => [piece.id, piece]),
);

const armorListOf = (locale) => getEquipmentCatalog(locale).armorList;

describe('armor-merge-contract: единый источник механики брони', () => {
  it.each(['ru-RU', 'en-EN'])('%s: каждая броня имеет полный механический контракт', (locale) => {
    const list = armorListOf(locale);
    expect(list.length).toBeGreaterThan(0);
    const broken = list.filter((item) => {
      if (item.itemType !== 'armor') return true;
      if (!Array.isArray(item.protectedAreas) || item.protectedAreas.length === 0) return true;
      if (!item.armorCategoryKey) return true;
      return ['weight', 'cost', 'physicalDamageRating', 'energyDamageRating', 'radiationDamageRating']
        .some((field) => typeof item[field] !== 'number');
    });
    expect(broken.map((item) => item.id)).toEqual([]);
  });

  it.each(['ru-RU', 'en-EN'])('%s: каждая броня совпадает по механике с data/equipment/armor.json', (locale) => {
    const drift = [];
    for (const item of armorListOf(locale)) {
      const data = dataPiecesById[item.id];
      if (!data) { drift.push(`${item.id}: нет в data/`); continue; }
      for (const field of MECHANICS) {
        if (JSON.stringify(item[field]) !== JSON.stringify(data[field])) {
          drift.push(`${item.id}.${field}: catalog=${JSON.stringify(item[field])} data=${JSON.stringify(data[field])}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('индексы обеих локалей содержат одинаковый набор id; «тостых» записей больше нет', () => {
    const ruIndex = getEquipmentCatalog('ru-RU').armorIndex.byId;
    const enIndex = getEquipmentCatalog('en-EN').armorIndex.byId;
    const ruIds = [...ruIndex.keys()].sort();
    const enIds = [...enIndex.keys()].sort();
    expect(enIds).toEqual(ruIds);
    for (const id of ruIds) {
      for (const field of MECHANICS) {
        expect(
          JSON.stringify(enIndex.get(id)?.[field]),
          `${id}.${field}: en-EN != ru-RU`,
        ).toBe(JSON.stringify(ruIndex.get(id)?.[field]));
      }
    }
  });

  it('i18n-файлы брони тощие: только отображаемые поля {id,name} (дубль механики запрещён)', () => {
    for (const [name, file] of [['ru-RU', ruArmorFile], ['en-EN', enArmorFile]]) {
      const violators = [];
      for (const group of file.armor || []) {
        for (const item of group.items || []) {
          const extra = Object.keys(item).filter((key) => key !== 'id' && key !== 'name');
          if (extra.length > 0) violators.push(`${item.id}: ${extra.join(',')}`);
        }
      }
      expect(violators, name).toEqual([]);
    }
  });

  it('локализация имён сохранилась после мёржа (sanity: ru != en имени)', () => {
    const ru = getEquipmentCatalog('ru-RU').armorIndex.byId.get('armor_leather_chest_001');
    const en = getEquipmentCatalog('en-EN').armorIndex.byId.get('armor_leather_chest_001');
    expect(ru.name).toBe('Кожаный Нагрудник');
    expect(en.name).toBe('Leather Chest Piece');
  });

  it('C: пустые слоты — алерт cannotEquipItem + трасс-маркер, а не молчаливый no-op', () => {
    const src = readFileSync('components/screens/InventoryScreen/InventoryScreen.js', 'utf8');
    expect(src.includes("debugLog('equip.armor:emptySlots'")).toBe(true);
    expect(src.includes('slotsToOccupy.length === 0')).toBe(true);
    expect(src.includes("tInventory('screen.alerts.cannotEquipItem')")).toBe(true);
  });
});
