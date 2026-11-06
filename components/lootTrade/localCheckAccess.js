/**
 * Патч 547: сигнал об успешном взломе в локальном резерве.
 *
 * Баг владельца: «я взломал замок… из-за того, что модалка взлома не передала
 * данные о взломе, я не могу пройти дальше».
 *
 * Причина: единственным каналом победы был реестр комнаты
 * (`rooms[code].terminalStates[id].game.status === 'won'`). Когда сервер комнат
 * ещё не знает протокол мини-игр, доска живёт в памяти клиента
 * (`localLockGame` / `localTerminalGame`), в реестр комнаты она не попадает —
 * сигнал не приходил никуда, преграда локации оставалась непройденной.
 *
 * Этот модуль — журнал пройденных проверок ДЛЯ ЛОКАЛЬНОГО РЕЗЕРВА. Он не
 * подменяет серверное решение: вызывающая сторона обязана спрашивать его только
 * когда у комнаты нет протокола мини-игр (`roomHasTerminalProtocol === false`).
 * При наличии протокола источником истины остаётся сервер (урок 506), а его
 * журнал `accessEvents` — общим на контур привязанных комнат.
 *
 * Модуль чистый (без React и без сети), поэтому правила проверяются тестами.
 */

const passedChecks = new Map();

export const localCheckAccessKey = ({ roomCode, containerId } = {}) => (
  `${String(roomCode || '').trim()}|${String(containerId || '').trim()}`
);

/**
 * Записать пройденную проверку. Возвращает true, если запись новая —
 * по этому флагу интерфейс понимает, что нужно перерисоваться.
 */
export const recordLocalCheckAccess = ({
  roomCode,
  containerId,
  kind = 'lock',
  now = Date.now(),
} = {}) => {
  const id = String(containerId || '').trim();
  if (!id) return false;
  const key = localCheckAccessKey({ roomCode, containerId: id });
  if (passedChecks.has(key)) return false;
  passedChecks.set(key, {
    containerId: id,
    roomCode: String(roomCode || '').trim(),
    kind: String(kind || 'lock'),
    at: now,
  });
  return true;
};

export const hasLocalCheckAccess = ({ roomCode, containerId } = {}) => (
  passedChecks.has(localCheckAccessKey({ roomCode, containerId }))
);

/** Снять запись точки; без containerId — весь локальный журнал комнаты. */
export const clearLocalCheckAccess = ({ roomCode, containerId } = {}) => {
  const id = String(containerId || '').trim();
  if (id) {
    passedChecks.delete(localCheckAccessKey({ roomCode, containerId: id }));
    return;
  }
  const code = String(roomCode || '').trim();
  for (const [key, entry] of passedChecks.entries()) {
    if (!code || entry.roomCode === code) passedChecks.delete(key);
  }
};

/** Снимок журнала — для отладки и тестов. */
export const localCheckAccessSnapshot = () => [...passedChecks.values()].map((entry) => ({ ...entry }));

export default recordLocalCheckAccess;
