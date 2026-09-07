// Патч 208 — слушатели применённых расходников (stateExtensions.js):
// родовое уведомление «расходник применён на себя» для расширений
// сеттингов. Тесты реестра без сеттинговых правил; поведение слушателя
// выживания — в __tests__/survival/survival-bridge.test.js.

import { describe, expect, it } from 'vitest';
import {
  getRegisteredConsumableAppliedListeners,
  notifyConsumableApplied,
  registerConsumableAppliedListener,
} from '../../src/store/stateExtensions';

describe('stateExtensions: слушатели расходников', () => {
  it('регистрация требует { id, listener }', () => {
    expect(() => registerConsumableAppliedListener(null)).toThrow();
    expect(() => registerConsumableAppliedListener({})).toThrow(/id/);
    expect(() => registerConsumableAppliedListener({ id: 'x' })).toThrow(/listener/);
  });

  it('повторная регистрация того же id — ошибка', () => {
    registerConsumableAppliedListener({ id: 'dupListenerA', listener: () => null });
    expect(() =>
      registerConsumableAppliedListener({ id: 'dupListenerA', listener: () => null }),
    ).toThrow(/уже зарегистрирован/);
  });

  it('notify: результаты собираются с id, null пропускается', () => {
    registerConsumableAppliedListener({
      id: 'listenerB',
      listener: (item) => (item?.flagB ? { gained: 2 } : null),
    });
    registerConsumableAppliedListener({
      id: 'listenerC',
      listener: (item) => (item?.flagC ? { gained: 1 } : null),
    });

    const none = notifyConsumableApplied({}, {});
    expect(none).toEqual([]);

    const one = notifyConsumableApplied({ flagB: true }, {});
    expect(one).toEqual([{ id: 'listenerB', gained: 2 }]);

    const both = notifyConsumableApplied({ flagB: true, flagC: true }, {});
    expect(both).toEqual([
      { id: 'listenerB', gained: 2 },
      { id: 'listenerC', gained: 1 },
    ]);
  });

  it('listener получает ctx { stateExtensions, setStateExtension }', () => {
    let receivedCtx = null;
    registerConsumableAppliedListener({
      id: 'listenerD',
      listener: (_item, ctx) => {
        receivedCtx = ctx;
        return { ok: true };
      },
    });
    const ctx = { stateExtensions: { field: 1 }, setStateExtension: () => {} };
    notifyConsumableApplied({}, ctx);
    expect(receivedCtx).toBe(ctx);
  });

  it('исключение слушателя всплывает (не молчим о дефекте)', () => {
    registerConsumableAppliedListener({
      id: 'listenerE',
      listener: () => {
        throw new Error('дефект слушателя');
      },
    });
    expect(() => notifyConsumableApplied({}, {})).toThrow(/дефект слушателя/);
  });

  it('слушатели видны в реестре', () => {
    const registered = getRegisteredConsumableAppliedListeners();
    expect(registered.some(([id]) => id === 'listenerB')).toBe(true);
  });
});
