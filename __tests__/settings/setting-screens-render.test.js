// Дымовой рендер: каждый экран сеттинга и каждое глобальное наложение
// монтируются в тестовом рендерере без падения.
//
// Это проверка «открывается ли экран», а не «правильно ли он нарисован»:
// ошибки вёрстки здесь не ловятся. Зато ловится то, из-за чего человек видит
// экран ошибки движка: упавший импорт, обращение к несуществующему полю стора,
// вызов отсутствующего метода React Native.
//
// Экраны импортируются напрямую, а не через активацию пакета: в тестах уже
// работает фикстура сеттинга (src/store/__test-setup__/settingRuntimeFixture.js).
// Стык «пакет → активация → экраны» проверяет setting-package-e2e.test.js.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const SCREENS = {
  character: () => import('../../modules/fallout/screens/CharacterScreen/CharacterScreen'),
  equipment: () => import('../../modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen'),
  inventory: () => import('../../components/screens/InventoryScreen/InventoryScreen'),
  perks: () => import('../../modules/fallout/screens/PerksAndTraitsScreen/PerksAndTraitsScreen'),
};

const GLOBAL_COMPONENTS = {
  survivalClock: () => import('../../modules/fallout/survival/SurvivalClock'),
  powerCoreClock: () => import('../../modules/fallout/powerArmor/PowerCoreClock'),
  fusionCoreChoice: () => import('../../modules/fallout/screens/PowerArmor/FusionCoreChoiceModal'),
};

// React 19 сыплет в console.error предупреждениями про сам тестовый рендерер и
// среду act — к приложению они отношения не имеют.
const IGNORED = [
  'react-test-renderer is deprecated',
  'The current testing environment is not configured to support act',
];

const mount = async (load) => {
  const errors = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(String(args[0]));
  });
  try {
    const module = await load();
    const Component = module.default;
    expect(typeof Component).toBe('function');
    await act(async () => {
      TestRenderer.create(React.createElement(Component));
    });
  } finally {
    spy.mockRestore();
  }
  return errors.filter((message) => !IGNORED.some((ignored) => message.includes(ignored)));
};

describe('экраны Fallout монтируются без падений', () => {
  for (const [name, load] of Object.entries(SCREENS)) {
    it(`${name}: монтируется и не пишет ошибок`, async () => {
      expect(await mount(load)).toEqual([]);
    }, 60000);
  }
});

describe('глобальные наложения Fallout монтируются без падений', () => {
  for (const [name, load] of Object.entries(GLOBAL_COMPONENTS)) {
    it(`${name}: монтируется и не пишет ошибок`, async () => {
      expect(await mount(load)).toEqual([]);
    }, 60000);
  }
});
