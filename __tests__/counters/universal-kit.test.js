import { describe, it, expect } from 'vitest';
import origins from '../../modules/fallout/data/origins/origins.json';
import kits from '../../modules/fallout/data/equipmentKits/index.js';
import ruKits from '../../modules/fallout/i18n/ru-RU/data/system/equipmentKits.json';
import enKits from '../../modules/fallout/i18n/en-EN/data/system/equipmentKits.json';
import { resolveLevelValue } from '../../domain/levelBands';

const KIT_ID = 'purchase_equipment';

describe('комплект «покупка снаряжения»', () => {
  it('существует в каталоге и помечен универсальным', () => {
    expect(kits[KIT_ID]).toBeTruthy();
    expect(kits[KIT_ID].universal).toBe(true);
  });

  it('имеет имя в обеих локалях (иначе каталог бросит ошибку)', () => {
    expect(ruKits[KIT_ID]?.name).toBeTruthy();
    expect(enKits[KIT_ID]?.name).toBeTruthy();
  });

  it('несёт ровно один элемент типа purchase с потолком редкости 2', () => {
    const items = kits[KIT_ID].items;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('purchase');
    expect(items[0].maxRarity).toBe(2);
  });

  it('сумма крышек задана полосами уровней', () => {
    expect(Array.isArray(kits[KIT_ID].items[0].caps)).toBe(true);
  });

  it('ни один ориджин не перечисляет универсальный комплект вручную', () => {
    // Дублирование в данных означало бы, что при добавлении ориджина о
    // комплекте нужно помнить — ровно то, чего мы избегаем.
    for (const origin of origins) {
      expect(
        (origin.equipmentKitIds || []).includes(KIT_ID),
        `ориджин ${origin.id} перечислил ${KIT_ID} вручную`,
      ).toBe(false);
    }
  });

  it('универсальным помечен только этот комплект', () => {
    const universal = Object.keys(kits).filter((id) => kits[id]?.universal === true);
    expect(universal).toEqual([KIT_ID]);
  });
});

describe('крышки комплекта по уровням', () => {
  const caps = kits[KIT_ID].items[0].caps;

  it('на 1 уровне выдаёт фиксированную сумму', () => {
    expect(resolveLevelValue(caps, 1)).toBe(100);
  });

  it('со 2 уровня считает по уровню', () => {
    expect(resolveLevelValue(caps, 2)).toBe(200);
    expect(resolveLevelValue(caps, 20)).toBe(2000);
  });

  it('выше 20 уровня продолжает выдавать значение, а не ноль', () => {
    expect(resolveLevelValue(caps, 21)).toBeGreaterThan(0);
    expect(resolveLevelValue(caps, 50)).toBeGreaterThan(0);
  });
});
