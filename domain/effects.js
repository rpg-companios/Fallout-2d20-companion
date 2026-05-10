import ruEffects from '../i18n/ru-RU/data/system/effects.json';
import enEffects from '../i18n/en-EN/data/system/effects.json';
import { getCurrentLocale } from '../i18n/locale';
import { rollCombatDiceEffects } from './diceRollsLogic';

const SCENE_DURATION_MINUTES = 5;
const SCENE_DURATION_MS = SCENE_DURATION_MINUTES * 60 * 1000;
const CANONICAL_ATTRIBUTES = new Set(['STR', 'END', 'PER', 'AGI', 'INT', 'CHA', 'LCK']);

const DICTIONARIES = {
    'ru-RU': ruEffects,
    'en-EN': enEffects,
};

const tEffects = (path, vars = {}) => {
    const parts = path.split('.');
    const locale = getCurrentLocale();
    let current = DICTIONARIES[locale] || ruEffects;
    for (const part of parts) {
        current = current?.[part];
        if (current === undefined) return path;
    }
    return String(current).replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] ?? ''));
};

const DURATION_LASTING_SCENES = 1;  // lasting = до конца текущей сцены (1 сцена = 5 мин)
const DURATION_BRIEF_SCENES = 3;    // brief = краткое действие (3 сцены = 15 мин)

const toStringSafe = (value) => (value === undefined || value === null ? '' : String(value).trim());

const normalizeDuration = (rawDuration) => {
    const value = toStringSafe(rawDuration).toLowerCase();
    const localizedNone = tEffects('duration.none').toLowerCase();
    const localizedInstant = tEffects('duration.instant').toLowerCase();

    if (!value || value === localizedNone || value === 'none') {
        return { type: 'none', scenes: 0 };
    }
    if (value === localizedInstant || value === 'instant') {
        return { type: 'instant', scenes: 0 };
    }
    // lasting = до конца сцены (1 сцена = 5 мин)
    if (value === 'lasting') {
        return { type: 'scene', scenes: DURATION_LASTING_SCENES };
    }
    // brief = краткое (3 сцены)
    if (value === 'brief') {
        return { type: 'scene', scenes: DURATION_BRIEF_SCENES };
    }

    const localizedScene = tEffects('duration.sceneUnit').toLowerCase();
    const sceneMatch = value.match(new RegExp(`(\\d+)\\s*(${localizedScene}\\w*|scene\\w*)`));
    if (sceneMatch) {
        return { type: 'scene', scenes: Number(sceneMatch[1]) || 0 };
    }

    return { type: 'none', scenes: 0 };
};

const normalizeRemovalEffects = (list) => {
    if (!list) return [];
    if (Array.isArray(list)) {
        return list.map((entry) => toStringSafe(entry)).filter(Boolean);
    }

    return toStringSafe(list)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const buildTimedEffect = ({ effectName, effectLabel, effectKind, scenes, sourceName, maxHpModifier, damageResistanceModifier }) => ({
    id: `${effectKind}-${effectName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    effectName,
    effectLabel,
    effectKind,
    sourceName,
    createdAt: Date.now(),
    durationMs: Math.max(0, scenes) * SCENE_DURATION_MS,
    expiresAt: Date.now() + (Math.max(0, scenes) * SCENE_DURATION_MS),
    scenesLeft: scenes,
    ...(maxHpModifier ? { maxHpModifier } : {}),
    ...(damageResistanceModifier ? { damageResistanceModifier } : {}),
});

const applyOrStackEffect = (activeEffects, newEffect) => {
    const existingIndex = activeEffects.findIndex((effect) => (
        effect.effectName === newEffect.effectName
        && effect.effectKind === newEffect.effectKind
    ));

    if (existingIndex === -1) {
        return [...activeEffects, newEffect];
    }

    const next = [...activeEffects];
    const prevDuration = Number(next[existingIndex].durationMs) || ((Number(next[existingIndex].scenesLeft) || 0) * SCENE_DURATION_MS);
    const incomingDuration = Number(newEffect.durationMs) || ((Number(newEffect.scenesLeft) || 0) * SCENE_DURATION_MS);
    const previousExpiresAt = Number(next[existingIndex].expiresAt) || (Date.now() + prevDuration);
    next[existingIndex] = {
        ...next[existingIndex],
        effectLabel: newEffect.effectLabel || next[existingIndex].effectLabel,
        scenesLeft: (Number(next[existingIndex].scenesLeft) || 0) + (Number(newEffect.scenesLeft) || 0),
        durationMs: prevDuration + incomingDuration,
        expiresAt: previousExpiresAt + incomingDuration,
    };
    return next;
};

const normalizeTimedEffectWithClock = (effect, nowMs) => {
    if (!effect) return { normalized: effect, expired: false, changed: false };
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

const normalizeAttributeToken = (token) => {
    const trimmed = toStringSafe(token).toUpperCase();
    return CANONICAL_ATTRIBUTES.has(trimmed) ? trimmed : null;
};

const parseAttributeDelta = (text) => {
    const raw = toStringSafe(text);
    if (!raw) return null;

    const match = raw.match(/([+-]?\d+)\s*<([^>]+)>/i);
    if (!match) return null;

    const amount = Number(match[1]);
    const attribute = normalizeAttributeToken(match[2]);
    if (!attribute || !Number.isFinite(amount)) return null;

    return { attribute, amount };
};

export const getTimedAttributeModifiers = (activeEffects = []) => (
    activeEffects.reduce((acc, effect) => {
        if (!effect || effect.effectKind !== 'positive') return acc;

        const parsed = parseAttributeDelta(effect.effectLabel) || parseAttributeDelta(effect.effectName);
        if (!parsed) return acc;

        acc[parsed.attribute] = (acc[parsed.attribute] || 0) + parsed.amount;
        return acc;
    }, {})
);

/**
 * Проверяет возникновение зависимости при приёме препарата.
 *
 * Механика: бросаем N Combat Dice (N = дозы за 24 ч),
 * считаем грани 5 и 6 как "эффекты".
 * Если effectCount >= addictionLevel → зависимость.
 *
 * @param {object} item          — предмет с полем addictionLevel
 * @param {number} dosesToday    — сколько доз этого препарата принято за 24 ч (включая текущую)
 * @returns {{ addicted: boolean, effectCount: number, faces: number[], addictionLevel: number }}
 */
export const checkAddiction = (item, dosesToday) => {
    const addictionLevel = Number(item?.addictionLevel) || 0;
    if (addictionLevel === 0 || !item?.negativeEffect) {
        return { addicted: false, effectCount: 0, faces: [], addictionLevel: 0 };
    }
    const { effectCount, faces } = rollCombatDiceEffects(dosesToday);
    return {
        addicted: effectCount >= addictionLevel,
        effectCount,
        faces,
        addictionLevel,
    };
};

/**
 * Применяет removeCondition из предмета к списку условий персонажа.
 * Например аддиктол: { removeCondition: ["addicted"] }
 *
 * @param {object}   item       — предмет с полем positiveEffect.removeCondition
 * @param {string[]} conditions — текущие условия персонажа
 * @returns {{ conditions: string[], removed: string[] }}
 */
export const applyRemoveConditions = (item, conditions = []) => {
    const positiveEffect = item?.positiveEffect;
    if (!positiveEffect || typeof positiveEffect !== 'object') {
        return { conditions, removed: [] };
    }
    const toRemove = Array.isArray(positiveEffect.removeCondition)
        ? positiveEffect.removeCondition.map(toStringSafe).filter(Boolean)
        : [];
    if (toRemove.length === 0) {
        return { conditions, removed: [] };
    }
    const removed = conditions.filter((c) => toRemove.includes(c));
    const next = conditions.filter((c) => !toRemove.includes(c));
    return { conditions: next, removed };
};

export const applyConsumableToEffects = (item, currentEffects = []) => {
    const name = toStringSafe(item?.name || item?.Name);
    let nextEffects = [...currentEffects];
    const events = [];

    const removeNegativeEffects = normalizeRemovalEffects(
        item?.removeNegativeEffects ?? item?.removesNegativeEffects
    );

    if (removeNegativeEffects.length > 0) {
        const beforeLength = nextEffects.length;
        nextEffects = nextEffects.filter((effect) => {
            if (effect.effectKind !== 'negative') return true;
            if (removeNegativeEffects.includes('all')) return false;
            const comparableNames = [effect.effectName, effect.effectLabel].filter(Boolean);
            return !comparableNames.some((value) => removeNegativeEffects.includes(value));
        });

        if (nextEffects.length !== beforeLength) {
            const clearedLabel = removeNegativeEffects.includes('all')
                ? tEffects('events.effectsClearedAll')
                : removeNegativeEffects.join(', ');
            events.push(tEffects('events.effectsCleared', { effects: clearedLabel }));
        }
    }

    const positiveEffectRaw = item?.positiveEffect;
    const positiveEffectIsObject = positiveEffectRaw !== null && typeof positiveEffectRaw === 'object';
    const positiveDuration = normalizeDuration(item?.positiveEffectDuration);

    // maxHpModifier — timed-эффект на максимальные ОЗ
    if (positiveEffectIsObject && positiveEffectRaw?.maxHpModifier && positiveDuration.scenes > 0) {
        const mod = positiveEffectRaw.maxHpModifier;
        const value = Number(mod?.value) || 0;
        if (value !== 0) {
            const effectName = `maxHp:${mod.op}${value}`;
            nextEffects = applyOrStackEffect(nextEffects, buildTimedEffect({
                effectName,
                effectLabel: effectName,
                effectKind: 'positive',
                scenes: positiveDuration.scenes,
                sourceName: name,
                maxHpModifier: mod,
            }));
            events.push(tEffects('events.positiveApplied', { name: effectName, scenes: positiveDuration.scenes }));
        }
    }

    // damageResistanceModifier — timed-эффект на сопротивление урону
    if (positiveEffectIsObject && positiveEffectRaw?.damageResistanceModifier && positiveDuration.scenes > 0) {
        const drMod = positiveEffectRaw.damageResistanceModifier;
        for (const [type, mod] of Object.entries(drMod)) {
            const value = Number(mod?.value) || 0;
            if (value !== 0) {
                const effectName = `dr:${type}:${mod.op}${value}`;
                nextEffects = applyOrStackEffect(nextEffects, buildTimedEffect({
                    effectName,
                    effectLabel: effectName,
                    effectKind: 'positive',
                    scenes: positiveDuration.scenes,
                    sourceName: name,
                    damageResistanceModifier: { type, op: mod.op, value },
                }));
                events.push(tEffects('events.positiveApplied', { name: effectName, scenes: positiveDuration.scenes }));
            }
        }
    }

    // Строковый/label positiveEffect — timed-эффект для отображения
    const positiveName = toStringSafe(item?.positiveEffectLabel || (!positiveEffectIsObject ? positiveEffectRaw : ''));
    const positiveLabel = toStringSafe(item?.positiveEffectLabel);

    if (positiveName && positiveDuration.type !== 'none') {
        if (positiveDuration.type === 'instant') {
            events.push(tEffects('events.instantPositive', { name: positiveName }));
        } else if (positiveDuration.scenes > 0) {
            nextEffects = applyOrStackEffect(nextEffects, buildTimedEffect({
                effectName: positiveName,
                effectLabel: positiveLabel,
                effectKind: 'positive',
                scenes: positiveDuration.scenes,
                sourceName: name,
            }));
            events.push(tEffects('events.positiveApplied', { name: positiveName, scenes: positiveDuration.scenes }));
        }
    }

    const negativeName = toStringSafe(item?.negativeEffect);
    const negativeLabel = toStringSafe(item?.negativeEffectLabel);
    const negativeDuration = normalizeDuration(item?.negativeEffectDuration);

    if (negativeName && negativeDuration.type !== 'none') {
        if (negativeDuration.type === 'instant') {
            events.push(tEffects('events.instantNegative', { name: negativeName }));
        } else if (negativeDuration.scenes > 0) {
            nextEffects = applyOrStackEffect(nextEffects, buildTimedEffect({
                effectName: negativeName,
                effectLabel: negativeLabel,
                effectKind: 'negative',
                scenes: negativeDuration.scenes,
                sourceName: name,
            }));
            events.push(tEffects('events.negativeApplied', { name: negativeName, scenes: negativeDuration.scenes }));
        }
    }

    return {
        effects: nextEffects,
        events,
    };
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

export const getEffectTimeText = (scenesLeft) => {
    const scenes = Number(scenesLeft) || 0;
    const totalMinutes = scenes * SCENE_DURATION_MINUTES;
    return tEffects('display.scenesAndMinutes', { scenes, minutes: totalMinutes });
};

/**
 * Возвращает мгновенное количество HP для лечения из предмета.
 * Читает positiveEffect.hpModifier (chems) или hpHealed (drinks/food).
 */
export const getInstantHealAmount = (item) => {
    if (!item) return 0;
    const pe = item.positiveEffect;
    if (pe && typeof pe === 'object' && pe.hpModifier?.op === '+') {
        return Number(pe.hpModifier.value) || 0;
    }
    if (item.hpHealed != null) return Number(item.hpHealed) || 0;
    if (item.healAmount != null) return Number(item.healAmount) || 0;
    return 0;
};

/**
 * Суммирует бонус к максимальным ОЗ из активных timed-эффектов.
 */
export const getTimedMaxHpBonus = (activeEffects = []) =>
    activeEffects.reduce((sum, effect) => {
        if (!effect || effect.effectKind !== 'positive') return sum;
        const mod = effect.maxHpModifier;
        if (!mod) return sum;
        const val = Number(mod.value) || 0;
        return mod.op === '+' ? sum + val : sum - val;
    }, 0);

/**
 * Суммирует бонус к сопротивлению урону из активных timed-эффектов.
 * Возвращает { physical: N, radiation: N, energy: N }
 */
export const getTimedDamageResistanceBonus = (activeEffects = []) =>
    activeEffects.reduce((acc, effect) => {
        if (!effect || effect.effectKind !== 'positive') return acc;
        const mod = effect.damageResistanceModifier;
        if (!mod) return acc;
        const val = Number(mod.value) || 0;
        const delta = mod.op === '+' ? val : -val;
        acc[mod.type] = (acc[mod.type] || 0) + delta;
        return acc;
    }, {});

export const SCENE_RULES = {
    SCENE_DURATION_MINUTES,
};

export default {
    SCENE_RULES,
    applyConsumableToEffects,
    checkAddiction,
    applyRemoveConditions,
    advanceEffectsByScene,
    pruneExpiredTimedEffects,
    getTimedAttributeModifiers,
    getTimedMaxHpBonus,
    getTimedDamageResistanceBonus,
    getInstantHealAmount,
    getEffectTimeText,
};
