/**
 * Патч 506: доступ к терминалу привязывался к трансляции, а не к локальному
 * «открыто/закрыто» окну. Патч 526 уточнил правило по слову владельца: баг
 * 506 был про АВТОМАТИЧЕСКИЙ перезапуск взлома после успеха, а не про право
 * игрока на новые подходы. «Билет на один взлом» убран: игрок сам решает,
 * когда начать новый подход (купил отмычки, прокачал PER/LOCKPICK).
 *
 * Что осталось:
 *  - автоматический рестарт после ACCESS GRANTED запрещён (правила
 *    shouldAutoStart / shouldAutoStartLock и серверные запреты `start`);
 *  - терминал после провала получает «заблокировано» и ждёт решения Мастера
 *    «Да/Нет»; повтор после блокировки — только с его разрешения;
 *  - замки пока НЕ блокируются вообще (владелец добавит условие позже),
 *    поэтому `isLock` снимает все статусные запреты.
 *
 * `accessId` и `terminalAccessKey()` сохранены для диагностики, дедупликации
 * открытого окна и совместимости, но больше не являются правом на взлом.
 * Модуль чистый: его можно проверять без React Native.
 */

export const TERMINAL_BLOCKED_STATUSES = Object.freeze([
  'won',
  'awaitingRetry',
  'closed',
]);

/** Стабильный ключ трансляции. Больше НЕ «билет», просто идентификатор. */
export const terminalAccessKey = ({ roomCode, containerId, accessId }) => (
  `${roomCode}|${containerId}|${accessId || 'legacy'}`
);

/**
 * Можно ли ещё нажимать «Взломать».
 * `used` и `key` принимаются для совместимости с вызывающими модулями,
 * но с 526 не влияют на решение.
 */
export const canHackTerminal = ({
  used,
  key,
  game,
  terminalClosed,
  terminalAwaiting,
  isLock = false,
}) => {
  // Патч 526: замки не блокируем. Ни «ДОСТУП ИСПОЛЬЗОВАН», ни финальный
  // статус доски, ни закрытие не запрещают новый подход игрока.
  if (isLock) return true;
  if (terminalClosed || terminalAwaiting) return false;
  if (TERMINAL_BLOCKED_STATUSES.includes(game?.status)) return false;
  return true;
};

/** Подпись состояния точки в списке локации (null — всё доступно). */
export const terminalBlockedReason = ({
  game,
  terminalClosed,
  terminalAwaiting,
  used,
  key,
  isLock = false,
}) => {
  // Патч 526: у замка показываем только информационные отметки, запретов нет.
  if (isLock) {
    if (game?.hackedByKey) return 'keyUnlocked';
    if (game?.status === 'won') return 'won';
    return null;
  }
  if (terminalClosed) return 'closed';
  if (terminalAwaiting) return 'awaiting';
  // Патч 516: успех без мини-игры, точка открыта ключевой записью.
  if (game?.hackedByKey) return 'keyUnlocked';
  if (game?.status === 'won') return 'won';
  if (TERMINAL_BLOCKED_STATUSES.includes(game?.status)) return 'finished';
  return null;
};

export default canHackTerminal;
