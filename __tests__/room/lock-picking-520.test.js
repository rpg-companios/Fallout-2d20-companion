// Приёмочный тест патча 520: мини-игра взлома замков как пятый вид точки.
// Владелец: «взлом замков можно назвать самостоятельно и он как и прочие
// эффекты может жить внутри локации или отдельно и может выступать преградой
// для другой локации/сундука/торговца. Взлом и терминал не могут одновременно
// блокировать локацию... считать эти требования как "или"».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARROWS,
  lockCellCount,
  lockRows,
  luckSaveChance,
  lockStats,
  effectiveDifficulty,
  createLockGame,
  publicLockGameState,
  applyLockAction,
  decodeLockNodeMarker,
} from '../../server/lockPicking.js';
import { resolveKeyAccess, linkedCheckIdsOf } from '../../server/keyAccess.js';
import { normalizeActiveSession, sanitizeSessionForMember } from '../../server/lootTradeSession.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import {
  CONTAINER_KIND,
  normalizeContainerEntity,
  normalizeLinkedCheckIds,
  buildHubSessionNodes,
  buildStandaloneLockSessionNode,
  resolveCheckSessionNode,
} from '../../domain/lootTrade.js';
import { ERROR_CODE } from '../../server/protocol.js';
import { ROOM_ERROR } from '../../src/room/roomProtocol';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const SNAPSHOT = {
  data: {
    attributes: { PER: { value: 10 }, LCK: { value: 4 } },
    skills: [{ name: 'LOCKPICK', value: 6 }],
    items: [{ itemId: 'item_bobby_pin', quantity: 20 }],
  },
};

const hub = () => normalizeActiveSession({
  name: 'Бункер', kind: 'hub', targetType: 'room',
  nodes: [
    { containerId: 't1', kind: 'terminal', name: 'Терминал', difficulty: 3 },
    { containerId: 'l1', kind: 'lock', name: 'Замок', difficulty: 5 },
    {
      containerId: 'c1', kind: 'loot', name: 'Сундук',
      linkedCheckIds: ['t1', 'l1'],
      items: [{ entryId: 'e1', name: 'Патроны', quantity: 1 }],
    },
  ],
});

const setupRoom = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол', ownerToken: 'tok' });
  const code = room.code;
  registry.joinRoom({ code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code, clientId: 'p1', name: 'Игрок', role: 'player' });
  registry.putSnapshot({
    code, characterId: 'ch1', snapshot: SNAPSHOT, fromClientId: 'p1', fromName: 'Игрок',
  });
  registry.openSession({ code, clientId: 'gm', session: hub() });
  return { registry, code };
};

describe('520: формула ячеек и статы', () => {
  it('N = 12 − PER + 2·D, все четыре контрольные точки владельца', () => {
    expect(lockCellCount(10, 1)).toBe(4);
    expect(lockCellCount(4, 1)).toBe(10);
    expect(lockCellCount(10, 2)).toBe(6);
    expect(lockCellCount(4, 2)).toBe(12);
    expect(lockCellCount(4, 5)).toBe(18);
    expect(lockCellCount(10, 0)).toBe(2); // D0 только понижением
  });

  it('два ряда, когда ячеек больше восьми', () => {
    expect(lockRows(8)).toEqual([8]);
    expect(lockRows(10)).toEqual([5, 5]);
    expect(lockRows(18)).toEqual([9, 9]);
  });

  it('Удача 4 → 5%, Удача 10 → 20%, та же кривая что у терминала', () => {
    expect(luckSaveChance(4)).toBeCloseTo(0.05);
    expect(luckSaveChance(10)).toBeCloseTo(0.2);
    expect(read('server/terminalHacking.js')).toContain('0.05 + 0.025 * (clamp(Number(luck) || 4, 4, 10) - 4)');
  });

  it('PER, LCK, ранг LOCKPICK и отмычки читаются из снимка с обёрткой data', () => {
    const stats = lockStats(SNAPSHOT);
    expect(stats).toMatchObject({ per: 10, luck: 4, skill: 6, pins: 20 });
  });

  it('журнал «Замки сегодня» понижает сложность до 0, но не ниже', () => {
    const withMagazine = {
      ...SNAPSHOT,
      data: { ...SNAPSHOT.data, usedMagazineEffects: ['mag_tumblers_today_02'] },
    };
    expect(effectiveDifficulty({ difficulty: 1 }, lockStats(withMagazine))).toBe(0);
    expect(effectiveDifficulty({ difficulty: 5 }, lockStats(withMagazine))).toBe(4);
    expect(createLockGame({ config: { difficulty: 1 }, characterSnapshot: withMagazine, rng: () => 0 })
      .cellCount).toBe(2);
  });

  it('секрет не уходит игроку, доска делится на ряды', () => {
    const game = createLockGame({ config: { difficulty: 5 }, characterSnapshot: {
      ...SNAPSHOT, data: { ...SNAPSHOT.data, attributes: { PER: { value: 4 }, LCK: { value: 4 } } },
    }, rng: () => 0.42 });
    expect(game.cellCount).toBe(18);
    expect(game.rows).toEqual([9, 9]);
    expect(game.secret).toHaveLength(18);
    expect(publicLockGameState(game)).not.toHaveProperty('secret');
    expect(publicLockGameState(game).cells).toHaveLength(18);
  });
});

describe('520: механика нажатий и отмычек', () => {
  const newGame = (overrides = {}) => createLockGame({
    config: { difficulty: 1, name: 'Замок' },
    characterSnapshot: SNAPSHOT,
    rng: () => 0,
    ...overrides,
  });

  it('угадал по позиции → зелёная стрелка и курсор вперёд; провал остаётся в ячейке', () => {
    const game = newGame(); // rng 0 → secret сплошь 'left', 4 ячейки
    const right = applyLockAction({ game, config: game, action: 'press', value: 'up', rng: () => 0.99 });
    expect(right.game.cells[0].state).toBe('red');
    expect(right.game.cursor).toBe(0);
    expect(right.game.pinFailures).toBe(1); // навык 6 — отмычка держит
    const good = applyLockAction({ game: right.game, config: game, action: 'press', value: 'left', rng: () => 0.99 });
    expect(good.game.cells[0].state).toBe('green');
    expect(good.game.cursor).toBe(1);
  });

  it('полная комбинация даёт победу, успех не сбрасывается', () => {
    let game = newGame();
    for (let i = 0; i < game.cellCount; i += 1) {
      const res = applyLockAction({ game, config: game, action: 'press', value: 'left', rng: () => 0.99 });
      game = res.game;
    }
    expect(game.status).toBe('won');
    expect(game.result).toBe('ACCESS GRANTED');
    expect(applyLockAction({ game, config: game, action: 'press', value: 'left' }).error)
      .toBe('LOCK_NOT_ACTIVE');
  });

  it('поломка: зелёные стрелки сереют и остаются видны, комбинация та же', () => {
    const lowSkill = {
      data: {
        attributes: { PER: { value: 10 }, LCK: { value: 4 } },
        skills: [{ name: 'LOCKPICK', value: 0 }],
        items: [{ itemId: 'item_bobby_pin', quantity: 5 }],
      },
    };
    let game = createLockGame({ config: { difficulty: 1 }, characterSnapshot: lowSkill, rng: () => 0 });
    game = applyLockAction({ game, config: {}, action: 'press', value: 'left', rng: () => 0.99 }).game;
    expect(game.cells[0].state).toBe('green');
    const broken = applyLockAction({ game, config: {}, action: 'press', value: 'up', rng: () => 0.99 }).game;
    expect(broken.cells[0]).toEqual({ arrow: 'left', state: 'grey' });
    // Патч 527: ошибочный «?» остаётся КРАСНЫМ и на ходе с поломкой.
    expect(broken.cells[1]).toEqual({ arrow: null, state: 'red' });
    // Патч 532: курсор остаётся на первой неотгаданной ячейке — повторять
    // уже угаданный префикс больше не нужно.
    expect(broken.cursor).toBe(1);
    expect(broken.knownPositions).toBe(1);
    expect(broken.brokenPins).toBe(1);
    expect(broken.pinsRemaining).toBe(game.pinsRemaining - 1);
    expect(broken.secret).toEqual(game.secret);
  });

  it('Удача спасает отмычку в момент поломки, счётчик не сбрасывается', () => {
    const lowSkill = {
      data: {
        attributes: { PER: { value: 10 }, LCK: { value: 10 } },
        skills: [{ name: 'LOCKPICK', value: 0 }],
        items: [{ itemId: 'item_bobby_pin', quantity: 5 }],
      },
    };
    const game = createLockGame({ config: { difficulty: 1 }, characterSnapshot: lowSkill, rng: () => 0 });
    // rng() < 0.2 → спас-бросок удался
    const held = applyLockAction({ game, config: {}, action: 'press', value: 'up', rng: () => 0.01 }).game;
    expect(held.result).toBe('PIN HELD');
    expect(held.brokenPins).toBe(0);
    expect(held.pinFailures).toBe(0); // порог навыка 0 остаётся на месте
  });

  it('без отмычек игра сразу ждёт решения Мастера', () => {
    const empty = { data: { ...SNAPSHOT.data, items: [] } };
    const game = createLockGame({ config: { difficulty: 1 }, characterSnapshot: empty, rng: () => 0 });
    expect(game.status).toBe('awaitingRetry');
    expect(game.result).toBe('OUT OF PINS');
    expect(game.pinActive).toBe(false);
  });

  it('клиентская и серверная константы стрелок совпадают', () => {
    expect(read('components/lootTrade/lockPickingConstants.js')).toContain("['left', 'up', 'right', 'down']");
    expect(ARROWS).toEqual(['left', 'up', 'right', 'down']);
  });
});

describe('520: «ИЛИ» между терминалом и замком', () => {
  it('достаточно любого пройденного источника', () => {
    const req = { linkedCheckIds: ['t1', 'l1'] };
    expect(linkedCheckIdsOf(req)).toEqual(['t1', 'l1']);
    expect(resolveKeyAccess(req, { accessEvents: { t1: {} } }).state).toBe('open');
    expect(resolveKeyAccess(req, { accessEvents: { l1: {} } }).state).toBe('open');
    expect(resolveKeyAccess(req, { accessEvents: {} }).state).toBe('needs-check');
  });

  it('legacy linkedCheckId продолжает работать и не дублируется', () => {
    expect(linkedCheckIdsOf({ linkedCheckId: 't1' })).toEqual(['t1']);
    expect(linkedCheckIdsOf({ linkedCheckId: 't1', linkedCheckIds: ['t1', 'l1'] }))
      .toEqual(['t1', 'l1']);
  });

  it('обязательный ключ по-прежнему не обходится взломом', () => {
    expect(resolveKeyAccess(
      { requiredKeyItemId: 'k1', keyRequirement: 'required', linkedCheckIds: ['t1', 'l1'] },
      { accessEvents: { t1: {} } },
    ).state).toBe('denied');
  });

  it('у игроков скрыты ОБА источника, Мастер видит все три узла', () => {
    const session = hub();
    const player = sanitizeSessionForMember(session, { isGm: false });
    const gm = sanitizeSessionForMember(session, { isGm: true });
    expect(player.nodes.map((n) => n.containerId)).toEqual(['c1']);
    expect(gm.nodes.map((n) => n.containerId)).toEqual(['t1', 'l1', 'c1']);
    expect(gm.nodes[0].hiddenForPlayers).toBe(true);
    expect(gm.nodes[1].hiddenForPlayers).toBe(true);
  });

  it('взлом замка открывает сундук и отдаёт добычу', () => {
    const { registry, code } = setupRoom();
    const start = registry.terminalAction({
      code, clientId: 'p1', characterId: 'ch1', containerId: 'l1', action: 'start',
    });
    expect(start.error).toBeUndefined();
    const game = registry._rooms.get(code).terminalStates.get('l1').game;
    expect(game.kind).toBe('lock');
    expect(registry.getState(code).terminalStates.l1.game).not.toHaveProperty('secret');
    let last;
    for (const idx of game.secret) {
      last = registry.terminalAction({
        code, clientId: 'p1', characterId: 'ch1', containerId: 'l1',
        action: 'press', value: ARROWS[idx],
      });
    }
    expect(last.terminal.game.status).toBe('won');
    expect(registry.getAccessEvents(code).l1).toBeTruthy();
    const player = sanitizeSessionForMember(registry.getRoom(code).activeSession, { isGm: false });
    expect(player.nodes[0].locked).toBe(false);
    expect(player.nodes[0].items).toHaveLength(1);
    const take = registry.lootTake({
      code, clientId: 'p1',
      payload: { characterId: 'ch1', nodeContainerId: 'c1', takes: [{ entryId: 'e1', quantity: 1 }] },
    });
    expect(take.granted).toHaveLength(1);
  });

  it('победа терминала тоже открывает сундук — взлом замка не обязателен', () => {
    const { registry, code } = setupRoom();
    registry._rooms.get(code).terminalStates.get('t1').game = {
      status: 'won', operatorName: 'Игрок', revision: 1,
    };
    registry.recomputeKeyAccess(code);
    const player = sanitizeSessionForMember(registry.getRoom(code).activeSession, { isGm: false });
    expect(player.nodes[0].locked).toBe(false);
    expect(player.nodes[0].keyAccessState).toBe('open');
  });

  it('до победы добыча не выдаётся', () => {
    const { registry, code } = setupRoom();
    const take = registry.lootTake({
      code, clientId: 'p1',
      payload: { characterId: 'ch1', nodeContainerId: 'c1', takes: [{ entryId: 'e1', quantity: 1 }] },
    });
    expect(take.error).toBe(ERROR_CODE.CONTAINER_LOCKED);
  });

  it('527: сломанные заколки не возрождаются — они уходят из снимка листа', () => {
    const { registry, code } = setupRoom();
    const room = registry._rooms.get(code);
    // pinLedger теперь только диагностика: заколки читаются из листа, иначе
    // списание из инвентаря учитывалось бы дважды.
    room.pinLedger.set('ch1', 7);
    registry.terminalAction({
      code, clientId: 'p1', characterId: 'ch1', containerId: 'l1', action: 'start',
    });
    const first = room.terminalStates.get('l1').game;
    expect(first.pinsTotal).toBe(20);
    expect(first.spentPins).toBe(0);
    // Реальное списание: обновлённый лист содержит 13 заколок.
    registry.putSnapshot({
      code, characterId: 'ch1', revision: 2,
      snapshot: { data: { ...SNAPSHOT.data, items: [{ itemId: 'item_bobby_pin', quantity: 13 }] } },
      fromClientId: 'p1', fromName: 'Игрок',
    });
    registry.terminalAction({
      code, clientId: 'p1', characterId: 'ch1', containerId: 'l1', action: 'newAttempt',
    });
    const fresh = room.terminalStates.get('l1').game;
    expect(fresh.pinsTotal).toBe(13);
    expect(fresh.spentPins).toBe(0);
  });
});

describe('520: пятая карточка и документы', () => {
  it('замок — полноценный вид точки, самостоятельный и вложенный', () => {
    expect(CONTAINER_KIND.LOCK).toBe('lock');
    const standalone = normalizeContainerEntity({
      id: 'l1', kind: CONTAINER_KIND.LOCK, name: 'Замок', difficulty: 5,
      linkedCheckIds: ['t1', 'x1', 'x2'],
    });
    expect(standalone.kind).toBe('lock');
    expect(standalone.difficulty).toBe(5);
    expect(standalone.linkedCheckIds).toEqual(['t1', 'x1']); // максимум две строки
    expect(standalone.linkedCheckId).toBe('t1');
    const node = buildStandaloneLockSessionNode(standalone);
    expect(node.kind).toBe(CONTAINER_KIND.LOCK);
    expect(decodeLockNodeMarker(node.lockLabel).difficulty).toBe(5);
    expect(resolveCheckSessionNode({ ...node, kind: 'loot', difficulty: 0 }).isLock).toBe(true);

    const hubCard = normalizeContainerEntity({
      id: 'h1', kind: CONTAINER_KIND.HUB, name: 'Бункер',
      links: [{ containerId: 'l1' }],
    });
    const nodes = buildHubSessionNodes(hubCard, [standalone, hubCard]);
    expect(nodes[0].kind).toBe('lock');
    expect(nodes[0].linkedCheckIds).toEqual(['t1', 'x1']);
  });

  it('форма и экран Мастера показывают две строки и плитку создания', () => {
    const form = read('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
    expect(form).toContain('container-form-linked-check-rows');
    expect(form).toContain('linked-check-row-');
    expect(form).toContain("tLootTrade('form.linkedCheckOr')");
    expect(form).toContain('normalizeLinkedCheckIds');
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(screen).toContain('createLock');
    expect(screen).toContain("iconName=\"lock\"");
    expect(screen).toContain('form.linkedCheckLock');
    expect(screen).toContain("tLootTrade('card.gateOr')");
  });

  it('у игрока две строки вариантов с «или» и выбор модалки по типу', () => {
    const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlay).toContain('normalizeLinkedCheckIds(node)');
    expect(overlay).toContain('gate-option-');
    expect(overlay).toContain("tLootTrade('player.gateOr')");
    expect(overlay).toContain('<LockPickingModal');
    expect(overlay).toContain('CONTAINER_KIND.LOCK');
  });

  it('модалка замка берёт светлый каркас модалок, а не гамму терминала (525)', () => {
    const modal = read('components/lootTrade/LockPickingModal.js');
    // Владелец в 525 отказался от зелёного «терминала»: замок теперь светлый
    // и переиспользует lootTradeFormStyles, а не рисует базовые стили заново.
    expect(modal).toContain("from './lockPickingStyles'");
    expect(modal).toContain('modalStyles.card');
    expect(modal).not.toContain('terminalHackingStyles');
    expect(modal).not.toContain('StyleSheet.create');
    const shared = read('components/lootTrade/lockPickingStyles.js');
    expect(shared).toContain('lootTradeFormStyles');
    expect(shared).toContain('ADMIN_MODAL_PALETTE');
    // Терминал остался при своей гамме — менялась только мини-игра замка.
    expect(read('components/lootTrade/TerminalHackingModal.js'))
      .toContain('const styles = terminalHackingStyles;');
    expect(modal).toContain('lock-pins-count');
    expect(modal).toContain('lock-arrow-');
    expect(modal).toContain('lock-cells-board');
  });

  it('парные RU/EN строки мини-игры и коды ошибок', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json');
    const en = json('i18n/en-EN/screens/lootTrade/screen.json');
    expect(Object.keys(ru.lock).sort()).toEqual(Object.keys(en.lock).sort());
    expect(ru.lock.pins).toContain('{count}');
    expect(en.lock.pins).toContain('{count}');
    for (const key of ['LOCK_NOT_ACTIVE', 'LOCK_INVALID_ARROW', 'LOCK_NO_PINS']) {
      expect(ERROR_CODE[key]).toBe(key);
      expect(ROOM_ERROR[key]).toBe(key);
    }
  });

  it('план и версия обновлены до 520', () => {
    const plan = read('docs/roadmap.md');
    expect(plan).toContain('520');
    expect(plan).toContain('Осталось после патча');
    expect(read('docs/lockpicking-mini-game-design.md')).toContain('ИЛИ');
    // Номер версии растёт дальше: исторический тест не стопорит цепочку.
    const version = Number(json('public/version.json').version);
    expect(version).toBeGreaterThanOrEqual(520);
  });
});
