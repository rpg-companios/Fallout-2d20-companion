// __tests__/saves/robot-slot-slim-roundtrip.test.js
//
// «Худой» сейв робота: слот хранит только id (да список id модов), всё
// остальное восстановимо из каталогов.
//
// Проверяется на РЕАЛЬНЫХ данных: слоты вырезаны из сейвов, присланных
// владельцем (протектрон, секьюритрон, робомозг, мистер Хэнди, ассультрон) —
// __tests__/fixtures/robot-slots-from-saves.json.

import { describe, it, expect } from 'vitest';

import {
  collectAttacks,
  serializeSlot,
  deserializeSlot,
  slotAcceptsArmor,
  totalDR,
} from '../../domain/robotSlots';
import { slimSaveData, slimRobotSlots, restoreSaveData } from '../../domain/saveSlimming';
import { migrateRobotPlatingIds } from '../../src/store/migrations';
import { resolveItem, findCatalogEntry } from '../../domain/resolveItem';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import fixtures from '../fixtures/robot-slots-from-saves.json';

const slot = (key) => JSON.parse(JSON.stringify(fixtures[key]));
const slimOf = (key) => serializeSlot(slot(key));

describe('ужимка слота: что остаётся в сейве', () => {
  it('оружие в ладони — только id', () => {
    // Робомозг держит боевой дробовик, Хэнди — ПП «10 мм».
    expect(slimOf('robobrain.rightArm').heldWeaponId).toBe('weapon_combat_shotgun');
    expect(slimOf('misterHandy.arm1').heldWeaponId).toBe('weapon_10mm_smg');
    const slim = slimOf('robobrain.rightArm');
    expect(slim.heldWeapon).toBeUndefined();
    expect(slim.limb).toBeUndefined();
  });

  it('установленное в конечность оружие — отдельный список id', () => {
    // Секьюритрон: в левой руке сверх манипулятора стоит лазерная пушка,
    // в правой — ПП. Ассультрон: лазер только в левой.
    expect(slimOf('securitron.leftArm').installedWeapons)
      .toEqual([{ id: 'weapon_laser_gun', modIds: [] }]);
    expect(slimOf('securitron.rightArm').installedWeapons)
      .toEqual([{ id: 'weapon_submachine_gun', modIds: [] }]);
    expect(slimOf('assaultron.leftArm').installedWeapons)
      .toEqual([{ id: 'weapon_laser_gun', modIds: [] }]);
  });

  it('своя атака конечности в установки не попадает', () => {
    for (const key of ['securitron.leftArm', 'securitron.rightArm', 'assaultron.leftArm']) {
      const ids = slimOf(key).installedWeapons.map((w) => w.id);
      expect(ids).not.toContain('robot_weapon_manipulator');
      expect(ids).not.toContain('robot_weapon_claw');
    }
  });

  it('конфликтующая обшивка выбрасывается (правило владельца)', () => {
    // Протектрон: на голове броня + рама + обшивка. Обшивка несовместима с
    // бронёй и рамой → в сейв она не идёт.
    const head = slimOf('protectron.head');
    expect(head.armorLayers.armor).toBe('robot_armor_factory_optics');
    expect(head.armorLayers.frame).toBe('robot_frame_hydraulic_optics');
    expect(head.armorLayers.plating).toBeNull();

    // Робомозг: то же самое на руке.
    const arm = slimOf('robobrain.rightArm');
    expect(arm.armorLayers.armor).toBe('robot_armor_factory_arms');
    expect(arm.armorLayers.plating).toBeNull();
  });

  it('обшивка без конфликта остаётся', () => {
    // Протектрон и робомозг: на корпусе только обшивка — выбрасывать нечего.
    expect(slimOf('protectron.body').armorLayers.plating)
      .toBe('robot_plating_factory_body');
    expect(slimOf('robobrain.body').armorLayers.plating)
      .toBe('robot_plating_serrated_body');
    // А у Хэнди на корпусе броня + рама + обшивка — обшивка лишняя.
    expect(slimOf('misterHandy.body').armorLayers.armor)
      .toBe('robot_armor_storage_body');
    expect(slimOf('misterHandy.body').armorLayers.frame)
      .toBe('robot_frame_hydraulic_body');
    expect(slimOf('misterHandy.body').armorLayers.plating).toBeNull();
  });

  it('оружие вместо руки защиты не хранит', () => {
    // Карабин Теслы — не рука, а оружие: в старом сейве на него надели
    // обшивку и раму. Оба слоя — мусор, в новый сейв не идут.
    const tesla = slimOf('robobrain.leftArm');
    expect(tesla.content).toBe('robot_weapon_tesla_arm');
    expect(tesla.armorLayers).toEqual({ frame: null, plating: null, armor: null });
  });
});

// Тот же путь, что в приложении: slimSaveData перед записью в базу и
// restoreSaveData на загрузке (components/CharacterContext.js).
const catalog = getEquipmentCatalog();
const getEntry = (id, itemType) => {
  try { return findCatalogEntry(catalog, id, itemType); } catch { return null; }
};
const resolve = (item) => {
  try { return resolveItem(item, catalog); } catch { return item; }
};

describe('полный круг «записали — загрузили» на настоящем каталоге', () => {
  // Как в приложении: сначала миграция сейва (v20 → v21 переименовывает
  // удалённую из каталога «заводскую обшивку»), потом ужимка.
  const allSlots = () => migrateRobotPlatingIds({
    equippedRobotSlots: Object.fromEntries(
      Object.entries(fixtures).map(([key, value]) => [key.replace('.', '__'), JSON.parse(JSON.stringify(value))]),
    ),
  }).equippedRobotSlots;
  const written = () => slimSaveData({ schemaVersion: 20, equippedRobotSlots: allSlots() }, { getEntry });
  const loaded = () => restoreSaveData(written(), { resolve });

  it('атаки после записи и загрузки те же, что были', () => {
    const before = collectAttacks(allSlots()).map((a) => `${a.id}@${a.sourceSlot}`);
    const after = collectAttacks(loaded().equippedRobotSlots).map((a) => `${a.id}@${a.sourceSlot}`);
    expect(after).toEqual(before);
    expect(after.length).toBeGreaterThan(0);
  });

  it('собственная атака конечности не уезжает в установки', () => {
    // Ужимка предметов вырезает из экземпляра конечности всё каталожное,
    // включая builtinWeaponId: в сейве остаётся только состояние. Делить
    // «своё / установленное» надо по каталогу, иначе манипулятор попадёт и в
    // собственные атаки, и в установки — дубль карточки после перезагрузки.
    const limbWithoutCatalog = {
      id: 'robot_arm_securitron',
      name: 'Рука Секьюритрона',
      builtinWeapons: [{ id: 'robot_weapon_manipulator' }, { id: 'weapon_laser_gun' }],
    };
    expect(serializeSlot({ limb: limbWithoutCatalog }).installedWeapons)
      .toEqual([{ id: 'weapon_laser_gun', modIds: [] }]);
    expect(written().equippedRobotSlots.securitron__leftArm.installedWeapons)
      .toEqual([{ id: 'weapon_laser_gun', modIds: [] }]);
  });

  it('после загрузки слоты снова объекты с именами и статами', () => {
    const slots = loaded().equippedRobotSlots;
    expect(slots.securitron__leftArm.limb.name).toBeTruthy();
    expect(slots.securitron__leftArm.armor.damageResistance).toEqual({ physical: 1, energy: 1 });
    expect(slots.misterHandy__arm1.heldWeapon.name).toBeTruthy();
  });

  it('повторная запись загруженного персонажа не возвращает мусор', () => {
    const once = written().equippedRobotSlots;
    const twice = slimSaveData(loaded(), { getEntry }).equippedRobotSlots;
    expect(twice).toEqual(once);
  });
});

describe('круг «ужали — развернули» ничего не теряет', () => {
  const keys = Object.keys(fixtures);

  // Слот в том виде, в каком его держит приложение после загрузки: миграция
  // сейва (v20 → v21 переименовывает удалённую из каталога «заводскую
  // обшивку»), ужимка на экспорте и разворот по каталогам на импорте.
  // Сравнивать «сырой» слот из сейва с восстановленным нельзя: в сейве слой
  // лежит объектом со старыми характеристиками, а после загрузки берётся из
  // каталога.
  const asLoaded = (key) => restoreSaveData(
    slimSaveData(
      migrateRobotPlatingIds({ schemaVersion: 21, equippedRobotSlots: { x: slot(key) } }),
      { getEntry },
    ),
    { resolve },
  ).equippedRobotSlots.x;

  it('атаки после ужимки те же, что до неё', () => {
    for (const key of keys) {
      const before = collectAttacks({ x: slot(key) }).map((a) => `${a.id}@${a.source}`);
      const after = collectAttacks({ x: slimOf(key) }).map((a) => `${a.id}@${a.source}`);
      expect(after, key).toEqual(before);
    }
  });

  it('СУ после ужимки не ниже, чем была (мёртвые слои не считались и так)', () => {
    for (const key of keys) {
      const loaded = asLoaded(key);
      const before = totalDR(loaded);
      const after = totalDR(serializeSlot(loaded));
      expect(after.physical, key).toBe(before.physical);
      expect(after.energy, key).toBe(before.energy);
      expect(after.rad, key).toBe(before.rad);
    }
  });

  it('свойство «принимает защиту» не меняется', () => {
    for (const key of keys) {
      expect(slotAcceptsArmor(slimOf(key)).allowed, key)
        .toBe(slotAcceptsArmor(slot(key)).allowed);
    }
  });

  it('урон из старого сейва ({base, modifiers, total}) приходит в карточку числом', () => {
    // v9 записала числовые статы предметов объектом. В сейве секьюритрона
    // у манипулятора damage — ровно такой объект; цифра лежит в total.
    expect(slot('securitron.leftArm').limb.builtinWeapons[0].damage).toEqual({
      base: 2,
      modifiers: [],
      total: 2,
    });
    const cards = collectAttacks({ leftArm: slot('securitron.leftArm') });
    const manipulator = cards.find((c) => c.id === 'robot_weapon_manipulator');
    expect(manipulator.damage).toBe(2);
    // и после ужимки — тоже число (характеристики берутся из каталога)
    const slimmed = collectAttacks({ leftArm: slimOf('securitron.leftArm') });
    expect(slimmed.find((c) => c.id === 'robot_weapon_manipulator').damage).toBe(2);
  });

  it('ужимка идемпотентна', () => {
    for (const key of keys) {
      const once = serializeSlot(asLoaded(key));
      const twice = serializeSlot(once);
      expect(twice, key).toEqual(once);
    }
  });

  it('худое тело сейва разворачивается и ужимается обратно', () => {
    const data = { schemaVersion: 19, equippedRobotSlots: {} };
    for (const key of keys) {
      const [plan, slotKey] = key.split('.');
      data.equippedRobotSlots[`${plan}__${slotKey}`] = slot(key);
    }
    const slim = slimRobotSlots(data);
    // в худом теле слотов нет ни предметов, ни имён
    const json = JSON.stringify(slim.equippedRobotSlots);
    expect(json).not.toContain('"damageResistance"');
    expect(json).not.toContain('"builtinWeapons"');

    const wide = restoreSaveData(slim, { resolve: (item) => item });
    for (const composite of Object.keys(slim.equippedRobotSlots)) {
      const again = serializeSlot(wide.equippedRobotSlots[composite]);
      expect(again, composite).toEqual(slim.equippedRobotSlots[composite]);
    }
  });

  it('разворот даёт слот, пригодный для экранов: конечность и слои — объекты', () => {
    const wide = deserializeSlot(slimOf('securitron.leftArm'));
    expect(wide.limb?.id).toBe('robot_arm_securitron');
    expect(wide.limb?.itemType).toBe('robotArm');
    expect(wide.armor?.id).toBe('robot_armor_factory_arms');
    expect(wide.armor?.damageResistance).toEqual({ physical: 1, energy: 1 });
    // установленное оружие вернулось внутрь конечности
    const ids = (wide.limb.builtinWeapons || []).map((w) => w.id);
    expect(ids).toContain('robot_weapon_manipulator');
    expect(ids).toContain('weapon_laser_gun');
  });

  it('разворот: оружие в ладони снова предмет', () => {
    const wide = deserializeSlot(slimOf('robobrain.rightArm'));
    expect(wide.heldWeapon?.id).toBe('weapon_combat_shotgun');
    expect(wide.heldWeapon?.itemType).toBe('weapon');
  });
});

describe('миграция v20 → v21: «заводская обшивка» → стандартная', () => {
  // Заводской обшивки в книге нет — каталог её больше не содержит, но старые
  // сейвы (и комплект защитрона) на неё ссылались. Слой обязан сохраниться.
  it('слой-объект в толстом слоте переименован', () => {
    const state = {
      equippedRobotSlots: {
        body: { limb: { id: 'robot_body_protectron' }, plating: { id: 'robot_plating_factory_body' } },
      },
    };
    const next = migrateRobotPlatingIds(state);
    expect(next.equippedRobotSlots.body.plating.id).toBe('robot_plating_standard_body');
    expect(next.equippedRobotSlots.body.limb.id).toBe('robot_body_protectron');
  });

  it('id в armorLayers нового слота переименован', () => {
    const state = {
      equippedRobotSlots: {
        body: { content: 'robot_body_protectron', armorLayers: { plating: 'robot_plating_factory_body', armor: null, frame: null } },
      },
    };
    expect(migrateRobotPlatingIds(state).equippedRobotSlots.body.armorLayers.plating)
      .toBe('robot_plating_standard_body');
  });

  it('инвентарь тоже правится', () => {
    const state = { equipment: { items: [{ id: 'robot_plating_factory_arms', quantity: 1 }, { id: 'weapon_10mm_pistol' }] } };
    expect(migrateRobotPlatingIds(state).equipment.items.map((i) => i.id))
      .toEqual(['robot_plating_standard_arms', 'weapon_10mm_pistol']);
  });

  it('идемпотентна и не трогает сейвы без старой обшивки', () => {
    const once = migrateRobotPlatingIds({
      equippedRobotSlots: { body: { armorLayers: { plating: 'robot_plating_factory_body' } } },
    });
    expect(migrateRobotPlatingIds(once)).toBe(once);

    const clean = { equippedRobotSlots: { body: { armorLayers: { plating: 'robot_plating_serrated_body' } } } };
    expect(migrateRobotPlatingIds(clean)).toBe(clean);
  });
});
