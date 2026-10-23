import { describe, expect, it } from 'vitest';

import { hostModule } from '../../src/engine/settings/hostModule.js';

/**
 * Копия модуля так, как её делает esbuild-овский __toESM в бандле сеттинга.
 * `hermes: true` повторяет баг Hermes: в цикле одна привязка `key` на всю
 * функцию, поэтому все геттеры читают последний ключ (facebook/hermes#575).
 */
const copyLikeToESM = (source, { hermes = false } = {}) => {
  const target = Object.create(Object.getPrototypeOf(source));
  if (!source.__esModule) {
    Object.defineProperty(target, 'default', { value: source, enumerable: true });
  }
  if (hermes) {
    let key;
    for (key of Object.getOwnPropertyNames(source)) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        Object.defineProperty(target, key, { get: () => source[key], enumerable: true });
      }
    }
  } else {
    for (const key of Object.getOwnPropertyNames(source)) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        Object.defineProperty(target, key, { get: () => source[key], enumerable: true });
      }
    }
  }
  return target;
};

const commonJsLike = () => ({
  useMemo: () => 'memo',
  createElement: () => null,
  version: '19.2.3', // последнее свойство react — из-за него падал Hermes
});

describe('hostModule', () => {
  it('survives the Hermes loop-binding bug: every property stays a function', () => {
    // Без фасада __toESM заводит геттеры, и на Hermes все они возвращают
    // последнее свойство модуля: useMemo превращался в '19.2.3'.
    const broken = copyLikeToESM(commonJsLike(), { hermes: true });
    expect(broken.useMemo).toBe('19.2.3');

    const fixed = copyLikeToESM(hostModule(commonJsLike()), { hermes: true });
    expect(typeof fixed.useMemo).toBe('function');
    expect(fixed.useMemo()).toBe('memo');
    expect(typeof fixed.createElement).toBe('function');
  });

  it('has no own properties, so there is nothing for __toESM to copy', () => {
    const facade = hostModule(commonJsLike());

    expect(Object.getOwnPropertyNames(facade)).toEqual([]);
    expect(facade.__esModule).toBe(true);
  });

  it('keeps the CommonJS default import working', () => {
    const source = commonJsLike();
    const facade = hostModule(source);

    expect(facade.default).toBe(source);
    expect(copyLikeToESM(facade).default).toBe(source);
    expect(copyLikeToESM(facade, { hermes: true }).default).toBe(source);
  });

  it('keeps ES module namespaces intact, including their own default', () => {
    const component = () => null;
    const namespace = { __esModule: true, default: component, named: () => 1 };
    const facade = hostModule(namespace);

    const copy = copyLikeToESM(facade, { hermes: true });
    expect(copy.default).toBe(component);
    expect(copy.named()).toBe(1);
  });

  it('does not shadow a real default export of a module without __esModule', () => {
    // Так выглядят ES-модули, собранные esbuild: у namespace есть default,
    // но нет Babel-маркера __esModule.
    const store = () => null;
    store.getState = () => ({ level: 3 });
    const namespace = { default: store };

    const facade = hostModule(namespace);
    expect(facade.default).toBe(store);
    expect(facade.default.getState()).toEqual({ level: 3 });
  });

  it('returns the same facade for the same module', () => {
    const source = commonJsLike();

    expect(hostModule(source)).toBe(hostModule(source));
  });

  it('passes non-object values through untouched', () => {
    expect(hostModule(undefined)).toBeUndefined();
    expect(hostModule(null)).toBeNull();
    expect(hostModule('text')).toBe('text');
  });
});
