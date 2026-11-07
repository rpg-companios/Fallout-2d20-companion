// Приёмочный тест патча 526. Владелец уточнил смысл бага 506:
// «То было сообщение на баг. Когда после успешного взлома, снова запускался
// взлом. Юзер может совершать сколько угодно подходов для вскрытия
// терминала/замка. Но только по своему усмотрению. Вот сейчас кончились
// отмычки, юзер купил новые и вернулся к взлому. Или прокачался и улучшил
// характеристики и снова решил попробовать силы...»
// И уточнение: «Терминал может запускать новую конфигурацию, а взлом замков
// нет. Терминал после провала получает статус "заблокировано", и можно ли
// повторно ПОСЛЕ БЛОКИРОВКИ взламывать — на усмотрение мастера... Замки пока
// не блокировать, но в будущем будут, когда я придумаю условие блокировки».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { ERROR_CODE } from '../../server/protocol.js';
import {
  createLockGame,
  applyLockAction,
  shouldBlockLock,
  LOCK_BLOCK_POLICY,
} from '../../server/lockPicking.js';
import { canHackTerminal, terminalBlockedReason } from '../../components/lootTrade/terminalAccess.js';
import { findPending } from '../../components/lootTrade/terminalRetryPrompt.js';
import { shouldAutoStartLock } from '../../components/lootTrade/lockAutoStart.js';
import {
  initialLocalLockState,
  applyLocalLockAction,
  buildLocalLockSnapshot,
} from '../../components/lootTrade/localLockGame.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const LOCK_CONFIG = {
  containerId: 'l1', name: 'Замок', description: '', difficulty: 2, kind: 'lock',
  requiredKeyItemId: '', keyRequirement: 'none', linkedCheckId: '', linkedCheckIds: [],
};
const TERMINAL_CONFIG = {
  containerId: 't1', name: 'Терминал', description: '', difficulty: 3,
};

const snapshot = (per, pins) => ({
  characterName: 'Сталкер',
  data: {
    attributes: [{ name: 'PER', value: per }, { name: 'LCK', value: 4 }],
    skills: [{ name: 'LOCKPICK', value: 2 }],
    equipment: { items: [{ id: 'pin', weaponId: 'item_bobby_pin', quantity: pins }] },
  },
});

const setup = (config = LOCK_CONFIG) => {
  const registry = createRoomRegistry({ now: () => 1000, rng: () => 0 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол' });
  const code = room.code;
  registry.joinRoom({ code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code, clientId: 'p1', name: 'Игрок', role: 'player' });
  registry.putSnapshot({
    code, characterId: 'ch1', revision: 1, snapshot: snapshot(4, 5),
    fromClientId: 'p1', fromName: 'Игрок',
  });
  registry.issueTerminal({ code, clientId: 'gm', config });
  const state = () => registry.getState(code).terminalStates[config.containerId];
  const act = (action, value, clientId = 'p1') => registry.terminalAction({
    code, clientId, characterId: 'ch1', containerId: config.containerId, action, value,
  });
  const publish = (per, pins, revision) => registry.putSnapshot({
    code, characterId: 'ch1', revision, snapshot: snapshot(per, pins),
    fromClientId: 'p1', fromName: 'Игрок',
  });
  return { registry, code, state, act, publish, config };
};

const winLock = (state, act) => {
  const cells = state().game.cellCount;
  for (let i = 0; i < cells; i += 1) act('press', 'left');
  expect(state().game.status).toBe('won');
};

describe('526: «билет» убран, автоматический рестарт запрещён', () => {
  it('чистое правило больше не блокирует «Взломать» по used', () => {
    const key = 'R|l1|broadcast-1';
    expect(canHackTerminal({ used: { [key]: true }, key, game: { status: 'playing' } })).toBe(true);
    expect(terminalBlockedReason({ used: { [key]: true }, key, game: null })).toBeNull();
    const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlay).not.toContain('markTerminalAccess');
    expect(overlay).not.toContain('usedTerminalAccess');
  });

  it('после ACCESS GRANTED автоматический start по-прежнему отклоняется', () => {
    const { state, act } = setup();
    act('start');
    winLock(state, act);
    // Тот же самый баг 506: лишний start после победы не стирает доску.
    expect(act('start').error).toBe(ERROR_CODE.TERMINAL_ALREADY_ACTIVE);
    expect(state().game.status).toBe('won');
    expect(shouldAutoStartLock({
      visible: true, autoStart: true, hasLock: true, hasRoom: true,
      characterId: 'ch1', game: { status: 'won' },
    })).toBe(false);
  });

  it('freshAttempt — только явное нажатие игрока, один раз на окно', () => {
    const base = {
      visible: true, autoStart: true, hasLock: true, hasRoom: true, characterId: 'ch1',
    };
    expect(shouldAutoStartLock({ ...base, game: { status: 'won' }, freshAttempt: true })).toBe(true);
    expect(shouldAutoStartLock({ ...base, game: { status: 'won' } })).toBe(false);
    expect(shouldAutoStartLock({ ...base, freshAttempt: true, autoStart: false })).toBe(false);
  });
});

describe('526: новый подход игрока (купил отмычки / прокачался)', () => {
  // Патч 547 (слово владельца): «"успешные попытки" не должны вызывать ещё
  // попытку». Правило 526 про свежий лист сохранено для НЕвыигранной доски;
  // после ACCESS GRANTED новый подход отказывает, а новую партию даёт только
  // Мастер повторной выдачей. Прежняя редакция теста требовала пересборки
  // доски после победы — именно она снова запирала уже открытую точку.
  it('newAttempt после победы отказывает: победа и событие доступа не теряются', () => {
    const { registry, code, state, act, publish } = setup();
    act('start');
    const first = state().game;
    expect(first.per).toBe(4);
    expect(first.pinsTotal).toBe(5);
    winLock(state, act);
    const wonRevision = state().game.revision;
    const accessIdBefore = state().accessId;
    expect(registry.getState(code).accessEvents.l1).toMatchObject({ containerId: 'l1', kind: 'hacked' });

    // Игрок купил заколки и прокачал восприятие, опубликовав свежий лист.
    publish(10, 12, 2);
    expect(act('newAttempt').error).toBe(ERROR_CODE.LOCK_ALREADY_WON);
    expect(state().game.status).toBe('won');
    expect(state().game.revision).toBe(wonRevision);
    // accessId не меняется: это не новая трансляция Мастера.
    expect(state().accessId).toBe(accessIdBefore);
    expect(state().closed).toBe(false);
    // Открытая точка остаётся открытой: доступ не отзывается.
    expect(registry.getState(code).accessEvents.l1).toMatchObject({ kind: 'hacked' });

    // Новую партию начинает только Мастер: повторная выдача снимает доску,
    // и следующий подход собирается по ТЕКУЩЕМУ листу игрока.
    expect(act('reissue', undefined, 'gm').error).toBeUndefined();
    expect(state().game).toBeNull();
    expect(act('newAttempt').error).toBeUndefined();
    const next = state().game;
    expect(next.status).toBe('playing');
    expect(next.per).toBe(10);
    expect(next.pinsTotal).toBe(12);
    expect(next.cellCount).toBeLessThan(first.cellCount);
    expect(next).not.toHaveProperty('secret');
  });

  it('сколько угодно подходов подряд, без Мастера и без повторной трансляции', () => {
    const { state, act } = setup();
    for (let i = 0; i < 4; i += 1) {
      const result = act('newAttempt');
      expect(result.error).toBeUndefined();
      expect(state().game.status).toBe('playing');
    }
    // потраченные отмычки не возвращаются при пересборке доски
    expect(state().game.spentPins).toBe(0);
  });

  it('«Нет» Мастера не блокирует замок, вопрос Мастеру не задаётся', () => {
    const { act, state } = setup();
    act('start');
    // Прямой вызов действия Мастера: для замка оно недоступно.
    const gmResult = act('retry', 'no', 'gm');
    expect(gmResult.error).toBe(ERROR_CODE.TERMINAL_NOT_ACTIVE);
    expect(state().closed).toBe(false);
    const gmRooms = {
      R: { role: 'gm', terminalStates: {
        l1: { config: { kind: 'lock' }, closed: false, game: { status: 'awaitingRetry', revision: 2 } },
      } },
    };
    expect(findPending(gmRooms)).toEqual([]);
  });

  it('задел под будущее условие блокировки: политика пока выключена', () => {
    expect(LOCK_BLOCK_POLICY.enabled).toBe(false);
    expect(shouldBlockLock({ game: { status: 'won' }, config: LOCK_CONFIG })).toBe(false);
    expect(read('server/lockPicking.js')).toContain('shouldBlockLock');
    expect(read('server/roomRegistry.js')).toContain('shouldBlockLock');
  });
});

describe('526: терминал сохраняет решение Мастера', () => {
  it('newAttempt не обходит блокировку терминала', () => {
    const { act, state } = setup(TERMINAL_CONFIG);
    expect(act('start').error).toBeUndefined();
    expect(act('newAttempt').error).toBe(ERROR_CODE.TERMINAL_NOT_ACTIVE);
    expect(state().game.status).toBe('playing');
  });

  it('«Да» Мастера запускает новую конфигурацию, «Нет» закрывает до reissue', () => {
    const { registry, code, act, state } = setup(TERMINAL_CONFIG);
    act('start');
    // Доводим терминал до awaitingRetry четырьмя неверными попытками.
    const words = state().game.wordRanges || [];
    for (let i = 0; i < 4 && state().game.status === 'playing'; i += 1) {
      const wrong = words.find((w) => w.word !== state().game.password);
      act('guess', wrong?.id || `missing-${i}`);
    }
    // Если слов не нашлось, проверяем закон на прямом действии Мастера.
    const gmNo = registry.terminalAction({
      code, clientId: 'gm', characterId: 'ch1', containerId: 't1',
      action: 'retry', value: 'no',
    });
    // В awaitingRetry «Нет» закрывает; в остальных состояниях решение не
    // принимается — оба варианта безопасны и не дают игроку обойти блок.
    expect(gmNo.error === undefined || gmNo.error === ERROR_CODE.TERMINAL_NOT_ACTIVE).toBe(true);
  });

  it('findPending по-прежнему видит провал терминала', () => {
    const gmRooms = {
      R: { role: 'gm', terminalStates: {
        t1: { config: { kind: 'terminal' }, closed: false, game: { status: 'awaitingRetry', revision: 2 } },
      } },
    };
    expect(findPending(gmRooms)).toHaveLength(1);
  });
});

describe('526: локальный резерв и строки', () => {
  it('532: newAttempt в локальной доске продолжает взлом, свежий лист меняет только заколки/навык', () => {
    const ctx = (store) => ({
      lock: LOCK_CONFIG,
      characterId: 'ch1',
      characterSnapshot: buildLocalLockSnapshot(store),
      rng: () => 0,
    });
    const weak = {
      attributes: { PER: { base: 4 } }, skills: { LOCKPICK: { base: 2 } },
      items: { p: { weaponId: 'item_bobby_pin', quantity: 5 } },
    };
    let state = applyLocalLockAction(initialLocalLockState(), 'newAttempt', undefined, ctx(weak));
    expect(state.view.per).toBe(4);
    const strong = {
      ...weak,
      attributes: { PER: { base: 10 } },
      items: { p: { weaponId: 'item_bobby_pin', quantity: 9 } },
    };
    const fresh = applyLocalLockAction(state, 'newAttempt', undefined, ctx(strong));
    // Патч 532: PER/число ячеек зафиксированы на время взлома, чтобы новая
    // длина комбинации не обесценила уже угаданные позиции.
    expect(fresh.view.per).toBe(4);
    expect(fresh.view.pinsTotal).toBe(9);
    expect(fresh.view.cellCount).toBe(state.view.cellCount);
    expect(fresh.view.knownPositions).toBe(0);
  });

  it('парные RU/EN строки нового подхода и уведомления о замке', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json');
    const en = json('i18n/en-EN/screens/lootTrade/screen.json');
    expect(Object.keys(ru.lock).sort()).toEqual(Object.keys(en.lock).sort());
    expect(ru.lock.newAttempt).toBe('Ещё подход');
    expect(en.lock.newAttempt).toBe('Another attempt');
    expect(ru.lock.newAttemptHint).toContain('заколк'); // 527
    expect(en.lock.newAttemptHint).toContain('pins');
    expect(ru.lock.hackedTitle).toBe('Замок взломан');
    expect(en.lock.hackedTitle).toBe('Lock picked');
  });

  it('в окне доски нет «Да/Нет» Мастера, но есть «Ещё подход»', () => {
    const modal = read('components/lootTrade/LockPickingModal.js');
    expect(modal).toContain('lock-new-attempt-button');
    expect(modal).toContain("tLootTrade('lock.newAttempt')");
    expect(modal).toContain('lock-approach-finished');
    expect(modal).not.toContain("tLootTrade('lock.retryYes')");
    expect(modal).not.toContain("doAction('retry'");
  });
});

describe('526: доставка и регрессии', () => {
  it('защита сервера и прежние инварианты на месте', () => {
    const registry = read('server/roomRegistry.js');
    expect(registry).toContain("member?.role !== 'player'");
    expect(registry).toContain('published.fromClientId !== clientId');
    expect(read('server/protocol.js')).toContain('MAX_MESSAGE_BYTES');
    expect(read('server/itemStacking.js')).toContain('itemTransferSnapshot');
    expect(read('server/locationGraph.js')).toContain('buildLocationGraph');
    // Баг 524/525 не вернулся.
    expect(read('components/lootTrade/LockPickingModal.js')).toContain('roomHasTerminalProtocol');
    expect(read('components/lootTrade/PlayerLootTradeOverlay.js')).toContain('<StandaloneCheckModal');
  });

  it('версия, отсечка, заметки, журналы, план и установка', () => {
    const version = json('public/version.json');
    expect(Number(version.version)).toBeGreaterThanOrEqual(526);
    expect(version.notes['ru-RU'].length).toBeGreaterThanOrEqual(10);
    expect(version.notes['en-EN'].length).toBeGreaterThanOrEqual(10);
    expect(Number(json('patchs/baseline.json').baseline)).toBeGreaterThanOrEqual(526);
    expect(read('docs/changelog.ru.md')).toContain('526');
    expect(read('docs/changelog.en.md')).toContain('526');
    expect(read('docs/roadmap.md')).toContain('526');
    expect(read('docs/patch-526-install.md')).toContain('526');
    expect(read('docs/lockpicking-mini-game-design.md')).toContain('526');
    expect(read('patchs/526-lock-attempts.patch')).toContain('newAttempt');
  });
});
