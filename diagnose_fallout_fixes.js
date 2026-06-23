#!/usr/bin/env node
// Run from Fallout-2d20-companion project root:
//   node diagnose_fallout_fixes.js
const fs = require('fs');
const path = require('path');

function read(rel) {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function check(name, ok, details = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${details ? ` — ${details}` : ''}`);
  return ok;
}

let okAll = true;

const character = read('components/screens/CharacterScreen/CharacterScreen.js');
const catalog = read('db/catalogSource.js');
const ammoTypes = read('i18n/en-EN/data/equipment/ammo/ammo_types.json');
const ammoData = read('i18n/en-EN/data/equipment/ammo/ammoData.json');

if (!character) {
  check('CharacterScreen.js exists', false);
  okAll = false;
} else {
  okAll &= check('CharacterScreen has handleChangeSkillValue', character.includes('const handleChangeSkillValue = (index, delta) => {'));
  okAll &= check('CharacterScreen tag applies +2', character.includes('currentSkill.value + 2'));
  okAll &= check('CharacterScreen syncs skill store', character.includes('updateSkill(skillName, delta)') || character.includes('updateSkill(skill.name, appliedDelta)'));
  okAll &= check('CharacterScreen no broken skill.value/delta fragment in handleToggleSkill', !character.includes('canChangeSkillValue(skill.value, delta'));
}

if (!catalog) {
  check('db/catalogSource.js exists', false);
  okAll = false;
} else {
  okAll &= check('catalogSource preserves damageModifier', catalog.includes('damageModifier: m.damageModifier || null'));
  okAll &= check('catalogSource preserves fireRateModifier', catalog.includes('fireRateModifier: m.fireRateModifier || null'));
  okAll &= check('catalogSource preserves rangeModifier', catalog.includes('rangeModifier: m.rangeModifier || null'));
  okAll &= check('catalogSource preserves qualityChanges', catalog.includes('qualityChanges: Array.isArray(m.qualityChanges)'));
}

if (!ammoTypes) {
  check('English ammo_types exists', false);
  okAll = false;
} else {
  okAll &= check('English ammo_types has 10mm Round', ammoTypes.includes('10mm Round'));
  okAll &= check('English ammo_types has no Russian Патрон', !ammoTypes.includes('Патрон'));
}

if (!ammoData) {
  check('English ammoData exists', false);
  okAll = false;
} else {
  okAll &= check('English ammoData has Shotgun Shell', ammoData.includes('Shotgun Shell'));
  okAll &= check('English ammoData has no Russian патрон words', !/Патрон|патрон|Сигнальная|Ядерн|Топливо огнемета/.test(ammoData));
}

console.log('\nSummary:', okAll ? 'file signatures look patched' : 'some fixes are NOT present in files');
if (!okAll) process.exit(1);
