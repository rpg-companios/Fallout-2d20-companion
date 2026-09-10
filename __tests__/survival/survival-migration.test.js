import { describe, expect, it } from 'vitest';
// Side-effect: сеттинг регистрирует расширение состояния (поле survival +
// миграцию v22→v23) в реестре движка — как это делает App.js.
import '../../modules/fallout/survival';
import { migrateCharacterState } from '../../src/store/migrations';
import { migrateSurvivalField } from '../../modules/fallout/survival/migration';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/saveSchema';
import { SURVIVAL_RULES } from '../../modules/fallout/survival/survival';

const v22 = (origin, extra = {}) => ({ schemaVersion: 22, origin, ...extra });

const maxState = () => ({
    food: SURVIVAL_RULES.max.food,
    water: SURVIVAL_RULES.max.water,
    sleep: SURVIVAL_RULES.max.sleep,
    fatigue: [],
    acc: { food: 0, water: 0, sleep: 0 },
    timeCarried: 0,
    hpBonus: 0,
    bedRestHours: 0, // патч 215
});

describe('survival: миграция v22 → v23', () => {
    it('версия схемы — 26 (поле выживания добавляется переходом v22→v23)', () => {
        expect(CURRENT_SCHEMA_VERSION).toBe(26);
    });

    it.each([
        ['brotherhood', 'human'],
        ['ghoul', 'ghoul'],
        ['superMutant', 'mutant'],
        ['shadow', 'mutant'],
    ])('органику %s (%s) — начальные максимумы', (originId) => {
        const out = migrateCharacterState(v22({ id: originId }));
        expect(out.schemaVersion).toBe(26);
        expect(out.survival).toEqual(maxState());
    });

    it.each([
        ['protectron', 'robot'],
        ['misterHandy', 'robot'],
        ['synth', 'cyborg'],
    ])('роботу/киборгу %s (%s) — null, шкал нет', (originId) => {
        const out = migrateCharacterState(v22({ id: originId }));
        expect(out.schemaVersion).toBe(26);
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
