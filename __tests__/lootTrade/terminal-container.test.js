import { describe, expect, it } from 'vitest';
import {
  CONTAINER_KIND,
  buildHubSessionNodes,
  getHubIdsContainingChild,
  isContainerVisibleOnRoot,
  normalizeContainerEntity,
  sortContainersForRoot,
} from '../../domain/lootTrade.js';

describe('terminal cards in loot/trade locations', () => {
  it('normalizes terminal settings without inventing inventory rows', () => {
    const terminal = normalizeContainerEntity({
      id: 'term-1',
      kind: 'terminal',
      name: 'Vault console',
      description: 'Power is intermittent.',
      difficulty: 5,
      lockOnFailure: true,
      items: [{ entryId: 'should-not-exist', quantity: 99 }],
    });
    expect(terminal).toMatchObject({
      id: 'term-1',
      kind: CONTAINER_KIND.TERMINAL,
      difficulty: 5,
      lockOnFailure: true,
      items: [],
    });
    expect(normalizeContainerEntity({ kind: 'terminal', difficulty: 99 }).difficulty).toBe(5);
  });

  it('can be linked in a location and included in its room-wide nodes', () => {
    const terminal = normalizeContainerEntity({
      id: 'term-1', kind: 'terminal', name: 'Vault console', difficulty: 3, lockOnFailure: true,
    });
    const hub = normalizeContainerEntity({
      id: 'hub-1', kind: 'hub', name: 'Vault', roomCode: 'GM-AAAAAA',
      links: [{ containerId: 'term-1', locked: false }],
    });
    expect(getHubIdsContainingChild('term-1', [hub, terminal])).toEqual(['hub-1']);
    expect(isContainerVisibleOnRoot(terminal, [hub, terminal])).toBe(false);
    expect(buildHubSessionNodes(hub, [hub, terminal])).toMatchObject([{
      containerId: 'term-1',
      kind: 'terminal',
      difficulty: 3,
      lockOnFailure: true,
      items: [],
    }]);
    expect(sortContainersForRoot([terminal, hub]).map((entry) => entry.id)).toEqual(['hub-1', 'term-1']);
  });
});
