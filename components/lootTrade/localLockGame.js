import engine from '../../server/lockPicking';

/**
 * Патч 524: локальный резерв мини-игры взлома замков.
 *
 * Правила и генерация доски берутся из того же чистого модуля, который
 * использует сервер комнат (`server/lockPicking.js` — без node-зависимостей).
 * Резерв включается автоматически, когда сервер ещё не обновлён и не знает
 * `terminal.issue` / `terminal.action`: у терминала такой fallback уже был с
 * патча 498, у замка его не было, поэтому «Взломать» сразу показывало
 * «Действие не выполнено» и пустую доску без отмычек.
 *
 * Никакого видимого «локального режима» в интерфейсе нет (правило 498):
 * решение о резерве принимает клиент по `capabilities` комнаты, а игрок видит
 * обычные ячейки, стрелки и счётчик отмычек.
 */

export const LOCAL_LOCK_OPERATOR = 'local-lock-player';

/** Снимок живого стора персонажа в форме, которую понимает lockStats(). */
export const buildLocalLockSnapshot = (state = {}) => {
  const liveItems = state.items && typeof state.items === 'object'
    && !Array.isArray(state.items) && Object.keys(state.items).length > 0
    ? state.items
    : null;
  const kitItems = Array.isArray(state.equipment?.items) ? state.equipment.items : null;
  return {
    characterName: state.characterName || '',
    attributes: state.attributes || {},
    skills: state.skills || {},
    selectedSkills: state.selectedSkills || [],
    selectedPerks: state.selectedPerks || [],
    usedMagazineEffects: state.usedMagazineEffects || [],
    items: liveItems || kitItems || {},
    lockPicking: state.lockPicking || {},
  };
};

const finish = (game, spentPins, error = null) => ({
  game,
  view: game ? engine.publicLockGameState(game) : null,
  spentPins,
  error,
});

export const initialLocalLockState = () => finish(null, 0);

const localConfig = (lock) => ({
  containerId: String(lock?.containerId || lock?.id || '').trim(),
  name: lock?.name || '',
  description: lock?.description || '',
  difficulty: Number(lock?.difficulty) || 0,
  kind: 'lock',
});

export const applyLocalLockAction = (state, action, value, ctx = {}) => {
  const {
    lock,
    characterId,
    characterSnapshot = {},
    now = Date.now(),
    rng = Math.random,
  } = ctx;
  const carried = Math.max(0, Math.floor(Number(state?.spentPins) || 0));
  let game = state?.game || null;
  const config = localConfig(lock);
  if (game) game = engine.syncLockGameConfig(game, config);

  // «Да/Нет» Мастера в локальной партии: тот же протокол, что у терминала.
  const decision = action === 'retry'
    ? (value === 'yes' || value === true ? 'yes' : (value === 'no' || value === false ? 'no' : null))
    : null;
  if (decision) {
    if (!game || game.status !== 'awaitingRetry') return finish(game, carried, 'LOCK_NOT_ACTIVE');
    if (decision === 'no') return finish(engine.closeLockGame(game, { now }), carried);
    const fresh = engine.createLockGame({
      config,
      operatorClientId: LOCAL_LOCK_OPERATOR,
      operatorCharacterId: characterId || 'local',
      characterSnapshot,
      now,
      rng,
      spentPins: carried,
    });
    fresh.operatorName = characterSnapshot.characterName || game.operatorName || '';
    return finish(fresh, carried);
  }

  // Патч 526: явный новый подход игрока. Локальный резерв повторяет закон
  // сервера: свежая доска по текущему листу, потраченные отмычки не
  // возвращаются, блокировки пока нет (shouldBlockLock() — задел на будущее).
  if (action === 'newAttempt') {
    // Metro не гарантирует именованный импорт из CJS — берём с объекта.
    if (engine.shouldBlockLock({ game, config })) return finish(game, carried, 'LOCK_BLOCKED');
    const fresh = engine.createLockGame({
      config,
      operatorClientId: LOCAL_LOCK_OPERATOR,
      operatorCharacterId: characterId || 'local',
      characterSnapshot,
      now,
      rng,
      spentPins: carried,
    });
    fresh.operatorName = characterSnapshot.characterName || '';
    return finish(fresh, carried);
  }
  if (game?.status === 'closed') return finish(game, carried, 'LOCK_NOT_ACTIVE');
  if (game?.status === 'awaitingRetry') return finish(game, carried, 'LOCK_NOT_ACTIVE');
  if (game?.status === 'won') return finish(game, carried, 'LOCK_ALREADY_ACTIVE');
  if (game?.status === 'playing' && action === 'start') {
    return finish(game, carried, 'LOCK_ALREADY_ACTIVE');
  }

  if (!game && (action === 'start' || action === 'press')) {
    game = engine.createLockGame({
      config,
      operatorClientId: LOCAL_LOCK_OPERATOR,
      operatorCharacterId: characterId || 'local',
      characterSnapshot,
      now,
      rng,
      spentPins: carried,
    });
    game.operatorName = characterSnapshot.characterName || '';
    if (action === 'start') return finish(game, carried);
  }
  if (!game) return finish(null, carried, 'LOCK_NOT_ACTIVE');

  const brokenBefore = Number(game.brokenPins || 0);
  const result = engine.applyLockAction({
    game,
    config,
    action,
    clientId: LOCAL_LOCK_OPERATOR,
    characterId: characterId || 'local',
    characterSnapshot,
    value,
    now,
    rng,
    spentPins: carried,
  });
  if (result.error) return finish(game, carried, result.error);
  const delta = Math.max(0, Number(result.game?.brokenPins || 0) - brokenBefore);
  return finish(result.game, carried + delta);
};

export default applyLocalLockAction;
