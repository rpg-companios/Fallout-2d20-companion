import { describe, expect, it, vi } from 'vitest';
import { isSkillTagged, resolveD20Check } from '../../domain/d20Checks';

const roller = (values) => {
  const queue = [...values];
  return vi.fn(() => {
    if (queue.length === 0) throw new Error('test roller exhausted');
    return queue.shift();
  });
};

const check = ({
  attributeValue = 6,
  skillValue = 3,
  isTagged = false,
  difficulty = 1,
  rolls = [5, 6],
} = {}) => resolveD20Check({
  attributeValue,
  skillValue,
  isTagged,
  difficulty,
  diceCount: rolls.length,
  rollD20: roller(rolls),
});

describe('engine d20 checks', () => {
  it('recognizes both primary and extra tagged skills without inferring a tag from rank', () => {
    const primaryTaggedSkillIds = ['SURVIVAL'];
    const extraTaggedSkillIds = ['SCIENCE'];
    expect(isSkillTagged({
      skillId: 'SURVIVAL',
      primaryTaggedSkillIds,
      extraTaggedSkillIds,
    })).toBe(true);
    expect(isSkillTagged({
      skillId: 'SCIENCE',
      primaryTaggedSkillIds,
      extraTaggedSkillIds,
    })).toBe(true);
    expect(isSkillTagged({
      skillId: 'REPAIR',
      primaryTaggedSkillIds,
      extraTaggedSkillIds,
    })).toBe(false);
  });

  it('uses attribute + skill as the target number and compares successes with difficulty', () => {
    expect(check({ rolls: [8, 9], difficulty: 2 })).toMatchObject({
      targetNumber: 9,
      successes: 2,
      complicationCount: 0,
      passed: true,
      outcome: 'success',
    });
    expect(check({ rolls: [9, 10], difficulty: 2 })).toMatchObject({
      successes: 1,
      passed: false,
      outcome: 'failure',
    });
  });

  it('always gives exactly two successes for a natural 1', () => {
    expect(check({
      attributeValue: 0,
      skillValue: 0,
      isTagged: false,
      difficulty: 2,
      rolls: [1],
    })).toMatchObject({
      targetNumber: 0,
      successes: 2,
      passed: true,
    });
    expect(check({ isTagged: true, rolls: [1], difficulty: 2 }).successes).toBe(2);
  });

  it('gives two successes at or below the skill rank only when the skill is tagged', () => {
    const tagged = check({ isTagged: true, rolls: [3, 4], difficulty: 3 });
    expect(tagged.dieResults.map((result) => result.successes)).toEqual([2, 1]);
    expect(tagged.passed).toBe(true);

    const untagged = check({ isTagged: false, rolls: [3, 4], difficulty: 3 });
    expect(untagged.dieResults.map((result) => result.successes)).toEqual([1, 1]);
    expect(untagged.passed).toBe(false);
  });

  it('resolves one success plus a natural 20 as success with a complication', () => {
    expect(check({ rolls: [9, 20], difficulty: 1 })).toMatchObject({
      successes: 1,
      complicationCount: 1,
      automaticFailure: false,
      passed: true,
      outcome: 'successWithComplication',
    });
  });

  it('fails when a natural 20 is rolled and the pool produces no successes', () => {
    expect(check({ rolls: [10, 20], difficulty: 0 })).toMatchObject({
      successes: 0,
      complicationCount: 1,
      noSuccessFailure: true,
      passed: false,
      outcome: 'failure',
    });
  });

  it('fails automatically when two natural 20s are rolled', () => {
    expect(check({ rolls: [1, 20, 20], difficulty: 1 })).toMatchObject({
      successes: 2,
      complicationCount: 2,
      automaticFailure: true,
      passed: false,
      outcome: 'failure',
    });
  });

  it('rejects invalid canonical check input instead of normalizing it', () => {
    expect(() => check({ attributeValue: 6.5 })).toThrow('attributeValue');
    expect(() => check({ rolls: [0] })).toThrow('outside 1..20');
    expect(() => resolveD20Check({
      attributeValue: 6,
      skillValue: 3,
      isTagged: 'yes',
      difficulty: 1,
    })).toThrow('isTagged');
  });
});
