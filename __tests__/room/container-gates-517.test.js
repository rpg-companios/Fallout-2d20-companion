// Приёмочный тест 517: ворота между точками. Событие доступа общее на комнату,
// а не на вкладку игрока; Мастер видит связи в админке.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { KEY_ACCESS, resolveKeyAccess, isCheckPassed } from '../../server/keyAccess.js';
import { MESSAGE } from '../../server/protocol.js';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол', ownerToken: 'tok' });
  registry.joinRoom({ code: room.code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Игрок', role: 'player' });
  return { registry, room };
};

describe('517: нейтральное событие как ворота', () => {
  it('без требования ключа ворота всё равно закрывают/открывают точку', () => {
    const empty = { revision: 0, entries: [] };
    expect(resolveKeyAccess(
      { linkedCheckId: 't9' }, { storage: empty, accessEvents: {} },
    ).state).toBe(KEY_ACCESS.NEEDS_CHECK);
    expect(resolveKeyAccess(
      { linkedCheckId: 't9' }, { storage: empty, accessEvents: { t9: { kind: 'hacked' } } },
    ).state).toBe(KEY_ACCESS.OPEN);
    expect(resolveKeyAccess({}, { storage: empty }).state).toBe(KEY_ACCESS.NONE);
  });

  it('событие на комнате и победа терминала — равные источники', () => {
    expect(isCheckPassed({ accessEvents: { t9: { kind: 'hacked' } } }, 't9')).toBe(true);
    expect(isCheckPassed({ terminalStates: { t9: { game: { status: 'won' } } } }, 't9')).toBe(true);
    expect(isCheckPassed({ accessEvents: {} }, 't9')).toBe(false);
  });

  it('протокол несёт состояние ворот', () => {
    expect(MESSAGE.ACCESS_STATE).toBe('access.state');
    expect(ROOM_MESSAGE.ACCESS_STATE).toBe(MESSAGE.ACCESS_STATE);
  });
});

describe('517: сервер ведёт общий журнал событий', () => {
  it('открытие ключом порождает событие и снимает ворота у второй точки', () => {
    const { registry, room } = setup();
    // Точка A требует ключ; точка B — ворота на A.
    registry.openSession({
      code: room.code, clientId: 'gm',
      session: {
        name: 'Бункер', kind: 'hub', targetType: 'room',
        nodes: [
          {
            containerId: 'a', kind: 'loot', name: 'Сейф',
            requiredKeyItemId: 'k1', keyRequirement: 'required',
            items: [{ entryId: 'e1', name: 'Патроны', quantity: 1 }],
          },
          {
            containerId: 'b', kind: 'loot', name: 'Дверь',
            linkedCheckId: 'a',
            items: [{ entryId: 'e2', name: 'Аптечка', quantity: 1 }],
          },
        ],
      },
    });
    let session = registry.getRoom(room.code).activeSession;
    expect(session.nodes.find((n) => n.containerId === 'a').keyAccessState).toBe('denied');
    expect(session.nodes.find((n) => n.containerId === 'b').keyAccessState).toBe('needs-check');
    expect(registry.getAccessEvents(room.code)).toEqual({});

    registry.addKeyItemToStorage({
      code: room.code, clientId: 'gm', keyItemId: 'k1', name: 'Ключ', description: '',
    });
    session = registry.getRoom(room.code).activeSession;
    expect(session.nodes.find((n) => n.containerId === 'a').keyAccessState).toBe('open-by-key');
    expect(session.nodes.find((n) => n.containerId === 'b').keyAccessState).toBe('open');
    expect(session.nodes.find((n) => n.containerId === 'b').locked).toBe(false);

    const events = registry.getAccessEvents(room.code);
    expect(events.a).toMatchObject({ containerId: 'a', kind: 'hacked' });
    expect(events.b).toMatchObject({ containerId: 'b', kind: 'hacked' });
    expect(registry.getState(room.code).accessEvents.a).toBeTruthy();
  });

  it('настоящий взлом терминала тоже даёт событие для ворот', () => {
    const { registry, room } = setup();
    registry.issueTerminal({
      code: room.code, clientId: 'gm',
      config: { containerId: 't1', name: 'Терминал', difficulty: 1 },
    });
    const raw = registry._rooms.get(room.code);
    raw.terminalStates.get('t1').game = { status: 'won', operatorName: 'Игрок' };
    registry.recomputeKeyAccess(room.code);
    expect(registry.getAccessEvents(room.code).t1).toMatchObject({ kind: 'hacked' });
  });

  it('событие не дублируется (идентификатор точки уникален)', () => {
    const { registry, room } = setup();
    registry.addKeyItemToStorage({ code: room.code, clientId: 'gm', keyItemId: 'k', name: 'K' });
    const raw = registry._rooms.get(room.code);
    raw.accessEvents.set('x', { containerId: 'x', kind: 'hacked', at: 1 });
    registry.recomputeKeyAccess(room.code);
    expect(registry.getAccessEvents(room.code).x.at).toBe(1);
  });
});

describe('517: связи видны Мастеру и план обновлён', () => {
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
  const store = read('src/room/roomStore.ts');

  it('вторая строка формы выбирает любые точки, а не только терминалы', () => {
    expect(screen).toContain('availableCheckContainers={gateSources}');
    expect(screen).toContain('gateSources');
    expect(read('components/screens/LootTradeScreen/modals/ContainerFormModal.js'))
      .toContain('check.kindLabel');
  });

  it('карточка и локация показывают ворота и состояние события', () => {
    expect(screen).toContain('card-gate-');
    expect(screen).toContain("tLootTrade('card.gateAfter')");
    expect(screen).toContain('hub-gate-');
    expect(screen).toContain("tLootTrade('detail.hubGatesTitle')");
    expect(screen).toContain('gateEvents');
  });

  it('клиентский стор хранит общие события комнаты', () => {
    expect(store).toContain('accessEvents?:');
    expect(store).toContain('ROOM_MESSAGE.ACCESS_STATE');
    expect(read('server/roomServer.js')).toContain('MESSAGE.ACCESS_STATE');
  });

  it('подписи парные RU/EN', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
    for (const [section, key] of [
      ['card', 'gateAfter'], ['card', 'gateOpen'], ['card', 'gatePending'],
      ['detail', 'hubGatesTitle'], ['detail', 'hubGatesEmpty'],
      ['form', 'linkedCheckLabel'], ['form', 'linkedCheckHint'],
    ]) {
      expect(ru[section][key]).toBeTruthy();
      expect(en[section][key]).toBeTruthy();
    }
  });

  it('roadmap обновлён до 517 и тезис ворот закрыт', () => {
    const plan = read('docs/roadmap.md');
    expect(plan).toContain('517');
    expect(plan).toContain('Осталось после патча 517');
    expect(plan).not.toContain('| 9 | ⏳');
    expect(plan).toContain('две панели');
    expect(plan).toContain('Мини-игра взлома замков');
  });
});
