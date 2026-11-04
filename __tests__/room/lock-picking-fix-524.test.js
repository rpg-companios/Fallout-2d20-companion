// Приёмочный тест патча 524: «нажал взлом — сходу "Действие не выполнено",
// отмычек нет, ячеек нет, стрелки не нажимаются, "Покинуть локацию" в модалке
// показывается и не работает».
//
// Причины, закрытые патчем: повторный start из-за accessId в ключе
// автозапуска, глухой отказ на штатные коды сервера, отмычки не находились в
// реальных формах инвентаря, у замка не было локального резерва (в отличие от
// терминала), а окно локации оставалось под модалкой мини-игры.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARROWS,
  countBobbyPins,
  lockStats,
  createLockGame,
  publicLockGameState,
} from '../../server/lockPicking.js';
import {
  initialLocalLockState,
  applyLocalLockAction,
  buildLocalLockSnapshot,
} from '../../components/lootTrade/localLockGame.js';
import {
  shouldAutoStartLock,
  autoStartLockKey,
} from '../../components/lootTrade/lockAutoStart.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const LOCK = { containerId: 'lock-1', name: 'Замок', difficulty: 2, kind: 'lock' };

// Реальные формы инвентаря: словарь items с ключом-экземпляром, массив
// equipment.items из сейва, itemSnapshot из торговца/склада.
const LIVE_STORE = {
  characterName: 'Сталкер',
  attributes: { PER: { base: 9 }, LCK: { base: 5 } },
  skills: { LOCKPICK: { base: 4 } },
  selectedSkills: [],
  usedMagazineEffects: [],
  items: {
    id_1701_a1: { id: 'id_1701_a1', weaponId: 'item_bobby_pin', quantity: 7 },
    id_1702_b2: { catalogId: 'item_bobby_pin', count: '3' },
    id_1703_c3: { name: 'Отмычка', code: 'item_bobby_pin', qty: 2 },
    id_1704_d4: { itemId: 'weapon_10mm', quantity: 1 },
  },
  equipment: { items: [{ id: 'item_bobby_pin', quantity: 4 }] },
};

describe('524: отмычки находятся в любом виде инвентаря', () => {
  it('itemId / catalogId / weaponId / code / ключ записи / вложенный снимок', () => {
    expect(countBobbyPins({ items: [{ itemId: 'item_bobby_pin', quantity: 2 }] })).toBe(2);
    expect(countBobbyPins({ items: { 'item_bobby_pin': { quantity: 3 } } })).toBe(3);
    expect(countBobbyPins({ equipment: { items: [
      { weaponId: 'item_bobby_pin', quantity: 5 },
      { code: 'item_bobby_pin', count: 1 },
    ] } })).toBe(6);
    expect(countBobbyPins({ inventory: [{ item: { id: 'item_bobby_pin', quantity: 4 } }] })).toBe(4);
    expect(countBobbyPins({ bag: [{ snapshot: { itemId: 'item_bobby_pin', quantity: 6 } }] })).toBe(6);
    expect(countBobbyPins({ items: [{ itemId: 'weapon_laser', quantity: 9 }] })).toBe(0);
  });

  it('один и тот же экземпляр в items и equipment.items не удваивается', () => {
    const source = {
      items: { pin1: { id: 'item_bobby_pin', quantity: 5 } },
      equipment: { items: [{ id: 'pin1', weaponId: 'item_bobby_pin', quantity: 5 }] },
    };
    expect(countBobbyPins(source)).toBe(5);
  });

  it('публикуемый снимок персонажа из data.* даёт PER, LCK, навык и отмычки', () => {
    const published = {
      data: {
        attributes: [{ name: 'PER', value: 9 }, { name: 'LCK', value: 5 }],
        skills: [{ name: 'LOCKPICK', value: 4 }],
        equipment: { items: [
          { id: 'item_bobby_pin', quantity: 10 },
          { weaponId: 'item_bobby_pin', quantity: 2 },
        ] },
      },
    };
    expect(lockStats(published)).toMatchObject({ per: 9, luck: 5, skill: 4, pins: 12 });
  });

  it('снимок живого стора персонажа собирает доску с отмычками и ячейками', () => {
    const snapshot = buildLocalLockSnapshot(LIVE_STORE);
    expect(lockStats(snapshot)).toMatchObject({ per: 9, luck: 5, skill: 4, pins: 12 });
    const game = createLockGame({ config: LOCK, characterSnapshot: snapshot, rng: () => 0 });
    expect(game.status).toBe('playing');
    expect(game.cellCount).toBeGreaterThan(0);
    expect(game.pinsTotal).toBe(12);
    expect(publicLockGameState(game)).not.toHaveProperty('secret');
  });
});

describe('524: локальный резерв доски замка', () => {
  const ctx = () => ({
    lock: LOCK,
    characterId: 'ch1',
    characterSnapshot: buildLocalLockSnapshot(LIVE_STORE),
    rng: () => 0,
  });

  it('start без сервера даёт ячейки, отмычки и доступные стрелки', () => {
    const started = applyLocalLockAction(initialLocalLockState(), 'start', undefined, ctx());
    expect(started.error).toBeNull();
    expect(started.view.status).toBe('playing');
    expect(started.view.cells).toHaveLength(started.view.cellCount);
    expect(started.view.pinsTotal).toBe(12);
    expect(started.view).not.toHaveProperty('secret');
    // rng = 0 → secret сплошь 'left'; четыре нажатия открывают замок.
    let state = started;
    for (let i = 0; i < started.view.cellCount; i += 1) {
      state = applyLocalLockAction(state, 'press', ARROWS[0], ctx());
    }
    expect(state.view.status).toBe('won');
    expect(state.view.result).toBe('ACCESS GRANTED');
  });

  it('поломка списывает отмычку в локальный ledger, «Да» собирает новую доску', () => {
    const low = {
      ...LIVE_STORE,
      skills: { LOCKPICK: { base: 0 } },
      items: { p1: { id: 'p1', weaponId: 'item_bobby_pin', quantity: 3 } },
      equipment: { items: [] },
    };
    const localCtx = {
      lock: LOCK, characterId: 'ch1',
      characterSnapshot: buildLocalLockSnapshot(low), rng: () => 0,
    };
    // rng = 0 задаёт секрет сплошь 'left', но Удача тогда всегда спасает
    // отмычку; для нажатий берём rng = 0.99, чтобы поломка состоялась.
    const pressCtx = { ...localCtx, rng: () => 0.99 };
    let state = applyLocalLockAction(initialLocalLockState(), 'start', undefined, localCtx);
    expect(state.view.pinsTotal).toBe(3);
    for (let i = 0; i < 2 && state.view.status === 'playing'; i += 1) {
      state = applyLocalLockAction(state, 'press', 'up', pressCtx);
    }
    expect(state.spentPins).toBeGreaterThan(0);
    const awaiting = { ...state, game: { ...state.game, status: 'awaitingRetry' } };
    const fresh = applyLocalLockAction(awaiting, 'retry', 'yes', localCtx);
    expect(fresh.error).toBeNull();
    expect(fresh.view.pinsTotal).toBe(3 - state.spentPins);
    expect(fresh.view.status).toBe('playing');
    const denied = applyLocalLockAction(awaiting, 'retry', 'no', localCtx);
    expect(denied.view.status).toBe('closed');
  });

  it('без отмычек доска честно уходит в ожидание решения Мастера', () => {
    const empty = { ...LIVE_STORE, items: {}, equipment: { items: [] } };
    const started = applyLocalLockAction(initialLocalLockState(), 'start', undefined, {
      ...ctx(), characterSnapshot: buildLocalLockSnapshot(empty),
    });
    expect(started.view.status).toBe('awaitingRetry');
    expect(started.view.result).toBe('OUT OF PINS');
  });
});

describe('524: ровно один start на открытие окна', () => {
  it('ключ автозапуска не меняется от прихода accessId комнаты', () => {
    const base = { roomCode: 'ROOM1', containerId: 'lock-1', characterId: 'ch1' };
    expect(autoStartLockKey({ ...base, localMode: false }))
      .toBe(autoStartLockKey({ ...base, localMode: false }));
    expect(autoStartLockKey({ ...base, localMode: false })).not.toContain('access');
    expect(autoStartLockKey({ ...base, localMode: false }))
      .not.toBe(autoStartLockKey({ ...base, localMode: true }));
  });

  it('финальные статусы и чужая доска останавливают автозапуск', () => {
    const base = {
      visible: true, autoStart: true, hasLock: true, hasRoom: true,
      characterId: 'ch1', isClosed: false, awaitingGm: false,
    };
    expect(shouldAutoStartLock({ ...base, game: null })).toBe(true);
    expect(shouldAutoStartLock({ ...base, game: { status: 'playing' } })).toBe(false);
    for (const status of ['won', 'awaitingRetry', 'closed']) {
      expect(shouldAutoStartLock({ ...base, game: { status } })).toBe(false);
    }
    expect(shouldAutoStartLock({ ...base, game: { status: 'playing' }, boardOfAnotherOperator: true }))
      .toBe(true);
    expect(shouldAutoStartLock({ ...base, isClosed: true })).toBe(false);
    expect(shouldAutoStartLock({ ...base, autoStart: false })).toBe(false);
  });
});

describe('524: документы, строки и регрессионные законы', () => {
  it('модалка не показывает «Действие не выполнено» на штатных кодах', () => {
    const modal = read('components/lootTrade/LockPickingModal.js');
    for (const code of [
      'TERMINAL_ALREADY_ACTIVE', 'TERMINAL_AWAITING_RETRY', 'TERMINAL_NOT_ACTIVE',
      'LOCK_NO_PINS', 'LOCK_ALREADY_ACTIVE',
    ]) expect(modal).toContain(code);
    expect(modal).toContain("roomHasTerminalProtocol");
    expect(modal).toContain('SESSION_FORBIDDEN');
    expect(modal).toContain('UNKNOWN_TYPE');
    expect(modal).toContain('lock-no-pins-hint');
  });

  it('окно локации скрыто под мини-игрой, выход работает локально', () => {
    const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlay).toContain('visible={!terminalSelection}');
    expect(overlay).toContain('markSessionClosedLocally(session.sessionId)');
    expect(overlay).toContain('standaloneCheckSession');
    // Патч 525: отдельная точка сначала показывает входную модалку.
    expect(overlay).toContain('<StandaloneCheckModal');
    expect(read('components/lootTrade/StandaloneCheckModal.js')).toContain('check-hack-button');
    expect(overlay).toContain("tLootTrade('player.leaveHub')");
  });

  it('парные строки RU/EN и версия 524', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json').lock;
    const en = json('i18n/en-EN/screens/lootTrade/screen.json').lock;
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    expect(ru.noPinsHint).toContain('Отмычк');
    expect(en.sessionNotPublished).toContain('room');
    const version = json('public/version.json');
    expect(Number(version.version)).toBeGreaterThanOrEqual(524);
    expect(read('docs/roadmap.md')).toContain('524');
    expect(read('docs/changelog.ru.md')).toContain('524');
    expect(read('docs/changelog.en.md')).toContain('524');
    expect(Number(JSON.parse(read('patchs/baseline.json')).baseline)).toBeGreaterThanOrEqual(524);
    expect(read('docs/patch-524-install.md')).toContain('524');
  });
});
