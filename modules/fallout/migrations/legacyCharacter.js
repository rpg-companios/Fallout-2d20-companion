// Fallout-owned historical save migrations. Their indexes correspond to
// reserved engine schema transitions; registering them composes the rule into
// that same transition without changing schemaVersion numbering.
import { getEquipmentCatalog } from 'engine:i18n/equipmentCatalog';
import { resolveKitItems } from '../kitResolver.js';
import { debugLog } from '../debug.js';

const SHADOW_START = Object.freeze({
  STR: 6,
  PER: 4,
  END: 6,
  CHA: 4,
  INT: 4,
  AGI: 4,
  LCK: 4,
});

/** v9 -> v10: reset Shadow SPECIAL values to the corrected starting values. */
export const migrateShadowAttributesV9V10 = (state) => {
  const next = { ...state };
  const traitId = typeof next.trait === 'string' ? next.trait : next.trait?.id;
  const originId = typeof next.origin === 'string' ? next.origin : next.origin?.id;
  const isShadow = traitId === 'shadow' || originId === 'shadow';
  if (!isShadow) return state;

  const attrs = next.attributes;
  if (!Array.isArray(attrs)) return state;
  next.attributes = attrs.map((attr) => {
    if (!attr || typeof attr !== 'object') return attr;
    const name = String(attr.name || '').toUpperCase();
    const start = SHADOW_START[name];
    if (start === undefined) return attr;
    return { ...attr, name, value: start };
  });
  return next;
};

/** v10 -> v11: repair attribute objects written by the first v9 -> v10 bug. */
export const repairShadowAttributeSaveV10V11 = (state) => {
  const next = { ...state };
  const attrs = next.attributes;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return state;

  const values = Object.values(attrs);
  const looksLikeAttributes = values.length > 0
    && values.every((value) => value && typeof value === 'object'
      && (value.name !== undefined || value.id !== undefined));
  if (!looksLikeAttributes) return state;

  next.attributes = values.map((value) => ({
    name: value.name || value.id || '',
    value: value.value ?? value.base ?? value.total ?? 0,
  }));

  const traitId = typeof next.trait === 'string' ? next.trait : next.trait?.id;
  const originId = typeof next.origin === 'string' ? next.origin : next.origin?.id;
  if (traitId !== 'shadow' && originId !== 'shadow') return next;

  next.attributes = next.attributes.map((attribute) => {
    if (!attribute || typeof attribute !== 'object') return attribute;
    const name = String(attribute.name || '').toUpperCase();
    const start = SHADOW_START[name];
    if (start === undefined) return attribute;
    return { ...attribute, name, value: start };
  });
  return next;
};

/** v11 -> v12: reopen Shadow's attribute/skill distribution. */
export const resetShadowCharacterBuildV11V12 = (state) => {
  const next = { ...state };
  const traitId = typeof next.trait === 'string' ? next.trait : next.trait?.id;
  const originId = typeof next.origin === 'string' ? next.origin : next.origin?.id;
  if (traitId !== 'shadow' && originId !== 'shadow') return state;

  const tagged = new Set([
    ...(Array.isArray(next.selectedSkills) ? next.selectedSkills : []),
    ...(Array.isArray(next.extraTaggedSkills) ? next.extraTaggedSkills : []),
  ]);

  let changed = false;
  if (next.attributesSaved !== false) { next.attributesSaved = false; changed = true; }
  if (next.skillsSaved !== false) { next.skillsSaved = false; changed = true; }
  if (Array.isArray(next.skills)) {
    next.skills = next.skills.map((skill) => {
      if (!skill || typeof skill !== 'object') return skill;
      const name = String(skill.name || '');
      const start = tagged.has(name) ? 2 : 0;
      if (Number(skill.value) === start) return skill;
      changed = true;
      return { ...skill, name, value: start };
    });
  }
  return changed ? next : state;
};

/** v12 -> v13: repair legacy Shadow trait modifiers and reset its build once. */
export const migrateShadowTraitFormatV12V13 = (state) => {
  const next = { ...state };
  const trait = next.trait;
  const traitId = typeof trait === 'string' ? trait : trait?.id;
  const originId = typeof next.origin === 'string' ? next.origin : next.origin?.id;
  if (traitId !== 'shadow' && originId !== 'shadow') return state;
  if (!trait || typeof trait !== 'object' || !trait.modifiers) return state;
  const modifiers = trait.modifiers;
  if (!modifiers.attributeLimits && !modifiers.attributeBonus) return state;

  const attributes = {
    STR: {
      baseBonus: modifiers.attributeBonus?.STR ?? 0,
      min: modifiers.attributeLimits?.STR?.min ?? 4,
      max: modifiers.attributeLimits?.STR?.max ?? 10,
    },
    END: {
      baseBonus: modifiers.attributeBonus?.END ?? 0,
      min: modifiers.attributeLimits?.END?.min ?? 4,
      max: modifiers.attributeLimits?.END?.max ?? 10,
    },
    CHA: { max: modifiers.attributeLimits?.CHA?.max ?? 10 },
    INT: { max: modifiers.attributeLimits?.INT?.max ?? 10 },
  };
  const newModifiers = { attributes };
  for (const key of [
    'skillMaxValue',
    'immunities',
    'effects',
    'armorConstraint',
    'skillPickSelected',
    'goodSoulSelectedSkills',
    'forcedSkills',
  ]) {
    if (modifiers[key] !== undefined) newModifiers[key] = modifiers[key];
  }
  next.trait = { ...trait, modifiers: newModifiers };

  if (Array.isArray(next.attributes)) {
    next.attributes = next.attributes.map((attribute) => (
      attribute && typeof attribute === 'object' && SHADOW_START[attribute.name] !== undefined
        ? { ...attribute, name: attribute.name, value: SHADOW_START[attribute.name] }
        : attribute
    ));
  }
  next.attributesSaved = false;
  next.skillsSaved = false;
  if (Array.isArray(next.skills)) {
    const tagged = new Set([
      ...(Array.isArray(next.selectedSkills) ? next.selectedSkills : []),
      ...(Array.isArray(next.extraTaggedSkills) ? next.extraTaggedSkills : []),
    ]);
    next.skills = next.skills.map((skill) => (
      skill && typeof skill === 'object' && skill.name
        ? { ...skill, name: skill.name, value: tagged.has(skill.name) ? 2 : 0 }
        : skill
    ));
  }
  return next;
};

/** v13 -> v14: turn Shadow's legacy default-caps kit into Nightkin. */
export const migrateShadowDefaultKitV13V14 = (state) => {
  const next = { ...state };
  const originId = typeof next.origin === 'string' ? next.origin : next.origin?.id;
  if (originId !== 'shadow') return state;
  const equipment = next.equipment;
  if (!equipment || typeof equipment !== 'object') return state;
  const kitId = equipment.id;
  if (kitId === 'nightkin') return state;
  if (kitId !== 'default_caps_only' && kitId != null) return state;

  next.equipment = {
    ...equipment,
    id: 'nightkin',
    name: 'Тень',
    items: [],
  };
  next.nightkinKitPending = true;
  return next;
};

export const FALLOUT_LEGACY_CHARACTER_MIGRATIONS = Object.freeze([
  Object.freeze({ index: 9, migration: migrateShadowAttributesV9V10 }),
  Object.freeze({ index: 10, migration: repairShadowAttributeSaveV10V11 }),
  Object.freeze({ index: 11, migration: resetShadowCharacterBuildV11V12 }),
  Object.freeze({ index: 12, migration: migrateShadowTraitFormatV12V13 }),
  Object.freeze({ index: 13, migration: migrateShadowDefaultKitV13V14 }),
]);

/** Complete the async kit grant staged by v13 -> v14 after store hydration. */
export const completeFalloutLegacyCharacterLoad = async ({ data, addNewItem, setEquipment }) => {
  if (!data?.nightkinKitPending || data.equipment?.id !== 'nightkin') return;
  try {
    const kit = getEquipmentCatalog()?.equipmentKits?.nightkin;
    if (!kit?.name || !Array.isArray(kit.items)) {
      throw new Error('[loadCharacter] Комплект nightkin отсутствует в локализованном каталоге');
    }
    const resolved = await resolveKitItems({ id: 'nightkin', items: kit.items });
    (resolved.items || []).forEach((item) => {
      addNewItem({ ...item, equipped: false, locked: false });
    });
    setEquipment({ id: 'nightkin', name: kit.name, items: resolved.items || [] });
    data.nightkinKitPending = false;
  } catch (error) {
    debugLog('character.load.nightkinKitGrantFailed', { message: error?.message });
  }
};
