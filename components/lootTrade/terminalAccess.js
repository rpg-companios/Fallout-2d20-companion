/**
 * Патч 506: доступ к терминалу привязан к трансляции, а не к локальному
 * «открыто/закрыто» окну.
 *
 * Раньше признак «терминал открыт» жил в useState модалки: игрок закрывал
 * окно, состояние исчезало, и кнопка «Взломать» в локации снова считала
 * терминал доступным — сколько угодно раз подряд. Теперь сервер выдаёт
 * стабильный `accessId` на каждую трансляцию; он не меняется на ходах и при
 * правке карточки, но обновляется после явной повторной трансляции Мастера
 * (reissue, повторная выдача локации или разрешение повторного взлома).
 *
 * Модуль чистый: его можно проверять без React Native.
 */

export const TERMINAL_BLOCKED_STATUSES = Object.freeze([
  'won',
  'awaitingRetry',
  'closed',
]);

/** Ключ одноразового доступа: одна трансляция = один билет. */
export const terminalAccessKey = ({ roomCode, containerId, accessId }) => (
  `${roomCode}|${containerId}|${accessId || 'legacy'}`
);

/**
 * Можно ли ещё нажимать «Взломать».
 * `used` — отметки этой вкладки (объект accessKey → true).
 */
export const canHackTerminal = ({ used, key, game, terminalClosed, terminalAwaiting }) => {
  if (terminalClosed || terminalAwaiting) return false;
  if (TERMINAL_BLOCKED_STATUSES.includes(game?.status)) return false;
  if (used?.[key]) return false;
  return true;
};

/** Подпись состояния терминала в списке локации. */
export const terminalBlockedReason = ({ game, terminalClosed, terminalAwaiting, used, key }) => {
  if (terminalClosed) return 'closed';
  if (terminalAwaiting) return 'awaiting';
  if (game?.status === 'won') return 'won';
  if (TERMINAL_BLOCKED_STATUSES.includes(game?.status)) return 'finished';
  if (used?.[key]) return 'used';
  return null;
};

export default canHackTerminal;
