import { describe, it, expect } from 'vitest';
import {
  CHARACTER_TYPES,
  ARMOR_POLICIES,
  getCharacterType,
  isHumanCharacter,
  isMutantCharacter,
  isRobotCharacter,
  isCyborgCharacter,
  isGhoulCharacter,
  getArmorPolicy,
  getBodyPlan,
  tOrigin,
  loadOriginsData,
  loadEnrichedOrigins,
  findEnrichedOrigin,
} from './origins.js';

describe('CHARACTER_TYPES constants', () => {
  it('exposes the five canonical types', () => {
    expect(CHARACTER_TYPES).toEqual({
      HUMAN: 'human',
      MUTANT: 'mutant',
      ROBOT: 'robot',
      CYBORG: 'cyborg',
      GHOUL: 'ghoul',
    });
  });

  it('exposes the three armor policies in camelCase', () => {
    expect(ARMOR_POLICIES).toEqual({
      STANDARD: 'standard',
      RAIDER_ONLY: 'raiderOnly',
      ROBOT_ONLY: 'robotOnly',
    });
  });
});

describe('getCharacterType', () => {
  it('returns origin.characterType when present', () => {
    expect(getCharacterType({ origin: { characterType: 'robot' } })).toBe('robot');
    expect(getCharacterType({ origin: { characterType: 'mutant' } })).toBe('mutant');
  });

  it('falls back to human when origin is absent', () => {
    expect(getCharacterType({})).toBe('human');
  });

  it('falls back to human when characterType is absent', () => {
    expect(getCharacterType({ origin: {} })).toBe('human');
  });

  it('returns human for null/undefined', () => {
    expect(getCharacterType(null)).toBe('human');
    expect(getCharacterType(undefined)).toBe('human');
  });
});

describe('archetype predicates', () => {
  it('isHumanCharacter / isMutantCharacter / isRobotCharacter / isCyborgCharacter / isGhoulCharacter', () => {
    expect(isHumanCharacter({ origin: { characterType: 'human' } })).toBe(true);
    expect(isMutantCharacter({ origin: { characterType: 'mutant' } })).toBe(true);
    expect(isRobotCharacter({ origin: { characterType: 'robot' } })).toBe(true);
    expect(isCyborgCharacter({ origin: { characterType: 'cyborg' } })).toBe(true);
    expect(isGhoulCharacter({ origin: { characterType: 'ghoul' } })).toBe(true);
  });

  it('returns false for non-matching types', () => {
    const human = { origin: { characterType: 'human' } };
    expect(isRobotCharacter(human)).toBe(false);
    expect(isMutantCharacter(human)).toBe(false);
    expect(isCyborgCharacter(human)).toBe(false);
    expect(isGhoulCharacter(human)).toBe(false);
  });

  it('handles null/undefined safely', () => {
    expect(isRobotCharacter(null)).toBe(false);
    expect(isRobotCharacter(undefined)).toBe(false);
    expect(isRobotCharacter({})).toBe(false);
  });
});

describe('getArmorPolicy', () => {
  it('returns type default when origin.armorPolicy is absent', () => {
    expect(getArmorPolicy({ origin: { characterType: 'human' } })).toBe('standard');
    expect(getArmorPolicy({ origin: { characterType: 'mutant' } })).toBe('raiderOnly');
    expect(getArmorPolicy({ origin: { characterType: 'robot' } })).toBe('robotOnly');
    expect(getArmorPolicy({ origin: { characterType: 'ghoul' } })).toBe('standard');
    expect(getArmorPolicy({ origin: { characterType: 'cyborg' } })).toBe('standard');
  });

  it('origin.armorPolicy overrides the type default', () => {
    expect(getArmorPolicy({ origin: { characterType: 'mutant', armorPolicy: 'standard' } })).toBe('standard');
  });

  it('falls back to standard when characterType is missing', () => {
    expect(getArmorPolicy({})).toBe('standard');
  });
});

describe('getBodyPlan', () => {
  it('returns origin.bodyPlan for robot origins', () => {
    expect(getBodyPlan({ origin: { characterType: 'robot', bodyPlan: 'protectron' } })).toBe('protectron');
    expect(getBodyPlan({ origin: { characterType: 'robot', bodyPlan: 'robobrain' } })).toBe('robobrain');
    expect(getBodyPlan({ origin: { characterType: 'robot', bodyPlan: 'misterHandy' } })).toBe('misterHandy');
    expect(getBodyPlan({ origin: { characterType: 'robot', bodyPlan: 'assaultron' } })).toBe('assaultron');
  });

  it('returns humanoid for non-robot origins', () => {
    expect(getBodyPlan({ origin: { characterType: 'human' } })).toBe('humanoid');
    expect(getBodyPlan({ origin: { characterType: 'mutant' } })).toBe('humanoid');
    expect(getBodyPlan({ origin: { characterType: 'ghoul' } })).toBe('humanoid');
    expect(getBodyPlan({ origin: { characterType: 'cyborg' } })).toBe('humanoid');
  });

  it('returns humanoid for missing origin', () => {
    expect(getBodyPlan({})).toBe('humanoid');
  });
});

describe('tOrigin', () => {
  it('returns empty string for missing id', () => {
    expect(tOrigin('')).toBe('');
    expect(tOrigin(null)).toBe('');
    expect(tOrigin(undefined)).toBe('');
  });

  it('falls back to id when translation is missing', () => {
    expect(tOrigin('unknown_origin_id')).toBe('unknown_origin_id');
  });
});

describe('loadOriginsData', () => {
  it('returns the full raw origins array (17 entries)', () => {
    const origins = loadOriginsData();
    expect(Array.isArray(origins)).toBe(true);
    expect(origins).toHaveLength(17);
  });

  it('every origin has the new shape (characterType, image, no legacy fields)', () => {
    const origins = loadOriginsData();
    for (const o of origins) {
      expect(typeof o.id).toBe('string');
      expect(typeof o.characterType).toBe('string');
      expect(typeof o.image).toBe('string');
      expect(Array.isArray(o.traitIds)).toBe(true);
      expect(Array.isArray(o.equipmentKitIds)).toBe(true);
      expect(o.isRobot).toBeUndefined();
      expect(o.isMutant).toBeUndefined();
      expect(o.canWearStandardArmor).toBeUndefined();
      expect(o.canWearRobotArmor).toBeUndefined();
      expect(o.canWearMutantArmor).toBeUndefined();
      expect(o.armorPolicy).toBeUndefined();
    }
  });

  it('every characterType is one of the five canonical values', () => {
    const origins = loadOriginsData();
    const allowed = new Set(Object.values(CHARACTER_TYPES));
    for (const o of origins) {
      expect(allowed.has(o.characterType)).toBe(true);
    }
  });

  it('maps all 17 origin ids to the correct characterType per contract', () => {
    const origins = loadOriginsData();
    const byId = Object.fromEntries(origins.map((o) => [o.id, o.characterType]));
    expect(byId.brotherhood).toBe('human');
    expect(byId.ncr).toBe('human');
    expect(byId.minuteman).toBe('human');
    expect(byId.childOfAtom).toBe('human');
    expect(byId.vaultDweller).toBe('human');
    expect(byId.survivor).toBe('human');
    expect(byId.brotherhoodOutcast).toBe('human');
    expect(byId.savage).toBe('human');
    expect(byId.superMutant).toBe('mutant');
    expect(byId.shadow).toBe('mutant'); // shadow = mutant (per contract)
    expect(byId.ghoul).toBe('ghoul');
    expect(byId.synth).toBe('cyborg');
    expect(byId.robobrain).toBe('robot');
    expect(byId.securitron).toBe('robot');
    expect(byId.assaultron).toBe('robot');
    expect(byId.misterHandy).toBe('robot');
    expect(byId.protectron).toBe('robot');
  });

  it('robot origins all have a specific bodyPlan', () => {
    const origins = loadOriginsData().filter((o) => o.characterType === 'robot');
    for (const o of origins) {
      expect(['robobrain', 'protectron', 'assaultron', 'misterHandy']).toContain(o.bodyPlan);
    }
  });
});

describe('loadEnrichedOrigins', () => {
  it('returns enriched origins with name, image, equipmentKits', () => {
    const enriched = loadEnrichedOrigins();
    expect(enriched).toHaveLength(17);
    for (const o of enriched) {
      expect(typeof o.id).toBe('string');
      expect(typeof o.name).toBe('string');
      expect(o.characterType).toBeTruthy();
      expect(o.image).toBeTruthy();
      expect(Array.isArray(o.traitIds)).toBe(true);
      expect(Array.isArray(o.equipmentKitIds)).toBe(true);
      expect(Array.isArray(o.equipmentKits)).toBe(true);
    }
  });

  it('every origin has at least one equipment kit', () => {
    const enriched = loadEnrichedOrigins();
    for (const o of enriched) {
      expect(o.equipmentKits.length).toBeGreaterThan(0);
    }
  });
});

describe('findEnrichedOrigin', () => {
  it('returns enriched origin for known id', () => {
    const brotherhood = findEnrichedOrigin('brotherhood');
    expect(brotherhood?.id).toBe('brotherhood');
    expect(brotherhood?.characterType).toBe('human');
  });

  it('returns null for unknown id', () => {
    expect(findEnrichedOrigin('nonexistent')).toBeNull();
  });

  it('returns null for empty/null input', () => {
    expect(findEnrichedOrigin('')).toBeNull();
    expect(findEnrichedOrigin(null)).toBeNull();
    expect(findEnrichedOrigin(undefined)).toBeNull();
  });
});
