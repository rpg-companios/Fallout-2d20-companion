import { describe, expect, it } from 'vitest';
import {
    SURVIVAL_RULES,
    addFatigue,
    advanceHours,
    advanceRealMinutes,
    clearFatigueSource,
    consumeDrink,
    consumeFood,
    createSurvivalState,
    fatigueFromSource,
    forecastSleep,
    hpDrainForFatigue,
    isSurvivalCapable,
    removeFatigueTotal,
    rest,
    totalFatigue,
} from '../../domain/survival';
import food from '../../modules/fallout/data/consumables/food.json';
import drinks from '../../modules/fallout/data/consumables/drinks.json';

const foodItem = (id) => food.find((x) => x.id === id);
const drinkItem = (id) => drinks.find((x) => x.id === id);

describe('survival: доступность и начальное состояние', () => {
    it('шкалы у органиков, роботам/киборгам — null', () => {
        expect(isSurvivalCapable('human')).toBe(true);
        expect(isSurvivalCapable('ghoul')).toBe(true);
        expect(isSurvivalCapable('mutant')).toBe(true);
        expect(isSurvivalCapable('robot')).toBe(false);
        expect(isSurvivalCapable('cyborg')).toBe(false);
        expect(createSurvivalState('robot')).toBeNull();
        expect(createSurvivalState('cyborg')).toBeNull();
    });

    it('начальное состояние — максимумы, усталости нет', () => {
        const s = createSurvivalState('human');
        expect(s).toMatchObject({ food: 5, water: 4, sleep: 5, timeCarried: 0, hpBonus: 0 });
        expect(s.fatigue).toEqual([]);
        expect(s.acc).toEqual({ food: 0, water: 0, sleep: 0 });
    });
});

describe('survival: лестница еды (1/4/8/16 ч, дно 24 ч)', () => {
    it('полный спуск за 29 часов с начислением усталости на дне', () => {
        let s = createSurvivalState('human');
        s = advanceHours(s, 1).state;
        expect(s.food).toBe(4);
        s = advanceHours(s, 4).state; // 5 ч всего
        expect(s.food).toBe(3);
        s = advanceHours(s, 8).state; // 13 ч
        expect(s.food).toBe(2);
        expect(fatigueFromSource(s, 'food')).toBe(0); // вода к этому часу уже на дне — её усталость не трогаем
        s = advanceHours(s, 16).state; // 29 ч
        expect(s.food).toBe(1);
        expect(fatigueFromSource(s, 'food')).toBe(1); // переход 2→1
        s = advanceHours(s, 24).state; // 53 ч
        expect(fatigueFromSource(s, 'food')).toBe(2); // сутки на дне
        s = advanceHours(s, 24).state;
        expect(fatigueFromSource(s, 'food')).toBe(3);
    });

    it('счётчик секции сбрасывается при подъёме едой', () => {
        let s = createSurvivalState('human');
        s = advanceHours(s, 3).state; // food 4, acc 2 из 4
        s = consumeFood(s, foodItem('food_instamash')).state; // консерва +1 → 5
        expect(s.food).toBe(5);
        expect(s.acc.food).toBe(0);
        const after = advanceHours(s, 1).state; // снова 1 ч до спуска
        expect(after.food).toBe(4);
    });
});

describe('survival: лестница воды (1/2/4 ч, дно 8 ч)', () => {
    it('полный спуск за 7 часов', () => {
        let s = createSurvivalState('human');
        s = advanceHours(s, 1).state;
        expect(s.water).toBe(3);
        s = advanceHours(s, 2).state;
        expect(s.water).toBe(2);
        s = advanceHours(s, 4).state;
        expect(s.water).toBe(1);
        expect(fatigueFromSource(s, 'water')).toBe(1);
        s = advanceHours(s, 8).state;
        expect(fatigueFromSource(s, 'water')).toBe(2);
    });
});

describe('survival: лестница сна (8/8/8/8 ч, дно 4 ч)', () => {
    it('полный спуск за 32 часа с двумя очками усталости', () => {
        let s = createSurvivalState('human');
        s = advanceHours(s, 8).state;
        expect(s.sleep).toBe(4);
        s = advanceHours(s, 8).state; // 16 ч
        expect(s.sleep).toBe(3);
        s = advanceHours(s, 8).state; // 24 ч
        expect(s.sleep).toBe(2);
        expect(fatigueFromSource(s, 'sleep')).toBe(1); // 3→2
        s = advanceHours(s, 8).state; // 32 ч
        expect(s.sleep).toBe(1);
        expect(fatigueFromSource(s, 'sleep')).toBe(2); // 2→1
        s = advanceHours(s, 4).state;
        expect(fatigueFromSource(s, 'sleep')).toBe(3); // дно: каждые 4 ч
    });
});

describe('survival: часовой тик — порядок трёх шагов', () => {
    it('дрен ОЗ = ⌊N/2⌋ по итоговому N', () => {
        expect(hpDrainForFatigue(0)).toBe(0);
        expect(hpDrainForFatigue(1)).toBe(0);
        expect(hpDrainForFatigue(2)).toBe(1);
        expect(hpDrainForFatigue(3)).toBe(1);
        expect(hpDrainForFatigue(4)).toBe(2);
        const r = advanceHours({ ...createSurvivalState('human'), food: 1, fatigue: [{ source: 'food', amount: 4 }] }, 1);
        expect(r.hpLost).toBe(2);
    });

    it('снятие −1 в час при чистых источниках, не ниже нуля', () => {
        let s = createSurvivalState('human');
        addFatigue(s, 'food', 3);
        const r1 = advanceHours(s, 1);
        expect(totalFatigue(r1.state)).toBe(2); // чист по всем лестницам → −1
        expect(r1.hpLost).toBe(1); // дрен по итоговому N=2
        s = r1.state;
        const r2 = advanceHours(s, 2);
        expect(totalFatigue(r2.state)).toBe(0); // −1 и −1, пол нуля не пробивает
    });

    it('в час падения в «сильно голоден» снятия нет (состояние после шага)', () => {
        let s = createSurvivalState('human');
        addFatigue(s, 'food', 1);
        s = advanceHours(s, 29).state; // еда на дне, усталость food=2 (1+переход)
        const before = totalFatigue(s);
        const r = advanceHours(s, 1);
        expect(totalFatigue(r.state)).toBe(before); // food=1 блокирует снятие
    });

    it('снятие блокируется изнеможением (сон 2 < 3)', () => {
        let s = createSurvivalState('human');
        addFatigue(s, 'food', 1);
        s.sleep = 2;
        const r = advanceHours(s, 1);
        expect(totalFatigue(r.state)).toBe(1);
    });

    it('списание −1 берёт с наибольшего источника', () => {
        const s = createSurvivalState('human');
        addFatigue(s, 'food', 2);
        addFatigue(s, 'water', 1);
        removeFatigueTotal(s, 1);
        expect(fatigueFromSource(s, 'food')).toBe(1);
        expect(fatigueFromSource(s, 'water')).toBe(1);
    });
});

describe('survival: реальный тик по курсу', () => {
    it('дефолт 30 минут = 1 игровой час', () => {
        let s = createSurvivalState('human');
        s = advanceRealMinutes(s, 30).state;
        expect(s.water).toBe(3); // 1 час: вода 4→3
        expect(s.timeCarried).toBe(0);
    });

    it('дробные часы копятся до целого', () => {
        let s = createSurvivalState('human');
        s = advanceRealMinutes(s, 10).state; // 1/3 часа
        expect(s.water).toBe(4);
        expect(s.timeCarried).toBeCloseTo(1 / 3, 10);
        s = advanceRealMinutes(s, 10).state;
        expect(s.water).toBe(4);
        expect(s.timeCarried).toBeCloseTo(2 / 3, 10);
        s = advanceRealMinutes(s, 10).state; // суммарно 30 минут = 1 час
        expect(s.water).toBe(3);
        expect(s.timeCarried).toBe(0);
    });

    it('курс из настройки: 10 минут = 1 час', () => {
        const s = advanceRealMinutes(createSurvivalState('human'), 30, 10).state;
        expect(s.water).toBe(2); // 3 часа: 4→3, ещё через 2 ч → 2
    });
});

describe('survival: еда и питьё', () => {
    it('сырая +1, приготовленная +2, консервы +1', () => {
        let s = createSurvivalState('human');
        s.food = 2;
        s = consumeFood(s, foodItem('food_brahmin_meat')).state; // rawMeat, сырое
        expect(s.food).toBe(3);
        s = consumeFood(s, foodItem('food_grilled_bloatfly')).state; // cooked
        expect(s.food).toBe(5); // +2 с потолком
        s.food = 3;
        s = consumeFood(s, foodItem('food_instamash')).state; // preserved
        expect(s.food).toBe(4);
    });

    it('суп: +1 еда и +1 вода одновременно', () => {
        let s = createSurvivalState('human');
        s.food = 3;
        s.water = 2;
        const r = consumeFood(s, foodItem('food_vegetable_soup'));
        expect(r.ok).toBe(true);
        expect(r.gained).toEqual({ food: 1, water: 1 });
        expect(r.state.food).toBe(4);
        expect(r.state.water).toBe(3);
    });

    it('на секции 5 есть нельзя, включая суп', () => {
        const s = createSurvivalState('human'); // food=5
        expect(consumeFood(s, foodItem('food_grilled_bloatfly')).ok).toBe(false);
        expect(consumeFood(s, foodItem('food_vegetable_soup')).ok).toBe(false);
    });

    it('напитки: любой +1, очищенная вода +2, на потолке пить можно', () => {
        let s = createSurvivalState('human');
        s.water = 1;
        s = consumeDrink(s, drinkItem('drink_dirty_water')).state; // грязная: +1, побочки — вне шкал
        expect(s.water).toBe(2);
        s = consumeDrink(s, drinkItem('drink_purified_water')).state; // очищенная: +2
        expect(s.water).toBe(4);
        const r = consumeDrink(s, drinkItem('drink_nuka_cola')); // на потолке — ок, шкала стоит
        expect(r.ok).toBe(true);
        expect(r.gained.water).toBe(0);
        expect(r.state.water).toBe(4);
    });

    it('не-еда и не-напиток отклоняются', () => {
        const s = createSurvivalState('human');
        expect(consumeFood(s, drinkItem('drink_nuka_cola')).ok).toBe(false);
        expect(consumeDrink(s, foodItem('food_instamash')).ok).toBe(false);
    });
});

describe('survival: сон', () => {
    it('короткий сон 1–5 ч: +1 ступень с потолком «усталый»', () => {
        let s = createSurvivalState('human');
        s.sleep = 1;
        s = rest(s, { place: 'wasteland', hours: 3 }).state;
        expect(s.sleep).toBe(2);
        s = rest(s, { place: 'wasteland', hours: 1 }).state;
        expect(s.sleep).toBe(3); // потолок короткого сна
        const fresh = createSurvivalState('human'); // sleep=5
        const r = rest(fresh, { place: 'wasteland', hours: 2 });
        expect(r.state.sleep).toBe(5); // короткий сон не понижает
    });

    it('≥6 ч — «отдохнувший»; ≥8 ч в кровати — «прекрасно» + бонус ОЗ', () => {
        let s = createSurvivalState('human');
        s.sleep = 1;
        s = rest(s, { place: 'wasteland', hours: 6 }).state;
        expect(s.sleep).toBe(4); // пустошь: потолок «отдохнувший»
        expect(s.hpBonus).toBe(0);
        s.sleep = 1;
        const r = rest(s, { place: 'bed', hours: 8 });
        expect(r.state.sleep).toBe(5);
        expect(r.state.hpBonus).toBe(2);
    });

    it('любой сон снимает бонус +2 ОЗ («до следующего сна»)', () => {
        let s = createSurvivalState('human');
        s.hpBonus = 2;
        s = rest(s, { place: 'wasteland', hours: 1 }).state;
        expect(s.hpBonus).toBe(0);
    });

    it('сон двигает еду и воду по их таймингам', () => {
        let s = createSurvivalState('human');
        s = rest(s, { place: 'bed', hours: 8 }).state;
        expect(s.food).toBe(3); // 1 ч → 4, 5 ч → 3
        expect(s.water).toBe(1); // 1 ч → 3, 3 ч → 2, 7 ч → 1
        expect(fatigueFromSource(s, 'water')).toBe(1); // переход 2→1 на 7-м часу
    });

    it('на 6-м часе сна списывается только усталость недосыпа', () => {
        // вода на дне блокирует почасовое снятие — изолируем списание сна
        let s = createSurvivalState('human');
        s.food = 3;
        s.water = 1;
        addFatigue(s, 'sleep', 2);
        addFatigue(s, 'food', 3);
        const r = rest(s, { place: 'wasteland', hours: 7 });
        expect(fatigueFromSource(r.state, 'sleep')).toBe(0);
        expect(fatigueFromSource(r.state, 'food')).toBe(3);
        const cleared = r.events.find((e) => e.type === 'fatigueSleepCleared');
        expect(cleared).toMatchObject({ hour: 6, removed: 2 });
    });

    it('дрен ОЗ во сне тикает, прогноз ловит ноль с указанием часа', () => {
        // еда на дне: снятие заблокировано, усталость food спят не лечится
        const s = createSurvivalState('human');
        s.food = 1;
        addFatigue(s, 'food', 4); // дрен 2 ОЗ/час
        const f = forecastSleep(s, { place: 'bed', hours: 8, currentHp: 5 });
        expect(f.hitsZero).toBe(true);
        expect(f.zeroAtHour).toBe(3); // 5 − 2 − 2 → 1, на 3-м часе ≤ 0
        expect(f.hpLost).toBe(16); // 8 часов по 2
        // сам прогноз состояние не меняет:
        expect(fatigueFromSource(s, 'food')).toBe(4);
    });

    it('валидация аргументов', () => {
        const s = createSurvivalState('human');
        expect(() => rest(s, { place: 'tent', hours: 4 })).toThrow();
        expect(() => rest(s, { place: 'bed', hours: 0 })).toThrow();
        expect(() => rest(s, { place: 'bed', hours: 25 })).toThrow();
        expect(() => advanceHours(s, -1)).toThrow();
    });
});

describe('survival: данные', () => {
    it('флаг soup ровно на четырёх утверждённых блюдах', () => {
        const soups = food.filter((x) => x.soup === true).map((x) => x.id).sort();
        expect(soups).toEqual([
            'food_iguana_stew',
            'food_radstag_stew',
            'food_squirrel_stew',
            'food_vegetable_soup',
        ]);
        expect(food.find((x) => x.id === 'food_yao_guai_roast').soup).toBeUndefined();
    });

    it('флаг purified только у очищенной воды', () => {
        const purified = drinks.filter((x) => x.purified === true).map((x) => x.id);
        expect(purified).toEqual(['drink_purified_water']);
    });

    it('константы правил соответствуют дока 0.3', () => {
        expect(SURVIVAL_RULES.stepHours).toEqual({
            food: { 5: 1, 4: 4, 3: 8, 2: 16 },
            water: { 4: 1, 3: 2, 2: 4 },
            sleep: { 5: 8, 4: 8, 3: 8, 2: 8 },
        });
        expect(SURVIVAL_RULES.bottomPeriodHours).toEqual({ food: 24, water: 8, sleep: 4 });
        expect(SURVIVAL_RULES.defaultCourseMinutesPerHour).toBe(30);
    });
});
