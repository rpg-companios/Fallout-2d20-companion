// Система выживания — домен (редакция правил 0.3 дизайн-дока).
//
// Чистые функции без React и без обращения к часам: время передаётся
// явно (игровые часы / реальные минуты). Состояние хранится в сейве
// персонажа (см. docs/survival-system-design.md §12).
//
// Порядок часового тика (утверждён владельцем, §5):
//   1) шаг лестниц (еда/вода/сон) + начисление Усталости за переходы;
//   2) снятие Усталости: −1, если еда ≥ 2, вода ≥ 2, сон ≥ 3;
//   3) дрен ОЗ ⌊N/2⌋ по итоговому N, без сопротивлений.

export const SURVIVAL_RULES = {
    // Шкалы есть только у органиков (origins.json → characterType).
    capableTypes: ['human', 'ghoul', 'mutant'],
    // Максимум секций: еда 5, вода 4, сон 5.
    max: { food: 5, water: 4, sleep: 5 },
    // Игровые часы до спуска на секцию ниже, по текущей секции.
    stepHours: {
        food: { 5: 1, 4: 4, 3: 8, 2: 16 },
        water: { 4: 1, 3: 2, 2: 4 },
        sleep: { 5: 8, 4: 8, 3: 8, 2: 8 },
    },
    // На дне (секция 1): +1 Усталость за каждые N часов в состоянии.
    bottomPeriodHours: { food: 24, water: 8, sleep: 4 },
    // Очки Усталости при переходе вниз ИЗ указанной секции (2→1 у еды/воды;
    // 3→2 и 2→1 у сна).
    fatigueOnStep: {
        food: { 2: 1 },
        water: { 2: 1 },
        sleep: { 3: 1, 2: 1 },
    },
    // Снятие по часу разрешено при: еда ≥ 2, вода ≥ 2, сон ≥ 3.
    removalMin: { food: 2, water: 2, sleep: 3 },
    // Сон: 1–5 ч — +1 ступень с потолком «усталый»(3); ≥6 ч — «отдохнувший»(4);
    // ≥8 ч в кровати — «прекрасно отдохнувший»(5) + бонус к макс. ОЗ.
    sleep: {
        capShort: 3,
        longHours: 6,
        perfectHours: 8,
        perfectPlace: 'bed',
        hpBonus: 2,
        fatigueClearHours: 6, // на 6-м часе сна списывается вся усталость источника «сон»
    },
    // Дефолтный курс времени: 30 реальных минут = 1 игровой час.
    defaultCourseMinutesPerHour: 30,
    maxSleepHours: 24,
};

const LADDERS = ['food', 'water', 'sleep'];

export function isSurvivalCapable(characterType) {
    return SURVIVAL_RULES.capableTypes.includes(characterType);
}

// Начальное состояние — все шкалы на максимуме (решение владельца).
// Роботам/киборгам шкалы не положены — null.
export function createSurvivalState(characterType) {
    if (!isSurvivalCapable(characterType)) return null;
    return {
        food: SURVIVAL_RULES.max.food,
        water: SURVIVAL_RULES.max.water,
        sleep: SURVIVAL_RULES.max.sleep,
        fatigue: [], // [{ source: 'food'|'water'|'sleep', amount }]
        acc: { food: 0, water: 0, sleep: 0 }, // часы в текущей секции
        timeCarried: 0, // дробная часть игрового часа от реального тика
        hpBonus: 0, // +2 к макс. ОЗ до следующего сна (кровать, ≥8 ч)
    };
}

function cloneState(state) {
    return {
        ...state,
        fatigue: state.fatigue.map((f) => ({ ...f })),
        acc: { ...state.acc },
    };
}

export function totalFatigue(state) {
    return state.fatigue.reduce((sum, f) => sum + f.amount, 0);
}

export function fatigueFromSource(state, source) {
    const entry = state.fatigue.find((f) => f.source === source);
    return entry ? entry.amount : 0;
}

export function addFatigue(state, source, amount) {
    const entry = state.fatigue.find((f) => f.source === source);
    if (entry) entry.amount += amount;
    else state.fatigue.push({ source, amount });
}

// Списание из общей кучи: сначала с наибольшего источника
// (детерминированная деталь реализации, §6 дока).
export function removeFatigueTotal(state, amount) {
    let left = amount;
    while (left > 0) {
        let biggest = null;
        for (const f of state.fatigue) {
            if (f.amount > 0 && (!biggest || f.amount > biggest.amount)) biggest = f;
        }
        if (!biggest) return;
        const take = Math.min(left, biggest.amount);
        biggest.amount -= take;
        left -= take;
    }
}

export function clearFatigueSource(state, source) {
    const entry = state.fatigue.find((f) => f.source === source);
    if (entry) entry.amount = 0;
}

// 1 ОЗ за каждые 2 очка Усталости, без сопротивлений.
export function hpDrainForFatigue(fatigueTotal) {
    return Math.floor(fatigueTotal / 2);
}

// Смена секции (в любую сторону) — счётчик времени в состоянии с нуля.
function bumpLadder(state, key, delta) {
    const max = SURVIVAL_RULES.max[key];
    const before = state[key];
    if (before >= max && delta > 0) return 0; // на потолке подъём не меняет шкалу
    const after = Math.max(1, Math.min(max, before + delta));
    if (after !== before) {
        state[key] = after;
        state.acc[key] = 0;
        return after - before;
    }
    return 0;
}

// Шаг одной лестницы по накопленным часам. Возвращает события.
function stepLadder(state, key, events) {
    const cur = state[key];
    if (cur <= 1) {
        const period = SURVIVAL_RULES.bottomPeriodHours[key];
        while (state.acc[key] >= period) {
            state.acc[key] -= period;
            addFatigue(state, key, 1);
            events.push({ type: 'fatigueAdded', source: key, cause: 'bottom' });
        }
        return;
    }
    const threshold = SURVIVAL_RULES.stepHours[key][cur];
    if (threshold == null) return;
    if (state.acc[key] >= threshold) {
        state.acc[key] = 0; // время в новом состоянии с нуля
        state[key] = cur - 1;
        events.push({ type: 'step', ladder: key, from: cur, to: cur - 1 });
        const fatigue = (SURVIVAL_RULES.fatigueOnStep[key] || {})[cur] || 0;
        if (fatigue > 0) {
            addFatigue(state, key, fatigue);
            events.push({ type: 'fatigueAdded', source: key, cause: 'step' });
        }
    }
}

// Один часовой тик (три шага, §5). Мутирует рабочую копию.
// options.sleepMode — часы сна: лестница сна заморожена (сон лечит).
function tickHour(state, options = {}) {
    const events = [];
    // 1. Лестницы + начисление Усталости.
    for (const key of LADDERS) {
        if (options.sleepMode && key === 'sleep') continue;
        state.acc[key] += 1;
        stepLadder(state, key, events);
    }
    // 2. Снятие: −1 очко, если все лестницы вне зон начисления
    //    (проверка по состояниям ПОСЛЕ шага — «на уровнях до начисления»
    //    означает вне штрафных зон на момент снятия).
    const { removalMin } = SURVIVAL_RULES;
    if (
        state.food >= removalMin.food
        && state.water >= removalMin.water
        && state.sleep >= removalMin.sleep
        && totalFatigue(state) > 0
    ) {
        removeFatigueTotal(state, 1);
        events.push({ type: 'fatigueRemoved', amount: 1 });
    }
    // 3. Дрен ОЗ по итоговому N.
    const drain = hpDrainForFatigue(totalFatigue(state));
    if (drain > 0) events.push({ type: 'hpDrain', amount: drain });
    return { drain, events };
}

// Продвижение игровых часов контура выживания (реальный тик, сон —
// для еды/воды). Дробные часы копятся в timeCarried, тик — по целым.
export function advanceHours(state, hours, options = {}) {
    if (!Number.isFinite(hours) || hours < 0) {
        throw new Error(`advanceHours: некорректные часы: ${hours}`);
    }
    const wk = cloneState(state);
    const carried = wk.timeCarried + hours;
    const whole = Math.floor(carried);
    wk.timeCarried = carried - whole;
    let hpLost = 0;
    const events = [];
    for (let i = 0; i < whole; i += 1) {
        const r = tickHour(wk, options);
        hpLost += r.drain;
        for (const e of r.events) events.push({ hour: i + 1, ...e });
    }
    return { state: wk, hpLost, events };
}

// Реальный тик: X реальных минут = 1 игровой час (курс из настроек).
export function advanceRealMinutes(state, realMinutes, courseMinutesPerHour = SURVIVAL_RULES.defaultCourseMinutesPerHour) {
    if (!(courseMinutesPerHour > 0)) {
        throw new Error(`advanceRealMinutes: некорректный курс: ${courseMinutesPerHour}`);
    }
    return advanceHours(state, realMinutes / courseMinutesPerHour);
}

// Еда. Возвращает { ok, reason?, state, gained: { food, water } }.
// На секции 5 есть нельзя («не можете больше есть») — суп тоже.
export function consumeFood(state, item) {
    if (!item || item.itemType !== 'food') {
        return { ok: false, reason: 'notFood', state, gained: { food: 0, water: 0 } };
    }
    if (state.food >= SURVIVAL_RULES.max.food) {
        return { ok: false, reason: 'full', state, gained: { food: 0, water: 0 } };
    }
    const wk = cloneState(state);
    let foodSteps = 0;
    let waterSteps = 0;
    if (item.soup) {
        // Суп — всегда +1 еда и +1 вода, замещает категорию приготовленного.
        foodSteps = bumpLadder(wk, 'food', 1);
        waterSteps = bumpLadder(wk, 'water', 1);
    } else if (item.state === 'cooked' && !item.preserved) {
        foodSteps = bumpLadder(wk, 'food', 2); // приготовленная еда
    } else {
        foodSteps = bumpLadder(wk, 'food', 1); // сырая или консервированная
    }
    return { ok: true, state: wk, gained: { food: foodSteps, water: waterSteps } };
}

// Питьё. На потолке пить МОЖНО — шкала не двигается, эффекты работают.
export function consumeDrink(state, item) {
    if (!item || item.itemType !== 'drinks') {
        return { ok: false, reason: 'notDrink', state, gained: { water: 0 } };
    }
    const wk = cloneState(state);
    const steps = item.purified ? 2 : 1; // очищенная вода +2, остальное +1
    const waterSteps = bumpLadder(wk, 'water', steps);
    return { ok: true, state: wk, gained: { water: waterSteps } };
}

// Сон. place: 'bed' | 'wasteland', часы 1–24.
// currentHp (число) — включает прогноз: hpEnd / hitsZero / zeroAtHour
// (алерт в модали до подтверждения, §6).
export function rest(state, { place, hours, currentHp = null }) {
    const rules = SURVIVAL_RULES.sleep;
    if (!['bed', 'wasteland'].includes(place)) {
        throw new Error(`rest: некорректное место сна: ${place}`);
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > SURVIVAL_RULES.maxSleepHours) {
        throw new Error(`rest: некорректные часы сна: ${hours}`);
    }
    const wk = cloneState(state);
    wk.hpBonus = 0; // «до следующего сна» — любой сон снимает бонус
    const events = [];
    let hpLost = 0;
    let hp = currentHp;
    let hitsZero = false;
    let zeroAtHour = null;
    for (let h = 1; h <= hours; h += 1) {
        const r = tickHour(wk, { sleepMode: true });
        hpLost += r.drain;
        if (hp != null && !hitsZero) {
            hp -= r.drain;
            if (hp <= 0) {
                hitsZero = true;
                zeroAtHour = h;
            }
        }
        for (const e of r.events) events.push({ hour: h, ...e });
        if (h === rules.fatigueClearHours) {
            const removed = fatigueFromSource(wk, 'sleep');
            if (removed > 0) {
                clearFatigueSource(wk, 'sleep');
                events.push({ hour: h, type: 'fatigueSleepCleared', removed });
            }
        }
    }
    // Итог лестницы сна (§4). Короткий сон не понижает высоких состояний.
    const before = wk.sleep;
    if (hours >= rules.perfectHours && place === rules.perfectPlace) {
        wk.sleep = 5;
        wk.hpBonus = rules.hpBonus;
    } else if (hours >= rules.longHours) {
        wk.sleep = 4;
    } else if (wk.sleep < rules.capShort) {
        wk.sleep = Math.min(rules.capShort, wk.sleep + 1);
    }
    wk.acc.sleep = 0;
    events.push({
        hour: hours,
        type: 'sleepResult',
        from: before,
        to: wk.sleep,
        place,
        hpBonus: wk.hpBonus,
    });
    const result = { state: wk, hpLost, events };
    if (hp != null) {
        result.hpEnd = hitsZero ? 0 : hp;
        result.hitsZero = hitsZero;
        result.zeroAtHour = zeroAtHour;
    }
    return result;
}

// Прогноз сна для модали (чистый прогон rest, состояние не фиксируется).
export function forecastSleep(state, opts) {
    return rest(state, opts);
}

// Строки выживания для панели «Эффекты» (док §6): при Усталости N ≥ 1 —
// «Усталость N» и «Количество получаемых ОД −N» (M = N). Возвращает данные;
// тексты накладывает UI через i18n (survival.fatigue / survival.apPenalty).
export function survivalEffectRows(survival) {
    if (!survival) return [];
    const n = totalFatigue(survival);
    if (n <= 0) return [];
    return [
        { key: 'fatigue', n },
        { key: 'apPenalty', n },
    ];
}
