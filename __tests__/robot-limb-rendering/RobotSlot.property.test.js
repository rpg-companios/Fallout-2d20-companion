/**
 * Property-based tests for RobotSlot pure logic (RobotSlotLogic.js)
 *
 * Tests run in node environment (no React renderer).
 * All properties use fast-check with numRuns: 100.
 *
 * Tag: Feature: robot-limb-rendering
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildRobotSlotStats, getDrValue } from '../../components/screens/WeaponsAndArmorScreen/RobotSlotLogic.js';
import { getRobotSlotKeys } from '../../domain/robotEquip.js';

// Stub translation function — returns the key itself so tests are i18n-independent
const t = (key) => key;

// All valid slot keys across all body plans
const ALL_SLOT_KEYS = [
  'head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg',
  'arm1', 'arm2', 'arm3', 'thruster', 'chassis',
];

const slotKeyArb = fc.constantFrom(...ALL_SLOT_KEYS);

// Arbitrary for a DR layer: null or { physicalDamageRating: integer } or { dr: integer }
const drLayerArb = fc.oneof(
  fc.constant(null),
  fc.record({ physicalDamageRating: fc.integer({ min: 0, max: 100 }) }),
  fc.record({ dr: fc.integer({ min: 0, max: 100 }) }),
);

// Arbitrary for a limb object with a name field
const limbWithNameArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
});

// Arbitrary for slotData with all layers
const slotDataArb = fc.record({
  limb: fc.oneof(fc.constant(null), limbWithNameArb),
  plating: drLayerArb,
  armor: drLayerArb,
  frame: drLayerArb,
  heldWeapon: fc.constant(null),
});

// All known body plans
const BODY_PLANS = ['protectron', 'assaultron', 'sentryBot', 'misterHandy', 'robobrain'];
const EXPECTED_SLOT_COUNTS = {
  protectron: 6,
  assaultron: 6,
  sentryBot: 6,
  misterHandy: 6,
  robobrain: 5,
};

// Helper: chunk array into rows of given size
const chunkSlotKeys = (keys, size) => {
  const chunks = [];
  for (let i = 0; i < keys.length; i += size) {
    chunks.push(keys.slice(i, i + size));
  }
  return chunks;
};

// ---------------------------------------------------------------------------
// Property 1: slotTitle is always a non-empty string
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 1: slotTitle всегда непустая строка', () => {
  it('для любого slotKey buildRobotSlotStats возвращает непустой slotTitle', () => {
    fc.assert(
      fc.property(slotKeyArb, (slotKey) => {
        const { slotTitle } = buildRobotSlotStats(slotKey, {}, { t });
        expect(typeof slotTitle).toBe('string');
        expect(slotTitle.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: limbName equals limb.name when limb has a name field
// Validates: Requirements 1.4
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 2: limbName равен limb.name', () => {
  it('для любого limb с полем name, limbName в результате равен limb.name', () => {
    fc.assert(
      fc.property(slotKeyArb, limbWithNameArb, (slotKey, limb) => {
        const { limbName } = buildRobotSlotStats(slotKey, { limb }, { t });
        expect(limbName).toBe(limb.name);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: stats always contains exactly 3 value-type DR rows
// Validates: Requirements 2.1, 2.2, 2.3
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 3: три строки DR всегда присутствуют', () => {
  it('для любой комбинации plating/armor/frame stats содержит ровно 3 value-строки с DR', () => {
    fc.assert(
      fc.property(slotKeyArb, drLayerArb, drLayerArb, drLayerArb, (slotKey, plating, armor, frame) => {
        const { stats } = buildRobotSlotStats(
          slotKey,
          { plating, armor, frame },
          { t },
        );

        // The first 3 stats are always the DR rows (value type)
        const drRows = stats.slice(0, 3);
        expect(drRows).toHaveLength(3);

        for (const row of drRows) {
          expect(row.type).toBe('value');
          // Value is either a number string or '—'
          const isNumberString = /^\d+$/.test(row.value);
          const isDash = row.value === '—';
          expect(isNumberString || isDash).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: stats always contains exactly 4 button-type rows
// Validates: Requirements 3.1, 3.2
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 4: 4 кнопки апгрейда всегда присутствуют', () => {
  it('для любого slotKey stats содержит ровно 4 кнопки (upgradeLimb + 3 слоя)', () => {
    fc.assert(
      fc.property(slotKeyArb, (slotKey) => {
        const { stats } = buildRobotSlotStats(slotKey, {}, { t });
        const buttons = stats.filter((s) => s.type === 'button');
        // 4 upgrade buttons (no weapon in this case)
        expect(buttons).toHaveLength(4);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: upgradeLimb button calls onUpgradeLimb with the exact slotKey
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 5: кнопка апгрейда конечности вызывает onUpgradeLimb(slotKey)', () => {
  it('нажатие кнопки upgradeLimb вызывает onUpgradeLimb с правильным slotKey', () => {
    fc.assert(
      fc.property(slotKeyArb, (slotKey) => {
        let calledWith = undefined;
        const onUpgradeLimb = (key) => { calledWith = key; };

        const { stats } = buildRobotSlotStats(slotKey, {}, { t, onUpgradeLimb });

        // upgradeLimb button is the first button after the DR rows
        const upgradeLimbBtn = stats.find(
          (s) => s.type === 'button' && s.label === t('robotSlot.buttons.upgradeLimb'),
        );
        expect(upgradeLimbBtn).toBeDefined();
        upgradeLimbBtn.onPress();
        expect(calledWith).toBe(slotKey);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: upgrade layer buttons call onUpgradeArmor with the correct layer
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 6: кнопки апгрейда слоя вызывают onUpgradeArmor(layer)', () => {
  it('нажатие кнопки апгрейда слоя вызывает onUpgradeArmor с правильным layer', () => {
    const layers = ['plating', 'armor', 'frame'];
    const layerLabelKeys = {
      plating: t('robotSlot.buttons.upgradePlating'),
      armor: t('robotSlot.buttons.upgradeArmor'),
      frame: t('robotSlot.buttons.upgradeFrame'),
    };

    fc.assert(
      fc.property(slotKeyArb, fc.constantFrom(...layers), (slotKey, layer) => {
        let calledWith = undefined;
        const onUpgradeArmor = (l) => { calledWith = l; };

        const { stats } = buildRobotSlotStats(slotKey, {}, { t, onUpgradeArmor });

        const btn = stats.find(
          (s) => s.type === 'button' && s.label === layerLabelKeys[layer],
        );
        expect(btn).toBeDefined();
        btn.onPress();
        expect(calledWith).toBe(layer);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: weapon row present iff heldWeapon or limb.builtinWeaponId is non-null
// Validates: Requirements 4.1, 4.3
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 7: строка оружия присутствует тогда и только тогда, когда есть оружие', () => {
  it('weapon row iff heldWeapon != null OR limb.builtinWeaponId != null', () => {
    const weaponArb = fc.oneof(
      fc.constant(null),
      fc.record({ id: fc.string({ minLength: 1 }), name: fc.string({ minLength: 1 }) }),
    );
    const builtinWeaponIdArb = fc.oneof(
      fc.constant(null),
      fc.string({ minLength: 1 }),
    );

    fc.assert(
      fc.property(slotKeyArb, weaponArb, builtinWeaponIdArb, (slotKey, heldWeapon, builtinWeaponId) => {
        const limb = builtinWeaponId ? { builtinWeaponId } : null;
        const slotData = { limb, heldWeapon };

        const { stats } = buildRobotSlotStats(slotKey, slotData, { t });

        const hasWeaponRow = stats.some(
          (s) => s.label === t('robotSlot.weapon.builtin') || s.label === t('robotSlot.weapon.held'),
        );

        const shouldHaveWeapon = heldWeapon !== null || builtinWeaponId !== null;
        expect(hasWeaponRow).toBe(shouldHaveWeapon);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: getRobotSlotKeys returns expected count; chunkSlotKeys produces right rows
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 8: количество слотов соответствует bodyPlan', () => {
  it('getRobotSlotKeys(bodyPlan).length равен ожидаемому количеству для каждого bodyPlan', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BODY_PLANS), (bodyPlan) => {
        const keys = getRobotSlotKeys(bodyPlan);
        expect(keys.length).toBe(EXPECTED_SLOT_COUNTS[bodyPlan]);
      }),
      { numRuns: 100 },
    );
  });

  it('chunkSlotKeys(keys, 3) производит правильное количество строк', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BODY_PLANS), (bodyPlan) => {
        const keys = getRobotSlotKeys(bodyPlan);
        const chunks = chunkSlotKeys(keys, 3);
        const expectedRows = Math.ceil(keys.length / 3);
        expect(chunks.length).toBe(expectedRows);
        // Each chunk has at most 3 elements
        for (const chunk of chunks) {
          expect(chunk.length).toBeLessThanOrEqual(3);
        }
        // All keys are preserved
        expect(chunks.flat()).toEqual(keys);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: buildRobotSlotStats with slotData=null/undefined does not throw
// Validates: Requirements 6.3
// ---------------------------------------------------------------------------
describe('Feature: robot-limb-rendering, Property 9: null-безопасность при slotData=null/undefined', () => {
  it('buildRobotSlotStats с slotData=null не бросает ошибок и все DR равны "—"', () => {
    fc.assert(
      fc.property(slotKeyArb, (slotKey) => {
        expect(() => buildRobotSlotStats(slotKey, null, { t })).not.toThrow();
        const { stats } = buildRobotSlotStats(slotKey, null, { t });
        const drRows = stats.slice(0, 3);
        for (const row of drRows) {
          expect(row.value).toBe('—');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('buildRobotSlotStats с slotData=undefined не бросает ошибок и все DR равны "—"', () => {
    fc.assert(
      fc.property(slotKeyArb, (slotKey) => {
        expect(() => buildRobotSlotStats(slotKey, undefined, { t })).not.toThrow();
        const { stats } = buildRobotSlotStats(slotKey, undefined, { t });
        const drRows = stats.slice(0, 3);
        for (const row of drRows) {
          expect(row.value).toBe('—');
        }
      }),
      { numRuns: 100 },
    );
  });
});
