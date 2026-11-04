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
 *
 * Патч 526: `freshAttempt` — ЯВНОЕ нажатие «Взломать»/«Ещё подход». Оно
 * отправляет `newAttempt` и потому допустимо в любом состоянии доски, но
 * по-прежнему ровно один раз на монтирование окна (автоперезапуск после
 * ACCESS GRANTED остаётся запрещён).
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
  freshAttempt = false,
}) => {
  if (!visible || !autoStart || !hasLock || !hasRoom || !characterId) return false;
  // Явный новый подход игрока не зависит от состояния старой доски: замки
  // пока не блокируются. Защита от автоматического рестарта — в том, что
  // эффект срабатывает один раз на монтирование окна (ключ ниже).
  if (freshAttempt) return true;
  if (isClosed || awaitingGm) return false;
  if (LOCK_FINISHED_STATUSES.includes(game?.status)) return false;
  if (game?.status === 'playing' && !boardOfAnotherOperator) return false;
  return true;
};

export const autoStartLockKey = ({ roomCode, containerId, characterId, localMode, freshAttempt }) => (
  `${localMode ? 'local' : 'net'}:${freshAttempt ? 'fresh' : 'view'}:${roomCode || ''}:${containerId}:${characterId}`
);

export default shouldAutoStartLock;
