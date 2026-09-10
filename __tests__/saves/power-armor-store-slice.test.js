// Шаг 4 миграции: слой брони/силовой брони (equippedArmor, equippedPowerArmor,
// powerArmorRuntime, pendingCoreChoice) переехал из CharacterContext в стор
// (powerArmorSlice.js). Экшены слоя (надеть/снять пакет и части, починка, тик
// расхода блока) — действия стора; таймер остался React-эффектом, но тикает
// стор-действием tickPowerArmorCore.
//
// НЕ в этом тесте: полный цикл с диалогом выбора блока (интерактив) и
// интервальный тик — механики перенесены 1:1, покрытие — доменные тесты
// domain/powerArmor + этот слайс-тест на граничные случаи.
//
// Покрывает:
//  - начальное состояние (пустая броня, пустой пакет, нулевой накопитель);
//  - loadPowerArmorState (восстановление из сейва, диалог сбрасывается);
//  - персист: equippedArmor/equippedPowerArmor/powerArmorRuntime в partialize,
//    pendingCoreChoice НЕ персистится (недоодетый пакет не переживает рестарт);
//  - setEquippedArmor: прямой сет и функциональный апдейтер (паттерн экранов);
//  - механика частей: починка до максимума, сломанная часть слетает в
//    инвентарь, снятие части в свою стопку;
//  - no-op границы: снять пустой пакет, разрешить несуществующий диалог,
//    тик без каркаса;
//  - resetCharacterStore сбрасывает весь слой.

import { afterEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';
import { createEmptyEquippedPowerArmor, powerArmorSlotsFor } from '../../domain/powerArmor';
import { createEmptyEquippedArmor } from '../../domain/equippedArmor';
import dataPowerArmor from '../../modules/fallout/data/equipment/powerArmor.json';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

const PA_CATALOG_BY_ID = Object.fromEntries(
  Object.values(dataPowerArmor).flatMap((set) => set.pieces).map((p) => [p.id, p]),
);

const PIECE_ID = 'power_armor_raider_chest';
const PIECE_MAX_HP = PA_CATALOG_BY_ID[PIECE_ID].hp;
// Слот части считаем тем же доменным механизмом, что использует экшен, —
// без хардкода имён слотов в тесте.
const PIECE_SLOT = powerArmorSlotsFor(PA_CATALOG_BY_ID[PIECE_ID])[0];

const pieceIn = (hpCurrent) => ({
  ...createEmptyEquippedPowerArmor(),
  pieces: {
    ...createEmptyEquippedPowerArmor().pieces,
    [PIECE_SLOT]: { catalogId: PIECE_ID, appliedMods: {}, hpCurrent },
  },
});

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слайс силовой брони (powerArmorSlice)', () => {
  it('начальное состояние: пустая броня, пустой пакет, нулевой накопитель, диалога нет', () => {
    const state = useCharacterStore.getState();
    expect(state.equippedArmor).toEqual(createEmptyEquippedArmor());
    expect(state.equippedPowerArmor).toEqual(createEmptyEquippedPowerArmor());
    expect(state.powerArmorRuntime).toEqual({ coreAccumulatorMs: 0 });
    expect(state.pendingCoreChoice).toBeNull();
  });

  it('loadPowerArmorState восстанавливает слой из сейва и сбрасывает диалог', () => {
    const store = useCharacterStore.getState();
    store.setPendingCoreChoice({ kind: 'equip', equipped: createEmptyEquippedPowerArmor(), cores: [] });
    store.loadPowerArmorState({
      equippedArmor: { leftArm: { armor: { id: 'armor_leather' } } },
      equippedPowerArmor: pieceIn(PIECE_MAX_HP),
      powerArmorRuntime: { coreAccumulatorMs: 42_000 },
    });
    const state = useCharacterStore.getState();
    expect(state.equippedArmor.leftArm.armor.id).toBe('armor_leather');
    expect(state.equippedPowerArmor.pieces[PIECE_SLOT].hpCurrent).toBe(PIECE_MAX_HP);
    expect(state.powerArmorRuntime.coreAccumulatorMs).toBe(42_000);
    expect(state.pendingCoreChoice).toBeNull();
  });

  it('слой в partialize и переживает persist → rehydrate; диалог НЕ персистится', async () => {
    const store = useCharacterStore.getState();
    store.setEquippedArmor({ leftArm: { armor: { id: 'armor_x' } } });
    store.setPendingCoreChoice({ kind: 'depleted', equipped: createEmptyEquippedPowerArmor(), cores: [] });

    const raw = await vi.waitFor(async () => {
      const data = await AsyncStorage.getItem('character-store');
      expect(data).not.toBeNull();
      return data;
    });
    const persisted = JSON.parse(raw);
    expect(persisted.state.equippedArmor).toEqual({ leftArm: { armor: { id: 'armor_x' } } });
    expect(persisted.state.powerArmorRuntime).toEqual({ coreAccumulatorMs: 0 });
    // Недоодетый пакет/диалог — временное состояние транзакции, в сейв не идёт.
    expect(persisted.state.pendingCoreChoice).toBeUndefined();

    useCharacterStore.getState().resetCharacterStore();
    await AsyncStorage.setItem('character-store', raw);
    await useCharacterStore.persist.rehydrate();
    const state = useCharacterStore.getState();
    expect(state.equippedArmor).toEqual({ leftArm: { armor: { id: 'armor_x' } } });
    expect(state.pendingCoreChoice).toBeNull();
  });

  it('setEquippedArmor: прямой сет и функциональный апдейтер (паттерн экранов)', () => {
    const store = useCharacterStore.getState();
    store.setEquippedArmor({});
    store.setEquippedArmor((prev) => ({
      ...prev,
      leftArm: { ...prev.leftArm, armor: { id: 'armor_a' } },
    }));
    expect(useCharacterStore.getState().equippedArmor.leftArm.armor.id).toBe('armor_a');
  });

  it('починка надетой части — до максимума (ПРАВИЛО владельца: бесплатно)', () => {
    const store = useCharacterStore.getState();
    store.loadPowerArmorState({ equippedPowerArmor: pieceIn(3) });
    store.repairPowerArmorPieceAt(PIECE_SLOT);
    expect(useCharacterStore.getState().equippedPowerArmor.pieces[PIECE_SLOT].hpCurrent).toBe(PIECE_MAX_HP);
  });

  it('сломанная часть (0 hp) слетает с пакета в инвентарь', () => {
    const store = useCharacterStore.getState();
    store.loadPowerArmorState({ equippedPowerArmor: pieceIn(1) });
    store.adjustPowerArmorDurability(PIECE_SLOT, -1);
    const state = useCharacterStore.getState();
    expect(state.equippedPowerArmor.pieces[PIECE_SLOT]).toBeNull();
    const inInventory = Object.values(state.items)
      .some((item) => (item.weaponId || item.id) === PIECE_ID);
    expect(inInventory).toBe(true);
  });

  it('снятая часть уходит в инвентарь своей стопкой (подпись: id+моды+прочность)', () => {
    const store = useCharacterStore.getState();
    store.loadPowerArmorState({ equippedPowerArmor: pieceIn(PIECE_MAX_HP - 1) });
    store.unequipPowerArmorPieceAt(PIECE_SLOT);
    const state = useCharacterStore.getState();
    expect(state.equippedPowerArmor.pieces[PIECE_SLOT]).toBeNull();
    const stack = Object.values(state.items).find((item) => (item.weaponId || item.id) === PIECE_ID);
    expect(stack?.hpCurrent).toBe(PIECE_MAX_HP - 1);
  });

  it('no-op границы: пустой пакет, чужой диалог, тик без каркаса', () => {
    const store = useCharacterStore.getState();
    expect(() => store.unequipPowerArmorPackage()).not.toThrow();
    expect(useCharacterStore.getState().equippedPowerArmor.frame).toBeNull();
    expect(() => store.resolveCoreChoice(null)).not.toThrow();
    expect(useCharacterStore.getState().pendingCoreChoice).toBeNull();
    expect(() => store.tickPowerArmorCore(15_000)).not.toThrow();
    expect(useCharacterStore.getState().powerArmorRuntime).toEqual({ coreAccumulatorMs: 0 });
  });

  it('resetCharacterStore сбрасывает весь слой', () => {
    const store = useCharacterStore.getState();
    store.setEquippedArmor({ leftArm: { armor: { id: 'armor_a' } } });
    store.loadPowerArmorState({ equippedPowerArmor: pieceIn(PIECE_MAX_HP), powerArmorRuntime: { coreAccumulatorMs: 5 } });
    store.setPendingCoreChoice({ kind: 'equip', equipped: createEmptyEquippedPowerArmor(), cores: [] });

    useCharacterStore.getState().resetCharacterStore();
    const state = useCharacterStore.getState();
    expect(state.equippedArmor).toEqual(createEmptyEquippedArmor());
    expect(state.equippedPowerArmor).toEqual(createEmptyEquippedPowerArmor());
    expect(state.powerArmorRuntime).toEqual({ coreAccumulatorMs: 0 });
    expect(state.pendingCoreChoice).toBeNull();
  });
});
