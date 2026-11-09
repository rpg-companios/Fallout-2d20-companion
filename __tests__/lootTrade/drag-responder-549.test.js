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

// Патч 563: мок обязан повторять НАСТОЯЩИЙ PanResponder, иначе тест охраняет
// выдуманный контракт. В react-native panHandlers — это пропсы системы
// ответственности (`onStartShouldSetResponder*`), и они зовут обработчики
// конфига (`onStartShouldSetPanResponder*`). Пока мок отдавал конфиг как есть,
// тест «проходил» на хуке, у которого нагрузка строки не заявлялась никогда.
vi.mock('react-native', () => ({
  PanResponder: {
    create: (config) => ({
      panHandlers: {
        onStartShouldSetResponder: (e) => (config.onStartShouldSetPanResponder
          ? config.onStartShouldSetPanResponder(e) : false),
        onStartShouldSetResponderCapture: (e) => (config.onStartShouldSetPanResponderCapture
          ? config.onStartShouldSetPanResponderCapture(e) : false),
        onMoveShouldSetResponder: (e) => (config.onMoveShouldSetPanResponder
          ? config.onMoveShouldSetPanResponder(e) : false),
        onMoveShouldSetResponderCapture: (e) => (config.onMoveShouldSetPanResponderCapture
          ? config.onMoveShouldSetPanResponderCapture(e) : false),
        onResponderGrant: (e, g) => config.onPanResponderGrant?.(e, g),
        onResponderMove: (e, g) => config.onPanResponderMove?.(e, g),
        onResponderRelease: (e, g) => config.onPanResponderRelease?.(e, g),
        onResponderTerminate: (e) => config.onPanResponderTerminate?.(e),
        onResponderReject: (e) => config.onPanResponderReject?.(e),
        onResponderTerminationRequest: () => config.onPanResponderTerminationRequest?.() ?? true,
        onShouldBlockNativeResponder: () => config.onShouldBlockNativeResponder?.() ?? false,
      },
    }),
  },
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
  // RN опрашивает только эти четыре пропса — пан-имена здесь не работают.
  const capture = kind === 'start'
    ? 'onStartShouldSetResponderCapture'
    : 'onMoveShouldSetResponderCapture';
  const bubble = kind === 'start'
    ? 'onStartShouldSetResponder'
    : 'onMoveShouldSetResponder';
  if (handlers[capture]?.({ nativeEvent: { touches: [1] }, touchHistory: { numberActiveTouches: 1 } }) === true) return 'capture';
  if (handlers[bubble]?.({ nativeEvent: { touches: [1] }, touchHistory: { numberActiveTouches: 1 } }) === true) return 'bubble';
  return null;
};

const grant = (handlers, x0 = 10, y0 = 20) => handlers.onResponderGrant({ touchHistory: { numberActiveTouches: 1, mostRecentTimeStamp: 1 } }, { x0, y0 });
const move = (handlers, x, y) => handlers.onResponderMove({ touchHistory: { numberActiveTouches: 1, mostRecentTimeStamp: 2 } }, { moveX: x, moveY: y });
const release = (handlers) => handlers.onResponderRelease({}, {});

describe('549: хук заявляет жест в обеих фазах опроса', () => {
  it('capture принимает решение, и перенос всё равно начинается', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const { api } = mountHook({ payload: { id: 'a' }, onStart, onEnd });
    expect(negotiate(api.panHandlers)).toBe('capture');
    act(() => {
      grant(api.panHandlers);
      move(api.panHandlers, 40, 60);
      release(api.panHandlers);
    });
    expect(onStart).toHaveBeenCalledWith({ pageX: 10, pageY: 20 }, { id: 'a' });
    expect(onEnd).toHaveBeenCalledWith({ pageX: 40, pageY: 60 }, { id: 'a' }, { cancelled: false, moved: true });
  });

  it('bubble-путь остаётся рабочим, если платформа опросила только его', () => {
    const onStart = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart });
    expect(api.panHandlers.onStartShouldSetResponder({ nativeEvent: { touches: [1] }, touchHistory: { numberActiveTouches: 1 } })).toBe(true);
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
      release(rowA);
    });
    act(() => {
      expect(negotiate(rowB)).toBe('capture');
      grant(rowB);
      release(rowB);
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
      release(api.panHandlers);
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
      release(api.panHandlers);
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
      api.panHandlers.onResponderTerminate({}, {});
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
      release(api.panHandlers);
    });
    expect(onEnd.mock.calls[0][0]).toEqual({ pageX: 77, pageY: 88 });
  });
});

describe('549: жест не отдаётся наружу и уважает запрет', () => {
  it('ScrollView не получает жест обратно, нативный скролл заблокирован', () => {
    const { api } = mountHook({});
    expect(api.panHandlers.onResponderTerminationRequest()).toBe(false);
    expect(api.panHandlers.onShouldBlockNativeResponder()).toBe(true);
  });

  it('при enabled=false жест не берётся вовсе', () => {
    const onStart = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart, enabled: false });
    expect(negotiate(api.panHandlers)).toBeNull();
    act(() => grant(api.panHandlers));
    expect(onStart).not.toHaveBeenCalled();
    expect(api.handlersFor({ id: 'row' }).onStartShouldSetResponderCapture({ nativeEvent: { touches: [1] }, touchHistory: { numberActiveTouches: 1 } })).toBe(false);
  });

  it('отказ системы не оставляет призрак переноса', () => {
    const onEnd = vi.fn();
    const { api } = mountHook({ payload: 'p', onStart: vi.fn(), onEnd });
    act(() => {
      negotiate(api.panHandlers);
      grant(api.panHandlers);
      api.panHandlers.onResponderReject({}, {});
    });
    expect(api.draggingRef.current).toBe(false);
    act(() => { release(api.panHandlers); });
    expect(onEnd).not.toHaveBeenCalled();
  });
});
