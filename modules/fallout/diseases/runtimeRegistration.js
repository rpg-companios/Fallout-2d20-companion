import { registerStateMigration } from '../../../src/store/stateExtensions';
import { migrateDiseaseRanks } from './diseaseRanks';

/** Register the Fallout disease-rank migration for the active setting runtime. */
export const activateDiseaseRankMigration = () => registerStateMigration(migrateDiseaseRanks, 24);
