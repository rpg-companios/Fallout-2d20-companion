import { describe, expect, it } from 'vitest';

import {
  findSettingScreenByRole,
  normalizeSettingScreens,
  parseSettingScreenSlot,
  shouldScrollSettingTabBar,
  normalizeSettingTheme,
  resolveCharacterScreenRoute,
  SETTING_SCREEN_CODES,
  SETTING_SCREEN_LIMIT,
  SETTING_SCREEN_SLOTS,
  SettingScreensError,
} from '../../src/engine/settings/settingScreens.js';

const component = () => null;
const screen = (overrides = {}) => ({
  id: 'sheet',
  titleKey: 'tabs.sheet',
  component,
  ...overrides,
});

const codesOf = (screens) => {
  try {
    normalizeSettingScreens(screens);
  } catch (error) {
    expect(error).toBeInstanceOf(SettingScreensError);
    return error.problems.map((problem) => problem.code);
  }
  return [];
};

describe('экраны сеттинга занимают слоты движка', () => {
  it('даёт семь слотов', () => {
    expect(SETTING_SCREEN_SLOTS).toEqual([
      'screen:1', 'screen:2', 'screen:3', 'screen:4', 'screen:5', 'screen:6', 'screen:7',
    ]);
    expect(SETTING_SCREEN_LIMIT).toBe(7);
  });

  it('маршруты придумывает движок, а не сеттинг', () => {
    const screens = normalizeSettingScreens([screen()]);
    expect(screens).toHaveLength(1);
    expect(screens[0].route).toBe('SettingScreen1');
    expect(screens[0].slot).toBe('screen:1');
  });

  it('раскладывает по порядку слотов, а не по порядку объявления', () => {
    const screens = normalizeSettingScreens([
      screen({ id: 'second', slot: 'screen:2' }),
      screen({ id: 'first', slot: 'screen:1' }),
      screen({ id: 'third' }),
    ]);
    expect(screens.map((entry) => entry.id)).toEqual(['first', 'second', 'third']);
    expect(screens.map((entry) => entry.route)).toEqual([
      'SettingScreen1', 'SettingScreen2', 'SettingScreen3',
    ]);
  });

  it('не занимает явно объявленный слот автоматическим экраном', () => {
    const screens = normalizeSettingScreens([
      screen({ id: 'auto' }),
      screen({ id: 'pinned', slot: 'screen:1' }),
    ]);
    expect(screens.map((entry) => [entry.id, entry.slot])).toEqual([
      ['pinned', 'screen:1'],
      ['auto', 'screen:2'],
    ]);
  });

  it('восьмой экран — «нужен патч движка», а не «пакет сломан»', () => {
    const many = Array.from({ length: 8 }, (_, index) => screen({ id: `screen${index}` }));
    expect(codesOf(many)).toEqual([SETTING_SCREEN_CODES.SCREEN_SLOTS_UNAVAILABLE]);
    try {
      normalizeSettingScreens(many);
    } catch (error) {
      expect(error.problems[0].params).toEqual({ needed: 8, available: 7 });
    }
  });

  it('отказывает пакету без экранов', () => {
    expect(codesOf([])).toEqual([SETTING_SCREEN_CODES.NO_SCREENS]);
    expect(codesOf(undefined)).toEqual([SETTING_SCREEN_CODES.NO_SCREENS]);
  });

  it('требует компонент и заголовок у каждого экрана', () => {
    expect(codesOf([screen({ component: undefined })])).toEqual([SETTING_SCREEN_CODES.INVALID_SCREEN]);
    expect(codesOf([screen({ titleKey: undefined, title: undefined })])).toEqual([
      SETTING_SCREEN_CODES.INVALID_SCREEN,
    ]);
  });

  it('принимает заголовок строкой, без ключа словаря', () => {
    const [entry] = normalizeSettingScreens([screen({ titleKey: undefined, title: 'Лист персонажа' })]);
    expect(entry.title).toBe('Лист персонажа');
    expect(entry.titleKey).toBeUndefined();
  });

  it('не даёт двум экранам занять один слот', () => {
    expect(codesOf([
      screen({ id: 'one', slot: 'screen:1' }),
      screen({ id: 'two', slot: 'screen:1' }),
    ])).toEqual([SETTING_SCREEN_CODES.DUPLICATE_SCREEN]);
  });

  it('не даёт двум экранам один id', () => {
    expect(codesOf([
      screen({ id: 'same' }),
      screen({ id: 'same' }),
    ])).toEqual([SETTING_SCREEN_CODES.DUPLICATE_SCREEN]);
  });

  it('слот выше диапазона — «нужен патч движка», мусор в слоте — «пакет сломан»', () => {
    expect(codesOf([screen({ slot: 'screen:8' })])).toEqual([SETTING_SCREEN_CODES.SCREEN_SLOTS_UNAVAILABLE]);
    expect(codesOf([screen({ slot: 'screen:abc' })])).toEqual([SETTING_SCREEN_CODES.INVALID_SCREEN]);
    expect(codesOf([screen({ slot: 'screen:9999' })])).toEqual([SETTING_SCREEN_CODES.INVALID_SCREEN]);
  });
});

describe('роли экранов', () => {
  const screens = normalizeSettingScreens([
    screen({ id: 'sheet', slot: 'screen:1', role: 'character' }),
    screen({ id: 'bag', slot: 'screen:2', role: 'inventory' }),
  ]);

  it('движок находит экран по роли', () => {
    expect(findSettingScreenByRole(screens, 'character')?.id).toBe('sheet');
    expect(findSettingScreenByRole(screens, 'nope')).toBeNull();
  });

  it('кнопка «создать персонажа» ведёт на экран с ролью character', () => {
    expect(resolveCharacterScreenRoute(screens)).toBe('SettingScreen1');
  });

  it('без роли берётся первый слот — пакет не обязан её объявлять', () => {
    const plain = normalizeSettingScreens([screen({ id: 'only' })]);
    expect(resolveCharacterScreenRoute(plain)).toBe('SettingScreen1');
  });

  it('без активного сеттинга маршрута нет', () => {
    expect(resolveCharacterScreenRoute([])).toBeNull();
    expect(resolveCharacterScreenRoute(undefined)).toBeNull();
  });

  it('отказывает нечитаемой роли', () => {
    expect(codesOf([screen({ role: 'Лист персонажа' })])).toEqual([SETTING_SCREEN_CODES.INVALID_SCREEN]);
  });
});

describe('оформление задаёт сеттинг', () => {
  it('молчание пакета даёт палитру движка', () => {
    const theme = normalizeSettingTheme(undefined);
    expect(theme.tabBar.background).toBe('#1a1a1a');
    expect(theme.tabBar.active).toBe('#f0e68c');
  });

  it('пакет перекрашивает только то, что объявил', () => {
    const theme = normalizeSettingTheme({ tabBar: { active: '#00ff00' } });
    expect(theme.tabBar.active).toBe('#00ff00');
    expect(theme.tabBar.background).toBe('#1a1a1a');
  });

  it('нечитаемый цвет — отказ, а не тихая подмена', () => {
    expect(() => normalizeSettingTheme({ tabBar: { active: 'зелёный' } }))
      .toThrow(SettingScreensError);
  });
});

describe('патч движка на большее число экранов', () => {
  // Двенадцать экранов — не отказ пакету, а повод расширить набор слотов.
  // Здесь это проверяется на движке, которому слоты передали снаружи: ровно
  // так выглядит патч — меняется один список, логика та же.
  const twelveSlots = Object.freeze(Array.from({ length: 12 }, (_, index) => `screen:${index + 1}`));
  const twelveScreens = Array.from({ length: 12 }, (_, index) => screen({
    id: `page${index + 1}`,
    title: `Page ${index + 1}`,
  }));

  it('текущий движок честно говорит, чего ему не хватает', () => {
    expect(SETTING_SCREEN_LIMIT).toBe(7);
    expect(() => normalizeSettingScreens(twelveScreens)).toThrow(SettingScreensError);
  });

  it('на движке с 12 слотами те же экраны раскладываются без правок пакета', () => {
    const screens = normalizeSettingScreens(twelveScreens, { slots: twelveSlots });
    expect(screens).toHaveLength(12);
    expect(screens[11]).toMatchObject({ slot: 'screen:12', route: 'SettingScreen12', id: 'page12' });
  });

  it('старый пакет на новом движке не ломается', () => {
    const screens = normalizeSettingScreens([screen({ id: 'sheet' })], { slots: twelveSlots });
    expect(screens.map((entry) => entry.slot)).toEqual(['screen:1']);
  });

  it('слот разбирается в номер, мусор — нет', () => {
    expect(parseSettingScreenSlot('screen:1')).toBe(1);
    expect(parseSettingScreenSlot('screen:12')).toBe(12);
    expect(parseSettingScreenSlot('screen:0')).toBeNull();
    expect(parseSettingScreenSlot('screen:999')).toBeNull();
    expect(parseSettingScreenSlot('tab:1')).toBeNull();
    expect(parseSettingScreenSlot(undefined)).toBeNull();
  });
});

describe('нижняя панель вкладок', () => {
  it('пять вкладок ещё раскладываются по ширине', () => {
    expect(shouldScrollSettingTabBar(4)).toBe(false);
    expect(shouldScrollSettingTabBar(5)).toBe(false);
  });

  it('больше пяти — панель прокручивается', () => {
    expect(shouldScrollSettingTabBar(6)).toBe(true);
    expect(shouldScrollSettingTabBar(12)).toBe(true);
  });
});
