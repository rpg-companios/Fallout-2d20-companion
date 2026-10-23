// src/engine/settings/hostModule.js
// Форма модуля, которую движок отдаёт пакету сеттинга.

/**
 * Пакет сеттинга — CommonJS-бандл esbuild: каждый require() он оборачивает в
 * `__toESM`, а тот копирует собственные свойства модуля геттерами:
 *
 *   for (let key of __getOwnPropNames(from))
 *     __defProp(to, key, { get: () => from[key], ... });
 *
 * Hermes (движок React Native) не заводит отдельную привязку `key` на каждую
 * итерацию цикла: все геттеры читают последний ключ (facebook/hermes#575).
 * Поэтому у копии любой host-модуль отвечал своим последним свойством — react
 * вместо useMemo отдавал `version`, и вызов падал с `'19.2.3' is not a function`
 * (до этого — с `Object is not a function`, когда последним был `default`).
 *
 * Лечится формой, которую копировать нечего: у фасада нет собственных свойств,
 * все члены живут в прототипе и достаются по цепочке. `__toESM` копирует ноль
 * свойств, геттеры не создаются, значения остаются настоящими функциями.
 *
 * Фасад создаётся один раз на модуль: `require()` из разных мест пакета должен
 * получать один и тот же объект.
 */
const facades = new WeakMap();

export const hostModule = (source) => {
  if (!source || (typeof source !== 'object' && typeof source !== 'function')) return source;
  const cached = facades.get(source);
  if (cached) return cached;

  const facadePrototype = Object.create(source);
  // __toESM проверяет mod.__esModule, чтобы не подменять default.
  Object.defineProperty(facadePrototype, '__esModule', { value: true });
  // Для CommonJS-модуля __toESM подставляет default = module.exports; здесь это
  // делает прототип — иначе `import React from 'react'` получил бы undefined.
  // Если у модуля есть собственный default (ES-сборка, Babel), он и главнее.
  if (!('default' in source)) {
    Object.defineProperty(facadePrototype, 'default', { value: source, enumerable: true });
  }

  const facade = Object.freeze(Object.create(facadePrototype));
  facades.set(source, facade);
  return facade;
};
