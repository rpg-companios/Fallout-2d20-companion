/**
 * Разделение движок/сеттинг (патч 114): роботы перенесены в модуль
 * ЦЕЛИКОМ (8 файлов данных + robotparts + 11 файлов переводов на локаль).
 * data/equipment/robot/* и data/equipment/robotparts.json — пустые
 * движковые базы. Структура файлов сохранена (по файлу на категорию).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getEquipmentCatalogForLocale } from '../../domain/registry';
import { setCurrentLocale } from '../../i18n/locale';
import moduleRobotArms from '../../modules/fallout/data/equipment/robot/robotarms.json';
import moduleRobotBody from '../../modules/fallout/data/equipment/robot/robotbody.json';
import moduleRobotHeads from '../../modules/fallout/data/equipment/robot/robotheads.json';
import moduleRobotLegs from '../../modules/fallout/data/equipment/robot/robotlegs.json';
import moduleRobotWeapons from '../../modules/fallout/data/equipment/robot/weapons.json';
import moduleRobotArmor from '../../modules/fallout/data/equipment/robot/armor.json';
import moduleRobotPlating from '../../modules/fallout/data/equipment/robot/armor_plating.json';
import moduleRobotFrames from '../../modules/fallout/data/equipment/robot/frames.json';
import moduleRobotParts from '../../modules/fallout/data/equipment/robotparts.json';
import dataRobotArms from '../../data/equipment/robot/robotarms.json';
import dataRobotBody from '../../data/equipment/robot/robotbody.json';
import dataRobotParts from '../../data/equipment/robotparts.json';

describe('Роботы в модуле (сеттинг), data/ — пустой движок', () => {
  beforeAll(() => setCurrentLocale('ru-RU'));

  it('модуль содержит все категории роботов (структура сохранена)', () => {
    expect(moduleRobotArms).toHaveLength(21);
    expect(moduleRobotBody).toHaveLength(6);
    expect(moduleRobotHeads).toHaveLength(7);
    expect(moduleRobotLegs).toHaveLength(6);
    expect(moduleRobotWeapons).toHaveLength(19);
    expect(moduleRobotArmor.armor).toHaveLength(5);
    expect(moduleRobotPlating.plating).toHaveLength(28);
    expect(moduleRobotFrames.frames).toHaveLength(12);
    expect(moduleRobotParts.robotItems).toHaveLength(3);
    expect(moduleRobotParts.robotModules).toHaveLength(8);
  });

  it('data/ для роботов пуст (движок без сеттинга)', () => {
    expect(dataRobotArms).toEqual([]);
    expect(dataRobotBody).toEqual([]);
    expect(dataRobotParts).toEqual({});
  });

  it('каталог собирает роботов из модуля (модули, конечности, броня)', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.robotModules).toHaveLength(8);
    expect(catalog.robotArms).toHaveLength(21);
    expect(catalog.robotBody).toHaveLength(6);
    expect(catalog.robotHeads).toHaveLength(7);
    expect(catalog.robotLegs).toHaveLength(6);
    expect(catalog.robotPlating).toHaveLength(28);
    expect(catalog.robotArmorLayer).toHaveLength(5);
    expect(catalog.robotFrames).toHaveLength(12);
    for (const list of [catalog.robotModules, catalog.robotArms, catalog.robotBody, catalog.robotHeads, catalog.robotLegs, catalog.robotPlating, catalog.robotArmorLayer, catalog.robotFrames]) {
      expect(list[0].name.length).toBeGreaterThan(0);
    }
  });
});
