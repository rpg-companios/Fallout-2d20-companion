/**
 * Чистая логика поиска терминалов, которые ждут решения Мастера (патч 504).
 * Вынесена отдельно, чтобы её можно было проверять без React Native и чтобы
 * глобальный хост не содержал доменной логики.
 */

export const decisionKey = (code, containerId, game) => (
  `${code}|${containerId}|${game?.revision ?? 'none'}`
);

/**
 * Из состояний комнат выбирает провалившиеся партии, по которым Мастер ещё
 * не ответил. Игровые комнаты (role: 'player') и уже закрытые терминалы
 * никогда не порождают вопрос.
 */
export const findPending = (rooms) => {
  const pending = [];
  for (const [code, room] of Object.entries(rooms || {})) {
    if (room?.role !== 'gm') continue;
    for (const [containerId, terminal] of Object.entries(room?.terminalStates || {})) {
      if (terminal?.game?.status !== 'awaitingRetry') continue;
      if (terminal?.closed) continue;
      pending.push({
        code,
        containerId,
        key: decisionKey(code, containerId, terminal.game),
        name: terminal?.config?.name || containerId,
        difficulty: terminal?.config?.difficulty ?? 0,
      });
    }
  }
  return pending;
};
