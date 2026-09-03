/**
 * alertService — единая точка показа диалогов.
 *
 * ЗАЧЕМ.
 *   Раньше в приложении жили ПЯТЬ почти одинаковых обёрток showAlert
 *   (CharacterContext, HomeScreen, InventoryScreen, CharacterScreen,
 *   PerksAndTraitsScreen) и развилка `Platform.OS === 'web'` была размазана
 *   по ~50 местам вызова. На вебе диалоги показывались браузерными
 *   примитивами window.confirm/window.prompt, у которых ровно две кнопки,
 *   поэтому диалоги с ТРЕМЯ вариантами (применить расходник на себя /
 *   на другого / отмена; выбор руки для силовой брони) на вебе теряли
 *   вариант или требовали ввести цифру руками.
 *
 * КАК УСТРОЕНО.
 *   Сервис не рендерит сам: он хранит ссылку на хост-компонент
 *   (AlertHost), смонтированный один раз в App.js. Любой код — включая
 *   не-React модули вроде CharacterContext — вызывает showAlert() и
 *   получает Promise с результатом. Хост рисует обычную React-модалку,
 *   одинаковую на вебе и на нативе, с любым числом кнопок.
 *
 * ПОЧЕМУ PROMISE, А НЕ КОЛБЭКИ.
 *   Alert.alert работает через onPress-колбэки, window.confirm —
 *   синхронно возвращает boolean. Промис примиряет обе модели и
 *   позволяет писать `if (await confirmAlert('x')) ...` в любом месте.
 *
 * ВАЖНО ПРО ДВИЖОК.
 *   Доменные функции НЕ должны звать этот модуль напрямую: чистая логика
 *   не знает про UI. Правильный путь — вернуть событие, а экран сопоставит
 *   его с записью каталога и покажет диалог.
 */

import { ALERTS } from './catalog';

let hostHandler = null;
// Очередь запросов, пришедших до монтирования хоста (например, ранняя ошибка
// инициализации). Без неё такой алерт потерялся бы молча.
const pendingQueue = [];

/** Вызывается AlertHost при монтировании. Возвращает функцию отписки. */
export const registerAlertHost = (handler) => {
  hostHandler = handler;
  while (pendingQueue.length > 0) {
    const { request, resolve } = pendingQueue.shift();
    handler(request).then(resolve);
  }
  return () => {
    if (hostHandler === handler) hostHandler = null;
  };
};

/**
 * Показать диалог из каталога.
 *
 * @param {string} alertId  ключ в ALERTS
 * @param {object} params   подстановки для {placeholder} в тексте
 * @returns {Promise<*>}    для kind:'info'    → undefined
 *                          для kind:'confirm' → true | false
 *                          для kind:'choice'  → value выбранной кнопки | null
 */
export const showAlert = (alertId, params = {}) => {
  const entry = ALERTS[alertId];
  if (!entry) {
    // Промах ключа — дефект данных. Не роняем приложение, но и не молчим.
    console.error(`[alertService] Неизвестный алерт: ${alertId}`);
    return Promise.resolve(entry?.kind === 'confirm' ? false : null);
  }

  const request = { id: alertId, entry, params };

  if (!hostHandler) {
    return new Promise((resolve) => {
      pendingQueue.push({ request, resolve });
    });
  }

  return hostHandler(request);
};

/** Сахар для самого частого случая: да/нет. */
export const confirmAlert = (alertId, params = {}) =>
  showAlert(alertId, params).then((result) => result === true);

/**
 * Показать диалог с произвольным текстом, минуя каталог.
 *
 * Нужен для сообщений, текст которых приходит извне (ошибка от Google Drive,
 * отчёт о применении расходника) и не может быть заранее записан в каталог.
 * Для всего остального пользуйтесь showAlert с ключом.
 */
export const showRawAlert = ({ title, message = '', kind = 'info', buttons }) => {
  const request = {
    id: '__raw__',
    entry: { kind, buttons },
    params: {},
    raw: { title, message },
  };
  if (!hostHandler) {
    return new Promise((resolve) => {
      pendingQueue.push({ request, resolve });
    });
  }
  return hostHandler(request);
};
