// Приёмочный тест патча 535. Владелец принял предложение: «пригодится единый
// штатный выход „Мастер решает" — тот же паттерн „Да/Нет", что уже есть у
// терминала, но доступный для любой спорной ситуации, чтобы не перечислять
// все исключения в правилах. Чтобы админ мог блокировать/открывать замки по
// своему усмотрению» + «Сейчас замки, но оставить место для манёвра».
//
// Ответы на уточняющие вопросы: одним патчем с пунктом 1 плана; оба пути
// (запрос игрока И ручной переключатель Мастера); «открыть» = сразу выдать
// доступ без взлома; общий каркас без гадания о будущих видах решений.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { ERROR_CODE, MESSAGE } from '../../server/protocol.js';
import {
  LOCK_BLOCK_POLICY,
  shouldBlockLock,
  gmWonLockGame,
} from '../../server/lockPicking.js';
import {
  findPendingGmDecisions,
  gmDecisionTextKeys,
} from '../../components/lootTrade/gmDecisionPrompt.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const LOCK = {
  containerId: 'l1', name: 'Замок', description: '', difficulty: 0, kind: 'lock',
  requiredKeyItemId: '', keyRequirement: 'none', linkedCheckId: '', linkedCheckIds: [],
};
const TERMINAL = {
  containerId: 't1', name: 'Терминал', description: '', difficulty: 0, kind: 'terminal',
  requiredKeyItemId: '', keyRequirement: 'none', linkedCheckId: '', linkedCheckIds: [],
};

const snapshot = (pins = 5) => ({
  characterName: 'Сталкер',
  data: {
    attributes: [{ name: 'PER', value: 4 }, { name: 'LCK', value: 4 }, { name: 'INT', value: 5 }],
    skills: [{ name: 'LOCKPICK', value: 0 }, { name: 'SCIENCE', value: 0 }],
    equipment: { items: [{ id: 'pin', weaponId: 'item_bobby_pin', quantity: pins }] },
  },
});

const setupOne = () => {
  const registry = createRoomRegistry({ now: () => 1000, rng: () => 990 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол' });
  const code = room.code;
  registry.joinRoom({ code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code, clientId: 'p1', name: 'Игрок', role: 'player' });
  registry.putSnapshot({
    code, characterId: 'ch1', revision: 1, snapshot: snapshot(),
    fromClientId: 'p1', fromName: 'Игрок',
  });
  registry.issueTerminal({ code, clientId: 'gm', config: LOCK });
  const act = (action, value, clientId = 'p1') => registry.terminalAction({
    code, clientId, characterId: 'ch1', containerId: 'l1', action, value,
  });
  const entry = () => registry._rooms.get(code).terminalStates.get('l1');
  return { registry, code, act, entry };
};

describe('535: «Мастер решает» — блокировка и открытие замка', () => {
  it('автоблокировка 526 не вернулась: только явный флаг Мастера', () => {
    expect(LOCK_BLOCK_POLICY.enabled).toBe(false);
    expect(shouldBlockLock({ game: { status: 'won' }, config: LOCK })).toBe(false);
    expect(shouldBlockLock({ game: null, config: LOCK, gmBlocked: true })).toBe(true);
    const won = gmWonLockGame(LOCK);
    expect(won.result).toBe('ACCESS GRANTED');
    expect(won.hackedByGm).toBe(true);
    expect(won.hackedByKey).toBe(false);
  });

  it('gmBlock / gmOpen — только Мастер; игрок не начинает взлом при блокировке', () => {
    const { registry, code, act, entry } = setupOne();
    expect(act('gmBlock', undefined, 'p1').error).toBe(ERROR_CODE.TERMINAL_GM_ONLY);
    expect(registry.terminalAction({
      code, clientId: 'gm', containerId: 'l1', action: 'gmBlock',
    }).error).toBeUndefined();
    expect(entry().gmBlocked).toBe(true);
    expect(act('start').error).toBe(ERROR_CODE.LOCK_BLOCKED);
    expect(act('newAttempt').error).toBe(ERROR_CODE.LOCK_BLOCKED);
    const opened = registry.terminalAction({
      code, clientId: 'gm', containerId: 'l1', action: 'gmOpen',
    });
    expect(opened.error).toBeUndefined();
    expect(opened.terminal.gmBlocked).toBe(false);
    expect(opened.terminal.game.status).toBe('won');
    expect(opened.terminal.game.hackedByGm).toBe(true);
    expect(registry.getAccessEvents(code).l1).toMatchObject({ kind: 'hacked', by: 'gm' });
  });

  it('запрос игрока → «Да/Нет» Мастера; «Да» открывает точку сразу', () => {
    const { registry, code, act, entry } = setupOne();
    registry.terminalAction({ code, clientId: 'gm', containerId: 'l1', action: 'gmBlock' });
    const request = { code, clientId: 'p1', containerId: 'l1', kind: 'lock.open', characterId: 'ch1' };
    const first = registry.requestGmDecision(request);
    expect(first.error).toBeUndefined();
    expect(first.decision.status).toBe('pending');
    expect(first.decision.requestedBy.characterId).toBe('ch1');
    // Повторное нажатие не плодит диалоги.
    expect(registry.requestGmDecision(request).decision.id).toBe(first.decision.id);
    expect(registry.getGmDecisions(code)).toHaveLength(1);
    // Решать может только владелец комнаты.
    expect(registry.resolveGmDecision({
      code, clientId: 'p1', decisionId: first.decision.id, value: 'yes',
    }).error).toBe(ERROR_CODE.GM_DECISION_GM_ONLY);

    const declined = registry.resolveGmDecision({
      code, clientId: 'gm', decisionId: first.decision.id, value: 'no',
    });
    expect(declined.error).toBeUndefined();
    expect(declined.decision.status).toBe('declined');
    expect(declined.granted).toBe(false);
    expect(entry().gmBlocked).toBe(true);
    expect(entry().game).toBeNull();
    expect(act('start').error).toBe(ERROR_CODE.LOCK_BLOCKED);

    const second = registry.requestGmDecision(request);
    expect(second.decision.id).not.toBe(first.decision.id);
    const approved = registry.resolveGmDecision({
      code, clientId: 'gm', decisionId: second.decision.id, value: 'yes',
    });
    expect(approved.error).toBeUndefined();
    expect(approved.granted).toBe(true);
    expect(approved.terminal.game.status).toBe('won');
    expect(approved.terminal.game.hackedByGm).toBe(true);
    expect(entry().gmBlocked).toBe(false);
    expect(registry.getAccessEvents(code).l1).toMatchObject({ kind: 'hacked', by: 'gm' });
    expect(registry.getGmDecisions(code).every((d) => d.status !== 'pending')).toBe(true);
    expect(registry.resolveGmDecision({
      code, clientId: 'gm', decisionId: second.decision.id, value: 'yes',
    }).error).toBe(ERROR_CODE.GM_DECISION_CLOSED);
  });

  it('виды решений расширяемы, но неизвестный вид не проходит на сервере', () => {
    const { registry, code } = setupOne();
    expect(registry.GM_DECISION_KINDS).toContain('lock.open');
    expect(registry.requestGmDecision({
      code, clientId: 'p1', containerId: 'l1', kind: 'invented.kind',
    }).error).toBe(ERROR_CODE.GM_DECISION_KIND);
    expect(gmDecisionTextKeys('lock.open').titleKey).toBe('gmDecision.lockOpenTitle');
    expect(gmDecisionTextKeys('future.kind').titleKey).toBe('gmDecision.genericTitle');
  });

  it('глобальный хост показывает вопрос только Мастеру и только нерешённый', () => {
    const rooms = {
      R1: { role: 'gm', gmDecisions: [
        { id: 'd1', status: 'pending', kind: 'lock.open', containerId: 'l1', name: 'Замок', requestedBy: { name: 'Игрок' } },
        { id: 'd2', status: 'approved', kind: 'lock.open', containerId: 'l1', name: 'Замок', requestedBy: { name: 'Игрок' } },
      ] },
      R2: { role: 'player', gmDecisions: [
        { id: 'd3', status: 'pending', kind: 'lock.open', containerId: 'l1', name: 'Замок', requestedBy: { name: 'Игрок' } },
      ] },
    };
    expect(findPendingGmDecisions(rooms, 'gm').map((d) => d.id)).toEqual(['d1']);
  });
});

describe('535: пункт 1 плана — общая доска и общий журнал доступа', () => {
  it('точки, доска терминала и события доступа видны во всех привязанных комнатах', () => {
    const registry = createRoomRegistry({ now: () => 1000, rng: () => 990 });
    const a = registry.createRoom({ clientId: 'gm-R1', name: 'A', requestedCode: 'R1' }).room;
    const b = registry.createRoom({ clientId: 'gm-R2', name: 'B', requestedCode: 'R2' }).room;
    for (const room of [a, b]) {
      registry.joinRoom({ code: room.code, clientId: `gm-${room.code}`, name: 'GM', role: 'gm' });
      registry.joinRoom({ code: room.code, clientId: `p-${room.code}`, name: 'Игрок', role: 'player' });
      registry.putSnapshot({
        code: room.code, characterId: `ch-${room.code}`, revision: 1, snapshot: snapshot(),
        fromClientId: `p-${room.code}`, fromName: 'Игрок',
      });
    }
    registry.issueTerminal({ code: a.code, clientId: 'gm-R1', config: LOCK });
    registry.openSession({
      code: a.code, clientId: 'gm-R1',
      session: {
        sessionId: 'bound-535', containerId: 'hub', kind: 'hub', name: 'Бункер',
        targetType: 'room', roomCodes: [a.code, b.code],
        nodes: [
          { containerId: 'l1', kind: 'lock', name: 'Замок', difficulty: 0 },
          { containerId: 't1', kind: 'terminal', name: 'Терминал', difficulty: 0 },
        ],
      },
    });
    // Обе точки зарегистрированы в ОБЕИХ комнатах, а не только доска замка.
    expect(registry.getState(b.code).terminalStates.l1).toBeTruthy();
    expect(registry.getState(b.code).terminalStates.t1).toBeTruthy();

    const started = registry.terminalAction({
      code: a.code, clientId: 'p-R1', characterId: 'ch-R1', containerId: 't1', action: 'start',
    });
    expect(started.error).toBeUndefined();
    const boardA = registry.getState(a.code).terminalStates.t1.game;
    const boardB = registry.getState(b.code).terminalStates.t1.game;
    expect(boardB).toBeTruthy();
    expect(boardB.wordRanges).toEqual(boardA.wordRanges);

    const opened = registry.terminalAction({
      code: a.code, clientId: 'gm-R1', containerId: 'l1', action: 'gmOpen',
    });
    expect(opened.error).toBeUndefined();
    expect(registry.getState(b.code).terminalStates.l1.game.status).toBe('won');
    expect(registry.getAccessEvents(a.code).l1).toMatchObject({ kind: 'hacked', by: 'gm-R1' });
    expect(registry.getAccessEvents(b.code).l1).toMatchObject({ kind: 'hacked', by: 'gm-R1' });
  });
});

describe('535: протокол, клиент, строки и документы', () => {
  it('сервер и клиентское зеркало знают три новых кадра и коды ошибок', () => {
    expect(MESSAGE.GM_DECISION_REQUEST).toBe('gm.decisionRequest');
    expect(MESSAGE.GM_DECISION_STATE).toBe('gm.decisionState');
    expect(MESSAGE.GM_DECISION_RESOLVE).toBe('gm.decisionResolve');
    const mirror = read('src/room/roomProtocol.ts');
    for (const needle of [
      'GM_DECISION_REQUEST', 'GM_DECISION_STATE', 'GM_DECISION_RESOLVE',
      'GM_DECISION_GM_ONLY', 'GM_DECISION_NOT_FOUND', 'GM_DECISION_KIND', 'GM_DECISION_CLOSED',
    ]) expect(mirror).toContain(needle);
    for (const key of [
      'GM_DECISION_GM_ONLY', 'GM_DECISION_NOT_FOUND', 'GM_DECISION_KIND', 'GM_DECISION_CLOSED',
    ]) expect(ERROR_CODE[key]).toBe(key);
  });

  it('хост смонтирован, игрок видит блокировку и кнопку запроса, Мастер — переключатель', () => {
    expect(read('App.js')).toContain('<GmDecisionPromptHost />');
    const modal = read('components/lootTrade/LockPickingModal.js');
    expect(modal).toContain('lock-gm-blocked');
    expect(modal).toContain('lock-ask-gm');
    expect(modal).toContain('requestGmDecision');
    expect(modal).toContain('terminalState?.gmBlocked');
    const admin = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(admin).toContain('setGmLockState');
    expect(admin).toContain('gm-block-');
    expect(admin).toContain('gm-open-');
    expect(read('src/room/roomStore.ts')).toContain('GM_DECISION_STATE');
    expect(read('server/roomServer.js')).toContain('MESSAGE.GM_DECISION_REQUEST');
    expect(read('server/roomRegistry.js')).toContain('syncSharedTerminalScope');
  });

  it('RU/EN строки парные, закон снимка 529 не нарушен', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json');
    const en = json('i18n/en-EN/screens/lootTrade/screen.json');
    for (const section of ['gmDecision', 'lock', 'livePanel']) {
      expect(Object.keys(ru[section]).sort()).toEqual(Object.keys(en[section]).sort());
    }
    expect(ru.gmDecision.lockOpenMessage).toContain('{requester}');
    expect(en.gmDecision.lockOpenMessage).toContain('{requester}');
    expect(JSON.stringify(ru.lock)).not.toMatch(/отмычк|шпильк|булавк/i);
    // Единственный писатель снимка — putSnapshot (529).
    expect(read('server/roomRegistry.js').match(/room\.lastSnapshots\.set\(/g)).toHaveLength(1);
  });

  it('версия, отсечка установщика, roadmap и файл патча на месте', () => {
    const version = json('public/version.json');
    expect(version.version).toBe('551');
    expect(version.release).toBe(4);
    expect(version.notes['ru-RU']).toHaveLength(150);
    expect(version.notes['en-EN']).toHaveLength(150);
    expect(json('patchs/baseline.json').baseline).toBe('551');
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
    const roadmap = read('docs/roadmap.md');
    expect(roadmap).toContain('Текущая версия: **551**');
    expect(roadmap).toContain('| 28 |');
    expect(roadmap).toContain('| 29 |');
    expect(roadmap).toContain('| 30 |');
    expect(roadmap).toContain('| 31 |');
    expect(roadmap).toContain('| 32 |');
    expect(roadmap).toContain('| 33 |');
    expect(roadmap).toContain('Осталось после патча 551');
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
    expect(read('docs/location-level-design.md')).toContain('Переходы между локациями');
  });
});
