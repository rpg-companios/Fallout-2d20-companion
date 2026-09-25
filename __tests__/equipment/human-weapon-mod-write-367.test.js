// ПРИЁМОЧНЫЙ (патч 367, ГОТОВИТСЯ): реплей РЕАЛЬНОГО экспорта владельца
// («крош», человек 8 ур., старый сейв). Репорт от 2026-09-25:
//   1) «применил к 10мм ресивер для автоогня — на карточках оружия изменений
//      нет, а должны были появиться эффекты (Очередь и т.д.)»;
//   2) в экспорте у 10мм appliedMods = {} — установка не записалась вовсе.
// Диагноз (этот тест его фиксирует): классификатор плана записи (311) для
// НАДЕТОГО оружия человека возвращает null — в записях equippedWeapons нет
// ни storeItemId, ни uniqueId (только instanceId), поэтому экран молча
// ничего не пишет, а модалка при этом показывает зелёную отметку «Применено».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => {
  const rows = new Map();
  return {
    saveCharacter: vi.fn(async (id, name, level, originName, data) => {
      rows.set(id, { id, name, level, originName, data, folderId: null, renamePending: false });
      return id;
    }),
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

import saveExport from '../fixtures/krosh-human-export.json';
import useCharacterStore from '../../src/store/characterStore';
import { loadCharacter, saveCharacter } from '../../src/saves/characterSaves';
import { classifyModWritePlan } from '../../src/engine/items/weaponMods';
import { resolveWeaponWithAppliedMods } from '../../domain/resolveItem';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';

const state = () => useCharacterStore.getState();
const CHAR_ID = 'char_1789449430018_8ewxoar1b';

const loadExport = async () => {
  const { loadCharacterById } = await import('../../db');
  loadCharacterById.mockImplementation(async (id) => (id === CHAR_ID ? {
    id: CHAR_ID,
    name: 'крош',
    level: 8,
    originName: 'vaultDweller',
    data: saveExport.character.data,
    folderId: null,
    renamePending: false,
  } : null));
  expect(await loadCharacter(CHAR_ID)).toBe(true);
};

// Точная имитация входов handleApplyModification (WeaponsAndArmorScreen).
const screenPlanInputs = (cardWeapon) => {
  const items = state().items;
  const resolveStoreItemId = (weapon) => {
    if (weapon?.uniqueId && items[weapon.uniqueId]) return weapon.uniqueId;
    if (weapon?.id && items[weapon.id]) return weapon.id;
    return Object.values(items).find(
      (item) => item.equipped && (
        item.uniqueId === weapon?.uniqueId
        || item.id === weapon?.id
        || item.weaponId === weapon?.weaponId
      ),
    )?.id;
  };
  return {
    sourceSlot: cardWeapon?.sourceSlot,
    attackRole: cardWeapon?.attackRole,
    isBuiltin: cardWeapon?.isBuiltin,
    storeItemId: resolveStoreItemId(cardWeapon) || null,
    uniqueId: cardWeapon?.uniqueId || null,
    weaponId: cardWeapon?.weaponId || cardWeapon?.id || null,
  };
};

beforeEach(async () => {
  state().resetCharacterStore();
  await loadExport();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('ПРИЁМОЧНЫЙ (патч 367): мод на надетом оружии человека — реплей «крош»', () => {
  it('ДИАГНОЗ: план записи = storeItem (по ключу items), не equippedWeapon', () => {
    const w = state().equippedWeapons.find((x) => x?.weaponId === 'weapon_10mm_pistol');
    expect(w).toBeTruthy();
    expect(w.appliedMods).toEqual({}); // как в экспорте владельца
    expect(w.uniqueId).toBeUndefined(); // в сейве ключей экземпляра нет
    // В рантайме надетое оружие лежит и в items — классификатор (311)
    // уводит запись в ветку «предмет сумки»…
    expect(state().items['weapon_10mm_pistol']).toBeTruthy();
    const card = resolveWeaponWithAppliedMods(w, getEquipmentCatalog('ru-RU'));
    const plan = classifyModWritePlan(screenPlanInputs(card), { slotHasHeldWeapon: false });
    expect(plan?.kind).toBe('storeItem');
    expect(plan.itemId).toBe('weapon_10mm_pistol');
  });

  it('ПОТЕРЯ: ветка storeItem пишет только в items — карточка (equippedWeapons) и сейв мод не видят', () => {
    const w = state().equippedWeapons.find((x) => x?.weaponId === 'weapon_10mm_pistol');
    // Точно как в ветке storeItem экрана: флагов нет (мода в сумке нет),
    // патч — в items, возврат. equippedWeapons не трогается.
    const patch = { appliedMods: { Receiver: 'mod_008' } };
    state().updateItem('weapon_10mm_pistol', patch);

    // Копия в items мод получила…
    expect(state().items['weapon_10mm_pistol'].appliedMods).toEqual({ Receiver: 'mod_008' });
    // …а надетый экземпляр (его читают карточки и сейв) — НЕТ.
    expect(state().equippedWeapons.find((x) => x?.weaponId === 'weapon_10mm_pistol').appliedMods).toEqual({});
  });

  it('ЦЕЛЬ ПОЧИНКИ: сквозная запись (как на экране) → «Очередь» на карточке → мод выживает сейв→загрузку', async () => {
    const w = state().equippedWeapons.find((x) => x?.weaponId === 'weapon_10mm_pistol');
    const card = resolveWeaponWithAppliedMods(w, getEquipmentCatalog('ru-RU'));
    const modifiedWeapon = { ...card, appliedMods: { Receiver: 'mod_008' } };
    // Точная имитация ветки storeItem экрана после 367: патч в items +
    // запись-сквозняк в надетый список по ключу предмета.
    state().updateItem(modifiedWeapon.instanceId || modifiedWeapon.id, { appliedMods: modifiedWeapon.appliedMods });
    state().setEquippedWeapons((prev) => prev.map((x) => (
      x && (x.uniqueId === w.uniqueId || x.instanceId === w.instanceId || x.id === w.id) ? modifiedWeapon : x
    )));

    const after = state().equippedWeapons.find((x) => x?.weaponId === 'weapon_10mm_pistol');
    expect(after.appliedMods).toEqual({ Receiver: 'mod_008' });

    // Эффект на карточке: «Очередь» (effect_burst) среди эффектов
    // (мод_008 «Автоматический»; локализацию id делает экран).
    const enriched = resolveWeaponWithAppliedMods(after, getEquipmentCatalog('ru-RU'));
    expect(JSON.stringify(enriched.effects ?? '')).toContain('effect_burst');

    // Мод выживает перезагрузку: сохранить (реальный путь) → грузить РОВНО
    // сохранённую строку (урок: мок, указывающий на исходный экспорт, давал
    // ложный «путь загрузки теряет моды»).
    const dbmod = await import('../../db');
    await saveCharacter(); // настоящий путь сохранения (characterSaves)
    const call = dbmod.saveCharacter.mock.calls.at(-1);
    const savedRow = {
      id: call[0], name: call[1], level: call[2], originName: call[3],
      data: call[4], folderId: null, renamePending: false,
    };
    dbmod.loadCharacterById.mockImplementation(async (id) => (id === CHAR_ID ? savedRow : null));
    state().resetCharacterStore();
    expect(await loadCharacter(CHAR_ID)).toBe(true);
    const reloaded = state().equippedWeapons.find((x) => x?.weaponId === 'weapon_10mm_pistol');
    expect(reloaded?.appliedMods).toEqual({ Receiver: 'mod_008' });
  });
});
