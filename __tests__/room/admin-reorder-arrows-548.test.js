// ПРИЁМОЧНЫЙ (патч 548): удалить при конверсии/приживании.
// Патч 548: «стрелки перемещения в админке не активны».
//
// Настоящая причина — порядок опроса ответственности в React Native.
// `findWantsResponder` (react-native-web: modules/useResponderEvents/
// ResponderSystem.js) идёт по CAPTURE-фазе сверху вниз и принимает решение
// СРАЗУ, как только обработчик вернул true; bubble-фаза после этого не
// опрашивается. Ручка дерева отдавала `onStartShouldSetResponderCapture:
// () => true`, а контекст строки (`parentId`, `childId`, братья) писала только
// в `onStartShouldSetResponder`. Поэтому `dragContextRef.current` оставался
// null, `onResponderGrant` выходил по `if (!context) return`, и стрелка не
// перетаскивалась никогда.
//
// Тест 545 этого не увидел: он звал bubble-обработчик руками, чего живой
// браузер не делает. Здесь опрос идёт как в RN: сначала capture, и bubble
// вызывается ТОЛЬКО если capture отказался.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockLayout = vi.hoisted(() => ({ bounds: {} }));

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  const View = React.forwardRef(({ children, ...props }, ref) => {
    React.useImperativeHandle(ref, () => ({
      measureInWindow: (cb) => {
        const b = mockLayout.bounds[props.testID] || { x: 0, y: 0, width: 200, height: 24 };
        cb(b.x, b.y, b.width, b.height);
      },
    }));
    return React.createElement('View', props, children);
  });
  return {
    Platform: { OS: 'web' },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => (Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles || {}),
    },
    Modal: ({ visible, children, ...props }) => (visible ? React.createElement('Modal', props, children) : null),
    View,
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: host('TouchableOpacity'),
    ScrollView: host('ScrollView'),
    Image: host('Image'),
    useWindowDimensions: () => ({ width: 420, height: 800 }),
    // Как настоящий PanResponder: конфиг превращается в набор обработчиков.
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
  };
});

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, ...props }) => React.createElement('MaterialCommunityIcons', { name, ...props }),
}));
vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useLocale: () => 'ru-RU', useModuleLocale: () => 'ru-RU' };
});
vi.mock('../../components/screens/LootTradeScreen/logic/lootTradeI18n', () => ({
  tLootTrade: (key) => key,
  formatLootTrade: (template, values) => `${template}:${JSON.stringify(values || {})}`,
}));
vi.mock('../../modules/fallout/assets/backgrounds/caps.png', () => ({ default: 'caps.png' }));

import HubTreeView from '../../components/screens/LootTradeScreen/modals/HubTreeView.js';
import { CONTAINER_KIND, normalizeContainerEntity } from '../../domain/lootTrade.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const findAll = (root, testID) => root.findAll((node) => node.props?.testID === testID);

const hub = (id, extra = {}) => normalizeContainerEntity({
  id, kind: CONTAINER_KIND.HUB, name: id, ...extra,
});
const child = (id, kind, extra = {}) => normalizeContainerEntity({ id, kind, name: id, ...extra });

// Город: торговец, сундук и вложенная мэрия; в мэрии стол и сейф.
const cards = () => [
  hub('town', {
    childOrder: ['shop', 'chest', 'mayor'],
    links: [{ containerId: 'chest' }, { containerId: 'shop' }],
  }),
  hub('mayor', {
    parentLocationId: 'town',
    childOrder: ['desk', 'safe'],
    links: [{ containerId: 'safe' }, { containerId: 'desk' }],
  }),
  child('chest', CONTAINER_KIND.LOOT),
  child('shop', CONTAINER_KIND.MERCHANT, { caps: 100 }),
  child('desk', CONTAINER_KIND.LOOT),
  child('safe', CONTAINER_KIND.LOOT),
];

const mountTree = (all, onReorderChildren) => {
  let renderer;
  act(() => {
    renderer = create(React.createElement(HubTreeView, {
      hub: all[0], containers: all, keyItems: [],
      onOpenSettings: vi.fn(), onReorderChildren,
    }));
  });
  return renderer;
};

const rowIds = (renderer) => renderer.root
  .findAll((node) => node.type === 'View'
    && typeof node.props?.testID === 'string'
    && node.props.testID.startsWith('hub-tree-row-'))
  .map((node) => node.props.testID.replace('hub-tree-row-', ''));

const setRowBounds = (ids, startY = 0) => {
  ids.forEach((id, index) => {
    mockLayout.bounds[`hub-tree-row-${id}`] = { x: 0, y: startY + index * 30, width: 200, height: 24 };
  });
};

/**
 * Опрос ответственности как в RN/react-native-web: capture идёт первым и
 * принимает решение сразу; bubble опрашивается только если capture отказался.
 * Возвращает имя сработавшей фазы — чтобы тест видел, кто именно захватил жест.
 */
const negotiate = (handle, kind = 'start') => {
  const capture = kind === 'start'
    ? 'onStartShouldSetResponderCapture'
    : 'onMoveShouldSetResponderCapture';
  const bubble = kind === 'start'
    ? 'onStartShouldSetResponder'
    : 'onMoveShouldSetResponder';
  if (handle.props[capture]?.() === true) return 'capture';
  if (handle.props[bubble]?.() === true) return 'bubble';
  return null;
};

const handleOf = (renderer, childId) => {
  const [handle] = findAll(renderer.root, `hub-tree-reorder-${childId}`);
  expect(handle, childId).toBeTruthy();
  return handle;
};

/** Живой жест: negotiation (capture-first) → grant → move → release. */
const dragLikeNative = (renderer, childId, targetId, kind = 'start') => {
  const handle = handleOf(renderer, childId);
  const target = mockLayout.bounds[`hub-tree-row-${targetId}`];
  let phase = null;
  act(() => {
    phase = negotiate(handle, kind);
    handle.props.onResponderGrant({}, { x0: 0, y0: 0 });
    handle.props.onResponderMove({}, { moveX: 10, moveY: target.y + 5 });
    handle.props.onResponderRelease();
  });
  return phase;
};

describe('548: стрелка дерева работает при настоящем порядке опроса', () => {
  it('capture принимает жест, и перенос всё равно меняет порядок', () => {
    const onReorderChildren = vi.fn();
    const renderer = mountTree(cards(), onReorderChildren);
    expect(rowIds(renderer)).toEqual(['shop', 'chest', 'mayor']);
    setRowBounds(['shop', 'chest', 'mayor']);

    // В живом браузере решение принимает именно capture-фаза.
    expect(dragLikeNative(renderer, 'chest', 'shop')).toBe('capture');
    expect(onReorderChildren).toHaveBeenCalledWith('town', ['chest', 'shop', 'mayor']);
  });

  it('перенос вниз через capture-фазу тоже меняет порядок', () => {
    const onReorderChildren = vi.fn();
    const renderer = mountTree(cards(), onReorderChildren);
    setRowBounds(['shop', 'chest', 'mayor']);
    dragLikeNative(renderer, 'shop', 'mayor');
    expect(onReorderChildren).toHaveBeenCalledWith('town', ['chest', 'mayor', 'shop']);
  });

  it('захват по движению (move), а не по нажатию, тоже начинает перетаскивание', () => {
    const onReorderChildren = vi.fn();
    const renderer = mountTree(cards(), onReorderChildren);
    setRowBounds(['shop', 'chest', 'mayor']);
    expect(dragLikeNative(renderer, 'chest', 'shop', 'move')).toBe('capture');
    expect(onReorderChildren).toHaveBeenCalledWith('town', ['chest', 'shop', 'mayor']);
  });

  it('bubble-путь остаётся рабочим, если платформа опросила только его', () => {
    const onReorderChildren = vi.fn();
    const renderer = mountTree(cards(), onReorderChildren);
    setRowBounds(['shop', 'chest', 'mayor']);
    const handle = handleOf(renderer, 'chest');
    act(() => {
      expect(handle.props.onStartShouldSetResponder()).toBe(true);
      handle.props.onResponderGrant({}, { x0: 0, y0: 0 });
      handle.props.onResponderMove({}, { moveX: 10, moveY: 5 });
      handle.props.onResponderRelease();
    });
    expect(onReorderChildren).toHaveBeenCalledWith('town', ['chest', 'shop', 'mayor']);
  });

  it('вложенная локация переставляет своих детей через capture-фазу', () => {
    const onReorderChildren = vi.fn();
    const renderer = mountTree(cards(), onReorderChildren);
    act(() => findAll(renderer.root, 'hub-tree-toggle-mayor')[0].props.onPress());
    setRowBounds(['desk', 'safe'], 120);
    expect(dragLikeNative(renderer, 'safe', 'desk')).toBe('capture');
    expect(onReorderChildren).toHaveBeenCalledWith('mayor', ['safe', 'desk']);
  });

  it('каждая ручка захватывает свою строку: чужой порядок не наследуется', () => {
    const onReorderChildren = vi.fn();
    const renderer = mountTree(cards(), onReorderChildren);
    setRowBounds(['shop', 'chest', 'mayor']);
    dragLikeNative(renderer, 'chest', 'shop');
    dragLikeNative(renderer, 'mayor', 'shop');
    expect(onReorderChildren).toHaveBeenNthCalledWith(1, 'town', ['chest', 'shop', 'mayor']);
    expect(onReorderChildren).toHaveBeenNthCalledWith(2, 'town', ['mayor', 'shop', 'chest']);
  });

  it('без движения порядок не меняется — простое нажатие стрелки безвредно', () => {
    const onReorderChildren = vi.fn();
    const renderer = mountTree(cards(), onReorderChildren);
    setRowBounds(['shop', 'chest', 'mayor']);
    const handle = handleOf(renderer, 'chest');
    act(() => {
      negotiate(handle);
      handle.props.onResponderGrant({}, { x0: 0, y0: 0 });
      handle.props.onResponderRelease();
    });
    expect(onReorderChildren).not.toHaveBeenCalled();
  });

  it('ручка не отдаёт жест ScrollView и блокирует нативный скролл', () => {
    const renderer = mountTree(cards(), vi.fn());
    const handle = handleOf(renderer, 'chest');
    expect(handle.props.onResponderTerminationRequest()).toBe(false);
    expect(handle.props.onShouldBlockNativeResponder()).toBe(true);
  });
});

describe('548: обе группы стрелок и защита от возврата бага', () => {
  it('контекст строки задаётся в capture-фазе, а не только в bubble', () => {
    // Патч 549: жест вынесен в общий хук. Закон фазы проверяется там, где он
    // теперь живёт, — иначе проверка запрещала бы переиспользование и снова
    // разводила копии по файлам (именно так и появился баг 548).
    const hook = read('src/ui/useDragResponder.js');
    // 563: props системы ответственности называются onStartShouldSetResponder*.
    // Пан-имена (onStartShouldSetPanResponder*) — это ключи КОНФИГА PanResponder,
    // у View таких пропсов нет; до 563 именно на них и был мёртв драг.
    expect(hook).toContain('onStartShouldSetResponderCapture: wrap(');
    expect(hook).toContain('onMoveShouldSetResponderCapture: wrap(');
    expect(hook).toContain('onStartShouldSetResponder: wrap(');
    expect(hook).toContain('onMoveShouldSetResponder: wrap(');
    expect(hook).toContain('claim(rowPayload)');
    expect(hook).toContain('ЗАКОН ИМЁН');
    // Причина бага зафиксирована в коде, чтобы её не вернули «упрощением».
    expect(hook).toContain('548');
    expect(hook).toContain('capture');
    // Дерево берёт жест из хука, а не держит свою копию.
    const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');
    expect(tree).toContain('useDragResponder');
    expect(tree).not.toContain('PanResponder.create');
  });

  it('стрелки карточек сетки берут тот же механизм, что и остальное приложение', () => {
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    const start = screen.indexOf('const ContainerCardCell');
    const end = screen.indexOf('export default function LootTradeScreen');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const cell = screen.slice(start, end);
    // Патч 549: одна реализация жеста на четыре места.
    expect(cell).toContain('useDragResponder');
    expect(cell).toContain('payload: container');
    expect(cell).not.toContain('PanResponder.create');
    expect(cell).not.toContain('dragContextRef');
    // Ручка есть у всех карточек, включая хабы (канон 539).
    expect(screen).toContain('{onDragStart && (');
  });
});
