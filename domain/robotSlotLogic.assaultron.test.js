import { describe, expect, it } from 'vitest';
import { buildRobotSlotStats } from './robotSlotLogic.js';

const t = (key) => key;

describe('robot slot immunity display', () => {
  it('shows infinity for radiation when robot has radiation immunity', () => {
    const { stats } = buildRobotSlotStats('body', { limb: { id: 'robot_body_assaultron', radDR: 0 } }, { t, hasRadImmunity: true });
    expect(stats[2]).toMatchObject({ label: 'armor.fields.radiation', value: '∞' });
  });

  it('shows numeric radiation DR when immunity is absent', () => {
    const { stats } = buildRobotSlotStats('body', { limb: { id: 'robot_body_assaultron', radDR: 0 } }, { t });
    expect(stats[2]).toMatchObject({ label: 'armor.fields.radiation', value: '0' });
  });
});
