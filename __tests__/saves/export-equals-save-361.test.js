// ПРИЁМОЧНЫЙ (патч 361): экспорт ВСЕГДА = сейву (слово владельца: «хорошо
// бы, чтобы экспорт всегда = сейву… когда-то были расхождения»). Тело файла
// — тело записи БД БЕЗ повторной обработки: сжатие делает один владелец —
// saveCharacter. Раньше экспорт ре-слаймил тело каталогом экрана: другая
// локаль/обновившиеся правила слайма/двойной прогон давали тело, отличное
// от сейва, — источник исторических расхождений.
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
    duplicateCharacter: vi.fn(async () => ({ id: 'copy' })),
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

import useCharacterStore from '../../src/store/characterStore';
import { saveCharacter, loadCharacter } from '../../src/saves/characterSaves';
import { createCharacterExportPayload, parseCharacterImportPayload } from '../../domain/characterTransfer';

const state = () => useCharacterStore.getState();
const db = () => import('../../db');

beforeEach(async () => {
  state().resetCharacterStore();
  useCharacterStore.setState({ currentCharacterId: null, isSaved: false });
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('ПРИЁМОЧНЫЙ (патч 361): экспорт = сейв', () => {
  it('тело файла байт в байт = тело записи БД после saveCharacter', async () => {
    // персонаж-робот с оружием и модами: тело проходит полный путь сейва
    useCharacterStore.setState({
      origin: { id: 'assaultron', characterType: 'robot', bodyPlan: 'assaultron' },
      characterName: 'экспортный',
    });
    state().loadRobotState({
      bodyPlan: 'assaultron',
      slots: {
        leftArm: {
          limb: {
            id: 'robot_arm_assaultron', itemCategory: 'limb', limbType: 'arm', canHoldWeapons: true, weaponSlots: 1,
            builtinWeapons: [
              { id: 'weapon_laser_gun', weaponId: 'weapon_laser_gun', itemType: 'weapon', appliedMods: { Capacitor: 'mod_043' }, modIds: ['mod_043'] },
            ],
          },
          armorLayers: { frame: null, plating: null, armor: null }, heldWeapon: null,
        },
      },
      modules: [], mk2Installed: false,
    });

    const id = await saveCharacter('экспортный');
    expect(id).toBeTruthy();

    const row = (await (await db()).loadCharacterById(id));
    expect(row?.data).toBeTruthy();

    const payload = createCharacterExportPayload(row);
    expect(payload.format).toBe('rpg-companion-character');
    // ГЛАВНОЕ: тело файла = тело сейва БЕЗ изменения (байт в байт)
    expect(JSON.stringify(payload.character.data)).toBe(JSON.stringify(row.data));
  });

  it('круг экспорт → импорт → экспорт: тело не меняется', async () => {
    useCharacterStore.setState({
      origin: { id: 'assaultron', characterType: 'robot', bodyPlan: 'assaultron' },
    });
    state().loadRobotState({
      bodyPlan: 'assaultron',
      slots: { leftArm: { limb: { id: 'robot_arm_assaultron' }, armorLayers: { frame: null, plating: null, armor: null }, heldWeapon: null } },
      modules: [], mk2Installed: false,
    });
    await saveCharacter('круг');

    const first = createCharacterExportPayload(await (await db()).loadCharacterById('char_1') ?? await (await db()).getCharactersList().then((l) => l[0]));
    const parsed = parseCharacterImportPayload(JSON.stringify(first));
    expect(parsed.error).toBeUndefined();
    expect(parsed.character.data).toEqual(first.character.data); // импорт берёт тело как есть

    // повторный «экспорт той же строки» — то же самое тело (идемпотентность)
    const again = createCharacterExportPayload(await (await db()).getCharactersList().then((l) => l[0]));
    expect(JSON.stringify(again.character.data)).toBe(JSON.stringify(first.character.data));
  });

  it('экспортироваться может и старый ЖИРНЫЙ сейв (v18-) — тело не перекраивается', () => {
    const fatRow = {
      id: 'old', name: 'Старый', level: 3, originName: 'assaultron',
      data: { schemaVersion: 18, equippedRobotSlots: { leftArm: { limb: { id: 'robot_arm_assaultron', builtinWeapons: [{ id: 'weapon_laser_gun', name: 'Лазерный пистолет', damage: 4 }] } } } },
    };
    const payload = createCharacterExportPayload(fatRow);
    expect(payload.character.data).toBe(fatRow.data); // тот же объект, без копий-обработок
  });
});
