const SCENE_DURATION_MINUTES = 5;
const SCENE_DURATION_MS = SCENE_DURATION_MINUTES * 60 * 1000;

/** Create a serializable timed-effect record with the shared lifecycle fields. */
export const createTimedEffectRecord = ({
    effectName,
    effectLabel,
    effectKind,
    scenes,
    sourceName,
    sceneDurationMs = SCENE_DURATION_MS,
    fields = {},
}) => ({
    id: `${effectKind}-${effectName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    effectName,
    effectLabel,
    effectKind,
    sourceName,
    createdAt: Date.now(),
    durationMs: Math.max(0, scenes) * sceneDurationMs,
    expiresAt: Date.now() + (Math.max(0, scenes) * sceneDurationMs),
    scenesLeft: scenes,
    ...fields,
});

/** Add a timed effect, stacking its remaining duration with an existing one. */
export const applyOrStackTimedEffect = (
    activeEffects,
    newEffect,
    { sceneDurationMs = SCENE_DURATION_MS } = {},
) => {
    const existingIndex = activeEffects.findIndex((effect) => (
        effect.effectName === newEffect.effectName
        && effect.effectKind === newEffect.effectKind
    ));

    if (existingIndex === -1) {
        return [...activeEffects, newEffect];
    }

    const next = [...activeEffects];
    const prevDuration = Number(next[existingIndex].durationMs)
        || ((Number(next[existingIndex].scenesLeft) || 0) * sceneDurationMs);
    const incomingDuration = Number(newEffect.durationMs)
        || ((Number(newEffect.scenesLeft) || 0) * sceneDurationMs);
    const previousExpiresAt = Number(next[existingIndex].expiresAt)
        || (Date.now() + prevDuration);
    next[existingIndex] = {
        ...next[existingIndex],
        effectLabel: newEffect.effectLabel || next[existingIndex].effectLabel,
        scenesLeft: (Number(next[existingIndex].scenesLeft) || 0)
            + (Number(newEffect.scenesLeft) || 0),
        durationMs: prevDuration + incomingDuration,
        expiresAt: previousExpiresAt + incomingDuration,
    };
    return next;
};

const toStringSafe = (value) => (value === undefined || value === null ? '' : String(value).trim());

const normalizeTimedEffectWithClock = (effect, nowMs) => {
    if (!effect) return { normalized: effect, expired: false, changed: false };
    // Permanent timed effects do not expire by scene progression; their owning
    // setting or generic condition-removal flow is responsible for removing them.
    if (effect.isPermanent) {
        return {
            expired: false,
            changed: false,
            normalized: effect,
        };
    }
    const currentScenes = Math.max(0, Number(effect.scenesLeft) || 0);
    const hasExpiresAt = Number.isFinite(Number(effect.expiresAt));
    const expiresAt = hasExpiresAt
        ? Number(effect.expiresAt)
        : nowMs + (currentScenes * SCENE_DURATION_MS);

    const remainingMs = Math.max(0, expiresAt - nowMs);
    const nextScenesLeft = Math.ceil(remainingMs / SCENE_DURATION_MS);
    const nextDuration = Number(effect.durationMs) || (currentScenes * SCENE_DURATION_MS);
    const expired = remainingMs <= 0;
    const changed = !hasExpiresAt
        || Number(effect.durationMs) !== nextDuration
        || currentScenes !== nextScenesLeft;

    return {
        expired,
        changed,
        normalized: {
            ...effect,
            expiresAt,
            durationMs: nextDuration,
            scenesLeft: nextScenesLeft,
        },
    };
};

/**
 * Добавляет дозу в скользящее временное окно и возвращает общий размер пула.
 * Содержимое записей задаёт сеттинг; движок учитывает только их takenAt.
 */
export const recordDoseWithinWindow = (doseLog, dose, { now, windowMs }) => {
    if (!Array.isArray(doseLog)) {
        throw new Error('[effects] doseLog должен быть массивом');
    }
    if (doseLog.some((entry) => !entry || !Number.isFinite(entry.takenAt))) {
        throw new Error('[effects] Каждая запись doseLog должна содержать числовой takenAt');
    }
    if (!dose || !Number.isFinite(dose.takenAt)) {
        throw new Error('[effects] dose должен содержать числовой takenAt');
    }
    if (!Number.isFinite(now) || !Number.isFinite(windowMs) || windowMs <= 0) {
        throw new Error('[effects] Некорректное временное окно доз');
    }

    const activeDoses = doseLog.filter(({ takenAt }) => now - takenAt < windowMs);
    const nextDoseLog = [...activeDoses, dose];

    return {
        doseLog: nextDoseLog,
        doseCount: nextDoseLog.length,
    };
};

/**
 * Apply a requested condition-removal list from an item to the character.
 *
 * @param {object}   item       — item with positiveEffect.removeCondition
 * @param {string[]} conditions — текущие условия персонажа
 * @returns {{ conditions: string[], removed: string[], requested: string[] }}
 */
export const applyRemoveConditions = (item, conditions = []) => {
    const positiveEffect = item?.positiveEffect;
    if (!positiveEffect || typeof positiveEffect !== 'object') {
        return { conditions, removed: [], requested: [] };
    }
    const requested = Array.isArray(positiveEffect.removeCondition)
        ? positiveEffect.removeCondition.map(toStringSafe).filter(Boolean)
        : [];
    if (requested.length === 0) {
        return { conditions, removed: [], requested };
    }
    const removed = conditions.filter((condition) => requested.includes(condition));
    const next = conditions.filter((condition) => !requested.includes(condition));
    return { conditions: next, removed, requested };
};

export const advanceEffectsByScene = (currentEffects = []) => {
    const nowMs = Date.now() + SCENE_DURATION_MS;
    const expired = [];
    const nextEffects = currentEffects.reduce((acc, effect) => {
        const normalized = normalizeTimedEffectWithClock(effect, nowMs);
        if (normalized.expired) {
            expired.push(normalized.normalized);
            return acc;
        }
        acc.push(normalized.normalized);
        return acc;
    }, []);

    return {
        effects: nextEffects,
        expired,
    };
};

// Массовое продвижение таймеров эффектов на N сцен одним проходом.
// Сон — мост контуров (док выживания §5): N часов сна = N × 12 сцен
// (1 игровой час = 60 минут = 12 сцен по 5 минут). Применяется модалкой
// сна; счётчик сцен персонажа при этом не меняется.
export const advanceEffectsByScenes = (currentEffects = [], scenes = 0) => {
    if (!Number.isInteger(scenes) || scenes < 0) {
        throw new Error(`[effects] advanceEffectsByScenes: некорректное число сцен: ${scenes}`);
    }
    const nowMs = Date.now() + scenes * SCENE_DURATION_MS;
    const expired = [];
    const nextEffects = currentEffects.reduce((acc, effect) => {
        const normalized = normalizeTimedEffectWithClock(effect, nowMs);
        if (normalized.expired) {
            expired.push(normalized.normalized);
            return acc;
        }
        acc.push(normalized.normalized);
        return acc;
    }, []);

    return {
        effects: nextEffects,
        expired,
    };
};

export const pruneExpiredTimedEffects = (currentEffects = [], nowMs = Date.now()) => {
    let changed = false;
    const expired = [];
    const effects = currentEffects.reduce((acc, effect) => {
        const normalized = normalizeTimedEffectWithClock(effect, nowMs);
        if (normalized.expired) {
            expired.push(normalized.normalized);
            changed = true;
            return acc;
        }
        if (normalized.changed) changed = true;
        acc.push(normalized.normalized);
        return acc;
    }, []);

    if (effects.length !== currentEffects.length) {
        changed = true;
    }

    return {
        effects,
        expired,
        changed,
    };
};

export const SCENE_RULES = {
    SCENE_DURATION_MINUTES,
    // Сцен в одном игровом часу (60 минут / 5 минут на сцену) — мост
    // между контуром эффектов и сном (док выживания §5).
    SCENES_PER_GAME_HOUR: Math.round(60 / SCENE_DURATION_MINUTES),
};

export default {
    SCENE_RULES,
    createTimedEffectRecord,
    applyOrStackTimedEffect,
    recordDoseWithinWindow,
    applyRemoveConditions,
    advanceEffectsByScene,
    advanceEffectsByScenes,
    pruneExpiredTimedEffects,
};
