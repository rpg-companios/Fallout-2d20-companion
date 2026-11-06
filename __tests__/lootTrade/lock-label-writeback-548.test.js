// ПРИЁМОЧНЫЙ (патч 548): удалить при конверсии/приживании.
// Патч 548, вторая половина: обратная запись живой сессии не должна затирать
// человеческую подпись замка техническим маркером. До фикса выдача локации
// превращала «Ржавая дверь» в `F2D20-LOC:{"v":1,...}` и портила карточку Мастера
// навсегда. Маркер прячет исходный текст в поле `l` — его и возвращаем.
import { describe, expect, it, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cards: {},
  listeners: new Set(),
  state: { rooms: {} },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Alert: { alert: vi.fn() },
}));

vi.mock('../../db', () => ({
  getGmContainerById: vi.fn(async (id) => h.cards[id] || null),
  getGmContainersList: vi.fn(async () => Object.values(h.cards)),
  saveGmContainer: vi.fn(async (card) => { h.cards[card.id] = card; return card; }),
  deleteGmContainer: vi.fn(async (id) => { delete h.cards[id]; }),
  getFolderRooms: vi.fn(async () => []),
}));

vi.mock('../../src/room/roomStore', () => ({
  default: { getState: () => h.state },
  onRoomSessionState: (fn) => { h.listeners.add(fn); return () => h.listeners.delete(fn); },
}));

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncGmContainerToCloudIfEnabled: vi.fn(async () => {}),
  deleteGmContainerFromCloudIfEnabled: vi.fn(async () => {}),
}));
vi.mock('../../components/alerts/alertService', () => ({ showRawAlert: vi.fn() }));
vi.mock('../../components/screens/LootTradeScreen/logic/lootTradeI18n', () => ({
  tLootTrade: (key) => key,
  formatLootTrade: (key) => key,
}));
vi.mock('../../domain/premium', async (importOriginal) => ({
  ...(await importOriginal()),
  isGmLootTradeLicensed: () => true,
}));

import * as db from '../../db';
import {
  CONTAINER_KIND,
  buildLocationSessionNodes,
  encodeLockNodeMarker,
  encodeTerminalNodeMarker,
  normalizeContainerEntity,
  normalizeHubLink,
  readableSessionLockLabel,
} from '../../domain/lootTrade.js';
import { encodeLocationNodeMarker } from '../../domain/locationNodeMarker.js';
import {
  resetPromptedEmptySessionsForTests,
  startGmSessionPersistence,
} from '../../src/lootTrade/gmSessionPersistence.js';

const cards = () => [
  normalizeContainerEntity({
    id: 'town', kind: CONTAINER_KIND.HUB, name: 'Город',
    links: [
      { containerId: 'cellar', locked: true, lockLabel: 'Ржавая дверь' },
      { containerId: 'hatch', locked: false, lockLabel: '' },
    ],
  }),
  normalizeContainerEntity({ id: 'cellar', kind: CONTAINER_KIND.LOOT, name: 'Подвал', items: [] }),
  normalizeContainerEntity({ id: 'hatch', kind: CONTAINER_KIND.LOCK, name: 'Люк', difficulty: 2 }),
];

const seed = (all) => {
  h.cards = {};
  all.forEach((c) => { h.cards[c.id] = c; });
};

/** Прогоняет конверт сессии через настоящий слушатель и ждёт цепочку записи. */
const emitSession = async (session) => {
  const stop = startGmSessionPersistence();
  try {
    await Promise.all([...h.listeners].map((fn) => fn({ roomCode: 'ROOM1', payload: { session } })));
  } finally {
    stop();
  }
};

beforeEach(() => {
  h.listeners.clear();
  h.state = { rooms: { ROOM1: { role: 'gm', joined: true, activeSession: null } } };
  resetPromptedEmptySessionsForTests();
  vi.clearAllMocks();
});

describe('548: разбор подписи замка', () => {
  it('обычный текст возвращается без изменений', () => {
    expect(readableSessionLockLabel('Ржавая дверь')).toBe('Ржавая дверь');
    expect(readableSessionLockLabel('')).toBe('');
    expect(readableSessionLockLabel(undefined)).toBe('');
    expect(readableSessionLockLabel(null)).toBe('');
  });

  it('маркер локации, замка и терминала отдают исходный текст Мастера', () => {
    expect(readableSessionLockLabel(encodeLocationNodeMarker({
      kind: 'loot', parentIds: ['town'], lockLabel: 'Ржавая дверь',
    }))).toBe('Ржавая дверь');
    expect(readableSessionLockLabel(encodeLockNodeMarker({
      difficulty: 3, label: 'Тугой замок',
    }))).toBe('Тугой замок');
    expect(readableSessionLockLabel(encodeTerminalNodeMarker({
      difficulty: 2, label: 'Старый терминал',
    }))).toBe('Старый терминал');
  });

  it('маркер без подписи даёт пустую строку, а не JSON', () => {
    expect(readableSessionLockLabel(encodeLocationNodeMarker({ kind: 'lock', parentIds: ['town'] }))).toBe('');
  });

  it('битый маркер не роняет чтение и остаётся как есть', () => {
    const broken = 'F2D20-LOC:{не json';
    expect(readableSessionLockLabel(broken)).toBe(broken);
  });

  it('нормализация ссылки лечит маркер, уже осевший в БД', () => {
    const polluted = encodeLocationNodeMarker({ kind: 'loot', parentIds: ['town'], lockLabel: 'Ржавая дверь' });
    expect(normalizeHubLink({ containerId: 'cellar', locked: true, lockLabel: polluted }))
      .toEqual({ containerId: 'cellar', locked: true, lockLabel: 'Ржавая дверь' });
    // Карточка, сохранённая прошлой версией, читается уже с человеческой подписью.
    const restored = normalizeContainerEntity({
      id: 'town', kind: CONTAINER_KIND.HUB, name: 'Город',
      links: [{ containerId: 'cellar', locked: true, lockLabel: polluted }],
    });
    expect(restored.links[0].lockLabel).toBe('Ржавая дверь');
  });
});

describe('548: обратная запись сессии сохраняет подпись Мастера', () => {
  it('выдача локации с маркером 544 не затирает подпись замка', async () => {
    const all = cards();
    seed(all);
    const nodes = buildLocationSessionNodes(all[0], all);
    // Живые узлы действительно несут маркер — это условие бага.
    expect(String(nodes.find((n) => n.containerId === 'cellar').lockLabel)).toMatch(/^F2D20-/);

    await emitSession({
      sessionId: 's548', containerId: 'town', kind: 'hub', revision: 1, nodes,
    });

    const saved = h.cards.town;
    expect(saved.links.find((l) => l.containerId === 'cellar').lockLabel).toBe('Ржавая дверь');
    expect(saved.links.find((l) => l.containerId === 'hatch').lockLabel).toBe('');
    // Флаг замка по-прежнему синхронизируется — поведение 546/547 не тронуто.
    expect(saved.links.find((l) => l.containerId === 'cellar').locked).toBe(true);
  });

  it('взлом замка снимает флаг, но подпись остаётся человеческой', async () => {
    const all = cards();
    seed(all);
    const nodes = buildLocationSessionNodes(all[0], all).map((n) => (
      n.containerId === 'cellar' ? { ...n, locked: false } : n
    ));
    await emitSession({
      sessionId: 's548b', containerId: 'town', kind: 'hub', revision: 1, nodes,
    });
    const link = h.cards.town.links.find((l) => l.containerId === 'cellar');
    expect(link.locked).toBe(false);
    expect(link.lockLabel).toBe('Ржавая дверь');
  });

  it('повторная выдача не накапливает маркеры (идемпотентность)', async () => {
    const all = cards();
    seed(all);
    const nodes = buildLocationSessionNodes(all[0], all);
    await emitSession({ sessionId: 's548c', containerId: 'town', kind: 'hub', revision: 1, nodes });
    const afterFirst = h.cards.town.links.find((l) => l.containerId === 'cellar').lockLabel;
    const again = buildLocationSessionNodes(normalizeContainerEntity(h.cards.town), Object.values(h.cards));
    await emitSession({ sessionId: 's548d', containerId: 'town', kind: 'hub', revision: 1, nodes: again });
    expect(h.cards.town.links.find((l) => l.containerId === 'cellar').lockLabel).toBe(afterFirst);
    expect(afterFirst).toBe('Ржавая дверь');
  });

  it('узел без подписи в конверте не стирает сохранённую, а маркер в БД лечится', async () => {
    const all = cards();
    all[0] = normalizeContainerEntity({
      ...all[0],
      links: [
        { containerId: 'cellar', locked: true, lockLabel: 'Ржавая дверь' },
        {
          containerId: 'hatch',
          locked: false,
          lockLabel: encodeLockNodeMarker({ difficulty: 2, label: 'Люк во двор' }),
        },
      ],
    });
    seed(all);
    // Конверт несёт только один узел: вторая ссылка идёт мимо синхронизации.
    await emitSession({
      sessionId: 's548e', containerId: 'town', kind: 'hub', revision: 1,
      nodes: [{ containerId: 'cellar', kind: 'loot', name: 'Подвал', locked: true, lockLabel: 'Ржавая дверь', items: [] }],
    });
    const links = h.cards.town.links;
    expect(links.find((l) => l.containerId === 'cellar').lockLabel).toBe('Ржавая дверь');
    expect(links.find((l) => l.containerId === 'hatch').lockLabel).toBe('Люк во двор');
    expect(db.saveGmContainer).toHaveBeenCalled();
  });
});
