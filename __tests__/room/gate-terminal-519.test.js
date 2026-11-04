// Приёмочный тест 519: привязанный терминал — «замок» сундука, а не соседняя
// карточка. Игрок не видит терминал в локации; нажатие на запертый сундук
// открывает мини-игру именно этого терминала; добыча доступна после взлома.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { normalizeActiveSession, sanitizeSessionForMember } from '../../server/lootTradeSession.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const hub = () => normalizeActiveSession({
  name: 'Бункер', kind: 'hub', targetType: 'room',
  nodes: [
    { containerId: 't1', kind: 'terminal', name: 'Терминал', difficulty: 3 },
    {
      containerId: 'c1', kind: 'loot', name: 'Сундук',
      linkedCheckId: 't1',
      items: [{ entryId: 'e1', name: 'Патроны', quantity: 1 }],
    },
  ],
});

describe('519: терминал-замок скрыт из локации', () => {
  it('нормализация помечает терминал, на который ссылается сундук', () => {
    const nodes = hub().nodes;
    expect(nodes.find((n) => n.containerId === 't1').hiddenForPlayers).toBe(true);
    expect(nodes.find((n) => n.containerId === 'c1').hiddenForPlayers).toBe(false);
    expect(nodes.find((n) => n.containerId === 'c1').linkedCheckId).toBe('t1');
  });

  it('игрок видит только сундук, Мастер — оба узла', () => {
    const session = hub();
    expect(sanitizeSessionForMember(session, { isGm: false }).nodes.map((n) => n.containerId))
      .toEqual(['c1']);
    expect(sanitizeSessionForMember(session, { isGm: true }).nodes.map((n) => n.containerId))
      .toEqual(['t1', 'c1']);
  });

  it('запертый сундук не отдаёт игроку содержимое до взлома', () => {
    const registry = createRoomRegistry({ now: () => 1000 });
    const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол', ownerToken: 'tok' });
    registry.joinRoom({ code: room.code, clientId: 'gm', name: 'GM', role: 'gm' });
    registry.joinRoom({ code: room.code, clientId: 'p1', name: 'Игрок', role: 'player' });
    registry.openSession({ code: room.code, clientId: 'gm', session: hub() });

    const state = registry.getState(room.code);
    const playerView = sanitizeSessionForMember(
      registry.getRoom(room.code).activeSession, { isGm: false },
    );
    const chest = playerView.nodes.find((n) => n.containerId === 'c1');
    expect(playerView.nodes).toHaveLength(1);
    expect(chest.keyAccessState).toBe('needs-check');
    expect(chest.locked).toBe(true);
    expect(chest.items).toHaveLength(0);
    // Мини-игра скрытого терминала всё равно зарегистрирована на комнате.
    expect(state.terminalStates.t1).toBeTruthy();

    const denied = registry.lootTake({
      code: room.code, clientId: 'p1',
      payload: { characterId: 'c1', nodeContainerId: 'c1', takes: [{ entryId: 'e1', quantity: 1 }] },
    });
    expect(denied.error).toBe('CONTAINER_LOCKED');

    // Взлом терминала даёт событие и открывает сундук.
    const raw = registry._rooms.get(room.code);
    raw.terminalStates.get('t1').game = { status: 'won', operatorName: 'Игрок' };
    registry.recomputeKeyAccess(room.code);
    const opened = sanitizeSessionForMember(
      registry.getRoom(room.code).activeSession, { isGm: false },
    );
    expect(opened.nodes.find((n) => n.containerId === 'c1').locked).toBe(false);
    expect(opened.nodes.find((n) => n.containerId === 'c1').items).toHaveLength(1);
    expect(registry.getAccessEvents(room.code).t1).toBeTruthy();
  });
});

describe('519: интерфейс игрока и документы', () => {
  const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');

  it('у запертой точки с воротами есть кнопки просмотра и взлома', () => {
    expect(overlay).toContain('gateAvailable');
    expect(overlay).toContain('gate-hack-button-');
    expect(overlay).toContain('gate-view-button-');
    expect(overlay).toContain('gateHackAllowed');
    expect(overlay).toContain("tLootTrade('terminal.hack')");
    expect(overlay).toContain("node.keyAccessState !== 'denied'");
  });

  it('обязательный ключ не обойти взломом', () => {
    expect(overlay).toContain("tLootTrade(node.keyAccessState === 'denied'");
    expect(read('server/keyAccess.js')).toContain("if (requirement.keyRequirement === 'required')");
  });

  it('сервер скрывает узел и сохраняет состояние мини-игры', () => {
    const session = read('server/lootTradeSession.js');
    expect(session).toContain('hiddenForPlayers');
    expect(session).toContain('.filter((node) => !node.hiddenForPlayers)');
    expect(read('server/roomRegistry.js')).toContain('syncTerminalNodes(room, normalized');
  });

  it('подписи парные RU/EN', () => {
    for (const loc of ['ru-RU', 'en-EN']) {
      const d = JSON.parse(read(`i18n/${loc}/screens/lootTrade/screen.json`));
      expect(d.player.gateTerminal).toBeTruthy();
    }
  });

  it('roadmap обновлён до 519', () => {
    const plan = read('docs/roadmap.md');
    expect(plan).toContain('519');
    expect(plan).toContain('Осталось после патча');
    expect(plan).toContain('Мини-игра взлома замков');
  });
});
