#!/usr/bin/env node
// Run from the Fallout-2d20-companion project root:
//   node apply_fallout_fixes.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readText(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) fail(`not found: ${relPath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function writeText(relPath, content) {
  const fullPath = path.join(ROOT, relPath);
  const old = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;
  if (old !== content) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`updated: ${relPath}`);
  } else {
    console.log(`unchanged: ${relPath}`);
  }
}

// 1) CharacterScreen: replace the whole broken skill toggle/change block by stable markers.
const characterRel = 'components/screens/CharacterScreen/CharacterScreen.js';
let character = readText(characterRel);
const startMarker = '  const handleToggleSkill = (skillName) => {';
const endMarker = '  const handleChangeAttribute = (index, delta) => {';
const start = character.indexOf(startMarker);
const end = character.indexOf(endMarker, start >= 0 ? start : 0);
if (start < 0 || end < 0) {
  fail('Cannot find handleToggleSkill -> handleChangeAttribute block in CharacterScreen.js');
}

const newSkillBlock = String.raw`  const handleToggleSkill = (skillName) => {
    if (!canDistributeSkills) {
      showAlert(tCharacterScreen("alerts.warningTitle", "Warning"), tCharacterScreen("errors.saveAttributesFirst", "Distribute and save attributes first."));
      return;
    }

    const skillIndex = skills.findIndex((s) => s.name === skillName);
    if (skillIndex < 0) return;
    const currentSkill = skills[skillIndex];

    const isInMainSkills = selectedSkills.includes(skillName);
    const isInExtraSkills = extraTaggedSkills.includes(skillName);
    const isForcedSkill = forcedSelectedSkills.includes(skillName);
    const isCurrentlySelected = isInMainSkills || isInExtraSkills;

    if (isForcedSkill && isCurrentlySelected) {
      showError(tCharacterScreen("errors.cannotUnselectForcedSkill", "You cannot unselect a forced skill."));
      return;
    }

    let skillMax = trait?.modifiers?.skillMaxValue ?? 6;
    if (level === 1) {
      skillMax = Math.min(skillMax, 3);
    }

    const skillPickGroup = trait?.modifiers?.skillPickChoice?.from || [];
    const skillPickSelected = trait?.modifiers?.skillPickSelected || [];
    const isSkillPickActive = skillPickGroup.length > 0 && skillPickSelected.length > 0;
    const isInSkillPickGroup = skillPickGroup.includes(skillName);
    const isBonusFromSkillPick = isSkillPickActive && skillPickSelected.includes(skillName);
    const capForThis = isSkillPickActive && isInSkillPickGroup && !isBonusFromSkillPick ? 4 : undefined;

    const syncSkillStore = (delta) => {
      const store = useCharacterStore.getState();
      if (!store.skills?.[skillName]) {
        store.loadFromLegacyData({ skills });
      }
      useCharacterStore.getState().updateSkill(skillName, delta);
    };

    if (!isCurrentlySelected) {
      const unclampedNextValue = currentSkill.value + 2;
      if (unclampedNextValue > skillMax) {
        showError(
          tCharacterScreen("errors.skillTagExceedsMaxRank", "Tagging this skill will exceed max rank ({skillMax}). Lower it first.").replace("{skillMax}", String(skillMax)),
        );
        return;
      }
      const nextValue = Math.min(unclampedNextValue, capForThis ?? skillMax);

      if (isBonusFromSkillPick) {
        return;
      }

      if (isForcedSkill) {
        setExtraTaggedSkills((prev) => [...prev, skillName]);
      } else if (selectedSkills.length < BASE_TAGGED_SKILLS) {
        setSelectedSkills((prev) => [...prev, skillName]);
      } else {
        const extraSkillsFromTrait = trait?.extraSkills || trait?.modifiers?.extraSkills || 0;
        const traitForcedSkills = trait?.forcedSkills || trait?.modifiers?.forcedSkills || [];
        const canSelectAsExtra =
          extraSkillsFromTrait > 0 &&
          (traitForcedSkills.length === 0 || traitForcedSkills.includes(skillName));

        if (canSelectAsExtra && extraTaggedSkills.length < extraSkillsFromTrait) {
          setExtraTaggedSkills((prev) => [...prev, skillName]);
        } else {
          const extraText = canSelectAsExtra
            ? "\n\n" + tCharacterScreen("labels.extraSlotsAvailable", "Extra slots available") + ": " + (extraSkillsFromTrait - extraTaggedSkills.length)
            : "";
          showError(
            tCharacterScreen("errors.maxBaseSkills", "You can choose a maximum of {count} base skills.{extraText}").replace("{count}", String(BASE_TAGGED_SKILLS)).replace("{extraText}", extraText),
          );
          return;
        }
      }

      const appliedDelta = nextValue - currentSkill.value;
      setSkills((prev) =>
        prev.map((s, i) => (i === skillIndex ? { ...s, value: nextValue } : s)),
      );
      if (appliedDelta !== 0) syncSkillStore(appliedDelta);
    } else {
      if (isInMainSkills) {
        setSelectedSkills((prev) => prev.filter((s) => s !== skillName));
      }
      if (isInExtraSkills) {
        setExtraTaggedSkills((prev) => prev.filter((s) => s !== skillName));
      }

      const nextValue = Math.max(0, currentSkill.value - 2);
      const appliedDelta = nextValue - currentSkill.value;
      setSkills((prev) =>
        prev.map((s, i) => (i === skillIndex ? { ...s, value: nextValue } : s)),
      );
      if (appliedDelta !== 0) syncSkillStore(appliedDelta);
    }
  };

  const handleChangeSkillValue = (index, delta) => {
    if (!attributesSaved) {
      showAlert(tCharacterScreen("errors.saveAttributesFirstSimple", "Save attributes first."));
      return;
    }

    if (delta > 0 && skillPointsLeft <= 0) {
      showError(tCharacterScreen("errors.noSkillPointsLeft", "You have no skill points left to distribute."));
      return;
    }

    const skill = skills[index];
    if (!skill) return;
    const isTagged = selectedSkills.includes(skill.name) || extraTaggedSkills.includes(skill.name);

    const skillPickGroup = trait?.modifiers?.skillPickChoice?.from || [];
    const skillPickSelected = trait?.modifiers?.skillPickSelected || [];
    const isSkillPickActive = skillPickGroup.length > 0 && skillPickSelected.length > 0;
    const isInGroup = skillPickGroup.includes(skill.name);
    const isBonus = isSkillPickActive && skillPickSelected.includes(skill.name);
    const capForThis = isSkillPickActive && isInGroup && !isBonus ? 4 : undefined;

    if (!canChangeSkillValue(skill.value, delta, trait, level, isTagged)) return;

    let nextVal = skill.value + delta;
    if (capForThis !== undefined) {
      nextVal = Math.min(nextVal, capForThis);
    }
    if (nextVal === skill.value) return;

    const appliedDelta = nextVal - skill.value;
    setSkills((prev) => {
      const newSkills = [...prev];
      newSkills[index] = { ...skill, value: nextVal };
      return newSkills;
    });

    const store = useCharacterStore.getState();
    if (!store.skills?.[skill.name]) {
      store.loadFromLegacyData({ skills });
    }
    useCharacterStore.getState().updateSkill(skill.name, appliedDelta);
  };

`;

writeText(characterRel, character.slice(0, start) + newSkillBlock + character.slice(end));

// 2) catalogSource: preserve structured weapon mod fields.
const catalogRel = 'db/catalogSource.js';
let catalog = readText(catalogRel);
if (!catalog.includes('damageModifier: m.damageModifier || null')) {
  const oldBlock = `    cost: safeNum(m.cost),
    effects: safeStr(m.effects),
    effect_description: safeStr(m.effectDescription),
    weight: safeStr(m.weight),
    applies_to_ids: appliesToIds.length ? JSON.stringify(appliesToIds) : null,
`;
  const newBlock = `    cost: safeNum(m.cost),
    effects: safeStr(m.effects),
    effectsLegacy: safeStr(m.effectsLegacy),
    effect_description: safeStr(m.effectDescription),
    effectDescription: safeStr(m.effectDescription),
    weight: safeStr(m.weight),
    damageModifier: m.damageModifier || null,
    fireRateModifier: m.fireRateModifier || null,
    rangeModifier: m.rangeModifier || null,
    qualityChanges: Array.isArray(m.qualityChanges) ? m.qualityChanges : null,
    damageType: safeStr(m.damageType),
    ammoOverride: safeStr(m.ammoOverride),
    ammoPerShotDelta: m.ammoPerShotDelta ?? null,
    applies_to_ids: appliesToIds.length ? JSON.stringify(appliesToIds) : null,
`;
  if (!catalog.includes(oldBlock)) fail('Cannot patch buildWeaponModRow in db/catalogSource.js');
  catalog = catalog.replace(oldBlock, newBlock);
  writeText(catalogRel, catalog);
} else {
  console.log(`unchanged: ${catalogRel} (structured mod fields already present)`);
}

// 3) English ammo names.
const ammoTypes = [
  { id: 'ammo_357_magnum', name: '.357 Magnum Round' },
  { id: 'ammo_12_7mm', name: '12.7mm Round' },
  { id: 'ammo_9mm', name: '9mm Round' },
  { id: 'ammo_50_ball', name: '.50 Ball' },
  { id: 'ammo_25mm_grenade', name: '25mm Grenade' },
  { id: 'ammo_40mm_grenade', name: '40mm Grenade' },
  { id: 'ammo_alien_power_cell', name: 'Alien Power Cell' },
  { id: 'ammo_alien_power_module', name: 'Alien Power Module' },
  { id: 'ammo_arrow', name: 'Arrow' },
  { id: 'ammo_bolt', name: 'Bolt' },
  { id: 'ammo_plasma_cartridge_alien', name: 'Alien Plasma Cartridge' },
  { id: 'ammo_38', name: '.38 Round' },
  { id: 'ammo_10mm', name: '10mm Round' },
  { id: 'ammo_308', name: '.308 Round' },
  { id: 'ammo_flare', name: 'Flare' },
  { id: 'ammo_shotgun_shell', name: 'Shotgun Shell' },
  { id: 'ammo_45', name: '.45 Round' },
  { id: 'ammo_flamer_fuel', name: 'Flamer Fuel' },
  { id: 'ammo_energy_cell', name: 'Energy Cell' },
  { id: 'ammo_gamma_round', name: 'Gamma Round' },
  { id: 'ammo_railway_spike', name: 'Railway Spike' },
  { id: 'ammo_syringe', name: 'Syringe' },
  { id: 'ammo_44_magnum', name: '.44 Magnum Round' },
  { id: 'ammo_50_cal', name: '.50 Round' },
  { id: 'ammo_5_56mm', name: '5.56mm Round' },
  { id: 'ammo_5mm', name: '5mm Round' },
  { id: 'ammo_fusion_core', name: 'Fusion Core' },
  { id: 'ammo_missile', name: 'Missile' },
  { id: 'ammo_plasma_cartridge', name: 'Plasma Cartridge' },
  { id: 'ammo_2mm_ec', name: '2mm EC Round' },
  { id: 'ammo_mini_nuke', name: 'Mini Nuke' },
  { id: 'ammo_anything', name: 'Anything' },
  { id: 'ammo_acid_concentrate', name: 'Acid Concentrate' },
  { id: 'ammo_cannonball', name: 'Cannonball' },
  { id: 'ammo_cryo_cell', name: 'Cryo Cell' },
  { id: 'ammo_harpoon', name: 'Harpoon' },
  { id: 'ammo_syringe_bloodpack', name: 'Bloodpack Syringe' },
  { id: 'ammo_gas_grenade', name: 'Gas Grenade' },
];

const ammoData = [
  { name: '.38', find_formula: '10+5fn{CD}', weight: 0.015, price: 1, rarity: 0, itemType: 'ammo' },
  { name: '10mm', find_formula: '8+4fn{CD}', weight: 0.025, price: 2, rarity: 0, itemType: 'ammo' },
  { name: '.308', find_formula: '6+3fn{CD}', weight: 0.045, price: 3, rarity: 1, itemType: 'ammo' },
  { name: 'Flare', find_formula: '2+1fn{CD}', weight: 0.085, price: 1, rarity: 1, itemType: 'ammo' },
  { name: 'Shotgun Shell', find_formula: '6+3fn{CD}', weight: 0.1, price: 3, rarity: 1, itemType: 'ammo' },
  { name: '.45', find_formula: '8+4fn{CD}', weight: 0.03, price: 3, rarity: 2, itemType: 'ammo' },
  { name: 'Flamer Fuel', find_formula: '12+6fn{CD}', weight: 0.015, price: 1, rarity: 2, itemType: 'ammo' },
  { name: 'Energy Cell', find_formula: '14+7fn{CD}', weight: 0.03, price: 3, rarity: 2, itemType: 'ammo' },
  { name: 'Gamma Round', find_formula: '4+2fn{CD}', weight: 0.025, price: 10, rarity: 2, itemType: 'ammo' },
  { name: 'Railway Spike', find_formula: '6+3fn{CD}', weight: 0.2, price: 1, rarity: 2, itemType: 'ammo' },
  { name: 'Syringe', find_formula: '4+2fn{CD}', weight: 0.1, price: '1', rarity: 2, itemType: 'ammo' },
  { name: '.44 Magnum', find_formula: '4+2fn{CD}', weight: 0.055, price: 3, rarity: 3, itemType: 'ammo' },
  { name: '.50', find_formula: '4+2fn{CD}', weight: 0.075, price: 4, rarity: 3, itemType: 'ammo' },
  { name: '5.56mm', find_formula: '8+4fn{CD}', weight: 0.035, price: 2, rarity: 3, itemType: 'ammo' },
  { name: '5mm', find_formula: '10x(12+6fn{CD})', weight: 0.01, price: 1, rarity: 3, itemType: 'ammo' },
  { name: 'Fusion Core', find_formula: '1', weight: 4, price: 200, rarity: 3, itemType: 'ammo' },
  { name: 'Missile', find_formula: '2+1fn{CD}', weight: 7, price: 25, rarity: 3, itemType: 'ammo' },
  { name: 'Plasma Cartridge', find_formula: '10+5fn{CD}', weight: 0.03, price: 5, rarity: 4, itemType: 'ammo' },
  { name: '2mm EC', find_formula: '6+3fn{CD}', weight: 0.13, price: 10, rarity: 5, itemType: 'ammo' },
  { name: 'Mini Nuke', find_formula: '1+1fn{CD}', weight: 12, price: 100, rarity: 6, itemType: 'ammo' },
];

writeText('i18n/en-EN/data/equipment/ammo/ammo_types.json', JSON.stringify(ammoTypes, null, 2) + '\n');
writeText('i18n/en-EN/data/equipment/ammo/ammoData.json', JSON.stringify(ammoData, null, 2) + '\n');

// Checks.
for (const relPath of [characterRel, catalogRel]) {
  const result = spawnSync('node', ['-c', relPath], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) fail(`node -c failed: ${relPath}`);
  console.log(`node -c ok: ${relPath}`);
}

for (const relPath of [
  'i18n/en-EN/data/equipment/ammo/ammo_types.json',
  'i18n/en-EN/data/equipment/ammo/ammoData.json',
]) {
  JSON.parse(readText(relPath));
  console.log(`json ok: ${relPath}`);
}

console.log('\nDone. Now run: npx expo start -c');
