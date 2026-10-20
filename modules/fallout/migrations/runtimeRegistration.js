import { registerStateMigration } from '../../../src/store/stateExtensions.js';
import {
  migrateChairmenClothingV7V8,
  migrateConflictingWeaponQualitiesV2V3,
  migrateLegacyWeaponEffectIdsV0V1,
  migrateLegacyPerkIdsV17V18,
  migrateRemovedSynthModsV25V26,
  migrateSavageOriginV5V6,
  migrateStraightRazorV6V7,
  migrateTaggedSkillRewardJournalV1V2,
} from './catalogHistory.js';
import { FALLOUT_LEGACY_CHARACTER_MIGRATIONS } from './legacyCharacter.js';
import {
  migrateRobotArmAttachments,
  migrateRobotPlatingIds,
  migrateRobotSlotStatsV8V9,
} from './robotEquipment.js';

const FALLOUT_SAVE_MIGRATIONS = Object.freeze([
  { index: 0, migration: migrateLegacyWeaponEffectIdsV0V1 },
  { index: 1, migration: migrateTaggedSkillRewardJournalV1V2 },
  { index: 2, migration: migrateConflictingWeaponQualitiesV2V3 },
  { index: 5, migration: migrateSavageOriginV5V6 },
  { index: 6, migration: migrateStraightRazorV6V7 },
  { index: 7, migration: migrateChairmenClothingV7V8 },
  { index: 8, migration: migrateRobotSlotStatsV8V9 },
  ...FALLOUT_LEGACY_CHARACTER_MIGRATIONS,
  { index: 17, migration: migrateLegacyPerkIdsV17V18 },
  { index: 20, migration: migrateRobotPlatingIds },
  { index: 21, migration: migrateRobotArmAttachments },
  { index: 25, migration: migrateRemovedSynthModsV25V26 },
].map((registration) => Object.freeze(registration)));

/** Register Fallout's historical save migrations at their original versions. */
export const activateFalloutSaveMigrations = () => {
  const disposers = [];
  try {
    for (const { migration, index } of FALLOUT_SAVE_MIGRATIONS) {
      disposers.push(registerStateMigration(migration, index));
    }
  } catch (error) {
    disposers.reverse().forEach((dispose) => dispose?.());
    throw error;
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    disposers.reverse().forEach((dispose) => dispose?.());
  };
};
