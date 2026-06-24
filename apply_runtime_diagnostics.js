#!/usr/bin/env node
// Adds temporary runtime diagnostics. Run from project root:
//   node apply_runtime_diagnostics.js
// Then publish/run, reproduce, and in browser console run:
//   copy(JSON.stringify(window.__FALLOUT_DEBUG_LOGS, null, 2))
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MARKER = 'fallout-runtime-debug-2026-06-23-01';

function file(rel) { return path.join(ROOT, rel); }
function read(rel) {
  const p = file(rel);
  if (!fs.existsSync(p)) throw new Error(`Not found: ${rel}`);
  return fs.readFileSync(p, 'utf8');
}
function write(rel, text) {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.writeFileSync(file(rel), text, 'utf8');
  console.log(`updated: ${rel}`);
}
function replaceOnce(text, oldText, newText, rel) {
  if (!text.includes(oldText)) throw new Error(`Cannot patch ${rel}: missing block:\n${oldText.slice(0, 300)}`);
  return text.replace(oldText, newText);
}
function ensureImport(text, importLine, afterImportPrefix = null) {
  if (text.includes(importLine)) return text;
  if (afterImportPrefix) {
    const idx = text.indexOf(afterImportPrefix);
    if (idx >= 0) {
      const lineEnd = text.indexOf('\n', idx);
      return text.slice(0, lineEnd + 1) + importLine + '\n' + text.slice(lineEnd + 1);
    }
  }
  const lastImportEnd = [...text.matchAll(/^import .*;$/gm)].map(m => m.index + m[0].length).pop();
  if (lastImportEnd == null) return importLine + '\n' + text;
  return text.slice(0, lastImportEnd) + '\n' + importLine + text.slice(lastImportEnd);
}

// Debug helper
write('src/debug/falloutDebug.js', `// Temporary runtime diagnostics. Remove before final release.\nexport const FALLOUT_DEBUG_MARKER = '${MARKER}';\n\nconst safeClone = (value, depth = 0) => {\n  if (depth > 5) return '[depth-limit]';\n  if (value === null || value === undefined) return value;\n  const t = typeof value;\n  if (t === 'string' || t === 'number' || t === 'boolean') return value;\n  if (t === 'function') return '[function]';\n  if (Array.isArray(value)) return value.slice(0, 50).map((v) => safeClone(v, depth + 1));\n  if (t === 'object') {\n    const out = {};\n    Object.keys(value).slice(0, 80).forEach((key) => {\n      try { out[key] = safeClone(value[key], depth + 1); } catch (_) { out[key] = '[unreadable]'; }\n    });\n    return out;\n  }\n  return String(value);\n};\n\nexport function debugLog(event, data = {}) {\n  try {\n    const g = typeof globalThis !== 'undefined' ? globalThis : {};\n    const entry = {\n      ts: new Date().toISOString(),\n      marker: FALLOUT_DEBUG_MARKER,\n      event,\n      data: safeClone(data),\n    };\n    g.__FALLOUT_DEBUG_LOGS = g.__FALLOUT_DEBUG_LOGS || [];\n    g.__FALLOUT_DEBUG_LOGS.push(entry);\n    if (g.__FALLOUT_DEBUG_LOGS.length > 1000) g.__FALLOUT_DEBUG_LOGS.shift();\n    if (g.console?.log) g.console.log('[FALLOUT_DEBUG]', event, entry.data);\n  } catch (_) {}\n}\n\nif (typeof globalThis !== 'undefined') {\n  globalThis.__FALLOUT_DEBUG_MARKER = FALLOUT_DEBUG_MARKER;\n}\n`);

// i18n/locale.js
{
  const rel = 'i18n/locale.js';
  let s = read(rel);
  s = ensureImport(s, "import { debugLog, FALLOUT_DEBUG_MARKER } from '../src/debug/falloutDebug';", "import { useEffect, useState } from 'react';");
  if (!s.includes("debugLog('locale.setCurrentLocale'")) {
    s = replaceOnce(s,
`export const setCurrentLocale = (nextLocale) => {
  currentLocale = normalizeLocale(nextLocale);
  emitLocaleChange();
  return currentLocale;
};`,
`export const setCurrentLocale = (nextLocale) => {
  const previousLocale = currentLocale;
  currentLocale = normalizeLocale(nextLocale);
  debugLog('locale.setCurrentLocale', { marker: FALLOUT_DEBUG_MARKER, previousLocale, nextLocale, normalizedLocale: currentLocale });
  emitLocaleChange();
  return currentLocale;
};`, rel);
  }
  write(rel, s);
}

// CharacterScreen.js
{
  const rel = 'components/screens/CharacterScreen/CharacterScreen.js';
  let s = read(rel);
  s = s.replace('import { getCurrentLocale } from "../../../i18n/locale";', 'import { useLocale } from "../../../i18n/locale";');
  s = ensureImport(s, 'import { debugLog, FALLOUT_DEBUG_MARKER } from "../../../src/debug/falloutDebug";');

  if (!s.includes('const debugLocale = useLocale();')) {
    s = replaceOnce(s,
`  const storeAttributes = useCharacterStore((state) => state.attributes);
  const storeSkills = useCharacterStore((state) => state.skills);
  const storeEffects = useCharacterStore((state) => state.effects);`,
`  const debugLocale = useLocale();
  const storeAttributes = useCharacterStore((state) => state.attributes);
  const storeSkills = useCharacterStore((state) => state.skills);
  const storeEffects = useCharacterStore((state) => state.effects);`, rel);
  }

  if (!s.includes("debugLog('character.renderState'")) {
    s = replaceOnce(s,
`  const skills = useMemo(() => {
    if (Object.keys(storeSkills).length > 0) {
      return ALL_SKILLS.map((skill) => {
        const stored = storeSkills[skill.name];
        return stored ? { name: skill.name, value: stored.base } : { ...skill };
      });
    }
    return contextSkills;
  }, [storeSkills, contextSkills]);`,
`  const skills = useMemo(() => {
    if (Object.keys(storeSkills).length > 0) {
      return ALL_SKILLS.map((skill) => {
        const stored = storeSkills[skill.name];
        return stored ? { name: skill.name, value: stored.base } : { ...skill };
      });
    }
    return contextSkills;
  }, [storeSkills, contextSkills]);

  useEffect(() => {
    debugLog('character.renderState', {
      marker: FALLOUT_DEBUG_MARKER,
      locale: debugLocale,
      originId: origin?.id,
      originName: origin?.name,
      traitId: trait?.id,
      traitIds: trait?.ids,
      traitName: trait?.name,
      equipmentId: equipment?.id,
      equipmentName: equipment?.name,
      attributesSaved,
      skillsSaved,
      selectedSkills,
      extraTaggedSkills,
      storeSkillsCount: Object.keys(storeSkills || {}).length,
      skillsPreview: skills.slice(0, 8),
    });
  }, [debugLocale, origin?.id, origin?.name, trait?.id, trait?.name, equipment?.id, equipment?.name, attributesSaved, skillsSaved, selectedSkills, extraTaggedSkills, storeSkills, skills]);`, rel);
  }

  if (!s.includes("debugLog('skill.toggle.start'")) {
    s = replaceOnce(s,
`    const currentSkill = skills[skillIndex];`,
`    const currentSkill = skills[skillIndex];
    debugLog('skill.toggle.start', {
      skillName,
      before: currentSkill?.value,
      canDistributeSkills,
      attributesSaved,
      skillsSaved,
      selectedSkills,
      extraTaggedSkills,
      forcedSelectedSkills,
      storeSkill: useCharacterStore.getState().skills?.[skillName],
    });`, rel);
  }

  if (!s.includes("debugLog('skill.toggle.apply'")) {
    s = replaceOnce(s,
`      const appliedDelta = nextValue - currentSkill.value;
      setSkills((prev) =>`,
`      const appliedDelta = nextValue - currentSkill.value;
      debugLog('skill.toggle.apply', { skillName, before: currentSkill.value, nextValue, appliedDelta, capForThis, skillMax });
      setSkills((prev) =>`, rel);
  }
  if (!s.includes("debugLog('skill.toggle.remove'")) {
    s = replaceOnce(s,
`      const appliedDelta = nextValue - currentSkill.value;
      setSkills((prev) =>
        prev.map((s, i) => (i === skillIndex ? { ...s, value: nextValue } : s)),
      );
      if (appliedDelta !== 0) syncSkillStore(appliedDelta);
    }
  };`,
`      const appliedDelta = nextValue - currentSkill.value;
      debugLog('skill.toggle.remove', { skillName, before: currentSkill.value, nextValue, appliedDelta });
      setSkills((prev) =>
        prev.map((s, i) => (i === skillIndex ? { ...s, value: nextValue } : s)),
      );
      if (appliedDelta !== 0) syncSkillStore(appliedDelta);
    }
  };`, rel);
  }

  if (!s.includes("debugLog('skill.changeValue.apply'")) {
    s = replaceOnce(s,
`    const appliedDelta = nextVal - skill.value;
    setSkills((prev) => {`,
`    const appliedDelta = nextVal - skill.value;
    debugLog('skill.changeValue.apply', { skillName: skill.name, before: skill.value, nextVal, requestedDelta: delta, appliedDelta, capForThis });
    setSkills((prev) => {`, rel);
  }
  write(rel, s);
}

// WeaponModificationModal.js
{
  const rel = 'components/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal.js';
  let s = read(rel);
  s = ensureImport(s, "import { debugLog } from '../../../../src/debug/falloutDebug';");
  if (!s.includes("debugLog('weapon.mod.compute'")) {
    s = replaceOnce(s,
`  const qualitiesValue = qualities.size
    ? JSON.stringify(Array.from(qualities).map(id => ({ qualityId: id })))
    : '–';

  return {`,
`  const qualitiesValue = qualities.size
    ? JSON.stringify(Array.from(qualities).map(id => ({ qualityId: id })))
    : '–';

  debugLog('weapon.mod.compute', {
    weaponId: baseWeapon?.id ?? baseWeapon?.weaponId,
    baseName,
    selectedMods: selectedMods.map((m) => ({ id: m.id, slot: m.slot, rawSlot: m.rawSlot, damageModifier: m.damageModifier, fireRateModifier: m.fireRateModifier, rangeModifier: m.rangeModifier, qualityChanges: m.qualityChanges })),
    baseDamage: damageBase,
    resultDamage: damage,
    baseFireRate: fireRateBase,
    resultFireRate: fire_rate,
    baseWeight: weightBase,
    resultWeight: weight,
    baseCost: costBase,
    resultCost: cost,
    rangeShift,
    resultRange: range_name,
  });

  return {`, rel);
  }
  if (!s.includes("debugLog('weapon.mod.row'")) {
    s = replaceOnce(s,
`            const normalizedMods = (mods || []).map(normalizeModRow).filter(Boolean);
            if (!bySlot[normalizedSlot]) bySlot[normalizedSlot] = [];`,
`            const normalizedMods = (mods || []).map(normalizeModRow).filter(Boolean);
            normalizedMods.forEach((m) => debugLog('weapon.mod.row', { weaponId: resolvedWeaponId, slot, normalizedSlot, id: m.id, name: m.name, damageModifier: m.damageModifier, fireRateModifier: m.fireRateModifier, rangeModifier: m.rangeModifier, qualityChanges: m.qualityChanges, effectDescription: m.effectDescription }));
            if (!bySlot[normalizedSlot]) bySlot[normalizedSlot] = [];`, rel);
  }
  if (!s.includes("debugLog('weapon.mod.apply.modal'")) {
    s = replaceOnce(s,
`    const modificationsArray = Object.values(selectedModifications);
    if (modificationsArray.length > 0) {
      onApplyModification(modifiedWeapon);`,
`    const modificationsArray = Object.values(selectedModifications);
    debugLog('weapon.mod.apply.modal', { modificationsArray: modificationsArray.map((m) => ({ id: m.id, slot: m.slot, damageModifier: m.damageModifier, fireRateModifier: m.fireRateModifier })), modifiedWeapon });
    if (modificationsArray.length > 0) {
      onApplyModification(modifiedWeapon);`, rel);
  }
  write(rel, s);
}

// WeaponsAndArmorScreen.js
{
  const rel = 'components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js';
  let s = read(rel);
  s = ensureImport(s, "import { debugLog } from '../../../src/debug/falloutDebug';");
  if (!s.includes("debugLog('weapon.mod.apply.screen.start'")) {
    s = replaceOnce(s,
`  const handleApplyModification = useCallback((modifiedWeapon) => {
    handleCloseModificationModal();
    const itemId = resolveStoreItemId(selectedWeaponForModification);

    if (itemId) {
      updateItem(itemId, weaponModPatchToStore(modifiedWeapon));
      return;
    }`,
`  const handleApplyModification = useCallback((modifiedWeapon) => {
    handleCloseModificationModal();
    const itemId = resolveStoreItemId(selectedWeaponForModification);
    debugLog('weapon.mod.apply.screen.start', { itemId, selectedWeaponForModification, modifiedWeapon });

    if (itemId) {
      const patch = weaponModPatchToStore(modifiedWeapon);
      debugLog('weapon.mod.apply.screen.patch', { itemId, patch });
      updateItem(itemId, patch);
      return;
    }`, rel);
  }
  if (!s.includes("debugLog('weapon.display.list'")) {
    s = replaceOnce(s,
`  const localizedEquippedWeapons = equippedWeaponsForDisplay.map(
    (weapon) => findLocalizedWeapon(equipmentCatalog, weapon),
  );`,
`  const localizedEquippedWeapons = equippedWeaponsForDisplay.map(
    (weapon) => findLocalizedWeapon(equipmentCatalog, weapon),
  );
  useEffect(() => {
    debugLog('weapon.display.list', {
      locale,
      equippedWeaponsForDisplay: equippedWeaponsForDisplay.map((w) => ({ id: w.id, weaponId: w.weaponId, name: w.name, damage: w.damage, fire_rate: w.fire_rate, fireRate: w.fireRate, baseWeaponName: w.baseWeaponName, appliedMods: w.appliedMods })),
      localizedEquippedWeapons: localizedEquippedWeapons.map((w) => ({ id: w.id, weaponId: w.weaponId, name: w.name, damage: w.damage, fire_rate: w.fire_rate, fireRate: w.fireRate, baseWeaponName: w.baseWeaponName, appliedMods: w.appliedMods })),
    });
  }, [locale, equippedWeaponsForDisplay, localizedEquippedWeapons]);`, rel);
  }
  write(rel, s);
}

// characterStore.js
{
  const rel = 'src/store/characterStore.js';
  let s = read(rel);
  s = ensureImport(s, "import { debugLog } from '../debug/falloutDebug.js';");
  if (!s.includes("debugLog('store.updateItem.before'")) {
    s = replaceOnce(s,
`        // Merge the patch with existing item data
        const updatedItem = { ...items[itemId], ...patch };
        
        // Normalize item parameters (recalculate totals)
        const normalizedItem = normalizeItemParameters(updatedItem);`,
`        debugLog('store.updateItem.before', { itemId, oldItem: items[itemId], patch });
        // Merge the patch with existing item data
        const updatedItem = { ...items[itemId], ...patch };
        
        // Normalize item parameters (recalculate totals)
        const normalizedItem = normalizeItemParameters(updatedItem);
        debugLog('store.updateItem.after', { itemId, updatedItem, normalizedItem });`, rel);
  }
  write(rel, s);
}

console.log(`\nDiagnostics installed. Marker: ${MARKER}`);
console.log('Now run/publish, reproduce, then in browser DevTools Console run:');
console.log('copy(JSON.stringify(window.__FALLOUT_DEBUG_LOGS, null, 2))');
