// Compatibility entrypoint for legacy tests/importers. Runtime activation uses
// runtimeRegistration.js so it can unregister setting-owned migration hooks.
import { activateDiseaseRankMigration } from './runtimeRegistration';

activateDiseaseRankMigration();

export { migrateDiseaseRanks } from './diseaseRanks';
