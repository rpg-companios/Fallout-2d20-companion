// ТЕСТОВЫЙ СЕТТИНГ — реестр песочницы (МК-2, патч 286).
//
// Экран песочницы (только среда разработки, __DEV__) читает значения из
// реестра выводимости. Реестр ленивый синглтон: создаётся при первом
// обращении, сеттинг регистрируется один раз за жизнь модуля.
// Производственная сборка сюда не доходит: экран не монтируется.

import { createDerivationRegistry } from '../../src/engine/derivations/registry';
import { registerTestSetting } from './index';

let registry = null;

export const getSandboxRegistry = () => {
  if (registry === null) {
    registry = createDerivationRegistry();
    registerTestSetting(registry);
  }
  return registry;
};
