// Шаг миграции персонажного счётного ресурса из CharacterContext в
// characterStore. Рантайм-имя нейтральное — currency (в Fallout это крышки:
// имя/иконка/локализация остаются в UI-слое сеттинга). Форма — «каунтер» из
// domain/counters.js (createCounter + restore для начисления); списание —
// транзакционная операция с явным отказом при недостатке средств.
//
// НЕ в этом тесте: kit.caps / data.caps — Fallout-данные и персистентный
// формат сейва, они не переименовываются (buildSnapshot маппит currency
// обратно на caps).
//
// Покрывает:
//  - начальное значение 0;
//  - earnCurrency прибавляет (restore: отрицательные/мусорные суммы
//    игнорируются);
//  - spendCurrency транзакционный: перерасход ОТКЛОНЯЕТСЯ ({ok:false,
//    reason:'not-enough-currency'}), баланс не меняется — «потратить больше,
//    чем есть» невозможно ни по одному пути вызова (контракт
//    spendAmmoForWeapon);
//  - граничные суммы spendCurrency: ноль — ok (бесплатная «покупка»),
//    отрицательная и NaN — no-op без порчи ресурса;
//  - setCurrency — абсолютная установка при загрузке сейва (в т.ч. мусор → 0);
//  - персист: currency входит в partialize и переживает rehydrate;
//  - сброс через resetCharacterStore → 0.

import { afterEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слайс currency', () => {
  it('начальное значение — 0', () => {
    expect(useCharacterStore.getState().currency).toBe(0);
  });

  it('earnCurrency прибавляет, отрицательная сумма игнорируется', () => {
    const store = useCharacterStore.getState();
    store.earnCurrency(50);
    expect(useCharacterStore.getState().currency).toBe(50);
    // «Начислить минус пять» — ошибка вызывающего, а не скрытое списание
    // (restore игнорирует amount <= 0).
    store.earnCurrency(-5);
    expect(useCharacterStore.getState().currency).toBe(50);
  });

  it('spendCurrency отклоняет перерасход: баланс не меняется, ok: false', () => {
    const store = useCharacterStore.getState();
    store.setCurrency(10);
    store.spendCurrency(4);
    expect(useCharacterStore.getState().currency).toBe(6);
    // Ключевой кейс инварианта «нельзя потратить больше, чем есть»: списание
    // больше остатка отклоняется, баланс НЕ тронут — ни зажима на 0, ни ухода
    // в минус.
    const rejected = store.spendCurrency(999);
    expect(rejected).toEqual({ ok: false, reason: 'not-enough-currency' });
    expect(useCharacterStore.getState().currency).toBe(6);
    // Точная сумма проходит.
    expect(store.spendCurrency(6)).toEqual({ ok: true });
    expect(useCharacterStore.getState().currency).toBe(0);
  });

  it('spendCurrency: ноль — ok, отрицательная и NaN — no-op без порчи ресурса', () => {
    const store = useCharacterStore.getState();
    store.setCurrency(10);
    // Бесплатная «покупка» (цена 0): валидна, баланс не меняется.
    expect(store.spendCurrency(0)).toEqual({ ok: true });
    expect(useCharacterStore.getState().currency).toBe(10);
    // «Списать минус пять» — ошибка вызывающего, а не скрытое восполнение.
    expect(store.spendCurrency(-5)).toEqual({ ok: true });
    expect(useCharacterStore.getState().currency).toBe(10);
    // Мусор (NaN) не превращает ресурс в NaN — no-op.
    expect(store.spendCurrency(Number('мусор'))).toEqual({ ok: true });
    expect(useCharacterStore.getState().currency).toBe(10);
  });

  it('setCurrency ставит абсолютное значение (загрузка сейва), мусор → 0', () => {
    const store = useCharacterStore.getState();
    store.earnCurrency(15);
    store.setCurrency(777);
    expect(useCharacterStore.getState().currency).toBe(777);
    store.setCurrency(-3);
    expect(useCharacterStore.getState().currency).toBe(0);
    store.setCurrency('не число');
    expect(useCharacterStore.getState().currency).toBe(0);
  });

  it('currency входит в partialize и переживает persist → rehydrate', async () => {
    useCharacterStore.getState().setCurrency(123);

    // Ждём асинхронную запись персиста и проверяем, что partialize включил
    // currency в сохраняемое состояние.
    const raw = await vi.waitFor(async () => {
      const data = await AsyncStorage.getItem('character-store');
      expect(data).not.toBeNull();
      expect(JSON.parse(data).state.currency).toBe(123);
      return data;
    });
    expect(JSON.parse(raw).version).toBe(CURRENT_SCHEMA_VERSION);

    // Раундтрип в духе character-store-rehydration.test.js: пишем запись
    // руками (сброс стора сам перезаписал бы storage), ре-гидрация
    // возвращает ресурс в стейт.
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().currency).toBe(0);
    await AsyncStorage.setItem('character-store', raw);
    await useCharacterStore.persist.rehydrate();
    expect(useCharacterStore.getState().currency).toBe(123);
  });

  it('resetCharacterStore сбрасывает ресурс в 0', () => {
    useCharacterStore.getState().earnCurrency(200);
    expect(useCharacterStore.getState().currency).toBe(200);
    useCharacterStore.getState().resetCharacterStore();
    expect(useCharacterStore.getState().currency).toBe(0);
  });
});
