// Приёмочный тест 523: граф пространств, вложенность, циклы, несколько
// родителей, общие коды комнат, граница видимости по замку и адресный взлом.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import graph from '../../domain/locationGraph.js';
import {
  CONTAINER_KIND,
  normalizeContainerEntity,
  buildLocationSessionNodes,
  effectiveLocationRoomCodes,
} from '../../domain/lootTrade.js';
import {
  normalizeActiveSession,
  sanitizeSessionForMember,
  applySessionLockAll,
  applySessionUnlock,
  applySessionUpdate,
} from '../../server/lootTradeSession.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const CARDS = [
  { id: 'factory', kind: 'hub', name: 'Завод', roomCodes: ['R1'], links: [
    { containerId: 'hall' }, { containerId: 'chest' },
  ] },
  { id: 'hall', kind: 'hub', name: 'Цех', roomCodes: ['R2'], links: [
    { containerId: 'locker' }, { containerId: 'factory' }, // цикл A–B–A
  ] },
  { id: 'locker', kind: 'loot', name: 'Шкаф', links: [
    { containerId: 'box' }, // контейнер в контейнере
  ] },
  { id: 'box', kind: 'loot', name: 'Коробка', links: [] },
  { id: 'chest', kind: 'loot', name: 'Сундук', links: [] },
  { id: 'otherHub', kind: 'hub', name: 'Склад', roomCodes: ['R3'], links: [
    { containerId: 'chest' }, // несколько родителей у одного сундука
  ] },
];

const g = () => graph.buildLocationGraph(CARDS);

describe('523: граф локаций', () => {
  it('циклы A–B–A разрешены и обход не зацикливается', () => {
    const gr = g();
    expect(graph.hasCycleAt(gr, 'factory')).toBe(true);
    const descendants = graph.descendantsOf(gr, 'factory');
    expect(new Set(descendants).size).toBe(descendants.length);
    expect(descendants).toContain('hall');
    expect(descendants).toContain('box');
    expect(graph.ancestorsOf(gr, 'box')).toContain('factory');
  });

  it('несколько родителей сохраняются, «верхнего родителя» нет', () => {
    const gr = g();
    expect(graph.parentIdsOf(gr, 'chest').sort()).toEqual(['factory', 'otherHub']);
    // «Заблокировать всё» доступно на каждом узле с детьми, а не только на корне.
    expect(graph.hasChildren(gr, 'locker')).toBe(true);
    expect(graph.hasChildren(gr, 'box')).toBe(false);
    expect(graph.lockAllTargets(gr, 'locker')).toEqual(['box']);
    expect(graph.lockAllTargets(gr, 'factory')).toContain('chest');
  });

  it('коды комнат наследуются как объединение кодов ВСЕХ родителей', () => {
    const gr = g();
    // цикл factory→hall→factory делает hall предком factory, поэтому R2 тоже наследуется
    expect(graph.effectiveRoomCodes(gr, 'chest')).toEqual(['R1', 'R2', 'R3']);
    expect(graph.effectiveRoomCodes(gr, 'box')).toEqual(['R1', 'R2']);
    expect(effectiveLocationRoomCodes(CARDS[0], CARDS)).toEqual(['R1', 'R2']);
  });

  it('плоский список сессии несёт parentIds, childIds, depth и коды', () => {
    const flat = graph.flattenForSession(g(), 'factory');
    const byId = new Map(flat.map((n) => [n.id, n]));
    // в сессии с корнем factory достижим только родитель factory;
    // второй родитель живёт в глобальном графе (проверяется отдельно)
    expect(byId.get('chest').parentIds).toEqual(['factory']);
    expect(byId.get('box').childIds).toEqual([]);
    expect(byId.get('box').depth).toBe(3);
    expect(byId.get('box').roomCodes).toEqual(['R1', 'R2']);
    expect(byId.has('factory')).toBe(false); // корень — сама сессия
  });

  it('замок — граница видимости: потомки скрыты, Мастер видит всё', () => {
    const gr = g();
    const hidden = graph.hiddenBehindLock(gr, { lockedIds: ['hall'], rootId: 'factory' });
    expect(hidden).toContain('locker');
    expect(hidden).toContain('box');
    expect(hidden).not.toContain('hall'); // сама «дверь» видна
    expect(graph.hiddenBehindLock(gr, { lockedIds: ['hall'], isGm: true, rootId: 'factory' })).toEqual([]);
  });
});

describe('523: вложенные карточки Мастера', () => {
  it('ссылки разрешены у ЛЮБОГО узла, а не только у локации', () => {
    const loot = normalizeContainerEntity({ id: 'c1', kind: CONTAINER_KIND.LOOT, links: [{ containerId: 'c2' }] });
    expect(loot.links).toHaveLength(1);
    expect(loot.links[0].containerId).toBe('c2');
  });

  it('сессия собирает локацию в локации и контейнер в контейнер', () => {
    const nodes = buildLocationSessionNodes(CARDS[0], CARDS);
    const ids = nodes.map((n) => n.containerId);
    expect(ids).toContain('hall'); // локация внутри локации
    expect(ids).toContain('locker');
    expect(ids).toContain('box'); // контейнер внутри контейнера
    expect(nodes.find((n) => n.containerId === 'hall').kind).toBe(CONTAINER_KIND.HUB);
    expect(nodes.find((n) => n.containerId === 'chest').parentIds).toEqual(['factory']);
    expect(nodes.find((n) => n.containerId === 'box').roomCodes).toEqual(['R1', 'R2']);
  });
});

describe('523: серверная сессия и доступ', () => {
  const session = (nodes) => normalizeActiveSession({
    sessionId: 's1', containerId: 'factory', kind: 'hub', name: 'Завод',
    targetType: 'room', roomCodes: ['R1', 'R2'],
    linkedCheckIds: ['t1', 'k1'], linkedCheckId: 't1',
    nodes,
  }, 1000);

  const nodes = [
    { containerId: 'hall', kind: 'hub', name: 'Цех', locked: true, parentIds: ['factory'], childIds: ['locker'], depth: 1, roomCodes: ['R1', 'R2'] },
    { containerId: 'locker', kind: 'loot', name: 'Шкаф', parentIds: ['hall'], childIds: ['box'], depth: 2, roomCodes: ['R1', 'R2'], items: [{ entryId: 'e1', name: 'Патроны', quantity: 2 }] },
    { containerId: 'box', kind: 'loot', name: 'Коробка', parentIds: ['locker'], childIds: [], depth: 3, roomCodes: ['R1', 'R2'] },
    { containerId: 'chest', kind: 'loot', name: 'Сундук', parentIds: ['factory'], childIds: [], depth: 1, roomCodes: ['R1'] },
  ];

  it('сессия больше не теряет linkedCheckIds и хранит коды комнат', () => {
    const s = session(nodes);
    expect(s.linkedCheckIds).toEqual(['t1', 'k1']);
    expect(s.roomCodes).toEqual(['R1', 'R2']);
    expect(s.nodes.find((n) => n.containerId === 'hall').kind).toBe('hub');
    expect(s.nodes.find((n) => n.containerId === 'box').parentIds).toEqual(['locker']);
  });

  it('игрок не видит содержимое запертой локации, Мастер видит', () => {
    const s = session(nodes);
    const player = sanitizeSessionForMember(s, { isGm: false });
    expect(player.nodes.map((n) => n.containerId)).toEqual(['hall', 'chest']);
    expect(player.nodes.find((n) => n.containerId === 'hall').items).toEqual([]);
    expect(sanitizeSessionForMember(s, { isGm: true }).nodes).toHaveLength(4);
  });

  it('«заблокировать всё» работает на узле с детьми и только по потомкам', () => {
    const s = session(nodes);
    const result = applySessionLockAll(s, 'locker');
    expect(result.error).toBeUndefined();
    expect(result.session.nodes.find((n) => n.containerId === 'box').locked).toBe(true);
    expect(result.session.nodes.find((n) => n.containerId === 'chest').locked).toBe(false);
    expect(result.session.nodes.find((n) => n.containerId === 'locker').locked).toBe(false);
  });

  it('адресный взлом открывает ровно одну точку без каскада', () => {
    const s = session(nodes);
    const opened = applySessionUnlock(s, 'hall').session;
    expect(opened.nodes.find((n) => n.containerId === 'hall').locked).toBe(false);
    // потомки остаются как были — автоматического каскада нет
    expect(opened.nodes.find((n) => n.containerId === 'box').locked).toBe(false);
    expect(applySessionUnlock(s, 'missing').error).toBeTruthy();
  });

  it('команды Мастера доходят через session.updateRates', () => {
    const s = session(nodes);
    const locked = applySessionUpdate(s, { lockAll: 'factory' }, 1000).session;
    expect(locked.nodes.every((n) => n.locked)).toBe(true);
    const opened = applySessionUpdate(locked, { unlock: 'chest' }, 1000).session;
    expect(opened.nodes.find((n) => n.containerId === 'chest').locked).toBe(false);
    expect(opened.nodes.find((n) => n.containerId === 'box').locked).toBe(true);
  });

  it('ворота больше не дают транзитивного каскада (517 → 523)', () => {
    const registry = createRoomRegistry({ now: () => 1000 });
    const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол', ownerToken: 't' });
    registry.joinRoom({ code: room.code, clientId: 'gm', name: 'GM', role: 'gm' });
    registry.openSession({
      code: room.code, clientId: 'gm',
      session: {
        name: 'Бункер', kind: 'hub', targetType: 'room', roomCodes: [room.code],
        nodes: [
          { containerId: 'a', kind: 'loot', name: 'Сейф', requiredKeyItemId: 'k1', keyRequirement: 'required' },
          { containerId: 'b', kind: 'loot', name: 'Дверь', linkedCheckId: 'a' },
          { containerId: 'c', kind: 'loot', name: 'Люк', linkedCheckId: 'b' },
        ],
      },
    });
    registry.addKeyItemToStorage({ code: room.code, clientId: 'gm', keyItemId: 'k1', name: 'Ключ' });
    const events = registry.getAccessEvents(room.code);
    expect(events.a).toBeTruthy();
    expect(events.b).toBeUndefined(); // открытая воротами точка не становится источником
    const s = registry.getRoom(room.code).activeSession;
    expect(s.nodes.find((n) => n.containerId === 'b').keyAccessState).toBe('open');
    expect(s.nodes.find((n) => n.containerId === 'c').keyAccessState).toBe('needs-check');
  });
});

describe('523: состояние локации общее для привязанных комнат', () => {
  it('покупка/правка в одной комнате видна в другой, третья не видит ничего', () => {
    const registry = createRoomRegistry({ now: () => 1000 });
    const a = registry.createRoom({ clientId: 'gm', name: 'A', ownerToken: 'ta' }).room;
    const b = registry.createRoom({ clientId: 'gm', name: 'B', ownerToken: 'tb' }).room;
    const c = registry.createRoom({ clientId: 'gm', name: 'C', ownerToken: 'tc' }).room;
    for (const r of [a, b, c]) {
      registry.joinRoom({ code: r.code, clientId: 'gm', name: 'GM', role: 'gm' });
    }
    const opened = registry.openSession({
      code: a.code, clientId: 'gm',
      session: {
        sessionId: 'shared-1', containerId: 'factory', kind: 'hub', name: 'Завод',
        targetType: 'room', roomCodes: [a.code, b.code],
        nodes: [{ containerId: 'box', kind: 'loot', name: 'Коробка', items: [{ entryId: 'e1', name: 'Патроны', quantity: 5 }] }],
      },
    });
    expect(opened.boundRooms.map((r) => r.code).sort()).toEqual([a.code, b.code].sort());
    expect(registry.getRoom(b.code).activeSession.sessionId).toBe('shared-1');
    expect(registry.getRoom(c.code).activeSession).toBeNull();

    const updated = registry.updateSession({
      code: a.code, clientId: 'gm', payload: { sessionId: 'shared-1', lockAll: 'factory' },
    });
    expect(updated.boundRooms).toHaveLength(2);
    expect(registry.getRoom(b.code).activeSession.nodes[0].locked).toBe(true);
    expect(registry.getRoom(c.code).activeSession).toBeNull();

    const closed = registry.closeSession({ code: a.code, clientId: 'gm', sessionId: 'shared-1' });
    expect(closed.boundRooms).toHaveLength(2);
    expect(registry.getRoom(b.code).activeSession).toBeNull();
  });
});

describe('523: документы и версия', () => {
  it('дизайн, план, заметки и установка ведут на 523', () => {
    expect(read('docs/location-hierarchy-design.md')).toContain('523');
    expect(read('docs/roadmap.md')).toContain('523');
    expect(read('docs/changelog.ru.md')).toContain('523');
    expect(read('docs/changelog.en.md')).toContain('523');
    expect(read('docs/patch-523-install.md')).toContain('523');
    // Номер версии растёт дальше: исторический тест проверяет закон, а не
    // конкретный номер (патч 524 и последующие не должны ломать цепочку).
    expect(Number(JSON.parse(read('public/version.json')).version)).toBeGreaterThanOrEqual(523);
    expect(Number(JSON.parse(read('patchs/baseline.json')).baseline)).toBeGreaterThanOrEqual(523);
    expect(read('patchs/523-location-graph.patch')).toContain('server/locationGraph.js');
  });
});
