import { rollDie } from './diceRollsLogic';

const NATURAL_ONE = 1;
const COMPLICATION_FACE = 20;
const AUTOMATIC_FAILURE_COMPLICATIONS = 2;

const assertNonNegativeInteger = (value, label) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[d20Checks] ${label} must be a non-negative integer`);
  }
};

const assertSkillIdArray = (value, label) => {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id)) {
    throw new Error(`[d20Checks] ${label} must contain non-empty skill ids`);
  }
};

export const isSkillTagged = ({
  skillId,
  primaryTaggedSkillIds,
  extraTaggedSkillIds,
}) => {
  if (typeof skillId !== 'string' || !skillId) {
    throw new Error('[d20Checks] skillId is required');
  }
  assertSkillIdArray(primaryTaggedSkillIds, 'primaryTaggedSkillIds');
  assertSkillIdArray(extraTaggedSkillIds, 'extraTaggedSkillIds');
  return primaryTaggedSkillIds.includes(skillId) || extraTaggedSkillIds.includes(skillId);
};

const scoreD20 = ({ roll, targetNumber, skillValue, isTagged }) => {
  if (roll === COMPLICATION_FACE) {
    return {
      roll,
      successes: 0,
      isSuccess: false,
      isCriticalSuccess: false,
      isComplication: true,
    };
  }

  if (roll === NATURAL_ONE) {
    return {
      roll,
      successes: 2,
      isSuccess: true,
      isCriticalSuccess: true,
      isComplication: false,
    };
  }

  if (roll > targetNumber) {
    return {
      roll,
      successes: 0,
      isSuccess: false,
      isCriticalSuccess: false,
      isComplication: false,
    };
  }

  const isCriticalSuccess = isTagged && roll <= skillValue;
  return {
    roll,
    successes: isCriticalSuccess ? 2 : 1,
    isSuccess: true,
    isCriticalSuccess,
    isComplication: false,
  };
};

/**
 * Resolves an engine-owned attribute + skill d20 check.
 *
 * Settings provide the selected attribute, skill, difficulty, and dice-pool
 * size. Callers provide whether that skill is actually tagged for the current
 * character; skill rank alone never implies that it is tagged.
 */
export const resolveD20Check = ({
  attributeValue,
  skillValue,
  isTagged,
  difficulty,
  diceCount = 2,
  rollD20 = () => rollDie(20),
}) => {
  assertNonNegativeInteger(attributeValue, 'attributeValue');
  assertNonNegativeInteger(skillValue, 'skillValue');
  assertNonNegativeInteger(difficulty, 'difficulty');
  if (typeof isTagged !== 'boolean') {
    throw new Error('[d20Checks] isTagged must be a boolean');
  }
  if (!Number.isInteger(diceCount) || diceCount < 1) {
    throw new Error('[d20Checks] diceCount must be an integer >= 1');
  }
  if (typeof rollD20 !== 'function') {
    throw new Error('[d20Checks] rollD20 must be a function');
  }

  const targetNumber = attributeValue + skillValue;
  const rolls = Array.from({ length: diceCount }, () => rollD20());
  if (rolls.some((roll) => !Number.isInteger(roll) || roll < 1 || roll > 20)) {
    throw new Error('[d20Checks] d20 roller returned a value outside 1..20');
  }

  const dieResults = rolls.map((roll) => scoreD20({
    roll,
    targetNumber,
    skillValue,
    isTagged,
  }));
  const successes = dieResults.reduce((total, result) => total + result.successes, 0);
  const complicationCount = dieResults.filter((result) => result.isComplication).length;
  const automaticFailure = complicationCount >= AUTOMATIC_FAILURE_COMPLICATIONS;
  const noSuccessFailure = complicationCount > 0 && successes === 0;
  const passed = !automaticFailure && !noSuccessFailure && successes >= difficulty;
  const outcome = passed
    ? (complicationCount > 0 ? 'successWithComplication' : 'success')
    : 'failure';

  return {
    attributeValue,
    skillValue,
    targetNumber,
    isTagged,
    difficulty,
    diceCount,
    rolls,
    dieResults,
    successes,
    complicationCount,
    automaticFailure,
    noSuccessFailure,
    passed,
    outcome,
  };
};
