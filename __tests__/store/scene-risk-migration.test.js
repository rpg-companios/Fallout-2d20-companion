import { describe, expect, it } from 'vitest';
import { migrateCharacterState } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';

describe('scene-risk state migrations', () => {
  it('adds the canonical empty state through the v14 to v17 migration chain', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 14,
      characterName: 'Courier',
    });

    expect(CURRENT_SCHEMA_VERSION).toBe(17);
    expect(migrated).toMatchObject({
      schemaVersion: 17,
      characterName: 'Courier',
      sceneRiskStates: {},
    });
  });

  it('converts the v15 accumulated modifier into a one-check pending modifier', () => {
    const migrated = migrateCharacterState({
      schemaVersion: 15,
      sceneRiskStates: {
        diseaseExposure: {
          sceneStartedAt: 1_000,
          eventIds: ['rawFood'],
          difficultyModifier: 1,
        },
      },
    });

    expect(migrated).toEqual({
      schemaVersion: 17,
      sceneRiskStates: {
        diseaseExposure: {
          sceneStartedAt: 1_000,
          eventIds: ['rawFood'],
          pendingDifficultyModifier: 1,
        },
      },
    });
  });

  it('rejects a malformed v15 scene state instead of inventing defaults', () => {
    expect(() => migrateCharacterState({
      schemaVersion: 15,
      sceneRiskStates: {
        diseaseExposure: {
          sceneStartedAt: 1_000,
          eventIds: ['rawFood'],
        },
      },
    })).toThrow('Invalid v15 scene-risk state');
  });
});
