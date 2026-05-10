#!/usr/bin/env node
/**
 * One-time migration script: converts weapon_mods.json "Effects" strings
 * into structured statModifiers + qualityChanges fields.
 *
 * Run: node scripts/migrateWeaponMods.js
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Parser for the legacy Effects DSL
// ---------------------------------------------------------------------------

/**
 * "plus 2 CD Damage, minus 1 Fire Rate, gain Vicious, lose Inaccurate, Set 4 CD Damage, Ammo .38"
 * → structured object
 */
function parseEffects(effectsStr) {
  if (!effectsStr || !effectsStr.trim()) return {};

  const result = {};
  const qualityChanges = [];

  const tokens = effectsStr.split(',').map(s => s.trim()).filter(Boolean);

  for (const token of tokens) {
    // plus/minus N CD Damage
    const dmgDelta = token.match(/^(plus|minus)\s+(\d+)\s+CD\s+Damage$/i);
    if (dmgDelta) {
      result.damageModifier = { op: dmgDelta[1].toLowerCase() === 'plus' ? '+' : '-', value: Number(dmgDelta[2]) };
      continue;
    }

    // Set N CD Damage
    const dmgSet = token.match(/^Set\s+(\d+)\s+CD\s+Damage$/i);
    if (dmgSet) {
      result.damageModifier = { op: 'set', value: Number(dmgSet[1]) };
      continue;
    }

    // plus/minus N Fire Rate
    const fr = token.match(/^(plus|minus)\s+(\d+)\s+Fire\s+Rate$/i);
    if (fr) {
      result.fireRateModifier = { op: fr[1].toLowerCase() === 'plus' ? '+' : '-', value: Number(fr[2]) };
      continue;
    }

    // plus/minus N Range
    const range = token.match(/^(plus|minus)\s+(\d+)\s+Range$/i);
    if (range) {
      result.rangeModifier = { op: range[1].toLowerCase() === 'plus' ? '+' : '-', value: Number(range[2]) };
      continue;
    }

    // Ammo X
    const ammo = token.match(/^Ammo\s+(.+)$/i);
    if (ammo) {
      result.ammoOverride = ammo[1].trim();
      continue;
    }

    // gain QualityName [N]  (e.g. "gain Piercing 1", "gain Vicious", "gain Re-roll Hit Location")
    const gain = token.match(/^gain\s+(.+)$/i);
    if (gain) {
      const raw = gain[1].trim();
      // check for trailing number (e.g. "Piercing 1", "Crank 3")
      const withLevel = raw.match(/^(.+?)\s+(\d+)$/);
      if (withLevel) {
        qualityChanges.push({ op: 'gain', name: withLevel[1].trim(), value: Number(withLevel[2]) });
      } else {
        qualityChanges.push({ op: 'gain', name: raw });
      }
      continue;
    }

    // lose QualityName
    const lose = token.match(/^lose\s+(.+)$/i);
    if (lose) {
      qualityChanges.push({ op: 'lose', name: lose[1].trim() });
      continue;
    }

    // Damage Type override (e.g. "Damage Type Energy")
    const dmgType = token.match(/^[Dd]amage\s+[Tt]ype\s+(.+)$/);
    if (dmgType) {
      result.damageTypeOverride = dmgType[1].trim();
      continue;
    }

    // Unknown token — keep as-is in a "raw" array for manual review
    if (!result._unparsed) result._unparsed = [];
    result._unparsed.push(token);
  }

  if (qualityChanges.length) result.qualityChanges = qualityChanges;
  return result;
}

// ---------------------------------------------------------------------------
// Migrate both locale files
// ---------------------------------------------------------------------------

const locales = ['en-EN', 'ru-RU'];

for (const locale of locales) {
  const filePath = path.join(__dirname, '..', 'i18n', locale, 'weapon_mods.json');
  const mods = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let unparsedCount = 0;

  const migrated = mods.map(mod => {
    const structured = parseEffects(mod.Effects);

    if (structured._unparsed) {
      unparsedCount++;
      console.warn(`[${locale}] ${mod.id} (${mod.Name}): unparsed tokens: ${structured._unparsed.join(' | ')}`);
    }

    // Build new mod object: keep all existing fields, add structured ones, keep Effects for reference
    const next = { ...mod };

    if (structured.damageModifier)     next.damageModifier     = structured.damageModifier;
    if (structured.fireRateModifier)   next.fireRateModifier   = structured.fireRateModifier;
    if (structured.rangeModifier)      next.rangeModifier      = structured.rangeModifier;
    if (structured.ammoOverride)       next.ammoOverride       = structured.ammoOverride;
    if (structured.damageTypeOverride) next.damageTypeOverride = structured.damageTypeOverride;
    if (structured.qualityChanges)     next.qualityChanges     = structured.qualityChanges;
    if (structured._unparsed)          next._unparsed          = structured._unparsed;

    return next;
  });

  fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2), 'utf8');
  console.log(`[${locale}] Migrated ${mods.length} mods. Unparsed: ${unparsedCount}`);
}
