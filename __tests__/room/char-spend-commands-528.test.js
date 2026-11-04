// Приёмочный тест патча 528. Владелец: «Заколки удаляются не из снапшота,
// а клиенту посылается команда на списание заколки из инвентаря, штатными
// средствами. И после списания посылается команда на обновление снапшота».
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { MESSAGE as SERVER_MESSAGE } from '../../server/protocol.js';
import { ROOM_MESSAGE as CLIENT_MESSAGE } from '../../src/room/roomProtocol';
import { applyCharSpendCommand, resetAppliedPinSpendsForTests } from '../../components/lootTrade/CharSpendCommandHost.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол' });
  const code = room.code;
  registry.joinRoom({ code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code, clientId: 'p1', name: 'Игрок', role: 'player' });
  registry.putSnapshot({
    code, characterId: 'ch1', revision: 1,
    snapshot: { items: { p: { weaponId: 'item_bobby_pin', quantity: 5 } } },
    fromClientId: 'p1', fromName: 'Игрок',
  });
  return { registry, code, room: registry._rooms.get(code) };
};

describe('528: протокол команд списания', () => {
  it('char.spend / char.refresh зеркально есть на сервере и клиенте', () => {
    expect(SERVER_MESSAGE.CHAR_SPEND).toBe('char.spend');
    expect(SERVER_MESSAGE.CHAR_REFRESH).toBe('char.refresh');
    expect(CLIENT_MESSAGE.CHAR_SPEND).toBe(SERVER_MESSAGE.CHAR_SPEND);
    expect(CLIENT_MESSAGE.CHAR_REFRESH).toBe(SERVER_MESSAGE.CHAR_REFRESH);
  });

  it('реестр хранит команду до публикации листа и повторяет её после реконнекта', () => {
    const { registry, code } = setup();
    const entry = registry.registerPinSpend({
      code, characterId: 'ch1', clientId: 'p1', count: 1, spendId: 'pin-a1',
    });
    // Патч 529: команда стала универсальной (kind + payload), spendId — алиас.
    expect(entry).toMatchObject({
      commandId: 'pin-a1', spendId: 'pin-a1', characterId: 'ch1', clientId: 'p1',
      kind: 'item.spend', payload: { itemId: 'item_bobby_pin', count: 1 },
    });
    expect(registry.pendingCommandsForClient(code, 'p1')).toHaveLength(1);
    expect(registry.pendingSpendsForClient(code, 'another-tab')).toHaveLength(0);
    expect(registry.getState(code).pendingCommands).toHaveLength(1);
    expect(registry.getState(code).pendingSpends).toHaveLength(1);
    // Обычная публикация листа (вторая команда) снимает неподтверждённые.
    registry.putSnapshot({
      code, characterId: 'ch1', revision: 5,
      snapshot: { items: { p: { weaponId: 'item_bobby_pin', quantity: 4 } } },
      fromClientId: 'p1', fromName: 'Игрок',
    });
    expect(registry.getState(code).pendingCommands).toHaveLength(0);
    expect(registry.pendingCommandsForClient(code, 'p1')).toHaveLength(0);
  });

  it('сервер больше не правит чужой снимок', () => {
    const registrySource = read('server/roomRegistry.js');
    const serverSource = read('server/roomServer.js');
    expect(registrySource).not.toContain('consumeBobbyPins(');
    expect(registrySource).toContain('pinsToSpend');
    expect(serverSource).toContain('sendCharacterCommand');
    expect(serverSource).toContain('MESSAGE.CHAR_COMMAND');
    expect(serverSource).toContain('MESSAGE.CHAR_REFRESH');
    expect(serverSource).not.toContain('MESSAGE.CHAR_SPEND');
  });
});

describe('529: клиент применяет команды в строгом порядке', () => {
  const deps = (overrides = {}) => {
    const spend = vi.fn(async () => 1);
    const publish = vi.fn(async () => true);
    return {
      spend,
      publish,
      d: {
        executionDeps: { spendBobbyPins: spend },
        publish,
        getCharacterId: () => 'ch1',
        isApplied: async () => false,
        setApplied: vi.fn(async () => true),
        log: vi.fn(),
        ...overrides,
      },
    };
  };
  const command = (commandId, payload = {}) => ({
    type: CLIENT_MESSAGE.CHAR_COMMAND,
    payload: {
      commandId, characterId: 'ch1', kind: 'item.spend',
      payload: { itemId: 'item_bobby_pin', count: 1, ...payload },
    },
  });

  it('char.command(item.spend) списывает штатным вызовом и НЕ публикует лист сам', async () => {
    const { spend, d } = deps();
    const result = await applyCharSpendCommand(command('s1'), new Map(), d);
    expect(result).toMatchObject({ ok: true, started: true, kind: 'item.spend' });
    expect(spend).toHaveBeenCalledWith(1, { characterId: 'ch1', publish: false });
  });

  it('char.refresh ждёт окончания исполнения и только потом обновляет снимок', async () => {
    let resolveSpend;
    const spend = vi.fn(() => new Promise((resolve) => { resolveSpend = resolve; }));
    const publish = vi.fn(async () => true);
    const d = {
      executionDeps: { spendBobbyPins: spend },
      publish,
      getCharacterId: () => 'ch1',
      isApplied: async () => false,
      setApplied: vi.fn(async () => true),
      log: vi.fn(),
    };
    const jobs = new Map();
    const base = { commandId: 's2', characterId: 'ch1' };
    await applyCharSpendCommand(command('s2'), jobs, d);
    const refreshing = applyCharSpendCommand({
      type: CLIENT_MESSAGE.CHAR_REFRESH, payload: base,
    }, jobs, d);
    expect(publish).not.toHaveBeenCalled();
    resolveSpend(1);
    await refreshing;
    expect(publish).toHaveBeenCalledWith('ch1');
    expect(jobs.has('s2')).toBe(false);
  });

  it('повтор команды после реконнекта не применяет изменение дважды', async () => {
    const { spend, d } = deps({ isApplied: async () => true });
    const result = await applyCharSpendCommand(command('s3'), new Map(), d);
    expect(result.duplicate).toBe(true);
    expect(spend).not.toHaveBeenCalled();
  });

  it('команда для другого персонажа игнорируется, а чужой предмет не исполняется', async () => {
    const { spend, d } = deps({ getCharacterId: () => 'ch2' });
    expect((await applyCharSpendCommand(command('s4'), new Map(), d)).reason).toBe('other-character');
    const { spend: spend2, d: d2 } = deps();
    const foreign = command('s5', { itemId: 'caps' });
    const result = await applyCharSpendCommand(foreign, new Map(), d2);
    expect(result.started).toBe(true); // команда принята, но исполнитель её отверг
    expect(spend2).not.toHaveBeenCalled(); // белый список предметов
    expect(spend).not.toHaveBeenCalled();
  });

  it('хост смонтирован поверх всех экранов, чтобы лист обновился и при закрытом окне', () => {
    expect(read('App.js')).toContain('<CharSpendCommandHost />');
    expect(read('src/room/roomStore.ts')).toContain('onRoomCharSpend');
    resetAppliedPinSpendsForTests();
  });
});
