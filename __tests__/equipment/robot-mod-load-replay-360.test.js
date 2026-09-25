// ПРИЁМОЧНЫЙ (патч 360): реплей РЕАЛЬНОГО экспорта владельца (штурмомрон,
// лазер-ган «Смешанный Снайперский ствол», скрафченный тюнер в сумке).
// Жалоба: «Смешанный конденсатор не снимается, замена на тюнер — изменений
// не происходит». Дефекты сейва, которые чинит патч:
//   1) призрак робо-оружия в equippedWeapons с УСТАРЕВШИМИ appliedMods —
//      вычищается при загрузке (правда о модах робо-оружия — только слоты);
//   2) loadRobotState держал худые слоты как есть — ветки записи модов
//      (limb.builtinWeapons) молча не срабатывали; теперь слоты всегда
//      развёрнуты в полную форму.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => {
  const rows = new Map();
  return {
    saveCharacter: vi.fn(async () => 'char_replay'),
    loadCharacterById: vi.fn(async (id) => rows.get(id) ?? null),
    getCharactersList: vi.fn(async () => Array.from(rows.values())),
    deleteCharacter: vi.fn(async () => {}),
    clearCharacterRenameRequest: vi.fn(async () => {}),
  };
});
vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn(async () => {}),
}));
vi.mock('../../db/Database', () => ({
  getWeaponById: vi.fn(async () => null),
  getWeaponModById: vi.fn(async () => null),
  getAmmoById: vi.fn(async () => null),
  getItemByName: vi.fn(async () => null),
  getCharactersList: vi.fn(async () => []),
}));

import saveExport from '../fixtures/assaultron-ghost-export.json';
import useCharacterStore from '../../src/store/characterStore';
import { loadCharacter } from '../../src/saves/characterSaves';
import { collectAttacks, serializeSlot, setInstalledWeaponMods } from '../../domain/robotSlots';
import { classifyModWritePlan, modIdList, robotWeaponHostKey } from '../../src/engine/items/weaponMods';
import { diffModInstallPlan } from '../../domain/modsEquip';

const state = () => useCharacterStore.getState();
const CHAR_ID = 'char_1790055767985_l9qvxxsas';

const loadExport = async () => {
  const { loadCharacterById } = await import('../../db');
  loadCharacterById.mockImplementation(async (id) => (id === CHAR_ID ? {
    id: CHAR_ID,
    name: 'вввв',
    level: 1,
    originName: 'assaultron',
    data: saveExport.character.data,
    folderId: null,
    renamePending: false,
  } : null));
  expect(await loadCharacter(CHAR_ID)).toBe(true);
};

// Экранная проводка (robotSlot-ветка handleApplyModification, 359).
const applyOnScreen = (modifiedWeapon) => {
  const s = state();
  const card = collectAttacks(s.robot.slots).find((a) => a.weaponId === 'weapon_laser_gun');
  const plan = classifyModWritePlan({
    sourceSlot: card.sourceSlot,
    attackRole: card.attackRole,
    isBuiltin: card.isBuiltin,
    storeItemId: null,
    uniqueId: null,
    weaponId: card.weaponId || card.id,
  }, { slotHasHeldWeapon: false });
  expect(plan?.kind).toBe('robotSlot');
  const hostKey = robotWeaponHostKey(plan.slotKey, plan.weaponId);
  const diff = diffModInstallPlan(modIdList(card), modIdList(modifiedWeapon));
  diff.uninstall.forEach((id) => s.uninstallArmorMod({ modId: id, hostKey }));
  diff.install.forEach((id) => s.installRobotWeaponMod({ modId: id, hostKey }));
  const next = setInstalledWeaponMods(s.robot.slots, plan.slotKey, plan.weaponId, modifiedWeapon.appliedMods);
  expect(next).toBeTruthy(); // 360: запись на развёрнутых слотах НЕ молчит
  state().setEquippedRobotSlots(next);
};

beforeEach(async () => {
  state().resetCharacterStore();
  await loadExport();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('ПРИЁМОЧНЫЙ (патч 360): реплей экспорта владельца', () => {
  it('призрак вычищен из equippedWeapons при загрузке', () => {
    const ghosts = state().equippedWeapons.filter((w) => w?.sourceSlot);
    expect(ghosts).toEqual([]);
  });

  it('карточка из слотов: только «Снайперский ствол», без «Смешанного»', () => {
    const card = collectAttacks(state().robot.slots).find((a) => a.weaponId === 'weapon_laser_gun');
    expect(card.appliedMods).toEqual({ Barrel: 'mod_055' }); // конденсатора НЕТ
  });

  it('замена на скрафченный тюнер (mod_043) — запись срабатывает', () => {
    // тюнер из сумки (в экспорте он есть) прячется по закону 343/344
    const tunerKey = Object.keys(state().items).find((k) => state().items[k].weaponId === 'mod_043');
    expect(tunerKey).toBeTruthy();

    applyOnScreen({ appliedMods: { Capacitor: 'mod_043', Barrel: 'mod_055' }, modIds: ['mod_043', 'mod_055'] });

    expect(state().items[tunerKey].equipped).toBe(true);
    expect(state().items[tunerKey].installedOn).toBe(robotWeaponHostKey('leftArm', 'weapon_laser_gun'));

    const card = collectAttacks(state().robot.slots).find((a) => a.weaponId === 'weapon_laser_gun');
    expect(card.appliedMods).toEqual({ Capacitor: 'mod_043', Barrel: 'mod_055' });
  });

  it('снятие ствола — тоже; круг через сейв держит результат', () => {
    applyOnScreen({ appliedMods: { Capacitor: 'mod_043', Barrel: 'mod_055' }, modIds: ['mod_043', 'mod_055'] });
    applyOnScreen({ appliedMods: { Capacitor: 'mod_043' }, modIds: ['mod_043'] });

    const saved = Object.fromEntries(Object.entries(state().robot.slots).map(([k, v]) => [k, serializeSlot(v)]));
    const restored = saved.leftArm.installedWeapons.find((w) => w.id === 'weapon_laser_gun');
    expect(restored.modIds).toEqual(['mod_043']);
  });
});
