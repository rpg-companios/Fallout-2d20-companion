import { describe, expect, it } from 'vitest';
import {
  CONTAINER_KIND,
  buildHubSessionNodes,
  buildStandaloneTerminalSessionNode,
  decodeTerminalNodeMarker,
  encodeTerminalNodeMarker,
  normalizeContainerEntity,
  resolveTerminalSessionNode,
} from '../../domain/lootTrade.js';
import { normalizeActiveSession, applySessionUpdate } from '../../server/lootTradeSession.js';
import { decodeTerminalNodeMarker as serverDecodeMarker } from '../../server/terminalHacking.js';

const terminal = normalizeContainerEntity({
  id: 'term-1', kind: 'terminal', name: 'Vault console', difficulty: 3, lockOnFailure: true,
});
const hub = normalizeContainerEntity({
  id: 'hub-1', kind: 'hub', name: 'Vault', roomCode: 'GM-AAAAAA',
  links: [{ containerId: 'term-1', locked: false, lockLabel: 'Доступ запрещён' }],
});

/** Точная копия нормализации узла из сервера версии 481 (до патча 487). */
const legacyServerNode = (node) => ({
  containerId: node.containerId,
  kind: 'loot',
  name: node.name,
  description: node.description,
  locked: Boolean(node.locked),
  lockLabel: String(node.lockLabel || '').trim(),
  caps: 0,
  saleMarkupPercent: 0,
  buyDepreciationPercent: 50,
  characterOverrides: {},
  items: [],
});

describe('terminal node marker survives a legacy room server', () => {
  it('is attached to hub session nodes and keeps the original lock label', () => {
    const [node] = buildHubSessionNodes(hub, [hub, terminal]);
    expect(node.kind).toBe(CONTAINER_KIND.TERMINAL);
    expect(decodeTerminalNodeMarker(node.lockLabel)).toMatchObject({
      difficulty: 3,
      lockOnFailure: true,
      label: 'Доступ запрещён',
    });
    // CJS-копия на сервере понимает тот же формат.
    expect(serverDecodeMarker(node.lockLabel)).toEqual(decodeTerminalNodeMarker(node.lockLabel));
  });

  it('restores a terminal after the old server downgraded it to a chest', () => {
    const [node] = buildHubSessionNodes(hub, [hub, terminal]);
    const stale = legacyServerNode(node);
    const resolved = resolveTerminalSessionNode(stale);
    expect(resolved.isTerminal).toBe(true);
    expect(resolved.node).toMatchObject({
      kind: CONTAINER_KIND.TERMINAL,
      difficulty: 3,
      lockOnFailure: true,
      lockLabel: 'Доступ запрещён',
    });
    expect(resolved.node.lockLabel).not.toContain('F2D20-TERM:');
  });

  it('upgrades a marker-only node on the new server and keeps the marker', () => {
    const [node] = buildHubSessionNodes(hub, [hub, terminal]);
    const stale = legacyServerNode(node);
    const session = normalizeActiveSession({
      kind: 'hub',
      name: 'Vault',
      targetType: 'character',
      targetCharacterId: 'char-1',
      nodes: [stale],
    }, 1000);
    expect(session.nodes[0]).toMatchObject({
      kind: 'terminal',
      difficulty: 3,
      lockOnFailure: true,
    });
    expect(serverDecodeMarker(session.nodes[0].lockLabel)).toBeTruthy();
    expect(session.targetType).toBe('room');
  });

  it('refreshes the marker when the GM changes terminal settings live', () => {
    const session = normalizeActiveSession({
      kind: 'hub',
      name: 'Vault',
      targetType: 'room',
      nodes: [buildStandaloneTerminalSessionNode(terminal)],
    }, 1000);
    const updated = applySessionUpdate(session, {
      sessionId: session.sessionId,
      nodeContainerId: terminal.id,
      nodeDifficulty: 5,
      nodeLockOnFailure: false,
    }, 2000);
    expect(updated.session.nodes[0]).toMatchObject({
      kind: 'terminal',
      difficulty: 5,
      lockOnFailure: false,
    });
    expect(decodeTerminalNodeMarker(updated.session.nodes[0].lockLabel)).toMatchObject({
      difficulty: 5,
      lockOnFailure: false,
    });
  });

  it('ignores malformed markers on ordinary loot nodes', () => {
    const node = { containerId: 'chest-1', kind: 'loot', name: 'Chest', items: [] };
    expect(decodeTerminalNodeMarker(node.lockLabel)).toBeNull();
    expect(resolveTerminalSessionNode({ ...node, lockLabel: 'F2D20-TERM:{bad json}' })).toMatchObject({
      isTerminal: false,
    });
    expect(resolveTerminalSessionNode({ ...node, lockLabel: encodeTerminalNodeMarker({ difficulty: 2 }) }).node.difficulty).toBe(2);
  });
});
