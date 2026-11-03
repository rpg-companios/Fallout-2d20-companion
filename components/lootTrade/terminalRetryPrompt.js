/**
 * Чистая логика отбора событий терминалов для Мастера (патчи 504–505).
 * Вынесена отдельно, чтобы её можно было проверять без React Native и чтобы
 * глобальный хост не содержал доменной логики:
 *   findPending   — провал, ждём «Разрешить повторный взлом? Да/Нет»;
 *   findCompleted — успех, Мастеру нужно уведомление «Терминал взломан».
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


/**
 * Патч 505: об успехе Мастер раньше не узнавал вовсе — глобальный хост умел
 * показывать только вопрос о повторном взломе. Теперь `won` тоже приходит
 * Мастеру как отдельное событие. Префикс в ключе исключает коллизию с
 * вопросом `findPending` по той же ревизии партии.
 */
export const findCompleted = (rooms) => {
  const completed = [];
  for (const [code, room] of Object.entries(rooms || {})) {
    if (room?.role !== 'gm') continue;
    for (const [containerId, terminal] of Object.entries(room?.terminalStates || {})) {
      if (terminal?.game?.status !== 'won') continue;
      if (terminal?.closed) continue;
      completed.push({
        code,
        containerId,
        kind: 'won',
        key: `won:${decisionKey(code, containerId, terminal.game)}`,
        name: terminal?.config?.name || containerId,
        difficulty: terminal?.config?.difficulty ?? 0,
        operatorName: terminal?.game?.operatorName || '',
      });
    }
  }
  return completed;
};
