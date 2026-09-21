// Бочка контрактов выводимости (МК-1, патчи 281–283).
// Единственный типизированный вход движка для сеттингов. Ничего не исполняется —
// только типы и чистые функции; реестр живёт в src/engine/derivations/registry.ts.

export type {
  CounterDefinition,
  SpendOutcome,
} from './counter';
export type {
  DerivationContext,
  DerivedDefinition,
  TargetedModifier,
} from './derived';
export {
  ceilingFor,
} from './bands';
export type {
  RankBand,
  RankBands,
} from './bands';
export {
  applyPercent,
  applyPipeline,
  applyWithinPhase,
  DEFAULT_PHASES,
  defaultPhaseFor,
  resolvePhases,
  roundValue,
} from './parameter';
export type {
  DerivationContext as ModifierContext,
  ModifierBag,
  ModifierOperation,
  ModifierPhase,
  ParameterDefinition,
  ParameterModifier,
  ParameterValueKind,
  RoundingMode,
} from './parameter';
export {
  checkRequirements,
} from './requirements';
export type {
  GateCheck,
  Requirement,
} from './requirements';
export {
  changedParams,
} from './reactions';
export type {
  ReactionDefinition,
} from './reactions';
export {
  validateSettingExtension,
} from './setting';
export type {
  SettingExtension,
} from './setting';
