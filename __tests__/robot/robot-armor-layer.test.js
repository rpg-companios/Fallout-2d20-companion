// __tests__/robot/robot-armor-layer.test.js
//
// Слой защиты в слоте: запись должна быть видна движку в ОБОИХ видах слота.
// Сейв хранит старый «толстый» вид ({ limb, plating, frame }) и новый
// ({ content, armorLayers }). Экраны писали слой на верхний уровень — у нового
// вида он там ни на что не влиял: движок читает armorLayers, поэтому выбор
// обшивки в модалке пропадал (баг со slim-сейвом Штурмотрона).
import { describe, it, expect } from 'vitest';

import {
  initRobotSlots,
} from '../../domain/robotEquip';
import {
  normalizeSlot,
  serializeSlot,
  deserializeSlot,
  withArmorLayer,
} from '../../domain/robotSlots';
import { getRobotSlotDamageResistance } from '../../domain/robotDamageResistance';
import limbs from '../../modules/fallout/data/equipment/robot/limbs.json';
import weaponAsLimb from '../../modules/fallout/data/equipment/robot/weaponAsLimb.json';
import robotWeapons from '../../modules/fallout/data/equipment/robot/weapons.json';
import platingFile from '../../modules/fallout/data/equipment/robot/armor_plating.json';

const robotCatalog = { limbs, weaponAsLimb, weapons: robotWeapons };
const PLATING = platingFile.plating || [];
const armPlating = () => PLATING.find((p) => p.limbType === 'arm');

const freshSlot = () => {
  const { slots } = initRobotSlots('assaultron', [], robotCatalog);
  return slots.leftArm;
};

// То, что лежит в персонаже после загрузки slim-сейва (deserializeSlot
// восстанавливает толстый вид с limb).
const loadedSlot = () => deserializeSlot(serializeSlot(freshSlot()));

// Слот в новом виде ({ content, armorLayers }) — его и не видели экраны,
// писавшие слой на верхний уровень.
const newShapeSlot = () => ({
  content: 'robot_arm_assaultron',
  armorLayers: { frame: null, plating: null, armor: null },
  heldWeaponId: null,
  installedWeapons: [],
  weaponMods: {},
});

describe('запись слоя защиты в слот', () => {
  it('новый вид слота: обшивка видна движку, конечность цела', () => {
    const slot = newShapeSlot();

    const plating = armPlating();
    const next = withArmorLayer(slot, 'plating', plating);

    expect(normalizeSlot(next).armorLayers.plating?.id).toBe(plating.id);
    expect(normalizeSlot(next).content?.id).toBe(normalizeSlot(slot).content?.id);
    expect(normalizeSlot(next).content).toBe(slot.content);
  });

  it('старый вид слота: запись осталась на верхнем уровне, конечность цела', () => {
    const slot = freshSlot();
    const plating = armPlating();
    const next = withArmorLayer(slot, 'plating', plating);

    // Форму слота не меняем: примешивать armorLayers к старому виду нельзя —
    // он станет «новым» без content, и конечность потеряется.
    expect('armorLayers' in next).toBe(false);
    expect(next.plating?.id).toBe(plating.id);
    expect(normalizeSlot(next).armorLayers.plating?.id).toBe(plating.id);
    expect(normalizeSlot(next).content?.id).toBe('robot_arm_assaultron');
  });

  it('снять слой — null в обоих видах', () => {
    for (const slot of [freshSlot(), loadedSlot(), newShapeSlot()]) {
      const dressed = withArmorLayer(slot, 'plating', armPlating());
      const bare = withArmorLayer(dressed, 'plating', null);
      expect(normalizeSlot(bare).armorLayers.plating).toBeNull();
    }
  });

  it('обшивка из модалки меняет СУ слота (все три вида слота)', () => {
    for (const slot of [freshSlot(), loadedSlot(), newShapeSlot()]) {
      const before = getRobotSlotDamageResistance(slot).physical;
      const after = getRobotSlotDamageResistance(withArmorLayer(slot, 'plating', armPlating())).physical;
      expect(after).toBeGreaterThan(before);
    }
  });

  it('загруженный из slim-сейва слот остаётся толстым', () => {
    const slot = loadedSlot();
    expect(slot.limb?.id).toBe('robot_arm_assaultron');
    const next = withArmorLayer(slot, 'plating', armPlating());
    expect('armorLayers' in next).toBe(false);
    expect(normalizeSlot(next).armorLayers.plating?.id).toBe(armPlating().id);
  });

  it('обшивка из модалки меняет СУ слота', () => {
    const slot = loadedSlot();
    const before = getRobotSlotDamageResistance(slot).physical;
    const after = getRobotSlotDamageResistance(withArmorLayer(slot, 'plating', armPlating())).physical;
    expect(after).toBeGreaterThan(before);
  });

  it('регрессия: запись на верхний уровень в новом виде слота пропадала', () => {
    const slot = newShapeSlot();
    const plating = armPlating();
    // Так экраны писали раньше — движок этого не видел.
    const oldWay = { ...slot, plating };
    expect(normalizeSlot(oldWay).armorLayers.plating).toBeNull();
    // А так — видит.
    expect(normalizeSlot(withArmorLayer(slot, 'plating', plating)).armorLayers.plating?.id).toBe(plating.id);
  });
});
