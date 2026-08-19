import { describe, expect, it } from 'vitest';
import { migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

describe('v14 to v15 scene-risk state migration', () => {
  it('adds the canonical empty state through the migration chain', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 14,
      characterName: 'Courier',
    });

    expect(CURRENT_SCHEMA_VERSION).toBe(16);
    expect(migrated).toMatchObject({
      schemaVersion: 16,
      characterName: 'Courier',
      sceneRiskStates: {},
    });
  });
});
