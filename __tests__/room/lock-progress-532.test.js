// Приёмочный тест патча 532. Владелец: «И давай сделаем запоминание
// угаданных позиций? Сломанная заколка не лишает прогресса, всё ещё нужно
// закончить взлом, чтобы получить доступ или прерваться, если кончились
// заколки. Но прогресс не слетит. Просто когда маленькая ВОС, то сначала
// много времени надо чтобы угадать последовательность, а потом ещё куча
// времени на повторение».
//
// Уточнения владельца (ответы на вопросы): прогресс живёт НА ВЕСЬ ВЗЛОМ
// ТОЧКИ (поломка, «кончились заколки», «Ещё подход», повторное открытие окна);
// сбрасывается ACCESS GRANTED или повторной выдачей Мастера; принадлежит не
// оператору, а точке — общий для всех игроков, включая привязанные комнаты.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { ERROR_CODE } from '../../server/protocol.js';
import {
  ARROWS,
  CELL_STATE,
  createLockGame,
  applyLockAction,
  resumeLockGame,
  guessedLockPositions,
  isResumableLockGame,
  closeLockGame,
  publicLockGameState,
} from '../../server/lockPicking.js';
import {
  initialLocalLockState,
  saveLocalLockState,
  clearLocalLockState,
  applyLocalLockAction,
  buildLocalLockSnapshot,
} from '../../components/lootTrade/localLockGame.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const LOCK = {
  containerId: 'l1', name: 'Замок', description: '', difficulty: 0, kind: 'lock',
  requiredKeyItemId: '', keyRequirement: 'none', linkedCheckId: '', linkedCheckIds: [],
};

const snapshot = (per, luck, skill, pins) => ({
  characterName: 'Сталкер',
  data: {
    attributes: [{ name: 'PER', value: per }, { name: 'LCK', value: luck }],
    skills: [{ name: 'LOCKPICK', value: skill }],
    equipment: { items: [{ id: 'pin', weaponId: 'item_bobby_pin', quantity: pins }] },
  },
});

// rng 0 → секрет сплошь 'left'; rng 0.99 → спас-бросок Удачи НЕ срабатывает.
const press = (game, value, rng = () => 0.99) => applyLockAction({
  game, config: LOCK, action: 'press', value, rng,
}).game;
const correctAt = (game) => ARROWS[game.secret[game.cursor]];
const wrongAt = (game) => ARROWS[(game.secret[game.cursor] + 1) % ARROWS.length];

const newGame = (overrides = {}) => createLockGame({
  config: LOCK,
  characterSnapshot: snapshot(4, 4, 0, 5),
  rng: () => 0,
  ...overrides,
});

const setupRoom = ({ pins = 5, per = 4, luck = 4, skill = 0 } = {}) => {
  const registry = createRoomRegistry({ now: () => 1000, rng: () => 990 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол' });
  const code = room.code;
  registry.joinRoom({ code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code, clientId: 'p1', name: 'Игрок 1', role: 'player' });
  registry.joinRoom({ code, clientId: 'p2', name: 'Игрок 2', role: 'player' });
  registry.putSnapshot({
    code, characterId: 'ch1', revision: 1, snapshot: snapshot(per, luck, skill, pins),
    fromClientId: 'p1', fromName: 'Игрок 1',
  });
  registry.putSnapshot({
    code, characterId: 'ch2', revision: 1, snapshot: snapshot(per, luck, skill, pins),
    fromClientId: 'p2', fromName: 'Игрок 2',
  });
  registry.issueTerminal({ code, clientId: 'gm', config: LOCK });
  const act = (action, value, clientId = 'p1', characterId = 'ch1') => registry.terminalAction({
    code, clientId, characterId, containerId: 'l1', action, value,
  });
  const entry = () => registry._rooms.get(code).terminalStates.get('l1');
  const publish = (characterId, clientId, pinsLeft, revision = 2, perValue = per) => registry.putSnapshot({
    code, characterId, revision,
    snapshot: snapshot(perValue, luck, skill, pinsLeft),
    fromClientId: clientId, fromName: clientId === 'p1' ? 'Игрок 1' : 'Игрок 2',
  });
  return { registry, code, act, entry, publish };
};

describe('532: поломка заколки не стирает угаданные позиции', () => {
  it('курсор остаётся на первой неотгаданной ячейке, префикс сереет и виден', () => {
    let game = newGame();
    game = press(game, correctAt(game));
    game = press(game, correctAt(game));
    expect(game.cursor).toBe(2);
    expect(game.knownPositions).toBe(2);

    const secret = [...game.secret];
    const broken = press(game, wrongAt(game));
    expect(broken.brokenPins).toBe(1);
    expect(broken.result).toBe('PIN BROKEN');
    expect(broken.cursor).toBe(2);
    expect(broken.knownPositions).toBe(2);
    expect(broken.cells.slice(0, 2)).toEqual([
      { arrow: 'left', state: CELL_STATE.GREY },
      { arrow: 'left', state: CELL_STATE.GREY },
    ]);
    expect(broken.cells[2]).toEqual({ arrow: null, state: CELL_STATE.RED });
    expect(broken.secret).toEqual(secret);
    expect(broken.breakHighlight.durationMs).toBeGreaterThan(0);

    // Следующее нажатие сразу продолжает с ячейки 2 — повторять 0 и 1 не нужно.
    const continued = press(broken, correctAt(broken));
    expect(continued.cursor).toBe(3);
    expect(continued.knownPositions).toBe(3);
    expect(continued.cells[2]).toEqual({ arrow: 'left', state: CELL_STATE.GREEN });
    expect(continued.cells[0].state).toBe(CELL_STATE.GREY);
  });

  it('префикс из серых стрелок не теряется при следующей поломке', () => {
    let game = newGame();
    game = press(game, correctAt(game));
    game = press(game, wrongAt(game)); // поломка на ячейке 1
    expect(game.knownPositions).toBe(1);
    game = press(game, correctAt(game)); // ячейка 1 стала green
    game = press(game, wrongAt(game)); // поломка на ячейке 2
    expect(game.knownPositions).toBe(2);
    expect(game.cursor).toBe(2);
    expect(game.cells.slice(0, 2).every((c) => c.state === CELL_STATE.GREY)).toBe(true);
    expect(guessedLockPositions(game)).toEqual(['left', 'left']);
  });
});

describe('532: «Ещё подход» продолжает взлом, а не собирает новую доску', () => {
  it('тот же секрет и угаданный префикс, свежий лист меняет только заколки/навык/удачу', () => {
    let game = newGame();
    game = press(game, correctAt(game));
    game = press(game, correctAt(game));
    const secret = [...game.secret];
    const resumed = applyLockAction({
      game, config: LOCK, action: 'newAttempt',
      characterSnapshot: snapshot(10, 10, 6, 12), rng: () => 0,
    }).game;
    expect(resumed.secret).toEqual(secret);
    expect(resumed.cursor).toBe(2);
    expect(resumed.knownPositions).toBe(2);
    expect(resumed.cells.slice(0, 2).map((c) => c.state)).toEqual([
      CELL_STATE.GREY, CELL_STATE.GREY,
    ]);
    expect(resumed.pinsTotal).toBe(12);
    expect(resumed.skill).toBe(6);
    expect(resumed.luck).toBe(10);
    expect(resumed.luckSave).toBeCloseTo(0.2);
    // PER/сложность/длина комбинации зафиксированы на время взлома.
    expect(resumed.per).toBe(game.per);
    expect(resumed.cellCount).toBe(game.cellCount);
    expect(resumed.status).toBe('playing');
    expect(resumed.pinFailures).toBe(0);
    expect(resumed.revision).toBeGreaterThan(game.revision);
    expect(publicLockGameState(resumed)).not.toHaveProperty('secret');
  });

  it('кончились заколки → купили новые → продолжаем с того же места и выигрываем', () => {
    const { act, entry, publish } = setupRoom({ pins: 1, per: 10 });
    act('start');
    let game = entry().game;
    expect(game.cellCount).toBe(2);
    act('press', correctAt(game));
    const secret = [...entry().game.secret];
    act('press', wrongAt(entry().game));
    expect(entry().game.status).toBe('awaitingRetry');
    expect(entry().game.result).toBe('OUT OF PINS');
    expect(entry().game.knownPositions).toBe(1);

    publish('ch1', 'p1', 3);
    expect(act('newAttempt').error).toBeUndefined();
    const resumed = entry().game;
    expect(resumed.status).toBe('playing');
    expect(resumed.pinsTotal).toBe(3);
    expect(resumed.secret).toEqual(secret);
    expect(resumed.cursor).toBe(1);
    expect(resumed.knownPositions).toBe(1);
    // Одно верное нажатие завершает взлом: повторять префикс не потребовалось.
    act('press', correctAt(entry().game));
    expect(entry().game.status).toBe('won');
    expect(entry().game.result).toBe('ACCESS GRANTED');
  });

  it('победа и закрытие Мастером сбрасывают память: следующий взлом — новый секрет', () => {
    let game = newGame();
    while (game.status === 'playing') game = press(game, correctAt(game));
    expect(game.status).toBe('won');
    expect(isResumableLockGame(game)).toBe(false);
    const fresh = resumeLockGame({
      game, config: LOCK, characterSnapshot: snapshot(4, 4, 0, 5), rng: () => 0.9,
    });
    expect(fresh.secret).not.toEqual(game.secret);
    expect(fresh.knownPositions).toBe(0);
    expect(fresh.cursor).toBe(0);
    expect(fresh.cells.every((c) => c.state === CELL_STATE.HIDDEN)).toBe(true);

    const closed = closeLockGame(newGame(), { now: () => 1000 });
    expect(isResumableLockGame(closed)).toBe(false);
    expect(resumeLockGame({
      game: closed, config: LOCK, characterSnapshot: snapshot(4, 4, 0, 5), rng: () => 0.9,
    }).secret).not.toEqual(closed.secret);
  });

  it('после ACCESS GRANTED автоматический start по-прежнему запрещён (регрессия 505)', () => {
    const { act, entry } = setupRoom({ pins: 5, per: 10 });
    act('start');
    while (entry().game.status === 'playing') act('press', correctAt(entry().game));
    expect(entry().game.status).toBe('won');
    expect(act('start').error).toBe(ERROR_CODE.TERMINAL_ALREADY_ACTIVE);
    expect(entry().game.status).toBe('won');
  });
});

describe('532: прогресс точки общий для всех игроков', () => {
  it('другой персонаж продолжает ту же комбинацию через newAttempt', () => {
    const { act, entry } = setupRoom({ pins: 5, per: 10 });
    act('start');
    act('press', correctAt(entry().game));
    const secret = [...entry().game.secret];
    const known = entry().game.knownPositions;
    expect(act('newAttempt', undefined, 'p2', 'ch2').error).toBeUndefined();
    const shared = entry().game;
    expect(shared.secret).toEqual(secret);
    expect(shared.knownPositions).toBe(known);
    expect(shared.operatorClientId).toBe('p2');
    expect(shared.operatorCharacterId).toBe('ch2');
    expect(shared.status).toBe('playing');
    // Новый оператор может давить стрелки сразу с первой неотгаданной ячейки.
    expect(act('press', correctAt(entry().game), 'p2', 'ch2').error).toBeUndefined();
    expect(entry().game.cursor).toBe(known + 1);
  });

  it('start от другого персонажа тоже продолжает общий прогресс (а не пересобирает доску)', () => {
    const { act, entry } = setupRoom({ pins: 5, per: 10 });
    act('start');
    act('press', correctAt(entry().game));
    const secret = [...entry().game.secret];
    const result = act('start', undefined, 'p2', 'ch2');
    expect(result.error).toBeUndefined();
    expect(entry().game.secret).toEqual(secret);
    expect(entry().game.knownPositions).toBe(1);
    expect(entry().game.operatorCharacterId).toBe('ch2');
  });

  it('повторная выдача Мастером сбрасывает прогресс и даёт новый секрет', () => {
    const { registry, code, act, entry } = setupRoom({ pins: 5, per: 10 });
    act('start');
    act('press', correctAt(entry().game));
    const secret = [...entry().game.secret];
    const gm = registry.terminalAction({
      code, clientId: 'gm', characterId: 'ch1', containerId: 'l1', action: 'reissue',
    });
    expect(gm.error).toBeUndefined();
    expect(entry().game).toBeNull();
    expect(act('newAttempt').error).toBeUndefined();
    // Свежая доска: revision 1, пустой префикс, все ячейки скрыты.
    // (Секрет при фиксированном rng теста может совпасть случайно.)
    expect(entry().game.revision).toBe(1);
    expect(entry().game.knownPositions).toBe(0);
    expect(entry().game.cursor).toBe(0);
    expect(entry().game.cells.every((c) => c.state === CELL_STATE.HIDDEN)).toBe(true);
  });
});

describe('532: привязанные комнаты видят один и тот же прогресс', () => {
  it('доска копируется в связанную комнату, сброс Мастера тоже общий', () => {
    const registry = createRoomRegistry({ now: () => 1000, rng: () => 990 });
    const a = registry.createRoom({ clientId: 'gm-R1', name: 'A', requestedCode: 'R1' }).room;
    const b = registry.createRoom({ clientId: 'gm-R2', name: 'B', requestedCode: 'R2' }).room;
    for (const room of [a, b]) {
      registry.joinRoom({ code: room.code, clientId: `gm-${room.code}`, name: 'GM', role: 'gm' });
      registry.joinRoom({ code: room.code, clientId: `p-${room.code}`, name: 'Игрок', role: 'player' });
      registry.putSnapshot({
        code: room.code, characterId: `ch-${room.code}`, revision: 1,
        snapshot: snapshot(10, 4, 0, 5), fromClientId: `p-${room.code}`, fromName: 'Игрок',
      });
      registry.issueTerminal({ code: room.code, clientId: `gm-${room.code}`, config: LOCK });
    }
    registry.openSession({
      code: a.code, clientId: 'gm-R1',
      session: {
        sessionId: 'bound-532', containerId: 'hub', kind: 'hub', name: 'Бункер',
        targetType: 'room', roomCodes: [a.code, b.code, 'R3'],
        nodes: [{ containerId: 'l1', kind: 'lock', name: 'Замок', difficulty: 0 }],
      },
    });
    const inA = (action, value) => registry.terminalAction({
      code: a.code, clientId: 'p-R1', characterId: 'ch-R1', containerId: 'l1', action, value,
    });
    const inB = (action, value) => registry.terminalAction({
      code: b.code, clientId: 'p-R2', characterId: 'ch-R2', containerId: 'l1', action, value,
    });
    const gameA = () => registry.getRoom(a.code).terminalStates.get('l1').game;
    const gameB = () => registry.getRoom(b.code).terminalStates.get('l1').game;

    expect(inA('start').error).toBeUndefined();
    const secret = [...gameA().secret];
    inA('press', correctAt(gameA()));
    expect(gameB()).toBeTruthy();
    expect(gameB().secret).toEqual(secret);
    expect(gameB().knownPositions).toBe(1);
    expect(gameB().cells[0].state).toBe(CELL_STATE.GREEN);

    // Комната, которой точку выдали ПОЗЖЕ, подхватывает уже идущий взлом.
    const c = registry.createRoom({ clientId: 'gm-R3', name: 'C', requestedCode: 'R3' }).room;
    registry.joinRoom({ code: c.code, clientId: 'gm-R3', name: 'GM', role: 'gm' });
    registry.joinRoom({ code: c.code, clientId: 'p-R3', name: 'Игрок', role: 'player' });
    registry.putSnapshot({
      code: c.code, characterId: 'ch-R3', revision: 1,
      snapshot: snapshot(10, 4, 0, 5), fromClientId: 'p-R3', fromName: 'Игрок',
    });
    registry.issueTerminal({ code: c.code, clientId: 'gm-R3', config: LOCK });
    const inC = (action, value) => registry.terminalAction({
      code: c.code, clientId: 'p-R3', characterId: 'ch-R3', containerId: 'l1', action, value,
    });
    const gameC = () => registry.getRoom(c.code).terminalStates.get('l1').game;
    expect(inC('start').error).toBeUndefined();
    expect(gameC().secret).toEqual(secret);
    expect(gameC().knownPositions).toBe(1);

    // Игрок из второй комнаты продолжает ту же комбинацию.
    expect(inB('newAttempt').error).toBeUndefined();
    expect(gameB().secret).toEqual(secret);
    expect(gameB().knownPositions).toBe(1);
    expect(gameA().secret).toEqual(secret);
    expect(gameA().knownPositions).toBe(1);
    while (gameB().status === 'playing') inB('press', correctAt(gameB()));
    expect(gameB().status).toBe('won');
    expect(gameA().status).toBe('won');
    expect(registry.getAccessEvents(a.code).l1).toMatchObject({ kind: 'hacked' });
    expect(registry.getAccessEvents(b.code).l1).toMatchObject({ kind: 'hacked' });

    // Повторная выдача Мастером очищает память в ОБЕИХ комнатах.
    expect(registry.terminalAction({
      code: a.code, clientId: 'gm-R1', characterId: 'ch-R1', containerId: 'l1', action: 'reissue',
    }).error).toBeUndefined();
    expect(gameA()).toBeNull();
    expect(gameB()).toBeNull();
    expect(inB('newAttempt').error).toBeUndefined();
    expect(gameB().revision).toBe(1);
    expect(gameB().knownPositions).toBe(0);
    expect(gameB().cursor).toBe(0);
    expect(gameB().cells.every((c) => c.state === CELL_STATE.HIDDEN)).toBe(true);
  });
});

describe('532: локальный резерв помнит доску между открытиями окна', () => {
  it('initialLocalLockState поднимает сохранённую доску, победа очищает память', () => {
    const id = 'local-532';
    clearLocalLockState(id);
    const store = {
      attributes: { PER: { base: 10 } }, skills: { LOCKPICK: { base: 0 } },
      items: { p: { weaponId: 'item_bobby_pin', quantity: 5 } },
    };
    const ctx = {
      lock: LOCK, characterId: 'ch1',
      characterSnapshot: buildLocalLockSnapshot(store), rng: () => 0,
    };
    let state = applyLocalLockAction(initialLocalLockState(id), 'start', undefined, ctx);
    state = applyLocalLockAction(state, 'press', correctAt(state.game), ctx);
    saveLocalLockState(id, state);
    const restored = initialLocalLockState(id);
    expect(restored.game.secret).toEqual(state.game.secret);
    expect(restored.game.cursor).toBe(1);
    expect(restored.game.knownPositions).toBe(1);
    const resumed = applyLocalLockAction(restored, 'newAttempt', undefined, ctx);
    expect(resumed.game.secret).toEqual(state.game.secret);
    expect(resumed.game.knownPositions).toBe(1);

    let won = resumed;
    while (won.game.status === 'playing') {
      won = applyLocalLockAction(won, 'press', correctAt(won.game), ctx);
    }
    saveLocalLockState(id, won);
    expect(initialLocalLockState(id).game).toBeNull();
    clearLocalLockState(id);
  });
});

describe('532/534: строки, документы и версия', () => {
  it('534 вернул подсказки под механику сохранения позиций, RU/EN пары равны', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json').lock;
    const en = json('i18n/en-EN/screens/lootTrade/screen.json').lock;
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    expect(ru.arrowsHint).toContain('сохраняются');
    expect(ru.arrowsHint).not.toContain('начать сначала');
    expect(en.arrowsHint).toContain('bobby pin breaks');
    expect(en.arrowsHint).toContain('solved positions are kept');
    expect(ru.greyHint).toContain('сохраняются');
    expect(en.greyHint).toContain('already solved');
    expect(ru.progressSaved).toContain('{count}');
    expect(en.progressSaved).toContain('{count}');
    expect(ru.newAttemptHint).toContain('сохраняются');
    expect(en.newAttemptHint).toContain('solved positions are kept');
    expect(JSON.stringify(ru)).not.toMatch(/отмычк|шпильк|булавк/i);
  });

  it('534 вернул счётчик с серыми ячейками и строку о сохранённом прогрессе', () => {
    const modal = read('components/lootTrade/LockPickingModal.js');
    expect(modal).toContain('CELL_STATE.GREY');
    expect(modal).toContain('lock-progress-saved');
    expect(modal).toContain("tLootTrade('lock.progressSaved')");
    expect(modal).toContain('saveLocalLockState');
    expect(modal).toContain('initialLocalLockState(containerId)');
    // Перенос длинного описания тоже возвращён (патч 536: отдельный блок правил).
    expect(modal).toContain('testID="lock-rules-block"');
    const styles = read('components/lootTrade/lockPickingStyles.js');
    expect(styles).toContain('rulesBlock:');
    expect(styles).toContain('flexShrink: 1');
  });

  it('движок, реестр, локальный резерв и сетевой слой используют один закон', () => {
    expect(read('server/lockPicking.js')).toContain('resumeLockGame');
    expect(read('server/roomRegistry.js')).toContain('resumeLockGame');
    expect(read('server/roomRegistry.js')).toContain('propagateLockGame');
    expect(read('server/roomServer.js')).toContain('broadcastTerminalRooms');
    expect(read('components/lootTrade/localLockGame.js')).toContain('resumeLockGame');
    expect(read('components/lootTrade/localLockGame.js')).toContain('localBoards');
    // Закон снимка 529: сервер по-прежнему не правит опубликованный лист.
    expect(read('server/roomRegistry.js')).toContain('pinsToSpend');
    // Единственный писатель снимка — putSnapshot (закон 529).
    expect(read('server/roomRegistry.js').match(/room\.lastSnapshots\.set\(/g)).toHaveLength(1);
  });

  it('версия, отсечка установщика, roadmap и файл патча на месте', () => {
    const version = json('public/version.json');
    expect(version.version).toBe('561');
    expect(version.release).toBe(5);
    expect(version.notes['ru-RU']).toHaveLength(10);
    expect(version.notes['en-EN']).toHaveLength(10);
    expect(json('patchs/baseline.json').baseline).toBe('561');
    expect(read('patchs/532-lock-progress.patch')).toContain('resumeLockGame');
    expect(read('patchs/533-rollback-ui.patch')).toContain('borderWidth: 1.5');
    expect(read('patchs/534-restore-lock-ui.patch')).toContain('lock-progress-saved');
    expect(read('patchs/535-gm-decision.patch')).toContain('gm.decisionRequest');
    expect(read('patchs/536-lock-status-blocks.patch')).toContain('lock-rules-block');
    expect(read('patchs/537-location-level-design.patch')).toContain('location-level-design');
    expect(read('patchs/538-location-structure-admin.patch')).toContain('accessExpression');
    expect(read('patchs/539-hub-folder-tree.patch')).toContain('HubTreeView');
    expect(read('patchs/540-nested-location-params.patch')).toContain('renderHubMeta');
    expect(read('patchs/541-hub-tree-parameters.patch')).toContain('hub-tree-parameters');
    expect(read('patchs/542-hub-player-window.patch')).toContain('hub-player-window');
    expect(read('patchs/543-passage-block.patch')).toContain('passage-blocked-screen');
    expect(read('patchs/544-hub-location-display.patch')).toContain('hub-location-display');
    expect(read('patchs/545-hub-order-drag.patch')).toContain('hub-order-drag');
    expect(read('patchs/546-location-lock-barrier.patch')).toContain('location-lock-barrier');
    expect(read('patchs/547-hack-success-signal.patch')).toContain('hack-success-signal');
    expect(read('patchs/548-admin-reorder-arrows.patch')).toContain('admin-reorder-arrows');
    expect(read('patchs/549-shared-drag-hook.patch')).toContain('useDragResponder');
    expect(read('patchs/550-pin-spend-stop.patch')).toContain('not-enough-pins');
    expect(read('patchs/551-educated-and-range.patch')).toContain('getSkillPointsAvailable');
    expect(read('patchs/552-educated-skill-debt.patch')).toContain('unlockSkillDistributionIfPointsPending');
    expect(read('patchs/553-range-table-fix.patch')).toContain('RANGE_ORDER');
    const roadmap = read('docs/roadmap.md');
    expect(roadmap).toContain('Текущая версия: **561**');
    expect(roadmap).toContain('| 28 |');
    expect(roadmap).toContain('| 29 |');
    expect(roadmap).toContain('| 30 |');
    expect(roadmap).toContain('| 31 |');
    expect(roadmap).toContain('| 32 |');
    expect(roadmap).toContain('| 33 |');
    expect(roadmap).toContain('Осталось после патча 553');
    expect(read('docs/patch-540-install.md')).toContain('540');
    expect(read('docs/patch-541-install.md')).toContain('541');
    expect(read('docs/patch-542-install.md')).toContain('542');
    expect(read('docs/patch-543-install.md')).toContain('543');
    expect(read('docs/patch-544-install.md')).toContain('544');
    expect(read('docs/patch-545-install.md')).toContain('545');
    expect(read('docs/patch-546-install.md')).toContain('546');
    expect(read('docs/patch-547-install.md')).toContain('547');
    expect(read('docs/patch-548-install.md')).toContain('548');
    expect(read('docs/patch-549-install.md')).toContain('549');
    expect(read('docs/patch-550-install.md')).toContain('550');
    expect(read('docs/patch-551-install.md')).toContain('551');
    expect(read('docs/patch-552-install.md')).toContain('552');
    expect(read('docs/patch-553-install.md')).toContain('553');
    expect(read('docs/location-level-design.md')).toContain('Переходы между локациями');
  });
});
