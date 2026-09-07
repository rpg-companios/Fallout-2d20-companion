// Патч 206 — модалки еды/питья/сна: превью подъёма шкал, мост контуров
// (продвижение эффектов сценами), полнота i18n ключей модалок.

import { describe, expect, it } from 'vitest';
import { drinkGain, foodGain } from '../../modules/fallout/survival/survival';
import { advanceEffectsByScenes } from '../../domain/effects';
import food from '../../modules/fallout/data/consumables/food.json';
import drinks from '../../modules/fallout/data/consumables/drinks.json';
import ruScreen from '../../modules/fallout/i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enScreen from '../../modules/fallout/i18n/en-EN/screens/weaponsAndArmor/screen.json';

const SCENE_MS = 5 * 60 * 1000;

const timedEffect = (scenesLeft, extra = {}) => ({
    id: `effect-${Math.random().toString(36).slice(2, 8)}`,
    effectName: 'Тестовый эффект',
    effectKind: 'positive',
    sourceName: 'Тест',
    createdAt: Date.now(),
    durationMs: scenesLeft * SCENE_MS,
    expiresAt: Date.now() + scenesLeft * SCENE_MS,
    scenesLeft,
    ...extra,
});

describe('survival: превью подъёма шкал (foodGain / drinkGain)', () => {
    it('суп — +1 еда и +1 вода (замещает категорию приготовленного)', () => {
        const soup = food.find((x) => x.id === 'food_vegetable_soup');
        expect(foodGain(soup)).toEqual({ food: 1, water: 1 });
    });

    it('приготовленное не консервированное — +2 еды', () => {
        const cooked = food.find((x) => x.state === 'cooked' && !x.preserved && !x.soup);
        expect(foodGain(cooked)).toEqual({ food: 2, water: 0 });
    });

    it('сырое и консервированное — +1 еда', () => {
        const raw = food.find((x) => x.state === 'raw');
        const preserved = food.find((x) => x.preserved);
        expect(foodGain(raw)).toEqual({ food: 1, water: 0 });
        expect(foodGain(preserved)).toEqual({ food: 1, water: 0 });
    });

    it('напитки: очищенная вода +2, остальное +1', () => {
        const purified = drinks.find((x) => x.id === 'drink_purified_water');
        const other = drinks.find((x) => !x.purified);
        expect(drinkGain(purified)).toEqual({ food: 0, water: 2 });
        expect(drinkGain(other)).toEqual({ food: 0, water: 1 });
    });
});

describe('survival: мост контуров — advanceEffectsByScenes (§5)', () => {
    it('12 сцен (= 1 час сна) укорачивают эффект на 12 сцен', () => {
        const effect = timedEffect(24);
        const { effects, expired } = advanceEffectsByScenes([effect], 12);
        expect(expired).toEqual([]);
        expect(effects[0].scenesLeft).toBe(12);
    });

    it('эффект короче срока сна истекает', () => {
        const effect = timedEffect(6);
        const { effects, expired } = advanceEffectsByScenes([effect], 12);
        expect(effects).toEqual([]);
        expect(expired.map((e) => e.id)).toEqual([effect.id]);
    });

    it('перманентные эффекты сценами не двигаются', () => {
        const permanent = timedEffect(9999, { isPermanent: true });
        const { effects, expired } = advanceEffectsByScenes([permanent], 288);
        expect(expired).toEqual([]);
        expect(effects[0].scenesLeft).toBe(9999);
    });

    it('некорректное число сцен — ошибка', () => {
        expect(() => advanceEffectsByScenes([], -1)).toThrow();
        expect(() => advanceEffectsByScenes([], 1.5)).toThrow();
    });
});

describe('survival: i18n модалок (ru/en)', () => {
    const keyPaths = [
        'survival.actions.eat',
        'survival.actions.drink',
        'survival.actions.sleep',
        'survival.gain.food',
        'survival.gain.water',
        'survival.consumeNotAllowed',
        'survival.eat.title',
        'survival.eat.blocked',
        'survival.eat.empty',
        'survival.drink.title',
        'survival.drink.empty',
        'survival.sleep.title',
        'survival.sleep.placeBed',
        'survival.sleep.placeWasteland',
        'survival.sleep.hours',
        'survival.sleep.wastelandNote',
        'survival.sleep.forecastTitle',
        'survival.sleep.forecastState',
        'survival.sleep.forecastHpLost',
        'survival.sleep.forecastHpEnd',
        'survival.sleep.forecastZeroWarning',
        'survival.sleep.forecastFatigueCleared',
        'survival.sleep.forecastFoodDown',
        'survival.sleep.forecastWaterDown',
        'survival.sleep.forecastHpBonus',
        'survival.sleep.confirm',
        'survival.sleep.cancel',
        'survival.sleep.reportTitle',
        'survival.sleep.reportState',
        'survival.sleep.reportHp',
        'survival.sleep.reportHpLost',
        'survival.sleep.reportHpBonus',
        'survival.sleep.reportFatigueCleared',
    ];

    const at = (dict, path) => path.split('.').reduce((acc, part) => acc?.[part], dict);

    it.each(['ru-RU', 'en-EN'])('%s: каждый ключ модалок есть и непустой', (locale) => {
        const dict = locale === 'ru-RU' ? ruScreen : enScreen;
        for (const path of keyPaths) {
            const value = at(dict, path);
            expect(typeof value, `${locale}: ${path}`).toBe('string');
            expect(value, `${locale}: ${path}`).toMatch(/\S/);
        }
    });

    it('структура секций модалок идентична в обеих локалях', () => {
        const ruKeys = Object.keys(ruScreen.survival.sleep).sort();
        const enKeys = Object.keys(enScreen.survival.sleep).sort();
        expect(enKeys).toEqual(ruKeys);
        expect(Object.keys(ruScreen.survival.eat).sort())
            .toEqual(Object.keys(enScreen.survival.eat).sort());
        expect(Object.keys(ruScreen.survival.drink).sort())
            .toEqual(Object.keys(enScreen.survival.drink).sort());
    });
});
