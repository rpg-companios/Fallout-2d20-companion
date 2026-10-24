// Vitest setup: React Native поставляется с Flow-синтаксисом, который
// rolldown/vite не разбирает. Для тестов (node) подменяем модуль заглушкой
// с теми же именами: компоненты — простые узлы, Platform/StyleSheet/Dimensions —
// рабочие значения. Рендер в тестах не проверяет вёрстку, поэтому заглушки
// достаточно, чтобы модули сеттинга (экраны, модалки) импортировались.
import React from 'react';
import { vi } from 'vitest';

vi.mock('react-native', () => {
  const components = new Map();
  const component = (name) => {
    if (!components.has(name)) {
      const Stub = React.forwardRef((props, ref) => React.createElement(name, { ...props, ref }));
      Stub.displayName = `RNStub(${name})`;
      components.set(name, Stub);
    }
    return components.get(name);
  };

  const StyleSheet = {
    create: (styles) => styles,
    flatten: (style) => style,
    compose: (...styles) => styles,
    absoluteFill: {},
    absoluteFillObject: {},
    hairlineWidth: 1,
  };
  const Platform = {
    OS: 'web',
    Version: 1,
    select: (values) => values?.web ?? values?.ios ?? values?.android ?? values?.default,
  };
  const Dimensions = {
    get: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
    removeEventListener: () => {},
  };
  const Appearance = {
    getColorScheme: () => 'light',
    addChangeListener: () => ({ remove: () => {} }),
    removeChangeListener: () => {},
  };
  const Animated = {
    View: component('Animated.View'),
    Text: component('Animated.Text'),
    ScrollView: component('Animated.ScrollView'),
    Image: component('Animated.Image'),
    Value: class AnimatedValue {
      constructor(value) { this.value = value; }
      setValue(value) { this.value = value; }
      interpolate() { return this; }
      addListener() { return 0; }
      removeListener() {}
    },
    event: () => () => {},
    timing: () => ({ start: (cb) => cb?.({ finished: true }), stop: () => {} }),
    spring: () => ({ start: (cb) => cb?.({ finished: true }), stop: () => {} }),
    sequence: () => ({ start: (cb) => cb?.({ finished: true }), stop: () => {} }),
    parallel: () => ({ start: (cb) => cb?.({ finished: true }), stop: () => {} }),
    loop: () => ({ start: () => {}, stop: () => {} }),
    createAnimatedComponent: (Wrapped) => Wrapped,
  };

  // Жесты, состояние приложения и клавиатура — не компоненты, а объекты с
  // методами. Через Proxy они превратились бы в компонент и упали бы на
  // «PanResponder.create is not a function» при рендере экрана.
  const PanResponder = {
    create: () => ({ panHandlers: {} }),
  };
  const AppState = {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
    removeEventListener: () => {},
  };
  const Keyboard = {
    dismiss: () => {},
    addListener: () => ({ remove: () => {} }),
    removeListener: () => {},
  };

  const overrides = {
    __esModule: true,
    Platform,
    PanResponder,
    AppState,
    Keyboard,
    StyleSheet,
    Dimensions,
    Appearance,
    Animated,
    PixelRatio: { get: () => 2, getFontScale: () => 1, roundToNearestPixel: (value) => value },
    I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
    useColorScheme: () => 'light',
    NativeModules: {},
    NativeEventEmitter: class { addListener() { return { remove: () => {} }; } removeAllListeners() {} },
    Linking: { openURL: async () => true, canOpenURL: async () => true },
    Alert: { alert: () => {} },
  };

  return new Proxy(overrides, {
    get(target, property) {
      if (property in target) return target[property];
      if (typeof property !== 'string') return undefined;
      return component(property);
    },
    has: () => true,
  });
});

// Иконки: пакет экспортирует ESM-сборку без расширений в импортах, которую
// Node грузит нативно и не находит модуль. Для тестов достаточно заглушек.
vi.mock('@expo/vector-icons', () => {
  const Icon = (props) => React.createElement('Icon', props);
  return {
    __esModule: true,
    default: Icon,
    Ionicons: Icon,
    MaterialCommunityIcons: Icon,
    MaterialIcons: Icon,
    FontAwesome: Icon,
    FontAwesome5: Icon,
    Feather: Icon,
    Entypo: Icon,
    AntDesign: Icon,
  };
});
