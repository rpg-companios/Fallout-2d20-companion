import { describe, expect, it } from 'vitest';
import { migrateCharacterState, migrateSurvivalField } from '../../src/store/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';
import { SURVIVAL_RULES } from '../../domain/survival';

const v22 = (origin, extra = {}) => ({ schemaVersion: 22, origin, ...extra });

const maxState = () => ({
    food: SURVIVAL_RULES.max.food,
    water: SURVIVAL_RULES.max.water,
    sleep: SURVIVAL_RULES.max.sleep,
    fatigue: [],
    acc: { food: 0, water: 0, sleep: 0 },
    timeCarried: 0,
    hpBonus: 0,
});

describe('survival: миграция v22 → v23', () => {
    it('версия схемы — 23', () => {
        expect(CURRENT_SCHEMA_VERSION).toBe(23);
    });

    it.each([
        ['brotherhood', 'human'],
        ['ghoul', 'ghoul'],
        ['superMutant', 'mutant'],
        ['shadow', 'mutant'],
    ])('органику %s (%s) — начальные максимумы', (originId) => {
        const out = migrateCharacterState(v22({ id: originId }));
        expect(out.schemaVersion).toBe(23);
        expect(out.survival).toEqual(maxState());
    });

    it.each([
        ['protectron', 'robot'],
        ['misterHandy', 'robot'],
        ['synth', 'cyborg'],
    ])('роботу/киборгу %s (%s) — null, шкал нет', (originId) => {
        const out = migrateCharacterState(v22({ id: originId }));
        expect(out.schemaVersion).toBe(23);
        expect(out.survival).toBeNull();
    });

    it('«толстый» ориджин с characterType читается без каталога', () => {
        const out = migrateCharacterState(v22({ id: 'ghoul', characterType: 'ghoul' }));
        expect(out.survival).toEqual(maxState());
    });

    it('ориджин-строкой тоже определяется', () => {
        const out = migrateCharacterState(v22('protectron'));
        expect(out.survival).toBeNull();
    });

    it('без ориджина — фолбэк human (как в domain/origins)', () => {
        const out = migrateCharacterState(v22(null));
        expect(out.survival).toEqual(maxState());
    });

    it('существующее поле survival не перезаписывается', () => {
        const existing = {
            food: 2,
            water: 1,
            sleep: 3,
            fatigue: [{ source: 'food', amount: 2 }],
            acc: { food: 3, water: 1, sleep: 7 },
            timeCarried: 0.5,
            hpBonus: 2,
        };
        const out = migrateCharacterState(v22({ id: 'brotherhood' }, { survival: existing }));
        expect(out.survival).toEqual(existing);
    });

    it('идемпотентна: повторный прогон не меняет результат', () => {
        const once = migrateCharacterState(v22({ id: 'ghoul' }));
        const twice = migrateCharacterState(once);
        expect(twice).toEqual(once);
        expect(migrateSurvivalField(migrateSurvivalField(v22({ id: 'ghoul' })))).toEqual(
            migrateSurvivalField(v22({ id: 'ghoul' }))
        );
    });
});
