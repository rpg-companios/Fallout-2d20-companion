// Шаг миграции caps (крышки) из CharacterContext в characterStore: ресурс без
// верхней границы, не ниже нуля — форма «каунтера» из domain/counters.js
// (createCounter + restore/consume, тот же паттерн, что раньше жил в
// CharacterContext). Контекст — тонкий фасад (селектор + экшены) для
// существующих экранов (useCharacter().caps / earnCaps / spendCaps).
//
// Покрывает:
//  - начальное значение 0;
//  - earnCaps прибавляет (restore: отрицательные/мусорные суммы игнорируются);
//  - spendCaps транзакционный: перерасход ОТКЛОНЯЕТСЯ ({ok:false}), баланс
//    не меняется — «купить на больше, чем есть» невозможно ни по одному
//    пути вызова (контракт spendAmmoForWeapon);
//  - setCaps — абсолютная установка при загрузке сейва (в т.ч. мусор → 0);
//  - персист: caps входит в partialize и переживает rehydrate;
//  - сброс через resetCharacterStore → 0.

import { afterEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слайс caps', () => {
  it('начальное значение — 0', () => {
    expect(useCharacterStore.getState().caps).toBe(0);
  });

  it('earnCaps прибавляет, отрицательная сумма игнорируется', () => {
    const store = useCharacterStore.getState();
    store.earnCaps(50);
    expect(useCharacterStore.getState().caps).toBe(50);
    // «Вернуть минус пять» — ошибка вызывающего, а не скрытое списание
    // (restore игнорирует amount <= 0).
    store.earnCaps(-5);
    expect(useCharacterStore.getState().caps).toBe(50);
  });

  it('spendCaps отклоняет перерасход: баланс не меняется, ok: false', () => {
    const store = useCharacterStore.getState();
    store.setCaps(10);
    store.spendCaps(4);
    expect(useCharacterStore.getState().caps).toBe(6);
    // Ключевой кейс инварианта «нельзя списать больше, чем есть»: списание
    // больше остатка отклоняется (как spendAmmoForWeapon), баланс НЕ тронут —
    // ни зажима на 0, ни ухода в минус.
    const rejected = store.spendCaps(999);
    expect(rejected).toEqual({ ok: false, reason: 'not-enough-caps' });
    expect(useCharacterStore.getState().caps).toBe(6);
    // Точная сумма проходит.
    expect(store.spendCaps(6)).toEqual({ ok: true });
    expect(useCharacterStore.getState().caps).toBe(0);
  });

  it('spendCaps: нулевая сумма — ok (бесплатная покупка), отрицательная — no-op без изменений', () => {
    const store = useCharacterStore.getState();
    store.setCaps(10);
    // Бесплатная покупка (цена 0): валидна, баланс не меняется.
    expect(store.spendCaps(0)).toEqual({ ok: true });
    expect(useCharacterStore.getState().caps).toBe(10);
    // «Списать минус пять» — ошибка вызывающего, а не скрытое восполнение:
    // no-op, баланс прежний.
    expect(store.spendCaps(-5)).toEqual({ ok: true });
    expect(useCharacterStore.getState().caps).toBe(10);
  });

  it('setCaps ставит абсолютное значение (загрузка сейва), мусор → 0', () => {
    const store = useCharacterStore.getState();
    store.earnCaps(15);
    store.setCaps(777);
    expect(useCharacterStore.getState().caps).toBe(777);
    store.setCaps(-3);
    expect(useCharacterStore.getState().caps).toBe(0);
    store.setCaps('не число');
    expect(useCharacterStore.getState().caps).toBe(0);
  });

  it('caps входит в partialize и переживает persist → rehydrate', async () => {
    useCharacterStore.getState().setCaps(123);

    // Ждём асинхронную запись персиста и проверяем, что partialize
    // включил caps в сохраняемое состояние.
    const raw = await vi.waitFor(async () => {
      const data = await AsyncStorage.getItem('character-store');
      expect(data).not.toBeNull();
      expect(JSON.parse(data).state.caps).toBe(123);
      return data;
    });
    expect(JSON.parse(raw).version).toBe(CURRENT_SCHEMA_VERSION);

    // Раундтрип в духе character-store-rehydration.test.js: пишем запись
    // руками (сброс стора сам перезаписал бы storage), ре-гидрация
    // возвращает крышки в стейт.
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().caps).toBe(0);
    await AsyncStorage.setItem('character-store', raw);
    await useCharacterStore.persist.rehydrate();
    expect(useCharacterStore.getState().caps).toBe(123);
  });

  it('resetCharacterStore сбрасывает крышки в 0', () => {
    useCharacterStore.getState().earnCaps(200);
    expect(useCharacterStore.getState().caps).toBe(200);
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().caps).toBe(0);
  });
});
