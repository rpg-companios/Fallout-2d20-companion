import { resolveD20Check } from './d20Checks';

const MINUTE_MS = 60 * 1000;

export const createSceneRiskState = () => ({
  sceneStartedAt: null,
  eventIds: [],
  pendingDifficultyModifier: 0,
});

const assertFiniteInteger = (value, label, { min = 0 } = {}) => {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`[sceneRiskChecks] ${label} must be an integer >= ${min}`);
  }
};

const assertRule = (rule) => {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    throw new Error('[sceneRiskChecks] Risk-check rule must be an object');
  }
  if (typeof rule.id !== 'string' || !rule.id) {
    throw new Error('[sceneRiskChecks] Rule id is required');
  }
  assertFiniteInteger(rule.sceneDurationMinutes, 'sceneDurationMinutes', { min: 1 });
  assertFiniteInteger(rule.maxDifficulty, 'maxDifficulty', { min: 1 });
  if (
    !Array.isArray(rule.eventTypes)
    || rule.eventTypes.some((eventId) => typeof eventId !== 'string' || !eventId)
    || new Set(rule.eventTypes).size !== rule.eventTypes.length
  ) {
    throw new Error('[sceneRiskChecks] eventTypes must contain unique non-empty strings');
  }
  if (typeof rule.test?.attribute !== 'string' || !rule.test.attribute) {
    throw new Error('[sceneRiskChecks] test.attribute is required');
  }
  if (typeof rule.test?.skill !== 'string' || !rule.test.skill) {
    throw new Error('[sceneRiskChecks] test.skill is required');
  }
  if (rule.roll?.rollType !== 'rollD20') {
    throw new Error('[sceneRiskChecks] Only structured rollD20 checks are supported');
  }
  assertFiniteInteger(rule.roll.rollValue, 'roll.rollValue', { min: 1 });
  assertFiniteInteger(
    rule.complication?.nextEventDifficultyModifier,
    'complication.nextEventDifficultyModifier',
  );
};

const assertState = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('[sceneRiskChecks] Scene risk state must be an object');
  }
  if (state.sceneStartedAt !== null && (!Number.isFinite(state.sceneStartedAt) || state.sceneStartedAt < 0)) {
    throw new Error('[sceneRiskChecks] sceneStartedAt must be null or a non-negative timestamp');
  }
  if (!Array.isArray(state.eventIds) || state.eventIds.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('[sceneRiskChecks] eventIds must contain non-empty strings');
  }
  if (new Set(state.eventIds).size !== state.eventIds.length) {
    throw new Error('[sceneRiskChecks] eventIds must be unique');
  }
  assertFiniteInteger(state.pendingDifficultyModifier, 'pendingDifficultyModifier');
};

const assertStateRegistry = (states) => {
  if (!states || typeof states !== 'object' || Array.isArray(states)) {
    throw new Error('[sceneRiskChecks] Scene risk states must be an object');
  }
  Object.entries(states).forEach(([ruleId, state]) => {
    if (!ruleId) {
      throw new Error('[sceneRiskChecks] Scene risk state rule id is required');
    }
    assertState(state);
  });
};

const resetExpiredScene = (rule, state, now) => {
  if (state.sceneStartedAt === null) return state;
  const sceneDurationMs = rule.sceneDurationMinutes * MINUTE_MS;
  return now >= state.sceneStartedAt + sceneDurationMs
    ? createSceneRiskState()
    : state;
};

/**
 * Registers one explicitly declared setting event and, for a new event type in
 * the current scene, resolves the setting-provided attribute + skill check.
 *
 * The engine does not inspect item ids, names, or localized text. A setting must
 * put a canonical sceneRiskEvents entry on the source item and pass its rule here.
 */
export const resolveSceneRiskEvent = ({
  rule,
  state,
  eventId,
  attributeValue,
  skillValue,
  isTagged,
  now = Date.now(),
  rollD20,
}) => {
  assertRule(rule);
  assertState(state);
  if (typeof eventId !== 'string' || !eventId) {
    throw new Error('[sceneRiskChecks] eventId is required');
  }
  if (!rule.eventTypes.includes(eventId)) {
    throw new Error(`[sceneRiskChecks] Rule "${rule.id}" does not declare event type "${eventId}"`);
  }
  if (!Number.isFinite(now) || now < 0) {
    throw new Error('[sceneRiskChecks] Invalid clock');
  }

  const currentState = resetExpiredScene(rule, state, now);
  if (currentState.eventIds.includes(eventId)) {
    return { status: 'duplicate', state: currentState, check: null };
  }

  const eventIds = [...currentState.eventIds, eventId];
  const sceneStartedAt = currentState.sceneStartedAt ?? now;
  const baseDifficulty = Math.min(rule.maxDifficulty, eventIds.length);
  const appliedDifficultyModifier = currentState.pendingDifficultyModifier;
  const difficulty = Math.min(
    rule.maxDifficulty,
    baseDifficulty + appliedDifficultyModifier,
  );
  const d20Check = resolveD20Check({
    attributeValue,
    skillValue,
    isTagged,
    difficulty,
    diceCount: rule.roll.rollValue,
    rollD20,
  });
  const addedDifficulty = (
    d20Check.complicationCount * rule.complication.nextEventDifficultyModifier
  );
  const pendingDifficultyModifier = Math.min(rule.maxDifficulty, addedDifficulty);

  return {
    status: 'checked',
    state: {
      sceneStartedAt,
      eventIds,
      pendingDifficultyModifier,
    },
    check: {
      ruleId: rule.id,
      eventId,
      attribute: rule.test.attribute,
      skill: rule.test.skill,
      baseDifficulty,
      appliedDifficultyModifier,
      ...d20Check,
      addedDifficulty,
    },
  };
};

/**
 * Owns the canonical scene state for every risk rule of one character.
 * Event categories never keep local counters, and resolving an event updates
 * this registry synchronously before control returns to UI code.
 */
export const createSceneRiskTracker = (initialStates) => {
  assertStateRegistry(initialStates);
  let states = initialStates;

  return {
    getStates: () => states,
    replaceStates: (nextStates) => {
      assertStateRegistry(nextStates);
      states = nextStates;
      return states;
    },
    resolveEvent: (params) => {
      const { rule } = params;
      const result = resolveSceneRiskEvent({
        ...params,
        state: states[rule.id] ?? createSceneRiskState(),
      });
      if (result.status === 'checked') {
        states = {
          ...states,
          [rule.id]: result.state,
        };
      }
      return { result, states };
    },
  };
};

export const getSceneRiskEventForRule = (item, ruleId) => {
  if (!item || item.sceneRiskEvents === undefined) return null;
  if (!Array.isArray(item.sceneRiskEvents)) {
    throw new Error('[sceneRiskChecks] item.sceneRiskEvents must be an array');
  }
  const matches = item.sceneRiskEvents.filter((entry) => entry?.ruleId === ruleId);
  if (matches.length > 1) {
    throw new Error(`[sceneRiskChecks] Item declares rule "${ruleId}" more than once`);
  }
  if (matches.length === 0) return null;
  const event = matches[0];
  if (typeof event.eventId !== 'string' || !event.eventId) {
    throw new Error(`[sceneRiskChecks] Rule "${ruleId}" eventId is required`);
  }
  return event;
};
