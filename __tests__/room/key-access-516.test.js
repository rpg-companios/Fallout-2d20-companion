// Приёмочный тест 516: серверная проверка ключа (тезис 8 плана) и возврат
// на экран карточек после создания точки.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { applyKeyAccessToSession, normalizeActiveSession } from '../../server/lootTradeSession.js';
import { KEY_ACCESS, resolveKeyAccess, hasKeyInStorage, isCheckPassed } from '../../server/keyAccess.js';
import { findCompleted } from '../../components/lootTrade/terminalRetryPrompt.js';
import { ERROR_CODE } from '../../server/protocol.js';
import { ROOM_ERROR } from '../../src/room/roomProtocol.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол', ownerToken: 'tok' });
  registry.joinRoom({ code: room.code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Игрок', role: 'player' });
  return { registry, room };
};

const storageWithKey = (id) => ({
  revision: 1,
  entries: [{ entryId: 'e1', kind: 'keyItem', keyItemId: id, name: 'Ключ', quantity: 1 }],
});

describe('516: чистое правило доступа', () => {
  it('пять состояний: нет требования / ключ найден / обязательный / нужна проверка / проверка пройдена', () => {
    const empty = { revision: 0, entries: [] };
    expect(resolveKeyAccess({}, { storage: empty }).state).toBe(KEY_ACCESS.NONE);
    expect(resolveKeyAccess(
      { requiredKeyItemId: 'k1', keyRequirement: 'required' },
      { storage: storageWithKey('k1') },
    ).state).toBe(KEY_ACCESS.OPEN_BY_KEY);
    expect(resolveKeyAccess(
      { requiredKeyItemId: 'k1', keyRequirement: 'required' },
      { storage: empty },
    ).state).toBe(KEY_ACCESS.DENIED);
    expect(resolveKeyAccess(
      { requiredKeyItemId: 'k1', keyRequirement: 'optional', linkedCheckId: 't2' },
      { storage: empty },
    ).state).toBe(KEY_ACCESS.NEEDS_CHECK);
    expect(resolveKeyAccess(
      { requiredKeyItemId: 'k1', keyRequirement: 'optional', linkedCheckId: 't2' },
      { storage: empty, terminalStates: { t2: { game: { status: 'won' } } } },
    ).state).toBe(KEY_ACCESS.OPEN);
    expect(hasKeyInStorage(storageWithKey('k1'), 'k1')).toBe(true);
    expect(hasKeyInStorage(storageWithKey('k1'), 'k2')).toBe(false);
    expect(isCheckPassed({ terminalStates: { t2: { game: { status: 'won' } } } }, 't2')).toBe(true);
    expect(isCheckPassed({ terminalStates: new Map([['t2', { game: { status: 'won' } }]]) }, 't2')).toBe(true);
  });

  it('applyKeyAccessToSession помечает корень и вложенные узлы', () => {
    const session = normalizeActiveSession({
      name: 'Локация', kind: 'hub', targetType: 'room',
      requiredKeyItemId: 'k1', keyRequirement: 'required',
      nodes: [{
        containerId: 'c1', kind: 'loot', name: 'Сейф',
        requiredKeyItemId: 'k1', keyRequirement: 'required',
        items: [{ entryId: 'e1', name: 'Патроны', quantity: 1 }],
      }],
    });
    const denied = applyKeyAccessToSession(session, () => ({ state: KEY_ACCESS.DENIED }));
    expect(denied.locked).toBe(true);
    expect(denied.keyAccessState).toBe('denied');
    expect(denied.nodes[0].locked).toBe(true);

    const opened = applyKeyAccessToSession(session, () => ({ state: KEY_ACCESS.OPEN_BY_KEY }));
    expect(opened.locked).toBe(false);
    expect(opened.keyUnlocked).toBe(true);
    expect(opened.nodes[0].keyUnlocked).toBe(true);
  });

  it('зеркало протокола и код ошибки', () => {
    expect(ERROR_CODE.KEY_REQUIRED).toBe('KEY_REQUIRED');
    expect(ROOM_ERROR.KEY_REQUIRED).toBe('KEY_REQUIRED');
  });
});

describe('516: сервер применяет правило к выданной точке', () => {
  const openChest = (registry, room, requirement) => registry.openSession({
    code: room.code,
    clientId: 'gm',
    session: {
      name: 'Сейф', kind: 'loot', targetType: 'room',
      items: [{ entryId: 'e1', itemId: 'ammo', itemType: 'ammo', name: 'Патроны', quantity: 1 }],
      ...requirement,
    },
  });

  it('обязательный ключ: без ключа отказано, после находки — открыто', () => {
    const { registry, room } = setup();
    openChest(registry, room, { requiredKeyItemId: 'k1', keyRequirement: 'required' });
    expect(registry.getRoom(room.code).activeSession.keyAccessState).toBe('denied');
    const denied = registry.lootTake({
      code: room.code, clientId: 'p1',
      payload: { characterId: 'c1', takes: [{ entryId: 'e1', quantity: 1 }] },
    });
    expect(denied.error).toBe(ERROR_CODE.KEY_REQUIRED);

    registry.addKeyItemToStorage({ code: room.code, clientId: 'gm', keyItemId: 'k1', name: 'Ключ' });
    const state = registry.getRoom(room.code).activeSession;
    expect(state.keyAccessState).toBe('open-by-key');
    expect(state.keyUnlocked).toBe(true);
    expect(state.locked).toBe(false);
    const taken = registry.lootTake({
      code: room.code, clientId: 'p1',
      payload: { characterId: 'c1', takes: [{ entryId: 'e1', quantity: 1 }] },
    });
    expect(taken.error).toBeUndefined();
  });

  it('необязательный ключ: без проверки закрыто, после взлома связанного терминала — открыто', () => {
    const { registry, room } = setup();
    openChest(registry, room, {
      requiredKeyItemId: 'k2', keyRequirement: 'optional', linkedCheckId: 't2',
    });
    expect(registry.getRoom(room.code).activeSession.keyAccessState).toBe('needs-check');
    expect(registry.lootTake({
      code: room.code, clientId: 'p1',
      payload: { characterId: 'c1', takes: [{ entryId: 'e1', quantity: 1 }] },
    }).error).toBe(ERROR_CODE.KEY_REQUIRED);

    // Привязанный терминал взломан: состояние комнаты общее, ключ не нужен.
    const rawRoom = registry._rooms.get(room.code);
    rawRoom.terminalStates.set('t2', { config: { containerId: 't2' }, game: { status: 'won' } });
    registry.recomputeKeyAccess(room.code);
    expect(registry.getRoom(room.code).activeSession.keyAccessState).toBe('open');
    expect(registry.getRoom(room.code).activeSession.locked).toBe(false);
  });

  it('терминал с ключом: мини-игра не запускается и Мастеру нет уведомления', () => {
    const { registry, room } = setup();
    registry.issueTerminal({
      code: room.code, clientId: 'gm',
      config: {
        containerId: 't1', name: 'Терминал', difficulty: 1,
        requiredKeyItemId: 'k1', keyRequirement: 'required',
      },
    });
    expect(registry.terminalAction({
      code: room.code, clientId: 'p1', containerId: 't1', action: 'start',
    }).error).toBe(ERROR_CODE.KEY_REQUIRED);

    registry.addKeyItemToStorage({ code: room.code, clientId: 'gm', keyItemId: 'k1', name: 'Ключ' });
    const terminal = registry.getState(room.code).terminalStates.t1;
    expect(terminal.game.status).toBe('won');
    expect(terminal.game.hackedByKey).toBe(true);
    expect(terminal.keyAccessState).toBe('open-by-key');
    expect(terminal.game.wordRanges).toHaveLength(0);
    expect(findCompleted({ [room.code]: { role: 'gm', terminalStates: { t1: terminal } } }, 'gm')).toHaveLength(0);
  });
});

describe('516: экран карточек и документация', () => {
  it('после создания точки детальный экран не открывается', () => {
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(screen).not.toContain('setActiveContainerId(saved.id)');
    expect(screen).toContain('после создания точки остаёмся на экране карточек');
  });

  it('подписи ошибок и бейджи парные RU/EN', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
    for (const [section, key] of [
      ['player', 'keyRequiredError'], ['player', 'hubNodeKeyUnlockedBadge'],
      ['terminal', 'keyRequiredError'], ['terminal', 'keyUnlockedBadge'],
    ]) {
      expect(ru[section][key]).toBeTruthy();
      expect(en[section][key]).toBeTruthy();
    }
  });

  it('roadmap обновлён до 516 и список оставшихся актуален', () => {
    const plan = read('docs/roadmap.md');
    expect(plan).toContain('516');
    expect(plan).toContain('Осталось после патча');
    expect(plan).not.toContain('| 8 | ⏳');
    expect(plan).toContain('Ворота между точками');
    expect(plan).toContain('две панели');
  });
});
