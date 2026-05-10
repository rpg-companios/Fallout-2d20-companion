// Script to generate perks JSON files from _external_data/perks.ts
// Run: node scripts/generate-perks.js

const fs = require('fs');
const path = require('path');

// SPECIAL attribute mapping: full name -> abbreviation
const SPECIAL_MAP = {
  charisma: 'CHA',
  strength: 'STR',
  perception: 'PER',
  endurance: 'END',
  agility: 'AGI',
  intelligence: 'INT',
  luck: 'LCK',
};

// All perks from _external_data/perks.ts
const PERKS = [
  { id: 'animalFriend', maxRanks: 2, prerequisites: { special: { charisma: 6 }, level: 1, levelIncreasePerRank: 5 } },
  { id: 'aquaboy', maxRanks: 2, prerequisites: { special: { endurance: 5 }, level: 1, levelIncreasePerRank: 3 } },
  { id: 'radResistant', maxRanks: 2, prerequisites: { special: { endurance: 8 }, level: 1, levelIncreasePerRank: 4 } },
  { id: 'armorer', maxRanks: 4, prerequisites: { special: { strength: 5, intelligence: 6 }, levelIncreasePerRank: 4 } },
  { id: 'barbarian', maxRanks: 1, prerequisites: { special: { strength: 7 }, level: 4, notForRobots: true } },
  { id: 'gunFu', maxRanks: 1, prerequisites: { special: { agility: 7 } } },
  { id: 'silverTongue', maxRanks: 1, prerequisites: { special: { charisma: 6 } } },
  { id: 'blitz', maxRanks: 2, prerequisites: { special: { agility: 9 }, level: 1, levelIncreasePerRank: 3 } },
  { id: 'leadBelly', maxRanks: 2, prerequisites: { special: { endurance: 6 }, level: 1, levelIncreasePerRank: 4 } },
  { id: 'juryRigging', maxRanks: 1, prerequisites: {} },
  { id: 'scoundrel', maxRanks: 1, prerequisites: { special: { charisma: 7 } } },
  { id: 'dogmeat', maxRanks: 1, prerequisites: { special: { charisma: 5 } } },
  { id: 'hunter', maxRanks: 1, prerequisites: { special: { endurance: 6 } } },
  { id: 'chemist', maxRanks: 1, prerequisites: { special: { intelligence: 7 } } },
  { id: 'shotgunSurgeon', maxRanks: 1, prerequisites: { special: { strength: 5, agility: 7 } } },
  { id: 'movingTarget', maxRanks: 1, prerequisites: { special: { agility: 6 } } },
  { id: 'basher', maxRanks: 1, prerequisites: { special: { strength: 6 } } },
  { id: 'laserCommander', maxRanks: 2, prerequisites: { special: { perception: 8 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'commando', maxRanks: 2, prerequisites: { special: { agility: 8 }, level: 2, levelIncreasePerRank: 3 } },
  { id: 'comprehension', maxRanks: 1, prerequisites: { special: { intelligence: 6 } } },
  { id: 'canOpener', maxRanks: 1, prerequisites: { special: { charisma: 5 } } },
  { id: 'betterCriticals', maxRanks: 1, prerequisites: { special: { charisma: 9 } } },
  { id: 'quickDraw', maxRanks: 1, prerequisites: { special: { agility: 6 } } },
  { id: 'fortuneFinder', maxRanks: 3, prerequisites: { special: { charisma: 5 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'solarPowered', maxRanks: 1, prerequisites: { special: { endurance: 7 } } },
  { id: 'entomologist', maxRanks: 1, prerequisites: { special: { intelligence: 7 } } },
  { id: 'intenseTraining', maxRanks: 10, prerequisites: { level: 2, levelIncreasePerRank: 2 } },
  { id: 'demolitionExpert', maxRanks: 1, prerequisites: { special: { perception: 6, charisma: 6 } } },
  { id: 'roboticsExpert', maxRanks: 3, prerequisites: { special: { intelligence: 8 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'gunNut', maxRanks: 4, prerequisites: { special: { intelligence: 6 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'capCollector', maxRanks: 1, prerequisites: { special: { charisma: 5 } } },
  { id: 'ghost', maxRanks: 1, prerequisites: { special: { perception: 5, agility: 6 } } },
  { id: 'scrounger', maxRanks: 3, prerequisites: { special: { charisma: 6 }, level: 1, levelIncreasePerRank: 5 } },
  { id: 'pharmaFarmer', maxRanks: 1, prerequisites: { special: { charisma: 6 } } },
  { id: 'partyBoy', maxRanks: 1, prerequisites: { special: { endurance: 6, charisma: 7 } } },
  { id: 'finesse', maxRanks: 1, prerequisites: { special: { agility: 9 } } },
  { id: 'heavyHitter', maxRanks: 1, prerequisites: { special: { strength: 8 } } },
  { id: 'blacksmith', maxRanks: 3, prerequisites: { special: { strength: 6 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'piercingStrike', maxRanks: 1, prerequisites: { special: { strength: 7 } } },
  { id: 'rifleman', maxRanks: 2, prerequisites: { special: { agility: 7 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'meltdown', maxRanks: 1, prerequisites: { special: { perception: 10 } } },
  { id: 'fastHealer', maxRanks: 1, prerequisites: { special: { endurance: 6 }, notForRobots: true } },
  { id: 'medic', maxRanks: 3, prerequisites: { special: { intelligence: 7 }, level: 1, levelIncreasePerRank: 5 } },
  { id: 'heaveHo', maxRanks: 1, prerequisites: { special: { strength: 8 } } },
  { id: 'actionBoy', maxRanks: 1, prerequisites: {} },
  { id: 'infiltrator', maxRanks: 1, prerequisites: { special: { perception: 8 } } },
  { id: 'nurse', maxRanks: 1, prerequisites: { special: { intelligence: 8 } } },
  { id: 'sizeMatters', maxRanks: 3, prerequisites: { special: { endurance: 7, agility: 6 }, levelIncreasePerRank: 4 } },
  { id: 'bullRush', maxRanks: 2, prerequisites: { special: { strength: 9, endurance: 7 }, level: 1, levelIncreasePerRank: 5 } },
  { id: 'quickHands', maxRanks: 1, prerequisites: { special: { agility: 8 } } },
  { id: 'masterThief', maxRanks: 1, prerequisites: { special: { perception: 8, agility: 9 } } },
  { id: 'sandman', maxRanks: 1, prerequisites: { special: { agility: 9 } } },
  { id: 'fastMetabolism', maxRanks: 3, prerequisites: { special: { endurance: 6 }, level: 1, notForRobots: true, levelIncreasePerRank: 3 } },
  { id: 'mysteriousStranger', maxRanks: 1, prerequisites: { special: { charisma: 7 } } },
  { id: 'daringNature', maxRanks: 1, prerequisites: { special: { charisma: 7 }, excludedPerks: ['cautiousNature'] } },
  { id: 'cautiousNature', maxRanks: 1, prerequisites: { special: { perception: 7 }, excludedPerks: ['daringNature'] } },
  { id: 'ninja', maxRanks: 1, prerequisites: { special: { agility: 8 } } },
  { id: 'nightPerson', maxRanks: 1, prerequisites: { special: { perception: 7 } } },
  { id: 'paralyzingPalm', maxRanks: 1, prerequisites: { special: { strength: 8 } } },
  { id: 'nuclearPhysicist', maxRanks: 1, prerequisites: { special: { intelligence: 9 } } },
  { id: 'pickpocket', maxRanks: 3, prerequisites: { special: { perception: 8, agility: 8 }, level: 1, levelIncreasePerRank: 3 } },
  { id: 'lightStep', maxRanks: 1, prerequisites: {} },
  { id: 'hacker', maxRanks: 1, prerequisites: { special: { intelligence: 8 } } },
  { id: 'pathfinder', maxRanks: 1, prerequisites: { special: { perception: 6, endurance: 6 } } },
  { id: 'gunslinger', maxRanks: 2, prerequisites: { special: { agility: 7 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'ironFist', maxRanks: 2, prerequisites: { special: { strength: 6 }, level: 1, levelIncreasePerRank: 5 } },
  { id: 'adrenalineRush', maxRanks: 1, prerequisites: { special: { strength: 7 } } },
  { id: 'intimidation', maxRanks: 2, prerequisites: { special: { strength: 6, charisma: 8 }, level: 3, levelIncreasePerRank: 5 } },
  { id: 'pyromaniac', maxRanks: 3, prerequisites: { special: { endurance: 6 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'nerdRage', maxRanks: 3, prerequisites: { special: { intelligence: 8 }, level: 2, levelIncreasePerRank: 5 } },
  { id: 'snakeater', maxRanks: 1, prerequisites: { special: { endurance: 7 } } },
  { id: 'scrapper', maxRanks: 2, prerequisites: { level: 3, levelIncreasePerRank: 5 } },
  { id: 'refractor', maxRanks: 2, prerequisites: { special: { perception: 6, charisma: 7 }, level: 1, levelIncreasePerRank: 4 } },
  { id: 'strongBack', maxRanks: 3, prerequisites: { special: { strength: 5 }, level: 1, levelIncreasePerRank: 2 } },
  { id: 'chemResistant', maxRanks: 2, prerequisites: { special: { endurance: 7 }, level: 1, levelIncreasePerRank: 4 } },
  { id: 'ricochet', maxRanks: 1, prerequisites: { special: { charisma: 10 }, level: 5 } },
  { id: 'toughness', maxRanks: 2, prerequisites: { special: { endurance: 6, charisma: 6 }, level: 1, levelIncreasePerRank: 4 } },
  { id: 'bloodyMess', maxRanks: 1, prerequisites: { special: { charisma: 6 } } },
  { id: 'science', maxRanks: 4, prerequisites: { special: { intelligence: 6 }, level: 2, levelIncreasePerRank: 4 } },
  { id: 'awareness', maxRanks: 1, prerequisites: { special: { perception: 7 } } },
  { id: 'sniper', maxRanks: 1, prerequisites: { special: { perception: 8, agility: 6 } } },
  { id: 'inspirational', maxRanks: 1, prerequisites: { special: { charisma: 8 } } },
  { id: 'tag', maxRanks: 1, prerequisites: { level: 5 } },
  { id: 'adamantiumSkeleton', maxRanks: 3, prerequisites: { special: { endurance: 7 }, level: 1, levelIncreasePerRank: 3 } },
  { id: 'educated', maxRanks: 10, prerequisites: { level: 3, levelIncreasePerRank: 3 } },
  { id: 'concentratedFire', maxRanks: 1, prerequisites: { special: { perception: 8, agility: 6 } } },
  { id: 'slacker', maxRanks: 2, prerequisites: { special: { agility: 6 }, level: 4, levelIncreasePerRank: 6 } },
  { id: 'triggerRush', maxRanks: 3, prerequisites: { special: { agility: 10 }, level: 1, levelIncreasePerRank: 5 } },
  { id: 'slayer', maxRanks: 1, prerequisites: { special: { strength: 8 } } },
  { id: 'killer', maxRanks: 1, prerequisites: { special: { charisma: 8 } } },
  { id: 'junktownVendor', maxRanks: 1, prerequisites: { special: { charisma: 8 } } },
  { id: 'blackWidow', maxRanks: 1, prerequisites: { special: { charisma: 6 } } },
  { id: 'steadyAim', maxRanks: 1, prerequisites: { special: { strength: 8, agility: 7 } } },
  { id: 'lifeGiver', maxRanks: 5, prerequisites: { level: 5, levelIncreasePerRank: 5 } },
];

// Map SPECIAL attribute names to abbreviations
function mapSpecial(special) {
  if (!special) return undefined;
  const mapped = {};
  for (const [key, val] of Object.entries(special)) {
    const abbr = SPECIAL_MAP[key];
    if (abbr) mapped[abbr] = val;
    else mapped[key] = val; // keep unknown keys as-is
  }
  return mapped;
}

// Build structural data
const structuralData = PERKS.map(p => {
  const prereqs = {};
  if (p.prerequisites.special) prereqs.special = mapSpecial(p.prerequisites.special);
  if (p.prerequisites.level !== undefined) prereqs.level = p.prerequisites.level;
  if (p.prerequisites.levelIncreasePerRank !== undefined) prereqs.levelIncreasePerRank = p.prerequisites.levelIncreasePerRank;
  if (p.prerequisites.skills) prereqs.skills = p.prerequisites.skills;
  if (p.prerequisites.perks) prereqs.perks = p.prerequisites.perks;
  if (p.prerequisites.excludedPerks) prereqs.excludedPerks = p.prerequisites.excludedPerks;
  if (p.prerequisites.notForRobots) prereqs.notForRobots = p.prerequisites.notForRobots;

  return {
    id: p.id,
    nameKey: `perks.${p.id}.name`,
    maxRanks: p.maxRanks,
    prerequisites: prereqs,
    effectKey: `perks.${p.id}.effect`,
  };
});

// Build i18n data (English names derived from camelCase id)
function toDisplayName(id) {
  return id
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

const i18nData = PERKS.map(p => ({
  id: p.id,
  name: toDisplayName(p.id),
  effect: '',
}));

// Write files
const outDir = path.resolve(__dirname, '..');

fs.mkdirSync(path.join(outDir, 'data/perks'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'i18n/en-EN/data/perks'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'i18n/ru-RU/data/perks'), { recursive: true });

fs.writeFileSync(
  path.join(outDir, 'data/perks/perks.json'),
  JSON.stringify(structuralData, null, 2)
);
fs.writeFileSync(
  path.join(outDir, 'i18n/en-EN/data/perks/perks.json'),
  JSON.stringify(i18nData, null, 2)
);
fs.writeFileSync(
  path.join(outDir, 'i18n/ru-RU/data/perks/perks.json'),
  JSON.stringify(i18nData, null, 2)
);

console.log(`Generated ${structuralData.length} perks.`);
console.log('  data/perks/perks.json');
console.log('  i18n/en-EN/data/perks/perks.json');
console.log('  i18n/ru-RU/data/perks/perks.json');
