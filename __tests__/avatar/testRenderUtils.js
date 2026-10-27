// __tests__/avatar/testRenderUtils.js
// Лёгкая обёртка рендера/хуков поверх штатного react-test-renderer из devDependencies
// (без внешних @testing-library/react* пакетов, которых нет в package.json).

import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let currentRenderer = null;

const getByTestIdFrom = (renderer, testId) => {
  if (!renderer) {
    throw new Error(`Renderer is not mounted when looking up testID="${testId}"`);
  }
  return renderer.root.findByProps({ testID: testId });
};

export const screen = {
  getByTestId: (testId) => getByTestIdFrom(currentRenderer, testId),
};

export const fireEvent = {
  press: (node, ...args) => {
    if (typeof node?.props?.onPress === 'function') {
      return node.props.onPress(...args);
    }
    return undefined;
  },
};

export function render(element) {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  currentRenderer = renderer;
  return {
    rerender: (nextElement) => {
      act(() => {
        renderer.update(nextElement);
      });
    },
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
    getByTestId: (testId) => getByTestIdFrom(renderer, testId),
  };
}

export function renderHook(callback) {
  const result = { current: undefined };
  function HookHost() {
    result.current = callback();
    return null;
  }
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(HookHost));
  });
  return {
    result,
    rerender: () => {
      act(() => {
        renderer.update(React.createElement(HookHost));
      });
    },
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

export { act };
