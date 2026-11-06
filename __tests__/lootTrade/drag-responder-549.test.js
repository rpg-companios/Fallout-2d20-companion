// ПРИЁМОЧНЫЙ (патч 549): удалить при конверсии/приживании.
//
// Патч 549: единый механизм перетаскивания. До него жест был скопирован в
// четырёх местах; три копии жили по рабочему шаблону, четвёртая (дерево
// локаций) изобрела свой и сломалась — баг 548. Здесь проверяется контракт
// общего хука, на который теперь опираются все экраны.
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
  // Как настоящий PanResponder: конфиг становится набором обработчиков.
  PanResponder: { create: (config) => ({ panHandlers: config }) },
}));

import useDragResponder from '../../src/ui/useDragResponder.js';

/** Монтирует хук в пробнике и отдаёт его результат наружу. */
const mountHook = (options) => {
  const api = {};
  const Probe = (props) => {
    Object.assign(api, useDragResponder({ ...options, ...props }));
    return null;
  };
  let renderer;
  act(() => { renderer = create(React.createElement(Probe)); });
  return { api, renderer, rerender: (props) => act(() => renderer.update(React.createElement(Probe, props))) };
};

/**
 * Настоящий порядок опроса ответственности RN: capture сверху вниз и решение
 * сразу при `true`; bubble зовётся ТОЛЬКО если capture отказался.
 * (react-native-web: modules/useResponderEvents/ResponderSystem.js,
 *  findWantsResponder — цикл `// capture` возвращает результат немедленно.)
 */
const negotiate = (handlers, kind = 'start') => {
  const capture = kind === 'start'
    ? 'onStartShouldSetPanResponderCapture'
    : 'onMoveShouldSetPanResponderCapture';
  const bubble = kind === 'start'
    ? 'onStartShouldSetPanResponder'
    : 'onMoveShouldSetPanResponder';
  if (handlers[capture]?.() === true) return 'capture';
  if (handlers[bubble]?.() === true) return 'bubble';
  return null;
};

const grant = (handlers, x0 = 10, y0 = 20) => handlers.onPanResponderGrant({}, { x0, y0 });
const move = (handlers, x, y) => handlers.onPanResponderMove({}, { moveX: x, moveY: y });

describe('549: хук заявляет жест в обеих фазах опроса', () => {
  it('capture принимает решение, и перенос всё равно начинается', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const { api } = mountHook({ payload: { id: 'a' }, onStart, onEnd });
    expect(negotiate(api.panHandlers)).toBe('capture');
    act(() => {
      grant(api.panHandlers);
      move(api.panHandlers, 40, 60);
      api.panHandlers.onPanResponderRelease({}, {});
    });
    expect(onStart).toHaveBeenCalledWith({ pageX: 10, pageY: 20 }, { id: 'a' });
    expect(onEnd).toHaveBeenCalledWith({ pageX: 40, pageY: 60 }, { id: 'a' }, { cancelled: false, moved: true });
  });

  it('bubble-путь остаётся рабочим, если платформа опросила только его', () => {
    const onStart = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart });
    expect(api.panHandlers.onStartShouldSetPanResponder()).toBe(true);
    act(() => grant(api.panHandlers));
    expect(onStart).toHaveBeenCalledWith({ pageX: 10, pageY: 20 }, 'p');
  });

  it('захват по движению тоже начинает перенос', () => {
    const onStart = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart });
    expect(negotiate(api.panHandlers, 'move')).toBe('capture');
    act(() => grant(api.panHandlers));
    expect(onStart).toHaveBeenCalled();
  });

  it('нагрузка строки заявляется в capture и не течёт между строками', () => {
    const onStart = vi.fn();
    const { api } = mountHook({ onStart });
    const rowA = api.handlersFor({ id: 'a' });
    const rowB = api.handlersFor({ id: 'b' });
    act(() => {
      expect(negotiate(rowA)).toBe('capture');
      grant(rowA);
      rowA.onPanResponderRelease({}, {});
    });
    act(() => {
      expect(negotiate(rowB)).toBe('capture');
      grant(rowB);
      rowB.onPanResponderRelease({}, {});
    });
    expect(onStart.mock.calls.map(([, payload]) => payload.id)).toEqual(['a', 'b']);
  });

  it('свежие колбэки видны без пересоздания жеста', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { api, rerender } = mountHook({ payload: 'p', onStart: first });
    rerender({ payload: 'p2', onStart: second });
    act(() => {
      negotiate(api.panHandlers);
      grant(api.panHandlers);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ pageX: 10, pageY: 20 }, 'p2');
  });
});

describe('549: перенос засчитывает только настоящее движение', () => {
  it('нажатие без движения отдаёт moved=false', () => {
    const onEnd = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart: vi.fn(), onEnd });
    act(() => {
      negotiate(api.panHandlers);
      grant(api.panHandlers, 30, 40);
      api.panHandlers.onPanResponderRelease({}, {});
    });
    expect(onEnd).toHaveBeenCalledWith({ pageX: 30, pageY: 40 }, 'p', { cancelled: false, moved: false });
  });

  it('нулевая точка от RN не считается движением', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart: vi.fn(), onMove, onEnd });
    act(() => {
      negotiate(api.panHandlers);
      grant(api.panHandlers);
      move(api.panHandlers, 0, 0);
      api.panHandlers.onPanResponderRelease({}, {});
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd.mock.calls[0][2].moved).toBe(false);
  });

  it('обрыв жеста помечается отменой', () => {
    const onEnd = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart: vi.fn(), onEnd });
    act(() => {
      negotiate(api.panHandlers);
      grant(api.panHandlers);
      move(api.panHandlers, 50, 70);
      api.panHandlers.onPanResponderTerminate({}, {});
    });
    expect(onEnd).toHaveBeenCalledWith({ pageX: 50, pageY: 70 }, 'p', { cancelled: true, moved: true });
  });

  it('последняя точка сохраняется, если отпускание пришло без координат', () => {
    const onEnd = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart: vi.fn(), onEnd });
    act(() => {
      negotiate(api.panHandlers);
      grant(api.panHandlers);
      move(api.panHandlers, 77, 88);
      api.panHandlers.onPanResponderRelease({}, { moveX: 0, moveY: 0 });
    });
    expect(onEnd.mock.calls[0][0]).toEqual({ pageX: 77, pageY: 88 });
  });
});

describe('549: жест не отдаётся наружу и уважает запрет', () => {
  it('ScrollView не получает жест обратно, нативный скролл заблокирован', () => {
    const { api } = mountHook({});
    expect(api.panHandlers.onPanResponderTerminationRequest()).toBe(false);
    expect(api.panHandlers.onShouldBlockNativeResponder()).toBe(true);
  });

  it('при enabled=false жест не берётся вовсе', () => {
    const onStart = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart, enabled: false });
    expect(negotiate(api.panHandlers)).toBeNull();
    act(() => grant(api.panHandlers));
    expect(onStart).not.toHaveBeenCalled();
    expect(api.handlersFor({ id: 'row' }).onStartShouldSetPanResponderCapture()).toBe(false);
  });

  it('отказ системы не оставляет призрак переноса', () => {
    const onEnd = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart: vi.fn(), onEnd });
    act(() => {
      negotiate(api.panHandlers);
      grant(api.panHandlers);
      api.panHandlers.onPanResponderReject({}, {});
    });
    expect(api.draggingRef.current).toBe(false);
    act(() => { api.panHandlers.onPanResponderRelease({}, {}); });
    expect(onEnd).not.toHaveBeenCalled();
  });
});
