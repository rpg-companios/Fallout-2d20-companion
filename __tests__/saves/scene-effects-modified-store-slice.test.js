// Шаг 8а (часть 3): счётчик сцен, «эффекты трейтов», изменённые предметы — стор.
//
// - sceneCounter: данные (сколько сцен сменилось), персистится;
// - traitEffects: в сейве ключ effects (формат не менялся); пишутся только
//   из логики смены трейта (вычесть старые, дописать новые);
// - modifiedItems: в сторе JSON-дружелюбный словарь { [itemId]: item };
//   провайдер кладёт в снапшот Map → массив пар (прежний формат сейва).
//
// Стор-поле effects занято словарём timed-эффектов (Шаг 6) — поэтому
// «эффекты трейтов» названы traitEffects; фасадные имена effects/setEffects
// с фасада сняты (AST: character-context-step8a-3-facade.test.js).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: сцены/эффекты трейтов/модификации (Шаг 8а, часть 3)', () => {
  it('начальное состояние: 0 / [] / {}', () => {
    const s = useCharacterStore.getState();
    expect(s.sceneCounter).toBe(0);
    expect(s.traitEffects).toEqual([]);
    expect(s.modifiedItems).toEqual({});
  });

  it('sceneCounter: значением и апдейтером (advanceScene = +1 за сцену)', () => {
    const store = useCharacterStore.getState();
    store.setSceneCounter(5);
    expect(useCharacterStore.getState().sceneCounter).toBe(5);
    store.setSceneCounter((prev) => prev + 1);
    expect(useCharacterStore.getState().sceneCounter).toBe(6);
  });

  it('traitEffects: апдейтер «вычесть старые трейт-эффекты, дописать новые»', () => {
    const store = useCharacterStore.getState();
    store.setTraitEffects(['fast_metabolism', 'iron_gut']);
    store.setTraitEffects((current) => {
      const oldEffects = ['fast_metabolism'];
      const newEffects = ['gifted'];
      const withoutOld = current.filter((e) => !oldEffects.includes(e));
      return [...new Set([...withoutOld, ...newEffects])];
    });
    expect(useCharacterStore.getState().traitEffects).toEqual(['iron_gut', 'gifted']);
  });

  it('modifiedItems: save/remove по каноническому id оригинала', () => {
    const store = useCharacterStore.getState();
    store.saveModifiedItem({ weaponId: 'weapon_switchblade' }, { weaponId: 'weapon_switchblade', name: 'Клинок+' });
    expect(useCharacterStore.getState().modifiedItems.weapon_switchblade).toEqual({
      weaponId: 'weapon_switchblade',
      name: 'Клинок+',
    });
    // Повторное сохранение того же предмета перезаписывает (Map-семантика).
    store.saveModifiedItem({ weaponId: 'weapon_switchblade' }, { weaponId: 'weapon_switchblade', name: 'Клинок++' });
    expect(useCharacterStore.getState().modifiedItems.weapon_switchblade.name).toBe('Клинок++');
    store.saveModifiedItem({ id: 'armor_leather' }, { id: 'armor_leather', name: 'Кожанка+' });
    expect(Object.keys(useCharacterStore.getState().modifiedItems)).toEqual([
      'weapon_switchblade',
      'armor_leather',
    ]);
    store.removeModifiedItem({ weaponId: 'weapon_switchblade' });
    expect(useCharacterStore.getState().modifiedItems.weapon_switchblade).toBeUndefined();
  });

  it('modifiedItems: setModifiedItems объектом/апдейтером (путь загрузки сейва)', () => {
    const store = useCharacterStore.getState();
    store.setModifiedItems(Object.fromEntries([['w1', { id: 'w1' }]]));
    store.setModifiedItems((prev) => ({ ...prev, a1: { id: 'a1' } }));
    expect(useCharacterStore.getState().modifiedItems).toEqual({
      w1: { id: 'w1' },
      a1: { id: 'a1' },
    });
  });

  it('resetCharacterStore чистит сцены/эффекты/модификации', () => {
    const store = useCharacterStore.getState();
    store.setSceneCounter(9);
    store.setTraitEffects(['x']);
    store.saveModifiedItem({ id: 'w1' }, { id: 'w1' });
    store.resetCharacterStore();
    const s = useCharacterStore.getState();
    expect(s.sceneCounter).toBe(0);
    expect(s.traitEffects).toEqual([]);
    expect(s.modifiedItems).toEqual({});
  });

  it('поля персистятся (данные, не производные)', async () => {
    const store = useCharacterStore.getState();
    store.setSceneCounter(3);
    store.setTraitEffects(['gifted']);
    store.saveModifiedItem({ id: 'w1' }, { id: 'w1', name: 'Мод' });
    const raw = JSON.parse(await AsyncStorage.getItem('character-store'));
    expect(raw.state.sceneCounter).toBe(3);
    expect(raw.state.traitEffects).toEqual(['gifted']);
    expect(raw.state.modifiedItems).toEqual({ w1: { id: 'w1', name: 'Мод' } });
  });
});
