// Паспорта данных (серия «Стор на TypeScript», патч 244).
//
// Паспорт без проверки — просто бумажка. Тест держит два паспорта
// в сходимости с реальностью:
//
//   1) паспорт СТОРА (src/store/characterState.ts) против персист-байтов:
//      пишем состояние в AsyncStorage (persist character-store) и сверяем
//      состав ключей записанного JSON с CHARACTER_PERSISTED_KEYS в ОБЕ
//      стороны — новое поле стора без обновления паспорта падает тестом,
//      устаревший ключ паспорта — тоже. Runtime-поля
//      (currentCharacterId/isSaved) обязаны быть в состоянии и НЕ обязаны
//      попадать на диск;
//   2) паспорт СЕЙВА (src/saves/saveSnapshot.ts) против реальной записи:
//      saveCharacter (db замокан) → распарсенная строка data сверяется
//      с CHARACTER_SAVE_KEYS: паспорт ⊆ сейв, сейв \ паспорт = только
//      расширения сеттингов. Исторические инварианты формата — caps (не
//      currency), effects (= traitEffects стора), legacy-массивы
//      { name, value }, origin = { id }, modifiedItems — пары, и
//      maxLuckPoints НЕ пишется (Правило 1 counters-storage.md).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => {
  const rows = new Map();
  return {
    saveCharacter: vi.fn(async (id, name, level, originName, data) => {
      rows.set(id, {
        id,
        name,
        level,
        originName,
        data: typeof data === 'string' ? JSON.parse(data) : data,
        folderId: null,
        renamePending: false,
      });
      return id;
    }),
    loadCharacterById: vi.fn(async (id) => rows.get(id) ?? null),
    getCharactersList: vi.fn(async () => Array.from(rows.values())),
    deleteCharacter: vi.fn(async (id) => {
      rows.delete(id);
    }),
    clearCharacterRenameRequest: vi.fn(async () => {}),
  };
});

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn(async () => {}),
}));

// kitResolver импортирует db/Database напрямую; Database.js тянет
// react-native (Flow) — в node-тесте недопустимо. Каталоги не используются.
vi.mock('../../db/Database', () => ({
  getWeaponById: vi.fn(async () => null),
  getWeaponModById: vi.fn(async () => null),
  getAmmoById: vi.fn(async () => null),
  getItemByName: vi.fn(async () => null),
  getCharactersList: vi.fn(async () => []),
}));

import * as db from '../../db';
import useCharacterStore from '../../src/store/characterStore';
import {
  CHARACTER_PERSISTED_KEYS,
  CHARACTER_RUNTIME_KEYS,
} from '../../src/store/characterState';
import { CHARACTER_SAVE_KEYS } from '../../src/saves/saveSnapshot';

const PERSIST_KEY = 'character-store';
const state = () => useCharacterStore.getState();

// Мок сетапа держит in-memory Map; читаем через API AsyncStorage
// (тот же замокан), т.е. ровно те байты, что persist положил на «диск».
const readPersistedState = async () => {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const stored = await AsyncStorage.getItem(PERSIST_KEY);
  return stored ? JSON.parse(stored).state : null;
};

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
  vi.clearAllMocks();
});

describe('патч 244: паспорт данных стора против персист-байтов', () => {
  it('ключи записанного persist-JSON = CHARACTER_PERSISTED_KEYS (в обе стороны)', async () => {
    // Реальное изменение — persist пишет partialize(state) в хранилище.
    state().setCharacterName('Минутмен');
    await vi.waitFor(async () => {
      expect(await readPersistedState()).toBeTruthy();
    });

    const persisted = await readPersistedState();
    const persistedKeys = Object.keys(persisted).sort();
    const passportKeys = [...CHARACTER_PERSISTED_KEYS].sort();

    const extraOnDisk = persistedKeys.filter((key) => !passportKeys.includes(key));
    const missingOnDisk = passportKeys.filter((key) => !persistedKeys.includes(key));
    // Дефект ЛЮБОГО направления = паспорт разошёлся со стором.
    expect(extraOnDisk).toEqual([]);
    expect(missingOnDisk).toEqual([]);
  });

  it('runtime-поля (currentCharacterId/isSaved) в состоянии, но НЕ на диске', async () => {
    state().setCharacterName('Минутмен');
    useCharacterStore.setState({ currentCharacterId: 'char_x', isSaved: true });
    await vi.waitFor(async () => {
      expect(await readPersistedState()).toBeTruthy();
    });

    const stateKeys = Object.keys(state());
    for (const key of CHARACTER_RUNTIME_KEYS) {
      expect(stateKeys).toContain(key);
    }

    const persisted = await readPersistedState();
    for (const key of CHARACTER_RUNTIME_KEYS) {
      expect(Object.keys(persisted)).not.toContain(key);
    }
  });

  it('каждый ключ паспорта существует в состоянии стора', () => {
    const stateKeys = new Set(Object.keys(state()));
    const ghosts = CHARACTER_PERSISTED_KEYS.filter((key) => !stateKeys.has(key));
    expect(ghosts).toEqual([]);
  });
});

describe('патч 244: паспорт сейва против реальной записи', () => {
  const seedStore = () => {
    useCharacterStore.setState({
      characterName: 'Минутмен',
      level: 3,
      origin: { id: 'minuteman', name: 'Минитмен' },
      currency: 77,
      radiation: 4,
      traitEffects: [{ id: 'trait_glow', name: 'Светящийся' }],
      modifiedItems: { weapon_x_01_22: { id: 'weapon_x_01_22', name: 'Винтовка' } },
      // Расширение сеттинга — в сейв идёт верхним уровнем.
      stateExtensions: { survival: { day: 2 } },
    });
  };

  const saveOnce = async () => {
    const id = await (await import('../../src/saves/characterSaves')).saveCharacter('Минутмен');
    expect(id).toBeTruthy();
    expect(db.saveCharacter).toHaveBeenCalledTimes(1);
    return db.saveCharacter.mock.calls[0][4]; // data: распарсенный объект
  };

  it('паспорт ⊆ сейв; сейв \\ паспорт = только расширения сеттингов', async () => {
    seedStore();
    const saved = await saveOnce();
    const savedKeys = Object.keys(saved);

    const notInSave = CHARACTER_SAVE_KEYS.filter((key) => !savedKeys.includes(key));
    expect(notInSave).toEqual([]); // паспорт не оторвался от формата

    const settingFields = Object.keys(state().stateExtensions);
    const outsidePassport = savedKeys.filter(
      (key) => !CHARACTER_SAVE_KEYS.includes(key) && !settingFields.includes(key),
    );
    expect(outsidePassport).toEqual([]); // в сейве нет неизвестных движку ключей
  });

  it('maxLuckPoints в сейв НЕ пишется (Правило 1 counters-storage.md)', async () => {
    seedStore();
    const saved = await saveOnce();
    expect(saved.maxLuckPoints).toBeUndefined();
  });

  it('исторические инварианты: caps/effects/legacy-массивы/origin={id}/пары модов', async () => {
    seedStore();
    const saved = await saveOnce();

    // Рантайм-имя currency, поле сейва caps.
    expect(saved.caps).toBe(77);
    expect(saved.currency).toBeUndefined();
    // «Эффекты трейтов» — под ключом effects.
    expect(saved.effects).toEqual([{ id: 'trait_glow', name: 'Светящийся' }]);
    // Атрибуты/навыки — legacy-массивы { name, value }.
    expect(Array.isArray(saved.attributes)).toBe(true);
    expect(saved.attributes[0]).toHaveProperty('name');
    expect(saved.attributes[0]).toHaveProperty('value');
    // Ориджин — { id } без локализованных полей.
    expect(saved.origin).toEqual({ id: 'minuteman' });
    // Альбом модификаций — массив пар.
    expect(Array.isArray(saved.modifiedItems)).toBe(true);
    expect(saved.modifiedItems[0][0]).toBe('weapon_x_01_22');
    expect(saved.modifiedItems[0][1].name).toBe('Винтовка');
    // Версия схемы проставлена.
    expect(Number.isInteger(saved.schemaVersion)).toBe(true);
  });
});
