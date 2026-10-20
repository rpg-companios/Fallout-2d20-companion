import {
  applyOrStackTimedEffect,
  createTimedEffectRecord,
} from '../../../domain/effects.js';
import {
  getDefenseModifierEffectLabel,
  getFalloutEffectText,
} from '../logic/effectLabels.js';

const DURATION_LASTING_SCENES = 1;
const DURATION_BRIEF_SCENES = 3;

export const scaleDuration = (duration, multiplier = 1) => {
  const m = Number(multiplier) || 1;
  if (m <= 1 || duration == null) return duration;
  if (duration === 'instant') return duration;
  if (duration === 'lasting') return Math.max(1, Math.round(1 * m));
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    return Math.max(1, Math.round(duration * m));
  }
  return duration;
};

const toStringSafe = (value) => (value === undefined || value === null ? '' : String(value).trim());

const normalizeDuration = (rawDuration) => {
  const value = toStringSafe(rawDuration).toLowerCase();
  const localizedNone = getFalloutEffectText('duration.none').toLowerCase();
  const localizedInstant = getFalloutEffectText('duration.instant').toLowerCase();

  if (!value || value === localizedNone || value === 'none') {
    return { type: 'none', scenes: 0 };
  }
  if (value === localizedInstant || value === 'instant') {
    return { type: 'instant', scenes: 0 };
  }
  if (value === 'lasting') {
    return { type: 'scene', scenes: DURATION_LASTING_SCENES };
  }
  if (value === 'brief') {
    return { type: 'scene', scenes: DURATION_BRIEF_SCENES };
  }

  const localizedScene = getFalloutEffectText('duration.sceneUnit').toLowerCase();
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

const buildFalloutTimedEffect = ({
  maxHpModifier,
  damageResistanceModifier,
  damageModifier,
  apModifier,
  defenseModifier,
  ...effect
}) => createTimedEffectRecord({
  ...effect,
  fields: {
    ...(maxHpModifier ? { maxHpModifier } : {}),
    ...(damageResistanceModifier ? { damageResistanceModifier } : {}),
    ...(damageModifier ? { damageModifier } : {}),
    ...(apModifier ? { apModifier } : {}),
    ...(defenseModifier ? { defenseModifier } : {}),
  },
});

const applyOrStackFalloutEffect = applyOrStackTimedEffect;

/** Interpret Fallout consumable payloads and produce effect records and events. */
export const applyFalloutConsumableToEffects = (item, currentEffects = []) => {
  const name = toStringSafe(item?.name || item?.Name);
  let nextEffects = [...currentEffects];
  const events = [];
  const notificationEvents = [];
  const addNotificationEvent = (kind, message) => {
    events.push(message);
    notificationEvents.push({ kind, message });
  };

  const removeNegativeEffects = normalizeRemovalEffects(
    item?.removeNegativeEffects ?? item?.removesNegativeEffects,
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
        ? getFalloutEffectText('events.effectsClearedAll')
        : removeNegativeEffects.join(', ');
      addNotificationEvent('positive', getFalloutEffectText('events.effectsCleared', { effects: clearedLabel }));
    }
  }

  const positiveEffectRaw = item?.positiveEffect;
  const positiveEffectIsObject = positiveEffectRaw !== null && typeof positiveEffectRaw === 'object';
  const positiveDuration = normalizeDuration(item?.positiveEffectDuration);

  if (positiveEffectIsObject && positiveEffectRaw?.maxHpModifier && positiveDuration.scenes > 0) {
    const mod = positiveEffectRaw.maxHpModifier;
    const value = Number(mod?.value) || 0;
    if (value !== 0) {
      const effectName = `maxHp:${mod.op}${value}`;
      nextEffects = applyOrStackFalloutEffect(nextEffects, buildFalloutTimedEffect({
        effectName,
        effectLabel: effectName,
        effectKind: 'positive',
        scenes: positiveDuration.scenes,
        sourceName: name,
        maxHpModifier: mod,
      }));
      addNotificationEvent('positive', getFalloutEffectText('events.positiveApplied', {
        name: effectName,
        scenes: positiveDuration.scenes,
      }));
    }
  }

  if (positiveEffectIsObject && positiveEffectRaw?.damageModifier && positiveDuration.scenes > 0) {
    const mod = positiveEffectRaw.damageModifier;
    const value = Number(mod?.value) || 0;
    if (value !== 0) {
      const effectName = `dmg:${mod.op}${value}`;
      nextEffects = applyOrStackFalloutEffect(nextEffects, buildFalloutTimedEffect({
        effectName,
        effectLabel: effectName,
        effectKind: 'positive',
        scenes: positiveDuration.scenes,
        sourceName: name,
        damageModifier: mod,
      }));
      addNotificationEvent('positive', getFalloutEffectText('events.positiveApplied', {
        name: effectName,
        scenes: positiveDuration.scenes,
      }));
    }
  }

  if (positiveEffectIsObject && positiveEffectRaw?.apModifier && positiveDuration.scenes > 0) {
    const mod = positiveEffectRaw.apModifier;
    const value = Number(mod?.value) || 0;
    if (value !== 0) {
      const effectName = `ap:${mod.op}${value}`;
      nextEffects = applyOrStackFalloutEffect(nextEffects, buildFalloutTimedEffect({
        effectName,
        effectLabel: effectName,
        effectKind: 'positive',
        scenes: positiveDuration.scenes,
        sourceName: name,
        apModifier: mod,
      }));
      addNotificationEvent('positive', getFalloutEffectText('events.positiveApplied', {
        name: effectName,
        scenes: positiveDuration.scenes,
      }));
    }
  }

  if (positiveEffectIsObject && positiveEffectRaw?.defenseModifier && positiveDuration.scenes > 0) {
    const mod = positiveEffectRaw.defenseModifier;
    const effectLabel = getDefenseModifierEffectLabel(mod);
    if (mod.value !== 0) {
      const effectName = `def:${mod.op}${mod.value}`;
      nextEffects = applyOrStackFalloutEffect(nextEffects, buildFalloutTimedEffect({
        effectName,
        effectLabel,
        effectKind: 'positive',
        scenes: positiveDuration.scenes,
        sourceName: name,
        defenseModifier: mod,
      }));
      addNotificationEvent('positive', getFalloutEffectText('events.positiveApplied', {
        name: effectLabel,
        scenes: positiveDuration.scenes,
      }));
    }
  }

  if (positiveEffectIsObject && positiveEffectRaw?.damageResistanceModifier && positiveDuration.scenes > 0) {
    const resistanceModifiers = positiveEffectRaw.damageResistanceModifier;
    for (const [type, mod] of Object.entries(resistanceModifiers)) {
      const value = Number(mod?.value) || 0;
      if (value !== 0) {
        const effectName = `dr:${type}:${mod.op}${value}`;
        nextEffects = applyOrStackFalloutEffect(nextEffects, buildFalloutTimedEffect({
          effectName,
          effectLabel: effectName,
          effectKind: 'positive',
          scenes: positiveDuration.scenes,
          sourceName: name,
          damageResistanceModifier: { type, op: mod.op, value },
        }));
        addNotificationEvent('positive', getFalloutEffectText('events.positiveApplied', {
          name: effectName,
          scenes: positiveDuration.scenes,
        }));
      }
    }
  }

  const positiveName = toStringSafe(item?.positiveEffectLabel || (!positiveEffectIsObject ? positiveEffectRaw : ''));
  const positiveLabel = toStringSafe(item?.positiveEffectLabel);
  const hasStructuredInstantPositiveResult = Boolean(
    positiveEffectRaw?.hpModifier
    || item?.hpHealed != null
    || item?.healAmount != null
    || item?.radiationModifier != null
    || (Array.isArray(positiveEffectRaw?.removeCondition)
      && positiveEffectRaw.removeCondition.length > 0)
  );

  if (positiveName && positiveDuration.type !== 'none') {
    if (positiveDuration.type === 'instant' && !hasStructuredInstantPositiveResult) {
      addNotificationEvent('positive', getFalloutEffectText('events.instantPositive', { name: positiveName }));
    } else if (positiveDuration.scenes > 0) {
      nextEffects = applyOrStackFalloutEffect(nextEffects, buildFalloutTimedEffect({
        effectName: positiveName,
        effectLabel: positiveLabel,
        effectKind: 'positive',
        scenes: positiveDuration.scenes,
        sourceName: name,
      }));
      addNotificationEvent('positive', getFalloutEffectText('events.positiveApplied', {
        name: positiveName,
        scenes: positiveDuration.scenes,
      }));
    }
  }

  const negativeName = toStringSafe(item?.negativeEffect);
  const negativeLabel = toStringSafe(item?.negativeEffectLabel);
  const negativeDuration = normalizeDuration(item?.negativeEffectDuration);

  if (negativeName && negativeDuration.type !== 'none') {
    if (negativeDuration.type === 'instant') {
      addNotificationEvent('negative', getFalloutEffectText('events.instantNegative', { name: negativeName }));
    } else if (negativeDuration.scenes > 0) {
      nextEffects = applyOrStackFalloutEffect(nextEffects, buildFalloutTimedEffect({
        effectName: negativeName,
        effectLabel: negativeLabel,
        effectKind: 'negative',
        scenes: negativeDuration.scenes,
        sourceName: name,
      }));
      addNotificationEvent('negative', getFalloutEffectText('events.negativeApplied', {
        name: negativeName,
        scenes: negativeDuration.scenes,
      }));
    }
  }

  return {
    effects: nextEffects,
    events,
    notificationEvents,
  };
};
