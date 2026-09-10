// Шаг 3 миграции equippedWeapons из CharacterContext в characterStore:
// список надетого оружия — МЕТАДАННЫЕ (встроенные кулаки, манипуляторы,
// sourceSlot), «живые» предметы лежат в items (equipped: true). Единственный
// источник — стор; экраны (CharacterScreen, InventoryScreen,
// WeaponsAndArmorScreen, LimbUpgradeModal) читают/пишут его напрямую,
// фасад useCharacter() поле больше не отдаёт.
//
// НЕ в этом тесте: миграция сейвового формата [null, null] → динамический
// массив и инжекция встроенного оружия — они остались в loadCharacter
// контекста (React-lifecycle загрузки) и пишут через стор-экшен.
//
// Покрывает:
//  - начальное значение — пустой массив;
//  - прямой сет списка (робот: kit.robotWeapons);
//  - функциональный апдейтер prev => next (паттерн CharacterScreen:
//    дописать встроенное unarmed-оружие; WeaponsAndArmorScreen:
//    prev.map/prev.filter при модификации/снятии);
//  - персист: equippedWeapons входит в partialize и переживает rehydrate;
//  - сброс через resetCharacterStore → [].

import { afterEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слайс equippedWeapons', () => {
  it('начальное состояние — пустой массив', () => {
    expect(useCharacterStore.getState().equippedWeapons).toEqual([]);
  });

  it('setEquippedWeapons сохраняет список (робот: kit.robotWeapons)', () => {
    const robotWeapons = [
      { id: 'robot_weapon_laser', isManipulator: true, sourceSlot: 'leftArm' },
      { id: 'robot_weapon_flamer', sourceSlot: 'rightArm' },
    ];
    useCharacterStore.getState().setEquippedWeapons(robotWeapons);
    expect(useCharacterStore.getState().equippedWeapons).toEqual(robotWeapons);
  });

  it('функциональный апдейтер: дописать встроенное unarmed-оружие без дублей', () => {
    const store = useCharacterStore.getState();
    // Паттерн CharacterScreen.handleSelectKit для не-роботов.
    const unarmedId = 'weapon_fists';
    store.setEquippedWeapons((prev) => {
      const already = prev.some((w) => w?.id === unarmedId);
      if (already) return prev;
      return [{ id: unarmedId, isBuiltin: true }, ...prev];
    });
    expect(useCharacterStore.getState().equippedWeapons).toEqual([
      { id: unarmedId, isBuiltin: true },
    ]);
    // Повторный вызов не плодит дублей (prev => prev).
    useCharacterStore.getState().setEquippedWeapons((prev) => {
      const already = prev.some((w) => w?.id === unarmedId);
      if (already) return prev;
      return [{ id: unarmedId, isBuiltin: true }, ...prev];
    });
    expect(useCharacterStore.getState().equippedWeapons).toHaveLength(1);
  });

  it('функциональный апдейтер: prev.map / prev.filter (WeaponsAndArmorScreen)', () => {
    const store = useCharacterStore.getState();
    store.setEquippedWeapons([
      { id: 'weapon_a', appliedMods: {} },
      { id: 'weapon_b', appliedMods: { Receiver: 'mod_1' } },
    ]);
    // Модификация оружия (prev.map).
    store.setEquippedWeapons((prev) => prev.map((w) => (
      w.id === 'weapon_a' ? { ...w, appliedMods: { Receiver: 'mod_9' } } : w
    )));
    expect(useCharacterStore.getState().equippedWeapons[0].appliedMods).toEqual({ Receiver: 'mod_9' });
    // Снятие оружия (prev.filter).
    store.setEquippedWeapons((prev) => prev.filter((w) => w.id !== 'weapon_b'));
    expect(useCharacterStore.getState().equippedWeapons.map((w) => w.id)).toEqual(['weapon_a']);
  });

  it('equippedWeapons входит в partialize и переживает persist → rehydrate', async () => {
    const weapons = [{ id: 'weapon_fists', isBuiltin: true }];
    useCharacterStore.getState().setEquippedWeapons(weapons);

    // Ждём асинхронную запись персиста и проверяем, что partialize включил
    // equippedWeapons в сохраняемое состояние.
    const raw = await vi.waitFor(async () => {
      const data = await AsyncStorage.getItem('character-store');
      expect(data).not.toBeNull();
      expect(JSON.parse(data).state.equippedWeapons).toEqual(weapons);
      return data;
    });
    expect(JSON.parse(raw).version).toBe(CURRENT_SCHEMA_VERSION);

    // Раундтрип в духе character-store-rehydration.test.js: пишем запись
    // руками (сброс стора сам перезаписал бы storage), ре-гидрация
    // возвращает список в стейт.
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().equippedWeapons).toEqual([]);
    await AsyncStorage.setItem('character-store', raw);
    await useCharacterStore.persist.rehydrate();
    expect(useCharacterStore.getState().equippedWeapons).toEqual(weapons);
  });

  it('resetCharacterStore сбрасывает список в []', () => {
    useCharacterStore.getState().setEquippedWeapons([{ id: 'weapon_x' }]);
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().equippedWeapons).toEqual([]);
  });
});
