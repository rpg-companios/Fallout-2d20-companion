import { describe, expect, it } from 'vitest';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import {
  applyGameAction,
  createGame,
  publicGameState,
  recoveryChancePercent,
} from '../../server/terminalHacking.js';

const config = { containerId: 'terminal-1', name: 'Vault terminal', difficulty: 2, lockOnFailure: true };
const noRandomness = () => 0;

describe('shared Fallout terminal hacking rules', () => {
  it('uses the agreed recovery probability checkpoints and clamp', () => {
    expect(recoveryChancePercent(4, 0)).toBe(0);
    expect(recoveryChancePercent(4, 3)).toBe(10);
    expect(recoveryChancePercent(10, 6)).toBe(80);
    expect(recoveryChancePercent(1, 0)).toBe(0);
    expect(recoveryChancePercent(12, 10)).toBe(80);
  });

  // Патч 494: очень сложный терминал (5) всегда держит 13 слов — как в
  // Fallout 3, где Very Hard не сокращает список даже при Науке 100.
  it.each([
    [0, 4, 12], [1, 5, 12], [2, 6, 12], [3, 7, 12], [4, 8, 12], [5, 9, 13],
  ])('difficulty %s creates a %s-letter password', (difficulty, wordLength, wordCount) => {
    const game = createGame({
      config: { ...config, difficulty, lockOnFailure: false },
      operatorClientId: 'player-1',
      operatorCharacterId: 'char-1',
      characterSnapshot: { attributes: { INT: { value: 4 } }, skills: [] },
      now: 100,
      rng: noRandomness,
    });
    expect(game.wordLength).toBe(wordLength);
    expect(game.password).toHaveLength(wordLength);
    expect(game.wordRanges).toHaveLength(wordCount);
    expect(game.wordCount).toBe(wordCount);
  });

  it('Hacker rank reduces effective difficulty dynamically and difficulty zero marks the password', () => {
    const snapshot = {
      attributes: { INT: { value: 8 } },
      selectedPerks: [{ id: 'hacker', rank: 1 }, { id: 'hacker', rank: 3 }],
      skills: [],
    };
    const game = createGame({
      config: { ...config, difficulty: 5 },
      operatorClientId: 'player-1',
      operatorCharacterId: 'char-1',
      characterSnapshot: snapshot,
      now: 100,
      rng: noRandomness,
    });
    expect(game.effectiveDifficulty).toBe(2);
    expect(game.wordLength).toBe(6);
    const easy = createGame({
      config: { ...config, difficulty: 2 },
      operatorClientId: 'player-1',
      operatorCharacterId: 'char-1',
      characterSnapshot: { ...snapshot, selectedPerks: [{ id: 'hacker', rank: 8 }] },
      now: 101,
      rng: noRandomness,
    });
    expect(easy.effectiveDifficulty).toBe(0);
    expect(easy.wordLength).toBe(4);
    const publicState = publicGameState(easy);
    expect(publicState.wordRanges.filter((entry) => entry.isPassword)).toHaveLength(1);
    expect(publicState.password).toBeUndefined();
  });

  it('rolls at most one attempt-restoring bracket per board and restores all attempts', () => {
    const game = createGame({
      config: { ...config, difficulty: 0 },
      operatorClientId: 'player-1',
      operatorCharacterId: 'char-1',
      characterSnapshot: { attributes: { INT: { value: 10 } }, skills: [{ id: 'science', value: 6 }] },
      now: 100,
      rng: noRandomness,
    });
    const recoveryBrackets = game.bracketRanges.filter((entry) => entry.recovery);
    expect(recoveryBrackets).toHaveLength(1);
    expect(publicGameState(game).bracketRanges.every((entry) => !('recovery' in entry))).toBe(true);
    let next = { ...game, attempts: 1 };
    const result = applyGameAction({
      game: next,
      action: 'bracket',
      clientId: 'player-1',
      characterId: 'char-1',
      characterSnapshot: {},
      value: recoveryBrackets[0].id,
      now: 101,
      rng: noRandomness,
    });
    next = result.game;
    expect(next.attempts).toBe(4);
    expect(next.bracketRanges.filter((entry) => entry.recovery)).toHaveLength(1);
    expect(next.bracketRanges.find((entry) => entry.id === recoveryBrackets[0].id).used).toBe(true);
  });

  it('offers Programmer’s Digest only once per character and grants one extra attempt', () => {
    const characterSnapshot = {
      items: { mag_programmers_digest: { id: 'mag_programmers_digest', quantity: 1 } },
      usedMagazineEffects: [],
    };
    const game = createGame({
      config,
      operatorClientId: 'player-1',
      operatorCharacterId: 'char-1',
      characterSnapshot,
      now: 100,
      rng: noRandomness,
    });
    expect(game.digestEligible).toBe(true);
    const wrong = game.wordRanges.find((entry) => entry.word !== game.password);
    const pending = applyGameAction({
      game: { ...game, attempts: 1 },
      action: 'guess',
      clientId: 'player-1',
      characterId: 'char-1',
      characterSnapshot,
      value: wrong.id,
      now: 101,
      rng: noRandomness,
    }).game;
    expect(pending.status).toBe('pendingDigest');
    const used = applyGameAction({
      game: pending,
      action: 'useDigest',
      clientId: 'player-1',
      characterId: 'char-1',
      characterSnapshot,
      now: 102,
    });
    expect(used.usedDigest).toBe(true);
    expect(used.game).toMatchObject({ status: 'playing', attempts: 1, digestUsed: true });

    const usedSnapshot = { ...characterSnapshot, usedMagazineEffects: ['mag_programmers_digest'] };
    const nextBoard = createGame({
      config,
      operatorClientId: 'player-1',
      operatorCharacterId: 'char-1',
      characterSnapshot: usedSnapshot,
      now: 103,
      rng: noRandomness,
    });
    expect(nextBoard.digestEligible).toBe(false);
  });

  it('sets Access Granted on success, and locks with Access Denied after the last failure', () => {
    const base = createGame({
      config,
      operatorClientId: 'player-1',
      operatorCharacterId: 'char-1',
      characterSnapshot: {},
      now: 100,
      rng: noRandomness,
    });
    const win = applyGameAction({
      game: base,
      action: 'guess',
      clientId: 'player-1',
      characterId: 'char-1',
      characterSnapshot: {},
      value: base.wordRanges.find((entry) => entry.word === base.password).id,
      now: 101,
      rng: noRandomness,
    }).game;
    expect(win.status).toBe('won');
    expect(win.result).toBe('ACCESS GRANTED');
    expect(win.scrollUp).toBe(true);

    let failed = { ...base, attempts: 1, digestEligible: false };
    const wrong = failed.wordRanges.find((entry) => entry.word !== failed.password);
    failed = applyGameAction({
      game: failed,
      action: 'guess',
      clientId: 'player-1',
      characterId: 'char-1',
      characterSnapshot: {},
      value: wrong.id,
      now: 102,
      rng: noRandomness,
    }).game;
    expect(failed.status).toBe('locked');
    expect(failed.result).toBe('ACCESS DENIED');
  });

  it('registers location terminals as room-wide games without replacing the active location session', () => {
    const registry = createRoomRegistry();
    const { room } = registry.createRoom({ clientId: 'gm-location' });
    const opened = registry.openSession({
      code: room.code,
      clientId: 'gm-location',
      session: {
        containerId: 'vault-room',
        kind: 'hub',
        name: 'Vault',
        targetType: 'character',
        targetCharacterId: 'only-one-player',
        nodes: [{
          containerId: 'terminal-in-vault',
          kind: 'terminal',
          name: 'Control terminal',
          difficulty: 4,
          lockOnFailure: true,
          items: [],
        }],
      },
    });
    expect(opened.session.targetType).toBe('room');
    expect(opened.session.nodes[0]).toMatchObject({ kind: 'terminal', difficulty: 4, lockOnFailure: true });
    expect(registry.getState(room.code).terminalStates['terminal-in-vault']).toMatchObject({
      standaloneIssued: false,
      config: { difficulty: 4, lockOnFailure: true },
      game: null,
    });
    expect(registry.getState(room.code).activeSession.kind).toBe('hub');
  });

  it('shares the operator and board through the room registry, and permits GM unlock', () => {
    const registry = createRoomRegistry();
    const { room } = registry.createRoom({ clientId: 'gm-1' });
    registry.joinRoom({ code: room.code, clientId: 'gm-1', name: 'GM', role: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Player one', role: 'player' });
    registry.joinRoom({ code: room.code, clientId: 'p2', name: 'Player two', role: 'player' });
    registry.putSnapshot({
      code: room.code,
      characterId: 'char-1',
      revision: 1,
      fromClientId: 'p1',
      snapshot: { characterName: 'Operator', data: { attributes: { INT: { value: 4 } }, skills: [] } },
    });
    registry.putSnapshot({
      code: room.code,
      characterId: 'char-2',
      revision: 1,
      fromClientId: 'p2',
      snapshot: { characterName: 'Watcher', data: { attributes: { INT: { value: 4 } }, skills: [] } },
    });
    expect(registry.issueTerminal({ code: room.code, clientId: 'gm-1', config }).error).toBeUndefined();
    const started = registry.terminalAction({
      code: room.code,
      clientId: 'p1',
      characterId: 'char-1',
      containerId: config.containerId,
      action: 'start',
    });
    expect(started.terminal.game.operatorClientId).toBe('p1');
    expect(started.terminal.game.password).toBeUndefined();
    const watcherAction = registry.terminalAction({
      code: room.code,
      clientId: 'p2',
      characterId: 'char-2',
      containerId: config.containerId,
      action: 'guess',
      value: started.terminal.game.wordRanges[0].id,
    });
    expect(watcherAction.error).toBe('TERMINAL_VIEW_ONLY');
    expect(registry.terminalAction({
      code: room.code,
      clientId: 'gm-1',
      containerId: config.containerId,
      action: 'unlock',
    }).terminal.game).toBeNull();
  });
});
