// Шаг миграции equipment из CharacterContext в characterStore: комплект
// снаряжения ({ id, name, weight, price, items, purchaseMaxRarity } | null)
// хранится в зустанд-сторе, Context — тонкий фасад (селектор + экшен) для
// существующих экранов (useCharacter().equipment / setEquipment).
//
// Покрывает:
//  - прямой сет объекта (CharacterScreen.handleSelectKit, loadCharacter);
//  - функциональный апдейтер prev => next (LimbUpgradeModal переносит
//    снимаемую конечность в equipment.items);
//  - персист: equipment входит в partialize и переживает rehydrate;
//  - resetCharacterStore сбрасывает комплект в null (resetCharacter /
//    resetKitAndRewards больше не оставляют «хвост» от прошлого персонажа).

import { afterEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

const kit = {
  id: 'starting_kit',
  name: 'Стартовый комплект',
  weight: 12.5,
  price: 300,
  items: [{ id: 'chem_stimpak', name: 'Стимпак', quantity: 2 }],
  purchaseMaxRarity: null,
};

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слайс equipment', () => {
  it('начальное состояние — null', () => {
    expect(useCharacterStore.getState().equipment).toBeNull();
  });

  it('setEquipment сохраняет объект комплекта целиком', () => {
    useCharacterStore.getState().setEquipment(kit);
    expect(useCharacterStore.getState().equipment).toEqual(kit);
  });

  it('setEquipment поддерживает функциональный апдейтер (prev => next)', () => {
    const store = useCharacterStore.getState();
    store.setEquipment(kit);
    // Паттерн LimbUpgradeModal: дописать предмет в items комплекта.
    store.setEquipment((prev) => ({
      ...prev,
      items: [...(prev?.items || []), { id: 'robotArm_x', name: 'Манипулятор' }],
    }));
    const equipment = useCharacterStore.getState().equipment;
    expect(equipment.items).toHaveLength(2);
    expect(equipment.id).toBe(kit.id);
  });

  it('equipment входит в partialize и переживает persist → rehydrate', async () => {
    useCharacterStore.getState().setEquipment(kit);

    // Ждём асинхронную запись персиста и проверяем, что partialize
    // включил equipment в сохраняемое состояние.
    const raw = await vi.waitFor(async () => {
      const data = await AsyncStorage.getItem('character-store');
      expect(data).not.toBeNull();
      expect(JSON.parse(data).state.equipment).toEqual(kit);
      return data;
    });
    expect(JSON.parse(raw).version).toBe(CURRENT_SCHEMA_VERSION);

    // Раундтрип в духе character-store-rehydration.test.js: пишем запись
    // руками (сброс стора сам перезаписал бы storage), ре-гидрация
    // возвращает комплект в стейт.
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().equipment).toBeNull();
    await AsyncStorage.setItem('character-store', raw);
    await useCharacterStore.persist.rehydrate();
    expect(useCharacterStore.getState().equipment).toEqual(kit);
  });

  it('resetCharacterStore сбрасывает комплект в null', () => {
    useCharacterStore.getState().setEquipment(kit);
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().equipment).toBeNull();
  });
});
