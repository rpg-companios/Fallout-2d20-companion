// Патч 209 — слайс stateExtensions в characterStore: хранилище полей
// расширений сеттингов переехало из useState контекста в зустанд-стор
// (как items/effects). Мутации — только действия стора, экраны подписаны
// селекторами; контекст раскладывает словарь в сейв под теми же ключами.

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';

afterEach(() => {
  useCharacterStore.getState().setStateExtensions({});
});

describe('characterStore: слайс stateExtensions', () => {
  it('начальное состояние — пустой словарь', () => {
    expect(useCharacterStore.getState().stateExtensions).toEqual({});
  });

  it('setStateExtension добавляет/меняет одно поле, не трогая остальные', () => {
    const store = useCharacterStore.getState();
    store.setStateExtensions({ other: { keep: true } });
    store.setStateExtension('survival', { food: 5 });
    expect(useCharacterStore.getState().stateExtensions).toEqual({
      other: { keep: true },
      survival: { food: 5 },
    });
    store.setStateExtension('survival', { food: 3 });
    expect(useCharacterStore.getState().stateExtensions.survival).toEqual({ food: 3 });
    expect(useCharacterStore.getState().stateExtensions.other).toEqual({ keep: true });
  });

  it('setStateExtensions заменяет весь словарь', () => {
    useCharacterStore.getState().setStateExtensions({ survival: { food: 1 } });
    useCharacterStore.getState().setStateExtensions({ survival: { food: 2 }, next: null });
    expect(useCharacterStore.getState().stateExtensions).toEqual({
      survival: { food: 2 },
      next: null,
    });
  });

  it('подписка на слайс срабатывает при изменении (store = источник)', () => {
    const seen = [];
    const unsubscribe = useCharacterStore.subscribe((state) => {
      seen.push(state.stateExtensions?.survival?.food ?? null);
    });
    useCharacterStore.getState().setStateExtension('survival', { food: 5 });
    useCharacterStore.getState().setStateExtension('survival', { food: 4 });
    unsubscribe();
    expect(seen).toEqual([5, 4]);
  });

  it('resetCharacterStore очищает слайс', () => {
    useCharacterStore.getState().setStateExtensions({ survival: { food: 5 } });
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().stateExtensions).toEqual({});
  });
});
