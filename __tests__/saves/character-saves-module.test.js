// Патч 242 (Шаг 8б): блокнот сохранений переехал из CharacterContext в
// обычный модуль src/saves/characterSaves.js (без React). Контракт модуля:
//
//   - buildSnapshot строит снапшот из стора с ИСТОРИЧЕСКИМИ ключами сейва
//     (caps ← currency, effects ← traitEffects, modifiedItems — Map пар,
//     activeTimedEffects — денормализация словаря effects); потолок удачи
//     (maxLuckPoints) в сейв не пишется (Правило 1 counters-storage.md);
//   - saveCharacter пишет строку через db.saveCharacter, ставит
//     currentCharacterId/isSaved и «запоминает» сериализацию;
//   - loadCharacter восстанавливает стор (включая traitEffects из
//     сейв-ключа effects) и глушит автосейв («загруженное = записанное»);
//   - автосейв: подписка на стор с debounce 500 мс, пишет ТОЛЬКО уже
//     сохранённого персонажа (isSaved + currentCharacterId), пропускает
//     неизменённый JSON; отписка прекращает записи.
//
// db и облако замоканы: модуль движка не должен зависеть от реальной БД.

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

// kitResolver импортирует db/Database напрямую (мимо index-мока выше);
// Database.js тянет react-native (Flow) — в node-тесте недопустимо.
// Каталоги замоканы заглушками: roundtrip-тест каталоги не использует.
vi.mock('../../db/Database', () => ({
  getWeaponById: vi.fn(async () => null),
  getWeaponModById: vi.fn(async () => null),
  getAmmoById: vi.fn(async () => null),
  getItemByName: vi.fn(async () => null),
  getCharactersList: vi.fn(async () => []),
}));

import {
  buildSnapshot,
  saveCharacter,
  loadCharacter,
  getCharactersList,
  deleteCharacter,
  startCharacterAutosave,
} from '../../src/saves/characterSaves';
import * as db from '../../db';
import useCharacterStore from '../../src/store/characterStore';

const state = () => useCharacterStore.getState();

const seedStore = () => {
  // Стор собирается напрямую: модуль движка читает слайсы, а не React.
  useCharacterStore.setState({
    characterName: 'Минутмен',
    level: 3,
    origin: { id: 'minuteman', name: 'Минитмен' },
    trait: null,
    currency: 77,
    currentHealth: 12,
    radiation: 4,
    sceneCounter: 3,
    traitEffects: [{ id: 'trait_glow', name: 'Светящийся' }],
    effects: { eff1: { id: 'eff1', active: true, name: 'Психо', durationLeft: 60 } },
    // Картотека с унаследованной записью (эмуляция старого героя) +
    // предмет-основа в комплекте: мост при загрузке должен перенести
    // содержимое картотеки НА ПРЕДМЕТ.
    modifiedItems: { weapon_x_01_22: { id: 'weapon_x_01_22', name: 'Винтовка мод.', damage: 9 } },
    equipment: { id: 'kit_minuteman', name: 'Застрельщик', items: [{ id: 'weapon_x_01_22', name: 'Винтовка' }] },
    chemDosesLog: [{ chemId: 'psycho', takenAt: Date.now() - 1000 }], // свежая доза (окно CLEAN_DOSE)
    lastDiseaseResistAt: 999,
    conditions: { disease1: { id: 'disease1', ranks: 1 } },
    selectedPerks: [],
    // Журнал «награды за tagged-навыки выданы» (патч 244: восстанавливается).
    rewardedSkills: ['small_guns', 'repair'],
    // Расширение сеттинга (survival) — слайс stateExtensions стора.
    stateExtensions: { survival: { day: 2 } },
  });
};

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('патч 242: модуль сохранений (Шаг 8б)', () => {
  it('buildSnapshot: исторические ключи (caps/effects/modifiedItems), maxLuckPoints не пишется', () => {
    seedStore();
    const snapshot = buildSnapshot();

    // Персистентный контракт: крышки лежат под ключом caps.
    expect(snapshot.caps).toBe(77);
    expect(snapshot.currency).toBeUndefined();
    // «Эффекты трейтов» — под историческим ключом effects.
    expect(snapshot.effects).toEqual([{ id: 'trait_glow', name: 'Светящийся' }]);
    // Timed-эффекты — денормализация словаря стора (массив).
    expect(Array.isArray(snapshot.activeTimedEffects)).toBe(true);
    expect(snapshot.activeTimedEffects[0]?.id).toBe('eff1');
    // Формат-v2 (247): картотека модов в снапшот не входит (моды — на
    // предметах; старые записи переносятся на предметы при загрузке).
    expect(snapshot.modifiedItems).toBeUndefined();
    // Каунтеры/сцены/журнал доз — на месте.
    expect(snapshot.currentHealth).toBe(12);
    expect(snapshot.radiation).toBe(4);
    expect(snapshot.sceneCounter).toBe(3);
    expect(snapshot.chemDosesLog).toHaveLength(1);
    expect(snapshot.chemDosesLog[0].chemId).toBe('psycho');
    expect(snapshot.lastDiseaseResistAt).toBe(999);
    // Правило 1: потолок удачи в сейв не пишется.
    expect(snapshot.maxLuckPoints).toBeUndefined();
    // Расширения сеттингов (survival) приезжают теми же ключами.
    expect(snapshot.survival).toEqual({ day: 2 });
  });

  it('saveCharacter: пишет строку db, ставит isSaved + currentCharacterId', async () => {
    seedStore();
    const id = await saveCharacter('Минутмен');

    expect(id).toBeTruthy();
    expect(state().isSaved).toBe(true);
    expect(state().currentCharacterId).toBe(id);
    expect(db.saveCharacter).toHaveBeenCalledTimes(1);
    const [rowId, rowName, rowLevel, rowOrigin, rowData] = db.saveCharacter.mock.calls[0];
    expect(rowId).toBe(id);
    expect(rowName).toBe('Минутмен');
    expect(rowLevel).toBe(3);
    expect(rowOrigin).toBe('minuteman');
    const parsed = typeof rowData === 'string' ? JSON.parse(rowData) : rowData;
    expect(parsed.caps).toBe(77);
    expect(parsed.characterName).toBe('Минутмен');
    // Формат-v2: картотека в запись не идёт.
    expect(parsed.modifiedItems).toBeUndefined();
    // Зато предмет-основа едет в комплекте (мосту есть с чем работать).
    const savedItem = parsed.equipment?.items?.find((it) => it.id === 'weapon_x_01_22');
    expect(savedItem?.name).toBe('Винтовка');
  });

  it('loadCharacter: восстанавливает стор из сейв-ключей (effects → traitEffects), глушит автосейв', async () => {
    seedStore();
    const id = await saveCharacter('Минутмен');

    // Испортили рантайм: загрузка должна вернуть сохранённое.
    useCharacterStore.setState({ currency: 5, radiation: 1, characterName: 'Чужой' });

    const ok = await loadCharacter(id);
    expect(ok).toBe(true);
    expect(state().characterName).toBe('Минутмен');
    expect(state().currency).toBe(77);
    expect(state().radiation).toBe(4);
    expect(state().currentCharacterId).toBe(id);
    // renamePending: 0 → загруженный персонаж «сохранён».
    expect(state().isSaved).toBe(true);
    // Сейв-ключ effects вернулся в стор-поле traitEffects.
    expect(state().traitEffects).toEqual([{ id: 'trait_glow', name: 'Светящийся' }]);
    // Журнал доз/условия вернулись.
    expect(state().chemDosesLog).toHaveLength(1);
    expect(state().chemDosesLog[0].chemId).toBe('psycho');
    // Журнал выданных наград не потерялся (патч 244) — повторного вручения не будет.
    expect(state().rewardedSkills).toEqual(['small_guns', 'repair']);
  });

  it('save/load: сохраняет предметы, добавленные после выбора комплекта', async () => {
    seedStore();
    const bucketId = state().addNewItem({ itemId: 'bucket' });

    const id = await saveCharacter('Минутмен');
    const saved = db.saveCharacter.mock.calls.at(-1)[4];
    expect(saved.equipment?.items?.some((item) => item.weaponId === 'bucket')).toBe(true);

    await loadCharacter(id);
    expect(state().items[bucketId]?.weaponId).toBe('bucket');
  });

  it('формат-v2, мост: картотека старого сейва переносится на предметы при загрузке', async () => {
    // Готовим «старый» сейв руками: худой предмет в комплекте + полная
    // копия в картотеке (как до патча 237).
    db.saveCharacter.mockClear();
    await db.saveCharacter('char_old', 'Ветеран', 2, 'minuteman', {
      schemaVersion: 27,
      characterName: 'Ветеран',
      level: 2,
      origin: { id: 'minuteman' },
      trait: null,
      equipment: { id: 'kit_old', name: 'Старый комплект', items: [{ id: 'weapon_x_01_22', name: 'Винтовка' }] },
      equippedWeapons: [{ id: 'weapon_x_01_22_dupe', name: 'Дублёр' }],
      modifiedItems: [
        ['weapon_x_01_22', { id: 'weapon_x_01_22', name: 'Винтовка мод.', damage: 9 }],
        ['weapon_orphan', { id: 'weapon_orphan', name: 'Потеряшка' }],
      ],
      caps: 5,
    });

    const ok = await loadCharacter('char_old');
    expect(ok).toBe(true);

    // Мост: предмет в словаре стора обогащён картотекой (моды видны).
    // damage нормализуется параметрами стора в форму { base, modifiers, total }.
    expect(state().items.weapon_x_01_22?.name).toBe('Винтовка мод.');
    expect(state().items.weapon_x_01_22?.damage?.base).toBe(9);
    // Комплект тоже несёт обогащённую запись.
    const kitItem = state().equipment?.items?.find((it) => it.id === 'weapon_x_01_22');
    expect(kitItem?.name).toBe('Винтовка мод.');
    // Запись без пары (предмет потерян) оседает в стор-альбоме — read-only.
    expect(state().modifiedItems.weapon_orphan?.name).toBe('Потеряшка');

    // Пересохранение: картотека в запись больше не попадает (v2), а
    // обогащённый предмет — да; повторная загрузка ничего не теряет.
    await saveCharacter('Ветеран');
    const resent = db.saveCharacter.mock.calls.at(-1)[4];
    expect(resent.modifiedItems).toBeUndefined();
  });

  it('список и удаление: прокидываются в db', async () => {
    seedStore();
    const id = await saveCharacter('Минутмен');
    expect((await getCharactersList()).map((r) => r.id)).toContain(id);

    expect(await deleteCharacter(id)).toBe(true);
    expect((await getCharactersList()).map((r) => r.id)).not.toContain(id);
  });

  it('автосейв: пишет сохранённого, молчит на неизменённом JSON и несохранённом, отписка глушит', async () => {
    vi.useFakeTimers();
    seedStore();
    const id = await saveCharacter('Минутмен');
    db.saveCharacter.mockClear();

    const unsubscribe = startCharacterAutosave();

    // Реальное изменение → debounce 500 мс → запись.
    useCharacterStore.setState({ radiation: 9 });
    await vi.advanceTimersByTimeAsync(600);
    expect(db.saveCharacter).toHaveBeenCalledTimes(1);
    expect(db.saveCharacter.mock.calls[0][0]).toBe(id);

    // Тот же JSON (значение не менялось) → пропуск.
    useCharacterStore.setState({ sceneCounter: 4 });
    useCharacterStore.setState({ sceneCounter: 3 });
    await vi.advanceTimersByTimeAsync(600);
    expect(db.saveCharacter).toHaveBeenCalledTimes(1);

    // Несохранённый персонаж не пишется никогда.
    useCharacterStore.setState({ isSaved: false, radiation: 2 });
    await vi.advanceTimersByTimeAsync(600);
    expect(db.saveCharacter).toHaveBeenCalledTimes(1);

    // Отписка глушит автосейв окончательно.
    unsubscribe();
    useCharacterStore.setState({ isSaved: true, radiation: 5 });
    await vi.advanceTimersByTimeAsync(600);
    expect(db.saveCharacter).toHaveBeenCalledTimes(1);
  });
});
