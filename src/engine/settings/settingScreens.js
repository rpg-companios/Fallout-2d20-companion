// Экран сеттинга = слот движка + содержимое сеттинга.
//
// Движок владеет набором экранов: `screen:1` … `screen:N`. Он задаёт их
// порядок, маршрут в навигации, рамку (панель вкладок) и защиту от падения при
// рендере. Сеттинг заполняет слот: что на экране написано и как он выглядит —
// это код и данные пакета.
//
// Сколько слотов даёт движок — это ОДНА константа (`SETTING_SCREEN_SLOTS`).
// Нужно 12 экранов? Значит выходит патч движка, который поднимает набор до 12+,
// а не отказ пакету. Старые пакеты от такого патча не ломаются: они занимают
// свои первые слоты и не знают о новых. Поэтому число слотов здесь — данные, а
// не зашитое условие «больше семи нельзя».
//
// Ровно то же правило действует для любой механики: движок даёт элементы и
// состояния, сеттинг расширяет их по правилам движка. Не хватает механизма —
// это задача на патч движка, а не повод сказать «движком не предусмотрено».
//
// Что проверяется (до рендера, на активации):
//   1. объявлен хотя бы один экран;
//   2. у каждого есть `id` (уникальный), заголовок и компонент;
//   3. `slot` — из набора движка, без повторов; без `slot` экран занимает
//      первую свободную позицию в порядке объявления;
//   4. экранов не больше, чем слотов у этой версии движка.
//
// Ошибка «пакет собран неверно» и «движку нужен патч» — разные разговоры с
// человеком, поэтому и коды разные: `invalid-screen` против
// `screen-slots-unavailable`.
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

// Санитарный предел имени слота: `screen:999999` — опечатка, а не запрос на
// миллион вкладок. Это не ограничение движка, а защита от мусора в манифесте.
export const SETTING_SCREEN_SLOT_CEILING = 64;

export const SETTING_SCREEN_CODES = Object.freeze({
  NO_SCREENS: 'no-screens',
  // Слотов не хватает: это ограничение ЭТОЙ версии движка, а не ошибка пакета.
  SCREEN_SLOTS_UNAVAILABLE: 'screen-slots-unavailable',
  INVALID_SCREEN: 'invalid-screen',
  DUPLICATE_SCREEN: 'duplicate-screen',
});

const SCREEN_ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const SLOT_RE = /^screen:([1-9]\d{0,2})$/;

/**
 * Роли, которые движок ищет сам. Сеттинг может объявить любые свои роли —
 * движок их не трогает и лишь хранит.
 */
export const SETTING_SCREEN_ROLES = Object.freeze({
  CHARACTER: 'character',
  INVENTORY: 'inventory',
  EQUIPMENT: 'equipment',
});

// Сколько вкладок движок раскладывает по всей ширине. Больше — панель
// прокручивается: двенадцать вкладок поровну в 360 точках дают по 30 точек на
// подпись, и это уже не интерфейс. Порог — такое же данные-решение движка, как
// и число экранов.
export const SETTING_TABBAR_FIXED_LIMIT = 5;

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

/** Номер слота (`screen:7` → 7) или null, если имя не про слот. */
export const parseSettingScreenSlot = (slot) => {
  if (typeof slot !== 'string') return null;
  const match = SLOT_RE.exec(slot.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return number <= SETTING_SCREEN_SLOT_CEILING ? number : null;
};

/** Панель вкладок прокручивается, когда вкладки перестают помещаться. */
export const shouldScrollSettingTabBar = (count) => Number(count) > SETTING_TABBAR_FIXED_LIMIT;

const isComponent = (value) => typeof value === 'function'
  || (value !== null && typeof value === 'object');

const textOrNull = (value) => (
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null
);

/**
 * Привести экраны сеттинга к слотам движка.
 *
 * @param {readonly object[]|undefined} screens
 * @param {{ slots?: readonly string[] }} [options]
 *   `slots` — набор слотов этой версии движка. Параметр существует ровно для
 *   того, чтобы патч движка («теперь 16 слотов») и тесты не переписывали логику.
 * @returns {readonly object[]} экраны в порядке слотов, с маршрутами движка
 * @throws {SettingScreensError}
 */
export const normalizeSettingScreens = (screens, { slots = SETTING_SCREEN_SLOTS } = {}) => {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new SettingScreensError([{
      code: SETTING_SCREEN_CODES.NO_SCREENS,
      params: { limit: 0 },
    }]);
  }
  if (!Array.isArray(screens) || screens.length === 0) {
    throw new SettingScreensError([{
      code: SETTING_SCREEN_CODES.NO_SCREENS,
      params: { limit: slots.length },
    }]);
  }
  // Пакету нужно больше экранов, чем даёт эта версия движка. Не «пакет
  // сломан», а «этой сборке нужен патч движка» — и человек это прочитает.
  if (screens.length > slots.length) {
    throw new SettingScreensError([{
      code: SETTING_SCREEN_CODES.SCREEN_SLOTS_UNAVAILABLE,
      params: { needed: screens.length, available: slots.length },
    }]);
  }

  const problems = [];
  const ids = new Map();
  const takenSlots = new Set();

  // Сначала занимаем явно объявленные слоты, затем раздаём свободные.
  screens.forEach((screen) => {
    const slot = screen && typeof screen === 'object' ? screen.slot : undefined;
    if (typeof slot === 'string' && slots.includes(slot)) takenSlots.add(slot);
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

    // Слот бывает двух видов ошибки:
    //   `screen:abc` — мусор в манифесте (invalid-screen);
    //   `screen:12` на движке с семью слотами — движку нужен патч.
    const explicitSlot = screen.slot;
    if (explicitSlot !== undefined) {
      const slotNumber = parseSettingScreenSlot(explicitSlot);
      if (slotNumber === null) {
        problems.push({
          code: SETTING_SCREEN_CODES.INVALID_SCREEN,
          params: {
            screen: id ?? index + 1,
            field: 'slot',
            expected: `screen:1 … screen:${slots.length}`,
          },
        });
      } else if (!slots.includes(explicitSlot)) {
        problems.push({
          code: SETTING_SCREEN_CODES.SCREEN_SLOTS_UNAVAILABLE,
          params: {
            needed: slotNumber,
            available: slots.length,
            screen: id ?? index + 1,
          },
        });
      }
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

    const pinnedSlot = typeof explicitSlot === 'string' && slots.includes(explicitSlot)
      ? explicitSlot
      : null;
    const slot = pinnedSlot ?? slots.find((candidate) => !takenSlots.has(candidate));
    if (slot && !pinnedSlot) takenSlots.add(slot);

    return {
      slot,
      order: slot ? slots.indexOf(slot) : index,
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

/** Рамка экранов. Сеттинг может её перекрасить, но не обязан. */
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
