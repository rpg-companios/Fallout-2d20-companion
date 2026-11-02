import engine from '../../server/terminalHacking';

/**
 * Локальный резерв мини-игры взлома.
 *
 * Правила и генерация доски берутся из того же чистого модуля, который
 * использует сервер комнат (`server/terminalHacking.js` — без node-зависимостей).
 * Это нужно, когда сервер ещё не обновлён: он не знает terminal.issue/action,
 * поэтому клиент ведёт партию сам, но терминал всё равно открывается модалкой,
 * а не превращается в сундук с добычей.
 */
export const LOCAL_TERMINAL_OPERATOR = 'local-terminal-player';

export const buildLocalCharacterSnapshot = (state = {}) => ({
  characterName: state.characterName || '',
  attributes: state.attributes || {},
  skills: state.skills || {},
  selectedSkills: state.selectedSkills || [],
  selectedPerks: state.selectedPerks || [],
  usedMagazineEffects: state.usedMagazineEffects || [],
  items: state.items || {},
  terminalHacking: state.terminalHacking || {},
});

const pack = (game, extra = {}) => ({
  game,
  view: game ? engine.publicGameState(game) : null,
  usedDigest: false,
  error: null,
  ...extra,
});

export const initialLocalTerminalState = () => pack(null);

export const applyLocalTerminalAction = (state, action, value, ctx = {}) => {
  const {
    terminal,
    characterId,
    characterSnapshot,
    now = Date.now(),
    rng = Math.random,
  } = ctx;
  let game = state?.game || null;
  const config = engine.normalizeTerminalConfig({
    containerId: terminal?.containerId || terminal?.id,
    name: terminal?.name,
    description: terminal?.description,
    difficulty: terminal?.difficulty,
    lockOnFailure: terminal?.lockOnFailure,
  });

  if (action === 'start' || (!game && ['guess', 'bracket'].includes(action))) {
    game = engine.createGame({
      config,
      operatorClientId: LOCAL_TERMINAL_OPERATOR,
      operatorCharacterId: characterId || 'local',
      characterSnapshot,
      now,
      rng,
    });
    game.operatorName = characterSnapshot?.characterName || '';
    if (action === 'start') return pack(game);
  }
  if (!game) return pack(null, { error: 'TERMINAL_NOT_ISSUED' });

  const result = engine.applyGameAction({
    game,
    action,
    clientId: LOCAL_TERMINAL_OPERATOR,
    characterId: characterId || 'local',
    characterSnapshot,
    value,
    now,
    rng,
  });
  if (result.error) return pack(game, { error: result.error });
  return pack(result.game, { usedDigest: Boolean(result.usedDigest) });
};

export default applyLocalTerminalAction;
