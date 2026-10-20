// Compatibility entrypoint used by tests and older bundled paths. Runtime
// activation uses runtimeRegistration.js and keeps the returned disposer.
import { activateFalloutSurvival } from './runtimeRegistration';

activateFalloutSurvival();

export { createSurvivalState } from './survival';
export { migrateSurvivalField } from './migration';
export { sleepSurvival, survivalConsumableListener } from './operations';
export * from './survival';
