import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAddiction, recordDoseWithinWindow } from '../../domain/effects';

const DAY_MS = 24 * 60 * 60 * 1000;

const mockCombatDieFaces = (faces) => {
  const randomValues = faces.map((face) => (face - 0.5) / 6);
  vi.spyOn(Math, 'random').mockImplementation(() => {
    if (randomValues.length === 0) throw new Error('test combat-die queue exhausted');
    return randomValues.shift();
  });
};

describe('shared 24-hour addiction dose pool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts active doses from different chems and discards expired doses', () => {
    const now = 30 * DAY_MS;
    const result = recordDoseWithinWindow(
      [
        { chemId: 'chem_rad_x', takenAt: now - DAY_MS },
        { chemId: 'chem_stimpak', takenAt: now - 23 * 60 * 60 * 1000 },
        { chemId: 'chem_mentats', takenAt: now - 2 * 60 * 60 * 1000 },
        { chemId: 'chem_jet', takenAt: now - 60 * 60 * 1000 },
      ],
      { chemId: 'chem_buffout', takenAt: now },
      { now, windowMs: DAY_MS },
    );

    expect(result.doseLog.map(({ chemId }) => chemId)).toEqual([
      'chem_stimpak',
      'chem_mentats',
      'chem_jet',
      'chem_buffout',
    ]);
    expect(result.doseCount).toBe(4);
  });

  it('rejects malformed dose records instead of normalizing a heterogeneous log', () => {
    expect(() => recordDoseWithinWindow(
      [{ chemId: 'chem_mentats' }],
      { chemId: 'chem_jet', takenAt: DAY_MS },
      { now: DAY_MS, windowMs: DAY_MS },
    )).toThrow('takenAt');
  });

  it('records every canonical chem before deciding whether the current chem is addictive', () => {
    const source = readFileSync('components/CharacterContext.js', 'utf8');
    const doseRecordingIndex = source.indexOf("const dosesToday = item?.itemType === 'chem'");
    const addictionCheckIndex = source.indexOf('item?.addictionLevel > 0', doseRecordingIndex);

    expect(doseRecordingIndex).toBeGreaterThan(-1);
    expect(source.slice(doseRecordingIndex, addictionCheckIndex)).toContain('recordChemDose(item.id)');
    expect(addictionCheckIndex).toBeGreaterThan(doseRecordingIndex);
  });

  it('rolls one combat die per total dose and gains Addiction 1 from any effect', () => {
    mockCombatDieFaces([1, 5, 2]);

    const result = checkAddiction(
      { addictionLevel: 1, negativeEffect: 'addiction' },
      3,
    );

    expect(result).toEqual({
      addicted: true,
      effectCount: 1,
      faces: [1, 5, 2],
      addictionLevel: 1,
    });
  });

  it('keeps addictionLevel as the required number of effects', () => {
    mockCombatDieFaces([5, 2, 6]);

    const result = checkAddiction(
      { addictionLevel: 2, negativeEffect: 'addiction' },
      3,
    );

    expect(result.addicted).toBe(true);
    expect(result.effectCount).toBe(2);
    expect(result.faces).toEqual([5, 2, 6]);
  });
});
