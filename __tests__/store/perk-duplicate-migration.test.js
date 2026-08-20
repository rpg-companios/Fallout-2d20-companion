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

    expect(CURRENT_SCHEMA_VERSION).toBe(18);
    expect(migrated.schemaVersion).toBe(18);
    expect(migrated.selectedPerks).toEqual([
      { id: 'junktownVendor', rank: 1 },
      { id: 'snakeater', rank: 1 },
    ]);
    expect(migrated.pendingPerkDuplicateNotice).toBe(true);
  });

  it('does not raise a notice when there is nothing to trim', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 15,
      selectedPerks: [{ id: 'junktownVendor', maxRanks: 1, perk_name: 'Junktown Vendor' }],
    });

    expect(migrated.selectedPerks).toEqual([{ id: 'junktownVendor', rank: 1 }]);
    expect(migrated.pendingPerkDuplicateNotice).toBeUndefined();
  });

  it('v17 keeps a perk without id so the load alert can name it', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 16,
      selectedPerks: [{ perk_name: 'Broken Vendor' }],
    });

    expect(migrated.schemaVersion).toBe(18);
    expect(migrated.selectedPerks).toEqual([{ perk_name: 'Broken Vendor' }]);
  });

  it('v18 remaps triggerRush to scrounger and drops extras over maxRanks', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 17,
      selectedPerks: [
        { id: 'triggerRush', rank: 1 },
        { id: 'scrounger', rank: 1 },
        { id: 'scrounger', rank: 2 },
        { id: 'scrounger', rank: 3 },
        { id: 'slacker', rank: 1 },
        { id: 'bullRush', rank: 1 },
      ],
    });

    expect(migrated.schemaVersion).toBe(18);
    expect(migrated.selectedPerks).toEqual([
      { id: 'scrounger', rank: 1 },
      { id: 'scrounger', rank: 2 },
      { id: 'scrounger', rank: 3 },
      { id: 'dodger', rank: 1 },
      { id: 'painTrain', rank: 1 },
    ]);
    expect(migrated.pendingPerkDuplicateNotice).toBe(true);
  });
});
