import {
  registerConditionEventListener,
  registerConsumableAppliedListener,
  registerStateExtension,
  registerStateMigration,
} from '../../../src/store/stateExtensions';
import { createSurvivalState, withDiseaseFatigue, withoutDiseaseFatigue } from './survival';
import { migrateSurvivalField } from './migration';
import { survivalConsumableListener } from './operations';

const survivalCharacterType = (character) => {
  const origin = character?.origin;
  if (origin && typeof origin === 'object' && origin.characterType) return origin.characterType;
  return null;
};

const diseaseFatigueListener = (payload, ctx) => {
  const survival = ctx?.stateExtensions?.survival ?? null;
  if (!survival || payload?.kind !== 'disease') return null;
  if (payload.event === 'infected') {
    ctx.setStateExtension('survival', withDiseaseFatigue(survival, 1));
    return { survivalFatigueApplied: true };
  }
  if (payload.event === 'cured') {
    ctx.setStateExtension('survival', withoutDiseaseFatigue(survival, 1));
    return { survivalFatigueRemoved: true };
  }
  return null;
};

/** Register Fallout's state fields and event hooks for the active runtime. */
export const activateFalloutSurvival = () => {
  const dispose = [];
  try {
    dispose.push(registerStateExtension({
      id: 'survival',
      fieldKey: 'survival',
      factory: (character) => {
        const type = survivalCharacterType(character);
        return type ? createSurvivalState(type) : null;
      },
      hydrate: (raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const bedRestHours = Number(raw.bedRestHours);
        return Number.isFinite(bedRestHours) && bedRestHours >= 0
          ? { ...raw, bedRestHours }
          : { ...raw, bedRestHours: 0 };
      },
      reset: () => null,
    }));
    dispose.push(registerStateMigration(migrateSurvivalField, 22));
    dispose.push(registerConsumableAppliedListener({
      id: 'survival',
      listener: survivalConsumableListener,
    }));
    dispose.push(registerConditionEventListener({
      id: 'survivalDiseaseFatigue',
      kind: 'disease',
      event: 'infected',
      listener: diseaseFatigueListener,
    }));
    dispose.push(registerConditionEventListener({
      id: 'survivalDiseaseFatigue',
      kind: 'disease',
      event: 'cured',
      listener: diseaseFatigueListener,
    }));
  } catch (error) {
    dispose.reverse().forEach((unregister) => unregister?.());
    throw error;
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    dispose.reverse().forEach((unregister) => unregister?.());
  };
};
