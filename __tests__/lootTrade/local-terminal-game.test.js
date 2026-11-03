import { describe, expect, it } from 'vitest';
import {
  applyLocalTerminalAction,
  buildLocalCharacterSnapshot,
  initialLocalTerminalState,
} from '../../components/lootTrade/localTerminalGame.js';

const terminal = {
  containerId: 'term-1',
  name: 'Vault console',
  description: '',
  difficulty: 2,
};
const characterSnapshot = buildLocalCharacterSnapshot({
  characterName: 'Оператор',
  attributes: { INT: { value: 6 } },
  skills: [],
  items: { digest: { itemId: 'mag_programmers_digest' } },
});
const ctx = { terminal, characterId: 'char-1', characterSnapshot, now: 1000, rng: () => 0 };

const start = () => applyLocalTerminalAction(initialLocalTerminalState(), 'start', undefined, ctx);

describe('local terminal mini-game fallback', () => {
  it('starts a real board without a room-server terminal protocol', () => {
    const state = start();
    expect(state.error).toBeNull();
    expect(state.view.status).toBe('playing');
    expect(state.view.board).toHaveLength(408);
    expect(state.view.wordRanges.length).toBeGreaterThan(0);
    expect(state.view.wordRanges[0].word).toHaveLength(6);
    expect(state.view.password).toBeUndefined();
    expect(state.game.password).toBeTruthy();
    expect(state.view.operatorName).toBe('Оператор');
  });

  it('decrements attempts on a wrong guess and grants access on the password', () => {
    let state = start();
    const wrong = state.game.wordRanges.find((entry) => !entry.isPassword);
    state = applyLocalTerminalAction(state, 'guess', wrong.id, ctx);
    expect(state.error).toBeNull();
    expect(state.view.attempts).toBe(3);
    expect(state.view.guesses).toEqual([{ word: wrong.word, likeness: expect.any(Number) }]);

    const passwordRange = state.game.wordRanges.find((entry) => entry.isPassword);
    state = applyLocalTerminalAction(state, 'guess', passwordRange.id, ctx);
    expect(state.view.status).toBe('won');
    expect(state.view.result).toBe('ACCESS GRANTED');
  });

  it('offers the Programmer’s Digest before locking the terminal', () => {
    let state = start();
    for (let i = 0; i < 4; i += 1) {
      const dud = state.game.wordRanges.find((entry) => !entry.isPassword && !entry.removed && !entry.guessed);
      state = applyLocalTerminalAction(state, 'guess', dud.id, ctx);
    }
    expect(state.view.status).toBe('pendingDigest');
    state = applyLocalTerminalAction(state, 'useDigest', undefined, ctx);
    expect(state.usedDigest).toBe(true);
    expect(state.view.status).toBe('playing');
    expect(state.view.attempts).toBe(1);
  });

  it('keeps the board after an invalid guess and starts a fresh game on hack', () => {
    let state = start();
    state = applyLocalTerminalAction(state, 'guess', 'does-not-exist', ctx);
    expect(state.error).toBe('TERMINAL_INVALID_GUESS');
    expect(state.view.status).toBe('playing');
    const fresh = start();
    expect(fresh.view.status).toBe('playing');
    expect(fresh.view.revision).toBe(1);
  });
});
