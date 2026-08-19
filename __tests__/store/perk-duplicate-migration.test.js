import { describe, expect, it } from 'vitest';
import { migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

describe('v15 to v16 duplicate perk ranks', () => {
  it('trims extra rank-1 picks, frees the slot and asks to show a notice', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 15,
      selectedPerks: [
        { id: 'junktownVendor', maxRanks: 1 },
        { id: 'junktownVendor', maxRanks: 1 },
        { id: 'snakeater', maxRanks: 1 },
      ],
    });

    expect(CURRENT_SCHEMA_VERSION).toBe(16);
    expect(migrated.schemaVersion).toBe(16);
    expect(migrated.selectedPerks.map((perk) => perk.id)).toEqual(['junktownVendor', 'snakeater']);
    expect(migrated.pendingPerkDuplicateNotice).toBe(true);
  });

  it('does not raise a notice when there is nothing to trim', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 15,
      selectedPerks: [{ id: 'junktownVendor', maxRanks: 1 }],
    });

    expect(migrated.selectedPerks).toHaveLength(1);
    expect(migrated.pendingPerkDuplicateNotice).toBeUndefined();
  });
});
