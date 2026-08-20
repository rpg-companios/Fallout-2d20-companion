import { describe, expect, it } from 'vitest';
import { migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

describe('v16 to v17 duplicate perk ranks', () => {
  it('trims extra rank-1 picks, slims to {id, rank} and asks to show a notice', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 16,
      selectedPerks: [
        { id: 'junktownVendor', maxRanks: 1 },
        { id: 'junktownVendor', maxRanks: 1 },
        { id: 'snakeater', maxRanks: 1 },
      ],
    });

    expect(CURRENT_SCHEMA_VERSION).toBe(17);
    expect(migrated.schemaVersion).toBe(17);
    expect(migrated.selectedPerks).toEqual([
      { id: 'junktownVendor', rank: 1 },
      { id: 'snakeater', rank: 1 },
    ]);
    expect(migrated.pendingPerkDuplicateNotice).toBe(true);
  });

  it('does not raise a notice when there is nothing to trim', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 16,
      selectedPerks: [{ id: 'junktownVendor', maxRanks: 1, perk_name: 'Junktown Vendor' }],
    });

    expect(migrated.selectedPerks).toEqual([{ id: 'junktownVendor', rank: 1 }]);
    expect(migrated.pendingPerkDuplicateNotice).toBeUndefined();
  });

  it('keeps a perk without id so the load alert can name it', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 16,
      selectedPerks: [{ perk_name: 'Broken Vendor' }],
    });

    expect(migrated.schemaVersion).toBe(17);
    expect(migrated.selectedPerks).toEqual([{ perk_name: 'Broken Vendor' }]);
  });
});
