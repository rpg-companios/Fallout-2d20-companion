// Шаг 8а миграции: здоровье/радиация — стор-каунтеры (domain/counters.js).
// В состоянии лежит только текущее значение числом; потолок и границы
// собираются в момент операции (docs/architecture/counters-storage.md).
// Особенности, зафиксированные тестами:
//   - потолок лечения — формула сеттинга ВЫНОСЛИВОСТЬ + УДАЧА + (уровень−1);
//   - лечение не снимает «законно избыточное» здоровье (радиация опускает
//     максимум, не нанося урона; бонус отдыха повышает текущее выше базового);
//   - урон списывает до нуля без урезания по базовому потолку;
//   - радиация — ресурс «наоборот», нижняя граница 0, потолка нет;
//   - applySurvivalHpLoss (патч 232, по книге) — до нуля включительно, ноль
//     потерь — no-op;
//   - resetCharacterStore чистит счётчики (радиация больше не переживает
//     полный сброс — остаточное состояние до Шага 8а).
//
// Фасад useCharacter() поля больше не отдаёт — AST-контракт в
// character-context-step8a-facade.test.js.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';

const setVitals = ({ END = 5, LCK = 4, level = 1 }) => {
  useCharacterStore.getState().setBaseAttributes([
    { name: 'END', value: END },
    { name: 'LCK', value: LCK },
  ]);
  useCharacterStore.getState().setLevel(level);
};

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: каунтеры здоровье/радиация (Шаг 8а)', () => {
  it('начальное состояние: 0/0', () => {
    const s = useCharacterStore.getState();
    expect(s.currentHealth).toBe(0);
    expect(s.radiation).toBe(0);
  });

  it('потолок лечения: END + LCK + (уровень − 1)', () => {
    setVitals({ END: 5, LCK: 4, level: 3 });
    useCharacterStore.getState().healCharacter(99); // лечит до потолка 5+4+2=11
    expect(useCharacterStore.getState().currentHealth).toBe(11);
  });

  it(' healCharacter не превышает переданный потолок (радиация уменьшает max)', () => {
    setVitals({ END: 5, LCK: 4, level: 1 });
    useCharacterStore.getState().healCharacter(99, 7); // displayMax = 9−2
    expect(useCharacterStore.getState().currentHealth).toBe(7);
  });

  it('семантика restore сохранена 1-в-1: лечение зажимает к потолку и сверху', () => {
    // Легаси-поведение контекста 1-в-1: createCounter зажимает current к
    // границам при сборке (clampToBounds), поэтому heal при current выше
    // потолка возвращает потолок. «Законно избыточное» ОЗ защищает UI
    // (WeaponsAndArmorScreen: кнопка лечения disabled при
    // currentHealth >= displayMax), а не каунтер — контракт не менялся.
    setVitals({ END: 5, LCK: 4, level: 1 });
    const store = useCharacterStore.getState();
    store.setCurrentHealth(12); // выше базового потолка 9
    store.healCharacter(3);
    expect(useCharacterStore.getState().currentHealth).toBe(9);
  });

  it('урон: до нуля включительно, без урезания по базовому потолку', () => {
    setVitals({ END: 5, LCK: 4, level: 1 });
    const store = useCharacterStore.getState();
    store.setCurrentHealth(12);
    store.damageCharacter(5); // 12 выше потолка 9 — зажим отрезал бы 3
    expect(useCharacterStore.getState().currentHealth).toBe(7);
    store.damageCharacter(50);
    expect(useCharacterStore.getState().currentHealth).toBe(0);
  });

  it('setCurrentHealth поддерживает функциональный апдейтер', () => {
    const store = useCharacterStore.getState();
    store.setCurrentHealth(5);
    store.setCurrentHealth((prev) => prev - 2);
    expect(useCharacterStore.getState().currentHealth).toBe(3);
  });

  it('радиация: add/heal, нижняя граница 0', () => {
    const store = useCharacterStore.getState();
    store.addRadiation(4);
    expect(useCharacterStore.getState().radiation).toBe(4);
    store.healRadiation(6); // лечим больше, чем есть — в минус не уходит
    expect(useCharacterStore.getState().radiation).toBe(0);
    store.setRadiation((prev) => prev + 3);
    expect(useCharacterStore.getState().radiation).toBe(3);
    store.setRadiation(-10); // кламп к 0
    expect(useCharacterStore.getState().radiation).toBe(0);
  });

  it('applySurvivalHpLoss: списывает текущие ОЗ до нуля; ноль потерь — no-op', () => {
    const store = useCharacterStore.getState();
    store.setCurrentHealth(7);
    store.applySurvivalHpLoss(3);
    expect(useCharacterStore.getState().currentHealth).toBe(4);
    store.applySurvivalHpLoss(99);
    expect(useCharacterStore.getState().currentHealth).toBe(0);
    store.applySurvivalHpLoss(0);
    store.applySurvivalHpLoss(null);
    expect(useCharacterStore.getState().currentHealth).toBe(0);
  });

  it('resetCharacterStore чистит счётчики (радиация не переживает сброс)', () => {
    const store = useCharacterStore.getState();
    store.setCurrentHealth(9);
    store.addRadiation(5);
    store.resetCharacterStore();
    const s = useCharacterStore.getState();
    expect(s.currentHealth).toBe(0);
    expect(s.radiation).toBe(0);
  });

  it('счётчики персистятся (текущее значение — данные, не производная)', async () => {
    const store = useCharacterStore.getState();
    store.setCurrentHealth(6);
    store.addRadiation(2);
    const raw = JSON.parse(await AsyncStorage.getItem('character-store'));
    expect(raw.state.currentHealth).toBe(6);
    expect(raw.state.radiation).toBe(2);
  });
});
