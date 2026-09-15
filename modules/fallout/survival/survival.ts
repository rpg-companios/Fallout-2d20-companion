// Система выживания — домен сеттинга Fallout (редакция правил 0.4 дизайн-дока).
// Модуль сеттинга: modules/fallout/survival/ (патч 207 — выживание вынесено
// из движка; движок применяет его через реестр расширений
// src/store/stateExtensions.js и правил не знает).
//
// Чистые функции без React и без обращения к часам: время передаётся
// явно (игровые часы / реальные минуты). Состояние хранится в сейве
// персонажа (см. docs/survival-system-design.md §12).
//
// Порядок часового тика (утверждён владельцем, §5):
//   1) шаг лестниц (еда/вода/сон) + начисление Усталости за переходы;
//   2) снятие Усталости: −1, если еда ≥ 2, вода ≥ 2, сон ≥ 3;
//   3) дрен ОЗ ⌊N/2⌋ по итоговому N, без сопротивлений.
//
// Файл переведён на TypeScript патчем 206 (модалки еды/питья/сна):
// тронутая логика переходит в .ts, сейв-формат не меняется.

export type SurvivalLadder = 'food' | 'water' | 'sleep';
export type FatigueSource = 'food' | 'water' | 'sleep' | string;
export type SleepPlace = 'bed' | 'wasteland';

export interface FatigueEntry {
    source: FatigueSource;
    amount: number;
}

export interface SurvivalState {
    food: number;
    water: number;
    sleep: number;
    fatigue: FatigueEntry[];
    acc: { food: number; water: number; sleep: number };
    timeCarried: number;
    hpBonus: number;
    // Аккумулятор отдыха в постели (патч 215): часы сна В КРОВАТИ; каждые
    // bedRestHealHours накопленных часов снимают 1 единицу с каждой болезни
    // (применяет вызывающий — операции, через контекст персонажа).
    bedRestHours: number;
}

// Признаки расходника, которые читает домен выживания (данные сеттинга:
// food.json / drinks.json). Прочие поля предмета домену не важны.
export interface SurvivalConsumable {
    itemType?: string;
    soup?: boolean;
    state?: string;
    preserved?: boolean;
    purified?: boolean;
}

export interface SurvivalRules {
    capableTypes: string[];
    max: Record<SurvivalLadder, number>;
    stepHours: Record<SurvivalLadder, Record<number, number>>;
    bottomPeriodHours: Record<SurvivalLadder, number>;
    fatigueOnStep: Record<SurvivalLadder, Record<number, number>>;
    removalMin: Record<SurvivalLadder, number>;
    sleep: {
        capShort: number;
        longHours: number;
        perfectHours: number;
        perfectPlace: SleepPlace;
        hpBonus: number;
        fatigueClearHours: number;
    };
    // Отдых в постели: каждые N накопленных часов сна в кровати снимают
    // 1 единицу с каждой болезни (патч 215).
    bedRestHealHours: number;
    defaultCourseMinutesPerHour: number;
    maxSleepHours: number;
}

export const SURVIVAL_RULES: SurvivalRules = {
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
    // Отдых в постели: 12 накопленных часов сна в кровати снимают
    // 1 единицу с каждой болезни (решение владельца, патч 215).
    bedRestHealHours: 12,
    // Дефолтный курс времени: 30 реальных минут = 1 игровой час.
    defaultCourseMinutesPerHour: 30,
    maxSleepHours: 24,
};

const LADDERS: SurvivalLadder[] = ['food', 'water', 'sleep'];

export interface ConsumeGain {
    food: number;
    water: number;
}

export interface ConsumeResult {
    ok: boolean;
    reason?: 'notFood' | 'full' | 'notDrink';
    state: SurvivalState;
    gained: ConsumeGain;
}

export function isSurvivalCapable(characterType: string | undefined | null): boolean {
    return SURVIVAL_RULES.capableTypes.includes(characterType ?? '');
}

// Начальное состояние — все шкалы на максимуме (решение владельца).
// Роботам/киборгам шкалы не положены — null.
export function createSurvivalState(characterType: string | undefined | null): SurvivalState | null {
    if (!isSurvivalCapable(characterType)) return null;
    return {
        food: SURVIVAL_RULES.max.food,
        water: SURVIVAL_RULES.max.water,
        sleep: SURVIVAL_RULES.max.sleep,
        fatigue: [], // [{ source: 'food'|'water'|'sleep', amount }]
        acc: { food: 0, water: 0, sleep: 0 }, // часы в текущей секции
        timeCarried: 0, // дробная часть игрового часа от реального тика
        hpBonus: 0, // +2 к макс. ОЗ до следующего сна (кровать, ≥8 ч)
        bedRestHours: 0, // аккумулятор отдыха в постели (патч 215)
    };
}

function cloneState(state: SurvivalState): SurvivalState {
    return {
        ...state,
        fatigue: state.fatigue.map((f) => ({ ...f })),
        acc: { ...state.acc },
    };
}

export function totalFatigue(state: SurvivalState): number {
    return state.fatigue.reduce((sum, f) => sum + f.amount, 0);
}

export function fatigueFromSource(state: SurvivalState, source: FatigueSource): number {
    const entry = state.fatigue.find((f) => f.source === source);
    return entry ? entry.amount : 0;
}

export function addFatigue(state: SurvivalState, source: FatigueSource, amount: number): void {
    const entry = state.fatigue.find((f) => f.source === source);
    if (entry) entry.amount += amount;
    else state.fatigue.push({ source, amount });
}

// Списание из общей кучи: сначала с наибольшего источника
// (детерминированная деталь реализации, §6 дока).
// excludeSources — источники, которые списание не трогает (усталость от
// болезни снимается только излечением, патч 215).
export function removeFatigueTotal(state: SurvivalState, amount: number, excludeSources: FatigueSource[] = []): void {
    let left = amount;
    while (left > 0) {
        let biggest: FatigueEntry | null = null;
        for (const f of state.fatigue) {
            if (f.amount > 0 && !excludeSources.includes(f.source) && (!biggest || f.amount > biggest.amount)) biggest = f;
        }
        if (!biggest) return;
        const take = Math.min(left, biggest.amount);
        biggest.amount -= take;
        left -= take;
    }
}

// Усталость от болезни (патч 215): +1 при заражении (на каждую болезнь),
// −1 при полном излечении болезни. Снимается ТОЛЬКО излечением: часовое
// снятие и сон её не трогают (excludeSources выше).
export function addDiseaseFatigue(state: SurvivalState, amount: number): void {
    addFatigue(state, 'disease', amount);
}

export function removeDiseaseFatigue(state: SurvivalState, amount: number): void {
    const entry = state.fatigue.find((f) => f.source === 'disease');
    if (entry && entry.amount > 0) {
        entry.amount = Math.max(0, entry.amount - amount);
    }
}

// Чистые переходы для контекста персонажа (патч 215): домен мутирует
// рабочие копии, а болезни меняют усталость точечно — возвращаем новое
// состояние без мутации исходного.
export function cloneSurvivalState(state: SurvivalState): SurvivalState {
    return cloneState(state);
}

export function withDiseaseFatigue(state: SurvivalState, amount: number): SurvivalState {
    const next = cloneState(state);
    addFatigue(next, 'disease', amount);
    return next;
}

export function withoutDiseaseFatigue(state: SurvivalState, amount: number): SurvivalState {
    const next = cloneState(state);
    removeDiseaseFatigue(next, amount);
    return next;
}

export function clearFatigueSource(state: SurvivalState, source: FatigueSource): void {
    const entry = state.fatigue.find((f) => f.source === source);
    if (entry) entry.amount = 0;
}

// Снижение максимума ОЗ от Усталости (патч 213): −1 к макс. ОЗ за каждые
// 2 очка Усталости (⌊N/2⌋), без сопротивлений. По книге усталость дренирует
// МАКСИМУМ ОЗ, а не текущие — величина производная от текущего N:
// пересчитывается каждый игровой час (шаг 3 тика), отдельного аккумулятора
// в состоянии нет; при снятии Усталости максимум возвращается сам.
// Патч 232 (решение владельца, по книге): усталость — потеря ТЕКУЩИХ ОЗ
// «на начале сцены»: N/2 без сопротивлений. В приложении сцены не тикают
// (advanceScene — спящий код), поэтому потеря привязана к игровому часу
// тика выживания (каденция «сцена -> час» — как у снятия усталости); часы
// сна потерь не дают (сцены для спящего не начинаются). Функция возвращает
// величину потери за час/сцену; применяет её SurvivalClock.
export function hpMaxPenaltyForFatigue(fatigueTotal: number): number {
    return Math.floor(fatigueTotal / 2);
}

// Суммарная потеря ОЗ по событиям часового тика (SurvivalClock применяет её
// к текущим ОЗ через applySurvivalHpLoss; rest()/сон события не применяет).
export function fatigueHpLossFromEvents(events: SurvivalEvent[]): number {
    return events
        .filter((e) => e.type === 'hpMaxPenalty')
        .reduce((sum, e) => sum + (typeof e.amount === 'number' ? e.amount : 0), 0);
}

// Смена секции (в любую сторону) — счётчик времени в состоянии с нуля.
function bumpLadder(state: SurvivalState, key: SurvivalLadder, delta: number): number {
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

export interface SurvivalEvent {
    hour?: number;
    type: string;
    [key: string]: unknown;
}

// Шаг одной лестницы по накопленным часам. Возвращает события.
function stepLadder(state: SurvivalState, key: SurvivalLadder, events: SurvivalEvent[]): void {
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

export interface TickOptions {
    sleepMode?: boolean;
}

// Один часовой тик (три шага, §5). Мутирует рабочую копию.
// options.sleepMode — часы сна: лестница сна заморожена (сон лечит).
function tickHour(state: SurvivalState, options: TickOptions = {}): SurvivalEvent[] {
    const events: SurvivalEvent[] = [];
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
        removeFatigueTotal(state, 1, ['disease']);
        events.push({ type: 'fatigueRemoved', amount: 1 });
    }
    // 3. Снижение максимума ОЗ по итоговому N (патч 213): производная
    //    ⌊N/2⌋ — событие для наблюдателей/тестов, состояние не пишется.
    // Патч 232: событие = потеря текущих ОЗ за этот игровой час (применяет
    // SurvivalClock; часы сна потерь не дают).
    const maxPenalty = hpMaxPenaltyForFatigue(totalFatigue(state));
    if (maxPenalty > 0) events.push({ type: 'hpMaxPenalty', amount: maxPenalty });
    return events;
}

export interface AdvanceResult {
    state: SurvivalState;
    events: SurvivalEvent[];
}

// Продвижение игровых часов контура выживания (реальный тик, сон —
// для еды/воды). Дробные часы копятся в timeCarried, тик — по целым.
export function advanceHours(state: SurvivalState, hours: number, options: TickOptions = {}): AdvanceResult {
    if (!Number.isFinite(hours) || hours < 0) {
        throw new Error(`advanceHours: некорректные часы: ${hours}`);
    }
    const wk = cloneState(state);
    const carried = wk.timeCarried + hours;
    const whole = Math.floor(carried);
    wk.timeCarried = carried - whole;
    const events: SurvivalEvent[] = [];
    for (let i = 0; i < whole; i += 1) {
        const hourEvents = tickHour(wk, options);
        for (const e of hourEvents) events.push({ hour: i + 1, ...e });
    }
    return { state: wk, events };
}

// Реальный тик: X реальных минут = 1 игровой час (курс из настроек).
export function advanceRealMinutes(
    state: SurvivalState,
    realMinutes: number,
    courseMinutesPerHour: number = SURVIVAL_RULES.defaultCourseMinutesPerHour,
): AdvanceResult {
    if (!(courseMinutesPerHour > 0)) {
        throw new Error(`advanceRealMinutes: некорректный курс: ${courseMinutesPerHour}`);
    }
    return advanceHours(state, realMinutes / courseMinutesPerHour);
}

// Подъём шкал от еды — чисто по данным предмета (§2, §11): суп всегда
// +1 еда и +1 вода (замещает категорию приготовленного); приготовленное
// не консервированное — +2 еды; сырое/консервированное — +1 еда.
export function foodGain(item: SurvivalConsumable | null | undefined): ConsumeGain {
    if (item?.soup) {
        return { food: 1, water: 1 };
    }
    if (item?.state === 'cooked' && !item?.preserved) {
        return { food: 2, water: 0 };
    }
    return { food: 1, water: 0 };
}

// Подъём шкалы воды от напитка (§3, §11): очищенная вода +2, остальное +1.
export function drinkGain(item: SurvivalConsumable | null | undefined): ConsumeGain {
    return { food: 0, water: item?.purified ? 2 : 1 };
}

// Еда. Возвращает { ok, reason?, state, gained }.
// На секции 5 есть нельзя («не можете больше есть») — суп тоже.
export function consumeFood(state: SurvivalState, item: SurvivalConsumable | null | undefined): ConsumeResult {
    if (!item || item.itemType !== 'food') {
        return { ok: false, reason: 'notFood', state, gained: { food: 0, water: 0 } };
    }
    if (state.food >= SURVIVAL_RULES.max.food) {
        return { ok: false, reason: 'full', state, gained: { food: 0, water: 0 } };
    }
    const wk = cloneState(state);
    const gain = foodGain(item);
    const foodSteps = bumpLadder(wk, 'food', gain.food);
    const waterSteps = gain.water > 0 ? bumpLadder(wk, 'water', gain.water) : 0;
    return { ok: true, state: wk, gained: { food: foodSteps, water: waterSteps } };
}

// Питьё. На потолке пить МОЖНО — шкала не двигается, эффекты работают.
export function consumeDrink(state: SurvivalState, item: SurvivalConsumable | null | undefined): ConsumeResult {
    if (!item || item.itemType !== 'drinks') {
        return { ok: false, reason: 'notDrink', state, gained: { food: 0, water: 0 } };
    }
    const wk = cloneState(state);
    const waterSteps = bumpLadder(wk, 'water', drinkGain(item).water);
    return { ok: true, state: wk, gained: { food: 0, water: waterSteps } };
}

export interface RestOptions {
    place: SleepPlace;
    hours: number;
}

export interface RestResult {
    state: SurvivalState;
    events: SurvivalEvent[];
    // Сколько полных порций bedRestHealHours накоплено этим сном в кровати
    // (патч 215): вызывающий снимает по 1 единице с каждой болезни за порцию.
    bedRestCompleted: number;
}

// Сон. place: 'bed' | 'wasteland', часы 1–24.
// Текущие ОЗ сон не трогает: усталость снижает максимум (производная, §6,
// патч 213) — прогноз в модали показывает итоговый максимум ОЗ после сна.
export function rest(state: SurvivalState, { place, hours }: RestOptions): RestResult {
    const rules = SURVIVAL_RULES.sleep;
    if (!['bed', 'wasteland'].includes(place)) {
        throw new Error(`rest: некорректное место сна: ${place}`);
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > SURVIVAL_RULES.maxSleepHours) {
        throw new Error(`rest: некорректные часы сна: ${hours}`);
    }
    const wk = cloneState(state);
    wk.hpBonus = 0; // «до следующего сна» — любой сон снимает бонус
    const events: SurvivalEvent[] = [];
    // Отдых в постели (патч 215): часы сна В КРОВАТИ копятся в аккумулятор;
    // каждые bedRestHealHours часов — порция лечения болезней (применяет
    // вызывающий, чтобы получить имена излеченных). Сон в пустоши
    // аккумулятор не двигает.
    let bedRestCompleted = 0;
    if (place === 'bed') {
        wk.bedRestHours += hours;
        bedRestCompleted = Math.floor(wk.bedRestHours / SURVIVAL_RULES.bedRestHealHours);
        wk.bedRestHours -= bedRestCompleted * SURVIVAL_RULES.bedRestHealHours;
    }
    for (let h = 1; h <= hours; h += 1) {
        const hourEvents = tickHour(wk, { sleepMode: true });
        for (const e of hourEvents) events.push({ hour: h, ...e });
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
    return { state: wk, events, bedRestCompleted };
}

// Прогноз сна для модали (чистый прогон rest, состояние не фиксируется).
export function forecastSleep(state: SurvivalState, opts: RestOptions): RestResult {
    return rest(state, opts);
}

// Канонический порядок источников Усталости в разбивке панели «Эффекты»
// (патч 217): лестницы (еда, вода, сон), затем болезнь.
export const FATIGUE_SOURCE_ORDER: FatigueSource[] = ['food', 'water', 'sleep', 'disease'];

// Активные источники Усталости (только amount > 0) в каноническом порядке.
// Неизвестные источники (вне FATIGUE_SOURCE_ORDER) — в конце, в порядке
// сейва: сумма разбивки всегда совпадает с totalFatigue.
export function fatigueSourceBreakdown(state: SurvivalState): Array<{ source: FatigueSource; amount: number }> {
    const known = FATIGUE_SOURCE_ORDER.map((source) => ({ source, amount: fatigueFromSource(state, source) }))
        .filter((entry) => entry.amount > 0);
    const unknown = state.fatigue
        .filter((entry) => entry.amount > 0 && !FATIGUE_SOURCE_ORDER.includes(entry.source))
        .map((entry) => ({ source: entry.source, amount: entry.amount }));
    return [...known, ...unknown];
}

// Строки выживания для панели «Эффекты» (док §6): при Усталости N ≥ 1 —
// «Усталость N», «Количество получаемых ОД −N» (M = N) и
// «Максимум ОЗ: −P» (P = ⌊N/2⌋, при P ≥ 1 — патч 213). Возвращает данные;
// тексты накладывает UI через i18n (survival.fatigue / survival.apPenalty /
// survival.maxHpPenalty). Патч 217: строка «Усталость» несёт разбивку по
// активным источникам (sources), UI добавляет её в скобках.
// Цветовая шкала состояния лестницы (патч 231, решение владельца): значение
// состояния красится от нейтрального (потолок) к красному (дно):
// 'ok' → 'grey' → 'yellow' → 'orange' → 'red'. У 5-ступенчатых лестниц
// (еда, сон) все 5 красок; у воды 4 ступени — «жёлто-красный» пропускается,
// дно сразу красное (решение владельца).
export function ladderColorKey(
    ladder: SurvivalLadder,
    value: number,
): 'ok' | 'grey' | 'yellow' | 'orange' | 'red' {
    const max = SURVIVAL_RULES.max[ladder];
    const severity = max - value;
    if (severity <= 0) return 'ok';
    if (severity === 1) return 'grey';
    if (severity === 2) return 'yellow';
    if (max >= 5) return severity === 3 ? 'orange' : 'red';
    return 'red';
}

export function survivalEffectRows(
    survival: SurvivalState | null | undefined,
): Array<{ key: string; n: number; sources?: Array<{ source: string; amount: number }> }> {
    if (!survival) return [];
    const n = totalFatigue(survival);
    if (n <= 0) return [];
    const rows: Array<{ key: string; n: number; sources?: Array<{ source: string; amount: number }> }> = [
        { key: 'fatigue', n, sources: fatigueSourceBreakdown(survival) },
        { key: 'apPenalty', n },
    ];
    // Патч 232: строка «потеря ОЗ за игровой час» вместо «Максимум ОЗ: -P».
    const maxPenalty = hpMaxPenaltyForFatigue(n);
    if (maxPenalty > 0) rows.push({ key: 'hpPerHour', n: maxPenalty });
    return rows;
}
