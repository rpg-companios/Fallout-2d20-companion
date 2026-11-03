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
 * Патч 506: вкладки одного браузера делят UI-режим (localStorage), поэтому
 * `role: 'gm'` в сторе у Мастера легко оказывается 'player' — глобальный хост
 * тогда молчал и на провал, и на успех. Надёжный признак владельца — запись
 * участника с role 'gm' и clientId ЭТОЙ вкладки (сервер её присылает в
 * room.state / room.member независимо от UI-режима).
 */
export const isGmRoom = (room, clientId = null) => {
  if (room?.role === 'gm') return true;
  if (!clientId || !Array.isArray(room?.members)) return false;
  return room.members.some(
    (member) => member?.role === 'gm' && member?.clientId === clientId,
  );
};

/**
 * Из состояний комнат выбирает провалившиеся партии, по которым Мастер ещё
 * не ответил. Игровые комнаты (role: 'player') и уже закрытые терминалы
 * никогда не порождают вопрос.
 */
export const findPending = (rooms, clientId = null) => {
  const pending = [];
  for (const [code, room] of Object.entries(rooms || {})) {
    if (!isGmRoom(room, clientId)) continue;
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
export const findCompleted = (rooms, clientId = null) => {
  const completed = [];
  for (const [code, room] of Object.entries(rooms || {})) {
    if (!isGmRoom(room, clientId)) continue;
    for (const [containerId, terminal] of Object.entries(room?.terminalStates || {})) {
      if (terminal?.game?.status !== 'won') continue;
      // Патч 516: терминал, открытый ключом, не считается «взломанным
      // игроком» — Мастер сам создал и выдал ключ, уведомление не нужно.
      if (terminal?.game?.hackedByKey) continue;
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
