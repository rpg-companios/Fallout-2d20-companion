/**
 * Чистая логика автозапуска партии взлома (патч 505).
 *
 * Вынесена из TerminalHackingModal, чтобы правило «не начинать новую доску
 * после победы» можно было проверить без React Native. Окно взлома получает
 * `autoStart` от кнопки «Взломать» в локации; эффект должен отправить ровно
 * один `start` на открытие, а не на каждое изменение статуса доски.
 *
 * Раньше guard пропускал только `playing` / `pendingDigest`: после
 * `ACCESS GRANTED` эффект снова уходил в `start`, а другой clientId (вторая
 * вкладка браузера, переподключение) расценивался сервером как передача хода
 * и собирал свежую доску — победа исчезала с экрана.
 */

/** Статусы, в которых новая партия недопустима без явного решения Мастера. */
export const TERMINAL_FINISHED_STATUSES = Object.freeze([
  'won',
  'awaitingRetry',
  'closed',
]);

/**
 * Нужно ли отправлять `start` при текущем состоянии окна.
 * Все аргументы — примитивы, функция ничего не знает о сторе и сервере.
 */
export const shouldAutoStart = ({
  visible,
  autoStart,
  hasTerminal,
  hasRoom,
  characterId,
  isClosed,
  awaitingGm,
  game,
  boardOfAnotherOperator,
}) => {
  if (!visible || !autoStart || !hasTerminal || !hasRoom || !characterId) return false;
  if (isClosed || awaitingGm) return false;
  // Победа, провал и «Закрыт» — финальные состояния carte: доска не должна
  // пересобираться сама ни при каком операторе.
  if (TERMINAL_FINISHED_STATUSES.includes(game?.status)) return false;
  if (['playing', 'pendingDigest'].includes(game?.status) && !boardOfAnotherOperator) return false;
  return true;
};

/** Ключ дедупликации: один `start` на открытие окна для конкретной доски. */
export const autoStartKey = ({ roomCode, containerId, characterId, game }) => (
  `${roomCode}:${containerId}:${characterId}:${game?.operatorCharacterId || ''}:${game?.status || ''}`
);

export default shouldAutoStart;
