import { describe, expect, it } from 'vitest';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import {
  applyGameAction,
  bracketEffectFor,
  createGame,
  publicGameState,
  recoveryChancePercent,
} from '../../server/terminalHacking.js';

const config = { containerId: 'terminal-1', name: 'Vault terminal', difficulty: 2, lockOnFailure: true };
const noRandomness = () => 0;

describe('shared Fallout terminal hacking rules', () => {
  // Патч 496: справочная вероятность «не пустышка» берётся из таблицы d20.
  it('uses the agreed d20 luck checkpoints and clamp', () => {
    expect(recoveryChancePercent(4)).toBe(25);
    expect(recoveryChancePercent(7)).toBe(45);
    expect(recoveryChancePercent(10)).toBe(75);
    expect(recoveryChancePercent(1)).toBe(25);
    expect(recoveryChancePercent(12)).toBe(75);
    expect(recoveryChancePercent(0)).toBe(25);
    // d20: 1..F = полный сброс, F+1..P = +1 попытка, остальное = пустышка.
    expect(bracketEffectFor(4, 1)).toBe('reset');
    expect(bracketEffectFor(4, 3)).toBe('attempt');
    expect(bracketEffectFor(4, 9)).toBe('dud');
    expect(bracketEffectFor(10, 4)).toBe('reset');
    expect(bracketEffectFor(10, 12)).toBe('attempt');
    expect(bracketEffectFor(10, 18)).toBe('dud');
    expect(bracketEffectFor(10, 2, true)).toBe('attempt');
  });

  // Патч 496: база доски зависит от сложности, длина = d + 4.
  it.each([
    [0, 4, 8], [1, 5, 10], [2, 6, 12], [3, 7, 14], [4, 8, 17], [5, 9, 20],
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

  it('Hacker rank reduces effective difficulty dynamically and difficulty zero never leaks the password', () => {
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
    // Патч 495: подчёркивания больше нет — d=0 решается поиском «выброса»
    // среди анаграммных семей; пароль клиенту не передаётся.
    expect(publicState.wordRanges.filter((entry) => entry.isPassword)).toHaveLength(0);
    expect(publicState.password).toBeUndefined();
  });

  it('rolls bracket effects with d20 and allows a full reset only once', () => {
    const snapshot = {
      attributes: { INT: { value: 10 }, LCK: { value: 10 } },
      skills: [{ id: 'science', value: 6 }],
    };
    let game = null;
    for (let k = 1; k <= 60 && !game; k += 1) {
      const candidate = createGame({
        config: { ...config, difficulty: 5 },
        operatorClientId: 'player-1',
        operatorCharacterId: 'char-1',
        characterSnapshot: snapshot,
        now: 100,
        rng: () => k / 61,
      });
      if (candidate.bracketRanges.some((entry) => entry.effect === 'reset')) game = candidate;
    }
    expect(game).not.toBeNull();
    expect(game.bracketRanges).toHaveLength(3);
    expect(game.bracketRanges.filter((entry) => entry.effect === 'reset')).toHaveLength(1);
    expect(publicGameState(game).bracketRanges.every((entry) => !('effect' in entry) && !('recovery' in entry))).toBe(true);

    let next = { ...game, attempts: 1 };
    for (const bracket of [...game.bracketRanges]) {
      next = applyGameAction({
        game: next,
        action: 'bracket',
        clientId: 'player-1',
        characterId: 'char-1',
        characterSnapshot: {},
        value: bracket.id,
        now: 101,
        rng: noRandomness,
      }).game;
    }
    expect(next.resetUsed).toBe(true);
    expect(next.bonusAttempts).toBeGreaterThanOrEqual(next.maxAttempts);
    expect(next.attempts).toBe(1 + next.bonusAttempts);
    expect(next.bracketRanges.every((entry) => entry.used)).toBe(true);

    const noScience = createGame({
      config: { ...config, difficulty: 5 },
      operatorClientId: 'player-1',
      operatorCharacterId: 'char-1',
      characterSnapshot: { attributes: { INT: { value: 10 }, LCK: { value: 10 } }, skills: [] },
      now: 100,
      rng: noRandomness,
    });
    expect(noScience.bracketRanges).toHaveLength(0);
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
