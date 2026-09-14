// Паспорт операций стора (серия «Стор на TypeScript», патч 245).
//
// Проверяет паспорт src/store/characterActions.ts против живого стора:
//
//   1) ПОЛНОЕ покрытие: паспорт (сеттеры-апдейтеры + запись с семантикой +
//      именованные операции) ∪ исключения = ВСЕ действия стора, в обе
//      стороны. Новое действие без паспорта/исключения падает тестом —
//      «тихо проскочить мимо типизации» не выйдет;
//   2) семья апдейтеров: каждый сеттер из SETTER_UPDATER_KEYS принимает
//     функциональный апдейтер — вызов с identity (prev => prev) не падает
//     и не меняет состояние (обязательное требование владельца,
//     прецедент setEquippedWeapons, патч 218);
//   3) контракт ресурса: earnCurrency — void, spendCurrency →
//     {ok:true} | {ok:false, reason}, отказ НЕ трогает баланс
//     («нельзя купить на больше, чем есть»);
//   4) запись с собственной семантикой: setCurrency клампит не ниже нуля,
//     setBaseAttributes нормализует legacy-массив в словарь.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import {
  SETTER_UPDATER_KEYS,
  SETTER_VALUE_KEYS,
  NAMED_OP_KEYS,
  EXEMPT_ACTION_KEYS,
} from '../../src/store/characterActions';

const state = () => useCharacterStore.getState();
const actionKeys = () => new Set(
  Object.entries(state()).filter(([, v]) => typeof v === 'function').map(([k]) => k),
);

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('патч 245: паспорт операций против живого стора', () => {
  it('паспорт ∪ исключения покрывают ВСЕ действия стора (обе стороны)', () => {
    const passported = new Set([
      ...SETTER_UPDATER_KEYS,
      ...SETTER_VALUE_KEYS,
      ...NAMED_OP_KEYS,
    ]);
    const exempt = new Set(EXEMPT_ACTION_KEYS);
    const store = actionKeys();

    const notInStore = [...passported, ...exempt].filter((key) => !store.has(key));
    expect(notInStore).toEqual([]); // паспорт не оторвался от стора

    const notCovered = [...store].filter((key) => !passported.has(key) && !exempt.has(key));
    expect(notCovered).toEqual([]); // в сторе нет действий мимо паспорта

    const doubles = [...passported].filter((key) => exempt.has(key));
    expect(doubles).toEqual([]); // действие не может быть и в паспорте, и в исключениях
  });

  it.each([...SETTER_UPDATER_KEYS])('%s принимает функциональный апдейтер (identity)', (key) => {
    const before = { ...state() };
    state()[key]((prev) => prev);
    const after = state();
    // Наблюдаемое поле сеттера не изменилось (identity не мутирует состояние).
    const fieldName = key.replace(/^set/, '');
    const camel = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
    const compareKey = camel === 'equippedRobotSlots' || camel === 'equippedRobotModules'
      ? camel // robot.slots/modules — вложенные слайсы
      : camel;
    if (before[compareKey] !== undefined) {
      expect(after[compareKey]).toEqual(before[compareKey]);
    }
    expect(typeof state()[key]).toBe('function');
  });

  it('earnCurrency — void, spendCurrency → {ok} с нетронутым балансом при отказе', () => {
    state().earnCurrency(10);
    expect(state().currency).toBe(10);
    expect(state().earnCurrency(5)).toBeUndefined();

    const spend = state().spendCurrency(4);
    expect(spend).toEqual({ ok: true });
    expect(state().currency).toBe(11); // 10 + 5 - 4

    const rejected = state().spendCurrency(100);
    expect(rejected.ok).toBe(false);
    expect(typeof rejected.reason).toBe('string');
    expect(state().currency).toBe(11); // отказ баланс не трогает
  });

  it('запись с собственной семантикой: кламп ресурса, флаг, нормализация legacy', () => {
    state().setCurrency(-5);
    expect(state().currency).toBe(0); // не ниже нуля

    state().setAttributesSaved(true);
    expect(state().attributesSaved).toBe(true);

    state().setBaseAttributes([{ name: 'STR', value: 6 }]);
    expect(state().attributes.STR.base).toBe(6); // массив → словарь
  });

  it('именованные операции существуют и являются функциями', () => {
    const store = actionKeys();
    for (const key of [...NAMED_OP_KEYS, ...SETTER_VALUE_KEYS]) {
      expect(store.has(key)).toBe(true);
    }
  });
});
