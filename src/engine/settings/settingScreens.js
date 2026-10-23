// Экран сеттинга = слот движка + содержимое сеттинга.
//
// Движок владеет ограниченным набором экранов: `screen:1` … `screen:7`. Он
// задаёт их порядок, маршрут в навигации, рамку (панель вкладок) и защиту от
// падения при рендере. Сеттинг заполняет слот: что на экране написано и как он
// выглядит — это код и данные пакета.
//
// Восьмой экран — отказ с причиной, а не «поехавшая» панель вкладок: движок
// обязан остаться рабочим, а автор пакета — понять, что именно не так.
//
// Что проверяется (до рендера, на активации):
//   1. экранов от 1 до 7;
//   2. у каждого есть `id` (уникальный), заголовок и компонент;
//   3. `slot` — один из семи, без повторов; без `slot` экран занимает первую
//      свободную позицию в порядке объявления.
//
// Роль экрана (`role`) нужна движку там, где он сам ведёт человека: «создать
// персонажа» ведёт на экран с ролью `character`, а не на первый попавшийся.
// Движок знает роли, но не знает, какой экран их играет.
export const SETTING_SCREEN_SLOTS = Object.freeze([
  'screen:1',
  'screen:2',
  'screen:3',
  'screen:4',
  'screen:5',
  'screen:6',
  'screen:7',
]);

export const SETTING_SCREEN_LIMIT = SETTING_SCREEN_SLOTS.length;

export const SETTING_SCREEN_CODES = Object.freeze({
  NO_SCREENS: 'no-screens',
  TOO_MANY_SCREENS: 'too-many-screens',
  INVALID_SCREEN: 'invalid-screen',
  DUPLICATE_SCREEN: 'duplicate-screen',
});

const SCREEN_ID_RE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Роли, которые движок ищет сам. Сеттинг может объявить любые свои роли —
 * движок их не трогает и лишь хранит.
 */
export const SETTING_SCREEN_ROLES = Object.freeze({
  CHARACTER: 'character',
  INVENTORY: 'inventory',
  EQUIPMENT: 'equipment',
});
// Цвет либо hex, либо имя, которое понимает React Native (`gray`), либо rgb()/rgba().
// Русское «зелёный» здесь не пройдёт — опечатка должна быть видна автору пакета.
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([\d\s.,%]+\))$/;

export class SettingScreensError extends Error {
  constructor(problems) {
    const [first] = problems;
    super(`[setting-screens] ${first.code}: ${JSON.stringify(first.params)}`);
    this.name = 'SettingScreensError';
    this.code = first.code;
    this.problems = problems;
  }
}

/** Маршрут движка для слота. Сеттинг маршруты не придумывает. */
export const settingScreenRoute = (index) => `SettingScreen${index + 1}`;

const isComponent = (value) => typeof value === 'function'
  || (value !== null && typeof value === 'object');

const textOrNull = (value) => (
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null
);

/**
 * Привести экраны сеттинга к слотам движка.
 *
 * @param {readonly object[]|undefined} screens
 * @returns {readonly object[]} экраны в порядке слотов, с маршрутами движка
 * @throws {SettingScreensError}
 */
export const normalizeSettingScreens = (screens) => {
  if (!Array.isArray(screens) || screens.length === 0) {
    throw new SettingScreensError([{
      code: SETTING_SCREEN_CODES.NO_SCREENS,
      params: { limit: SETTING_SCREEN_LIMIT },
    }]);
  }
  if (screens.length > SETTING_SCREEN_LIMIT) {
    throw new SettingScreensError([{
      code: SETTING_SCREEN_CODES.TOO_MANY_SCREENS,
      params: { count: screens.length, limit: SETTING_SCREEN_LIMIT },
    }]);
  }

  const problems = [];
  const ids = new Map();
  const takenSlots = new Set();

  // Сначала занимаем явно объявленные слоты, затем раздаём свободные.
  screens.forEach((screen) => {
    const slot = screen && typeof screen === 'object' ? screen.slot : undefined;
    if (typeof slot === 'string' && SETTING_SCREEN_SLOTS.includes(slot)) takenSlots.add(slot);
  });

  const entries = screens.map((screen, index) => {
    if (!screen || typeof screen !== 'object' || Array.isArray(screen)) {
      problems.push({
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: { screen: index + 1, field: 'screen', expected: 'object' },
      });
      return null;
    }

    const id = textOrNull(screen.id);
    if (!id || !SCREEN_ID_RE.test(id)) {
      problems.push({
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: { screen: index + 1, field: 'id', expected: 'a-z, digits, dash; max 32' },
      });
    } else if (ids.has(id)) {
      problems.push({
        code: SETTING_SCREEN_CODES.DUPLICATE_SCREEN,
        params: { field: 'id', value: id },
      });
    } else {
      ids.set(id, index);
    }

    if (screen.slot !== undefined && !SETTING_SCREEN_SLOTS.includes(screen.slot)) {
      problems.push({
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: {
          screen: id ?? index + 1,
          field: 'slot',
          expected: SETTING_SCREEN_SLOTS.join(', '),
        },
      });
    }

    if (!isComponent(screen.component)) {
      problems.push({
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: { screen: id ?? index + 1, field: 'component', expected: 'React component' },
      });
    }

    const titleKey = textOrNull(screen.titleKey ?? screen.labelKey);
    const title = textOrNull(screen.title);
    if (!titleKey && !title) {
      problems.push({
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: { screen: id ?? index + 1, field: 'titleKey', expected: 'titleKey or title' },
      });
    }

    if (screen.icon !== undefined && textOrNull(screen.icon) === null) {
      problems.push({
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: { screen: id ?? index + 1, field: 'icon', expected: 'icon name string' },
      });
    }

    if (screen.role !== undefined && (typeof screen.role !== 'string' || !SCREEN_ID_RE.test(screen.role))) {
      problems.push({
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: { screen: id ?? index + 1, field: 'role', expected: 'a-z, digits, dash; max 32' },
      });
    }

    const explicitSlot = typeof screen.slot === 'string' && SETTING_SCREEN_SLOTS.includes(screen.slot)
      ? screen.slot
      : null;
    const slot = explicitSlot ?? SETTING_SCREEN_SLOTS.find((candidate) => !takenSlots.has(candidate));
    if (slot && !explicitSlot) takenSlots.add(slot);

    return {
      slot,
      order: slot ? SETTING_SCREEN_SLOTS.indexOf(slot) : index,
      id: id ?? `screen-${index + 1}`,
      titleKey: titleKey ?? undefined,
      title: title ?? undefined,
      icon: textOrNull(screen.icon) ?? undefined,
      role: textOrNull(screen.role) ?? undefined,
      component: screen.component,
    };
  });

  if (problems.length > 0) throw new SettingScreensError(problems);

  // Один и тот же слот дважды — это две вкладки на одном месте.
  const seenSlots = new Map();
  for (const entry of entries) {
    if (seenSlots.has(entry.slot)) {
      throw new SettingScreensError([{
        code: SETTING_SCREEN_CODES.DUPLICATE_SCREEN,
        params: { field: 'slot', value: entry.slot },
      }]);
    }
    seenSlots.set(entry.slot, entry.id);
  }

  return Object.freeze(
    [...entries]
      .sort((left, right) => left.order - right.order)
      .map((entry, index) => Object.freeze({
        ...entry,
        order: index,
        route: settingScreenRoute(index),
      })),
  );
};

/** Рамка экранов. Сеттинг может её перекрасить, но не обязан. */
/**
 * Найти экран по роли. Порядок поиска задан явно, потому что от него зависит
 * поведение кнопок движка («создать персонажа» открывает именно лист).
 *
 * @returns {object|null} экран из activeRuntime.screens
 */
export const findSettingScreenByRole = (screens, role) => (
  Array.isArray(screens) ? screens.find((screen) => screen.role === role) ?? null : null
);

/**
 * Экран для кнопки «открыть созданного персонажа»: роль `character`, иначе
 * первый слот. Без сеттинга кнопки Home неактивны, так что null здесь —
 * законный ответ, а не ошибка.
 */
export const resolveCharacterScreenRoute = (screens) => {
  if (!Array.isArray(screens) || screens.length === 0) return null;
  return findSettingScreenByRole(screens, SETTING_SCREEN_ROLES.CHARACTER)?.route
    ?? screens[0].route
    ?? null;
};

export const SETTING_THEME_DEFAULTS = Object.freeze({
  tabBar: Object.freeze({
    background: '#1a1a1a',
    active: '#f0e68c',
    inactive: 'gray',
  }),
});

/**
 * Проверить и дополнить оформление сеттинга значениями движка.
 * Ошибка в цвете — отказ с причиной: молча подставить «похожий» цвет значит
 * показать не тот дизайн, который задумал автор пакета.
 */
export const normalizeSettingTheme = (theme) => {
  if (theme === undefined) return SETTING_THEME_DEFAULTS;
  if (theme === null || typeof theme !== 'object' || Array.isArray(theme)) {
    throw new SettingScreensError([{
      code: SETTING_SCREEN_CODES.INVALID_SCREEN,
      params: { screen: 'theme', field: 'theme', expected: 'object' },
    }]);
  }
  const tabBar = theme.tabBar ?? {};
  if (typeof tabBar !== 'object' || Array.isArray(tabBar)) {
    throw new SettingScreensError([{
      code: SETTING_SCREEN_CODES.INVALID_SCREEN,
      params: { screen: 'theme', field: 'theme.tabBar', expected: 'object' },
    }]);
  }
  const resolved = { ...SETTING_THEME_DEFAULTS.tabBar };
  for (const field of ['background', 'active', 'inactive']) {
    if (tabBar[field] === undefined) continue;
    if (typeof tabBar[field] !== 'string' || !COLOR_RE.test(tabBar[field])) {
      throw new SettingScreensError([{
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: { screen: 'theme', field: `theme.tabBar.${field}`, expected: '#rrggbb' },
      }]);
    }
    resolved[field] = tabBar[field];
  }
  return Object.freeze({ tabBar: Object.freeze(resolved) });
};

/**
 * Глобальные наложения сеттинга: часы, модалки, всплывающие подсказки.
 *
 * Движок монтирует их поверх навигации и не спрашивает, что это, — поэтому
 * проверяется только то, что каждый ключ ведёт на компонент. Имя ключа
 * (например `survivalClock`) смысла для движка не несёт.
 */
export const normalizeSettingGlobalComponents = (globalComponents) => {
  if (globalComponents === undefined) return Object.freeze({});
  if (globalComponents === null || typeof globalComponents !== 'object' || Array.isArray(globalComponents)) {
    throw new SettingScreensError([{
      code: SETTING_SCREEN_CODES.INVALID_SCREEN,
      params: { screen: 'globalComponents', field: 'globalComponents', expected: 'object' },
    }]);
  }
  const entries = Object.entries(globalComponents).map(([id, component]) => {
    if (!isComponent(component)) {
      throw new SettingScreensError([{
        code: SETTING_SCREEN_CODES.INVALID_SCREEN,
        params: { screen: id, field: 'component', expected: 'React component' },
      }]);
    }
    return [id, component];
  });
  return Object.freeze(Object.fromEntries(entries));
};

export const assertSettingScreens = (screens) => normalizeSettingScreens(screens);
