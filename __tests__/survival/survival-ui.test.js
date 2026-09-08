import { describe, expect, it } from 'vitest';
import { SURVIVAL_RULES, addFatigue, createSurvivalState, survivalEffectRows } from '../../modules/fallout/survival/survival';
import ruScreen from '../../modules/fallout/i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enScreen from '../../modules/fallout/i18n/en-EN/screens/weaponsAndArmor/screen.json';

describe('survival: строки эффектов (§6)', () => {
    it('нет состояния (робот/киборг) — строк нет', () => {
        expect(survivalEffectRows(null)).toEqual([]);
    });

    it('нулевая усталость — строк нет', () => {
        expect(survivalEffectRows(createSurvivalState('human'))).toEqual([]);
    });

    it('N ≥ 1 — «Усталость N» и «Количество получаемых ОД −N», M = N', () => {
        const s = createSurvivalState('human');
        addFatigue(s, 'food', 1);
        expect(survivalEffectRows(s)).toEqual([
            // Патч 217: строка «Усталость» несёт разбивку по источникам.
            { key: 'fatigue', n: 1, sources: [{ source: 'food', amount: 1 }] },
            { key: 'apPenalty', n: 1 },
        ]);
        addFatigue(s, 'water', 2);
        expect(survivalEffectRows(s)).toEqual([
            {
                key: 'fatigue',
                n: 3,
                sources: [
                    { source: 'food', amount: 1 },
                    { source: 'water', amount: 2 },
                ],
            },
            { key: 'apPenalty', n: 3 },
            { key: 'maxHpPenalty', n: 1 }, // ⌊3/2⌋
        ]);
    });
});

// ПРАВИЛО владельца: никаких пропусков i18n — ключи обязаны быть в обеих
// локалях, промах ключа виден как сам путь.
describe('survival: i18n шкал (ru/en)', () => {
    const locales = { 'ru-RU': ruScreen, 'en-EN': enScreen };

    it.each(Object.entries(locales))('%s: названия всех секций всех шкал', (loc, dict) => {
        const survival = dict.survival;
        expect(survival).toBeTruthy();
        for (const [ladder, max] of Object.entries(SURVIVAL_RULES.max)) {
            for (let section = 1; section <= max; section += 1) {
                const name = survival?.[ladder]?.[String(section)];
                expect(name, `${loc} survival.${ladder}.${section}`).toMatch(/^\S.+$/);
            }
        }
    });

    it('ru: канонические названия владельца дословно', () => {
        expect(ruScreen.survival.food).toEqual({
            5: 'Полностью сыт',
            4: 'Сыт',
            3: 'Проголодался',
            2: 'Голодный',
            1: 'Сильно голоден',
        });
        expect(ruScreen.survival.water).toEqual({
            4: 'Полностью гидратирован',
            3: 'Гидратирован',
            2: 'Мучает жажда',
            1: 'Обезвожен',
        });
        // С патча 206 survival.sleep кроме названий секций несёт ключи
        // модалки сна — проверяем секции частичным совпадением.
        expect(ruScreen.survival.sleep).toMatchObject({
            5: 'Прекрасно отдохнувший',
            4: 'Отдохнувший',
            3: 'Усталый',
            2: 'Измождённый',
            1: 'Истощённый',
        });
    });

    it.each(Object.entries(locales))('%s: шаблоны строк эффектов с {n}', (loc, dict) => {
        expect(dict.survival.fatigue).toContain('{n}');
        expect(dict.survival.apPenalty).toContain('{n}');
        expect(dict.survival.maxHpPenalty).toContain('{n}'); // патч 213
    });

    it.each(Object.entries(locales))('%s: заголовки областей Голод/Жажда/Сон', (loc, dict) => {
        expect(dict.survival.foodTitle).toMatch(/^\S.+$/);
        expect(dict.survival.waterTitle).toMatch(/^\S.+$/);
        expect(dict.survival.sleepTitle).toMatch(/^\S.+$/);
    });

    it('ru: заголовки — слова владельца', () => {
        expect(ruScreen.survival.foodTitle).toBe('Голод');
        expect(ruScreen.survival.waterTitle).toBe('Жажда');
        expect(ruScreen.survival.sleepTitle).toBe('Сон');
    });

    it('ru: формулировки строк эффектов — слова владельца', () => {
        expect(ruScreen.survival.fatigue).toBe('Усталость {n}');
        expect(ruScreen.survival.apPenalty).toBe('Количество получаемых ОД −{n}');
    });

    // Патч 217: разбивка усталости по активным источникам.
    it.each(Object.entries(locales))('%s: ключи разбивки источников', (loc, dict) => {
        expect(dict.survival.fatigueSources).toContain('{n}');
        expect(dict.survival.fatigueSources).toContain('{sources}');
        expect(dict.survival.fatigueSourceJoin).toMatch(/^.+$/);
        for (const source of ['food', 'water', 'sleep', 'disease']) {
            expect(
                dict.survival.fatigueSource?.[source],
                `${loc} survival.fatigueSource.${source}`,
            ).toMatch(/^\S.+$/);
        }
    });

    it('ru: разбивка — слова владельца', () => {
        expect(ruScreen.survival.fatigueSources).toBe('Усталость {n} ({sources})');
        expect(ruScreen.survival.fatigueSource).toEqual({
            food: 'голод',
            water: 'жажда',
            sleep: 'сон',
            disease: 'болезнь',
        });
    });
});
