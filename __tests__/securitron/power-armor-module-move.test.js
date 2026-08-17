/**
 * Разделение движок/сеттинг (патч 109): силовая броня перенесена в модуль
 * ЦЕЛИКОМ. data/equipment/powerArmor.json — пустая движковая база ({}),
 * легаси i18n — {powerArmor: []}. Форматы сохранены: механика — сеты
 * {frame, raiderPower, t45, t51, t60, x01} с pieces; переводы — группы
 * {powerArmor:[{categoryKey, type, items}]}.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import modulePowerArmor from '../../modules/fallout/data/equipment/powerArmor.json';
import moduleRuPowerArmor from '../../modules/fallout/i18n/ru-RU/data/equipment/armor/powerArmor.json';
import moduleEnPowerArmor from '../../modules/fallout/i18n/en-EN/data/equipment/armor/powerArmor.json';
import dataPowerArmor from '../../data/equipment/powerArmor.json';
import legacyRuPowerArmor from '../../i18n/ru-RU/data/equipment/armor/powerArmor.json';
import legacyEnPowerArmor from '../../i18n/en-EN/data/equipment/armor/powerArmor.json';

const countPieces = (pa) =>
  Object.values(pa || {}).reduce((sum, set) => sum + (set?.pieces || []).length, 0);

describe('Силовая броня в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => {
    setCurrentLocale('ru-RU');
    setCurrentModuleLocale('ru-RU');
  });

  it('модуль содержит полную механику: 6 сетов (frame + 5), 21 деталь', () => {
    expect(Object.keys(modulePowerArmor).sort()).toEqual(['frame', 'raiderPower', 't45', 't51', 't60', 'x01']);
    expect(countPieces(modulePowerArmor)).toBe(21);
    const piece = modulePowerArmor.t45.pieces[0];
    expect(piece).toHaveProperty('damageResistance');
    expect(piece).toHaveProperty('weight');
  });

  it('переводы — группы {powerArmor:[...]}, 6 групп в каждой локали', () => {
    for (const i18n of [moduleRuPowerArmor, moduleEnPowerArmor]) {
      expect(i18n.powerArmor).toHaveLength(6);
      const items = i18n.powerArmor.flatMap((g) => g.items || []);
      expect(items).toHaveLength(21);
      for (const item of items) {
        expect(item.id).toBeTruthy();
        expect(item.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('data/ и легаси i18n пусты (движок без сеттинга)', () => {
    expect(dataPowerArmor).toEqual({});
    expect(legacyRuPowerArmor).toEqual({ powerArmor: [] });
    expect(legacyEnPowerArmor).toEqual({ powerArmor: [] });
  });

  it('каталог собирает силовую броню из модуля (powerArmorList, powerArmorRaw)', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.powerArmorRaw).toBe(modulePowerArmor);
    expect(catalog.powerArmorList).toHaveLength(21);
    const item = catalog.powerArmorList[0];
    expect(item.name.length).toBeGreaterThan(0);
    expect(item.powerArmorSetKey).toBeTruthy();
  });
});
