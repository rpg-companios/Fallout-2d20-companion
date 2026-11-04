/**
 * Патч 524: чистые правила автозапуска доски замка.
 *
 * Раньше ключ дедупликации содержал `terminalState.accessId`: на первом
 * рендере состояние комнаты ещё не приходило, ключ был «::», а после
 * `room.state` менялся — эффект отправлял второй `start`. Сервер отвечал
 * `TERMINAL_ALREADY_ACTIVE` / `TERMINAL_AWAITING_RETRY`, и игрок видел
 * «Действие не выполнено» поверх уже собранной (или пустой) доски.
 *
 * Теперь ключ не зависит от прихода сетевого состояния, а статус доски
 * входит в условия остановки: ровно один `start` на открытие окна.
 */

export const LOCK_FINISHED_STATUSES = Object.freeze([
  'won',
  'awaitingRetry',
  'closed',
]);

export const shouldAutoStartLock = ({
  visible,
  autoStart,
  hasLock,
  hasRoom,
  characterId,
  isClosed,
  awaitingGm,
  game,
  boardOfAnotherOperator = false,
}) => {
  if (!visible || !autoStart || !hasLock || !hasRoom || !characterId) return false;
  if (isClosed || awaitingGm) return false;
  if (LOCK_FINISHED_STATUSES.includes(game?.status)) return false;
  if (game?.status === 'playing' && !boardOfAnotherOperator) return false;
  return true;
};

export const autoStartLockKey = ({ roomCode, containerId, characterId, localMode }) => (
  `${localMode ? 'local' : 'net'}:${roomCode || ''}:${containerId}:${characterId}`
);

export default shouldAutoStartLock;
