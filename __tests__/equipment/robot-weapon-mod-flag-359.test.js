// ПРИЁМОЧНЫЙ (патч 359): мод на оружии в слоте робота подчиняется закону
// 343/344. Репорт владельца: скрафтил «Тюнер бета-волн» для лазер-гана
// штурмотрона («Смешанный Снайперский ствол Лазерный пистолет»), применяет —
// «не ставится, хотя в инвентаре есть… почему не экипируется?». Причина:
// робо-ветки применения не исполняли закон — мод-предмет оставался в сумке
// после установки. Теперь: установка прячет мод из сумки (привязка к слоту+
// оружию), замена/снятие возвращает, уход оружия из слота возвращает.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import { initRobotSlots } from '../../domain/robotEquip';
import { collectAttacks, setInstalledWeaponMods } from '../../domain/robotSlots';
import { classifyModWritePlan, modIdList, robotWeaponHostKey } from '../../src/engine/items/weaponMods';
import { diffModInstallPlan } from '../../domain/modsEquip';
import robotCatalog from '../../modules/fallout/data/equipment/robot/limbs.json';
import robotWeapons from '../../modules/fallout/data/equipment/robot/weapons.json';

const state = () => useCharacterStore.getState();

// Комплект штурмотрона: лазер-ган установлен в левую руку (installTo: 'arm').
const kitSlots = () => initRobotSlots('assaultron', [
  { weaponId: 'weapon_laser_gun', itemType: 'weapon', weight: 0, slot: 'left', installTo: 'arm' },
], { limbs: robotCatalog, weapons: robotWeapons, weaponAsLimb: [] }).slots;

// Экранная проводка (как в WeaponsAndArmorScreen handleApplyModification).
const applyOnScreen = ({ slots, card, modified: modifiedWeapon }) => {
  const plan = classifyModWritePlan({
    sourceSlot: card.sourceSlot,
    attackRole: card.attackRole,
    isBuiltin: card.isBuiltin,
    storeItemId: null,
    uniqueId: card.uniqueId || null,
    weaponId: card.weaponId || card.id || null,
  }, { slotHasHeldWeapon: false });
  expect(plan?.kind).toBe('robotSlot');
  const hostKey = robotWeaponHostKey(plan.slotKey, plan.weaponId);
  const diff = diffModInstallPlan(modIdList(card), modIdList(modifiedWeapon));
  diff.uninstall.forEach((id) => state().uninstallArmorMod({ modId: id, hostKey }));
  diff.install.forEach((id) => state().installRobotWeaponMod({ modId: id, hostKey }));
  const next = setInstalledWeaponMods(slots, plan.slotKey, plan.weaponId, modifiedWeapon.appliedMods);
  expect(next).toBeTruthy();
  return { slots: next, hostKey };
};

// «Смешанный Снайперский ствол Лазерный пистолет» — на оружии уже стоят
// мод_046 (конденсатор) + mod_055 (ствол); игрок выбирает тюнер mod_043.
const weaponOnCard = (slots) => collectAttacks(slots).find((a) => a.weaponId === 'weapon_laser_gun');

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('ПРИЁМОЧНЫЙ (патч 359): мод робо-оружия — закон 343/344', () => {
  let modKey;

  beforeEach(() => {
    modKey = state().addNewItem({ weaponId: 'mod_beta_wave_tuner', itemType: 'weaponMod' });
  });

  it('установка: тюнер исчезает из сумки, привязан к слоту+оружию', () => {
    const slots = kitSlots();
    const card = weaponOnCard(slots);
    const modified = { ...card, appliedMods: { Capacitor: 'mod_beta_wave_tuner', Barrel: 'mod_sniper_barrel' } };

    applyOnScreen({ slots, card, modified });

    const item = state().items[modKey];
    expect(item.equipped).toBe(true);
    expect(item.installedOn).toBe(robotWeaponHostKey('leftArm', 'weapon_laser_gun'));
    // в сумке (свободные предметы) мода больше нет
    const free = Object.values(state().items).filter((i) => !i.equipped && !i.installedOn);
    expect(free.some((i) => i.weaponId === 'mod_beta_wave_tuner')).toBe(false);
  });

  it('замена конденсатора обратно: прежний мод вернулся в сумку', () => {
    const slots = kitSlots();
    const card = weaponOnCard(slots);
    const withTuner = { ...card, appliedMods: { Capacitor: 'mod_beta_wave_tuner', Barrel: 'mod_sniper_barrel' } };
    const { slots: slots2, hostKey } = applyOnScreen({ slots, card, modified: withTuner });

    // игрок ставит «Смешанный» (mod_046) вместо тюнера
    const card2 = collectAttacks(slots2).find((a) => a.weaponId === 'weapon_laser_gun');
    const back = { ...card2, appliedMods: { Capacitor: 'mod_photon_agitator', Barrel: 'mod_sniper_barrel' } };
    applyOnScreen({ slots: slots2, card: card2, modified: back });

    const item = state().items[modKey];
    expect(item.equipped).toBe(false);
    expect(item.installedOn).toBeUndefined();
    const free = Object.values(state().items).filter((i) => !i.equipped && !i.installedOn);
    expect(free.some((i) => i.weaponId === 'mod_beta_wave_tuner')).toBe(true);
    expect(hostKey).toBe('robotSlot:leftArm:weapon_laser_gun');
  });

  it('оружие ушло из слота (замена конечности/ладонь) — моды снова в сумке', () => {
    // закон исполняет слайс: releaseRobotSlotMods при replaceLimb/unequipHeldWeapon
    const slots = kitSlots();
    const card = weaponOnCard(slots);
    const withTuner = { ...card, appliedMods: { Capacitor: 'mod_beta_wave_tuner', Barrel: 'mod_sniper_barrel' } };
    const { hostKey } = applyOnScreen({ slots, card, modified: withTuner });

    state().uninstallArmorMod({ modId: 'mod_beta_wave_tuner', hostKey });
    const item = state().items[modKey];
    expect(item.equipped).toBe(false);
    expect(item.installedOn).toBeUndefined();
  });

  it('слайс: оружие убрали из ладони — его моды вернулись в сумку', () => {
    // реальное действие unequipHeldWeapon исполняет закон 343/344 само
    const slots = kitSlots();
    const palm = { ...slots.rightArm, heldWeapon: { id: 'weapon_laser_gun', weaponId: 'weapon_laser_gun', itemType: 'weapon', appliedMods: { Capacitor: 'mod_beta_wave_tuner' }, modIds: ['mod_beta_wave_tuner'] } };
    useCharacterStore.setState({ robot: { bodyPlan: 'assaultron', slots: { ...slots, rightArm: palm }, modules: [], mk2Installed: false } });

    const hostKey = robotWeaponHostKey('rightArm', 'weapon_laser_gun');
    expect(state().installRobotWeaponMod({ modId: 'mod_beta_wave_tuner', hostKey })).toBeTruthy();
    expect(state().items[modKey].equipped).toBe(true);

    state().unequipHeldWeapon('rightArm');
    expect(state().items[modKey].equipped).toBe(false);
    expect(state().items[modKey].installedOn).toBeUndefined();
  });

  it('круг через сейв: привязка переживает сохранение, дубль не заводится', () => {
    const slots = kitSlots();
    const card = weaponOnCard(slots);
    const withTuner = { ...card, appliedMods: { Capacitor: 'mod_beta_wave_tuner', Barrel: 'mod_sniper_barrel' } };
    applyOnScreen({ slots, card, modified: withTuner });

    // повторное «применить» того же набора — дифф пуст, второй мод не прячется
    const card2 = collectAttacks(
      setInstalledWeaponMods(slots, 'leftArm', 'weapon_laser_gun', withTuner.appliedMods),
    ).find((a) => a.weaponId === 'weapon_laser_gun');
    const diff = diffModInstallPlan(modIdList(card2), modIdList(withTuner));
    expect(diff.install).toEqual([]);
    expect(diff.uninstall).toEqual([]);
    // единственный экземпляр остался привязанным
    expect(state().items[modKey].installedOn).toBe(robotWeaponHostKey('leftArm', 'weapon_laser_gun'));
  });
});
