#!/usr/bin/env node
// scripts/migrateModEffects.js
// Converts flat Effects strings in weapon_mods.json into structured mod operations.
// Run: node scripts/migrateModEffects.js

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Parser: Effects string -> structured operations
// ---------------------------------------------------------------------------

function parseEffects(effectsStr) {
  if (!effectsStr || !effectsStr.trim()) return {};

  const result = {};
  const qualityChanges = [];

  // Normalise casing inconsistencies in the source data
  const tokens = effectsStr.split(',').map(s => s.trim()).filter(Boolean);

  for (const token of tokens) {
    const t = token.trim();
    const lower = t.toLowerCase();

    // plus/minus N CD Damage
    const dmgPlus = lower.match(/^plus\s+(\d+)\s+cd\s+damage$/);
    const dmgMinus = lower.match(/^minus\s+(\d+)\s+cd\s+damage$/);
    const dmgSet = lower.match(/^set\s+(\d+)\s+cd\s+damage$/);
    if (dmgPlus) { result.damageModifier = { op: '+', value: Number(dmgPlus[1]) }; continue; }
    if (dmgMinus) { result.damageModifier = { op: '-', value: Number(dmgMinus[1]) }; continue; }
    if (dmgSet) { result.damageModifier = { op: 'set', value: Number(dmgSet[1]) }; continue; }

    // plus/minus N Fire Rate
    const frPlus = lower.match(/^plus\s+(\d+)\s+fire\s+rate$/);
    const frMinus = lower.match(/^minus\s+(\d+)\s+fire\s+rate$/);
    if (frPlus) { result.fireRateModifier = { op: '+', value: Number(frPlus[1]) }; continue; }
    if (frMinus) { result.fireRateModifier = { op: '-', value: Number(frMinus[1]) }; continue; }

    // plus/minus N Range
    const rngPlus = lower.match(/^plus\s+(\d+)\s+range$/);
    const rngMinus = lower.match(/^minus\s+(\d+)\s+range$/);
    if (rngPlus) { result.rangeModifier = { op: '+', value: Number(rngPlus[1]) }; continue; }
    if (rngMinus) { result.rangeModifier = { op: '-', value: Number(rngMinus[1]) }; continue; }

    // Ammo override — "Ammo .308", "Ammo fusion cell", etc.
    const ammo = t.match(/^[Aa]mmo\s+(.+)$/);
    if (ammo) { result.ammoOverride = ammo[1].trim(); continue; }

    // Ammo changes to X
    const ammoChanges = t.match(/^[Aa]mmo\s+changes\s+to\s+(.+)$/i);
    if (ammoChanges) { result.ammoOverride = ammoChanges[1].trim(); continue; }

    // Damage Type override (case-insensitive)
    const dmgType = t.match(/^damage\s+type\s+(.+)$/i);
    if (dmgType) { result.damageTypeOverride = dmgType[1].trim(); continue; }

    // gain QualityName [N]  — e.g. "gain Piercing 1", "gain Vicious", "gain Crank 3"
    const gain = t.match(/^[Gg]ain\s+(.+)$/);
    if (gain) {
      const raw = gain[1].trim();
      // Check if last token is a number (level), e.g. "Piercing 1", "Crank 3"
      const withLevel = raw.match(/^(.+?)\s+(\d+)$/);
      if (withLevel) {
        qualityChanges.push({ op: 'gain', name: withLevel[1].trim(), value: Number(withLevel[2]) });
      } else {
        qualityChanges.push({ op: 'gain', name: raw });
      }
      continue;
    }

    // lose QualityName
    const lose = t.match(/^[Ll]ose\s+(.+)$/);
    if (lose) {
      qualityChanges.push({ op: 'lose', name: lose[1].trim() });
      continue;
    }

    // Unrecognised — keep as-is in a fallback array so nothing is silently dropped
    if (!result._unparsed) result._unparsed = [];
    result._unparsed.push(t);
  }

  if (qualityChanges.length > 0) result.qualityChanges = qualityChanges;
  return result;
}

// ---------------------------------------------------------------------------
// Migrate a single mod array file (weapon_mods.json format)
// ---------------------------------------------------------------------------

function migrateModArray(mods) {
  return mods.map(mod => {
    if (!mod.Effects) return mod;
    const structured = parseEffects(mod.Effects);
    // Keep original Effects string for reference during transition, rename to effectsLegacy
    const { Effects, ...rest } = mod;
    return { ...rest, effectsLegacy: Effects, ...structured };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const FILES = [
  'i18n/en-EN/weapon_mods.json',
  'i18n/ru-RU/weapon_mods.json',
];

for (const relPath of FILES) {
  const absPath = path.resolve(__dirname, '..', relPath);
  const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const migrated = migrateModArray(raw);

  // Report any unparsed tokens
  migrated.forEach(m => {
    if (m._unparsed) console.warn(`[WARN] ${relPath} mod "${m.id}" has unparsed tokens:`, m._unparsed);
  });

  fs.writeFileSync(absPath, JSON.stringify(migrated, null, 2), 'utf8');
  console.log(`[OK] ${relPath} — ${migrated.length} mods migrated`);
}
