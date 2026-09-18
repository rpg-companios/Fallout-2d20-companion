// Бочка контрактов выводимости (МК-1, патч 281).
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
  applyModifiers,
  applyPercent,
} from './parameter';
export type {
  ModifierBag,
  ModifierOperation,
  ParameterDefinition,
  ParameterModifier,
  ParameterValueKind,
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
