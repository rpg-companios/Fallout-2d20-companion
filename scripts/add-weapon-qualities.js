// Script to add qualities and damageType to weapons.json based on external data
const fs = require('fs');
const path = require('path');

// Mapping from external weapon name to qualities and damageType
// Based on _external_data/weapons.ts
const weaponData = {
  '.44 Pistol':              { damageType: 'physical', qualities: [{ qualityId: 'quality_vicious' }, { qualityId: 'quality_close_quarters' }] },
  '10mm Pistol':             { damageType: 'physical', qualities: [{ qualityId: 'quality_close_quarters' }, { qualityId: 'quality_reliable' }] },
  'Flare Gun':               { damageType: 'physical', qualities: [{ qualityId: 'quality_reliable' }] },
  'Assault Rifle':           { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Combat Rifle':            { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Gauss Rifle':             { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_two-handed' }] },
  'Hunting Rifle':           { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_two-handed' }] },
  'Submachine Gun':          { damageType: 'physical', qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_inaccurate' }] },
  'Combat Shotgun':          { damageType: 'physical', qualities: [{ qualityId: 'quality_spread' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_inaccurate' }] },
  'Double-Barrel Shotgun':   { damageType: 'physical', qualities: [{ qualityId: 'quality_vicious' }, { qualityId: 'quality_spread' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_inaccurate' }] },
  'Pipe Bolt-Action':        { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_unreliable' }] },
  'Pipe Gun':                { damageType: 'physical', qualities: [{ qualityId: 'quality_close_quarters' }, { qualityId: 'quality_unreliable' }] },
  'Pipe Revolver':           { damageType: 'physical', qualities: [{ qualityId: 'quality_close_quarters' }, { qualityId: 'quality_unreliable' }] },
  'Railway Rifle':           { damageType: 'physical', qualities: [{ qualityId: 'quality_breaking' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_unreliable' }, { qualityId: 'quality_debilitating' }] },
  'Syringer':                { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Institute Laser':         { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_close_quarters' }, { qualityId: 'quality_inaccurate' }] },
  'Laser Musket':            { damageType: 'energy',   qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_two-handed' }] },
  'Laser Gun':               { damageType: 'energy',   qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_close_quarters' }] },
  'Plasma Gun':              { damageType: 'energy',   qualities: [{ qualityId: 'quality_close_quarters' }] },
  'Gamma Gun':               { damageType: 'radiation',qualities: [{ qualityId: 'quality_stun' }, { qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_inaccurate' }, { qualityId: 'quality_blast' }] },
  'Fat Man':                 { damageType: 'physical', qualities: [{ qualityId: 'quality_vicious' }, { qualityId: 'quality_breaking' }, { qualityId: 'quality_radioactive' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_inaccurate' }, { qualityId: 'quality_blast' }] },
  'Flamer':                  { damageType: 'energy',   qualities: [{ qualityId: 'quality_spread' }, { qualityId: 'quality_burst' }, { qualityId: 'quality_persistent' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_inaccurate' }, { qualityId: 'quality_debilitating' }] },
  'Гатлинг Laser':           { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_gatling' }, { qualityId: 'quality_inaccurate' }] },
  'Gatling Laser':           { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_gatling' }, { qualityId: 'quality_inaccurate' }] },
  'Heavy Incinerator':       { damageType: 'energy',   qualities: [{ qualityId: 'quality_spread' }, { qualityId: 'quality_burst' }, { qualityId: 'quality_persistent' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_debilitating' }] },
  'Junk Jet':                { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Minigun':                 { damageType: 'physical', qualities: [{ qualityId: 'quality_spread' }, { qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_gatling' }, { qualityId: 'quality_inaccurate' }] },
  'Missile Launcher':        { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_blast' }] },
  'Sword':                   { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_parry' }] },
  'Combat Knife':            { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }] },
  'Machete':                 { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }] },
  'Ripper':                  { damageType: 'physical', qualities: [{ qualityId: 'quality_vicious' }] },
  'Shishkebab':              { damageType: 'energy',   qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_parry' }] },
  'Switchblade':             { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_concealed' }] },
  'Baseball Bat':            { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Aluminum Baseball Bat':   { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Board':                   { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Lead Pipe':               { damageType: 'physical', qualities: [] },
  'Pipe Wrench':             { damageType: 'physical', qualities: [] },
  'Pool Cue':                { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Rolling Pin':             { damageType: 'physical', qualities: [] },
  'Baton':                   { damageType: 'physical', qualities: [] },
  'Sledgehammer':            { damageType: 'physical', qualities: [] },
  'Super Sledge':            { damageType: 'physical', qualities: [{ qualityId: 'quality_breaking' }, { qualityId: 'quality_two-handed' }] },
  'Tire Iron':               { damageType: 'physical', qualities: [] },
  'Walking Cane':            { damageType: 'physical', qualities: [] },
  'Boxing Glove':            { damageType: 'physical', qualities: [{ qualityId: 'quality_stun' }] },
  'Deathclaw Gauntlet':      { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }] },
  'Knuckles':                { damageType: 'physical', qualities: [{ qualityId: 'quality_concealed' }] },
  'Power Fist':              { damageType: 'physical', qualities: [{ qualityId: 'quality_stun' }] },
  'Throwing Knives':         { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_concealed' }, { qualityId: 'quality_thrown' }, { qualityId: 'quality_silent' }] },
  'Tomahawk':                { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_thrown' }, { qualityId: 'quality_silent' }] },
  'Javelin':                 { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_thrown' }, { qualityId: 'quality_silent' }] },
  'Baseball Grenade':        { damageType: 'physical', qualities: [{ qualityId: 'quality_thrown' }, { qualityId: 'quality_blast' }] },
  'Frag Grenade':            { damageType: 'physical', qualities: [{ qualityId: 'quality_thrown' }, { qualityId: 'quality_blast' }] },
  'Molotov Cocktail':        { damageType: 'energy',   qualities: [{ qualityId: 'quality_persistent' }, { qualityId: 'quality_thrown' }, { qualityId: 'quality_blast' }] },
  'Nuka Grenade':            { damageType: 'energy',   qualities: [{ qualityId: 'quality_vicious' }, { qualityId: 'quality_breaking' }, { qualityId: 'quality_radioactive' }, { qualityId: 'quality_thrown' }, { qualityId: 'quality_blast' }] },
  'Plasma Grenade':          { damageType: 'energy',   qualities: [{ qualityId: 'quality_thrown' }, { qualityId: 'quality_blast' }] },
  'Pulse Grenade':           { damageType: 'energy',   qualities: [{ qualityId: 'quality_stun' }, { qualityId: 'quality_thrown' }, { qualityId: 'quality_blast' }] },
  'Bottlecap Mine':          { damageType: 'physical', qualities: [{ qualityId: 'quality_mine' }, { qualityId: 'quality_blast' }] },
  'Frag Mine':               { damageType: 'physical', qualities: [{ qualityId: 'quality_mine' }, { qualityId: 'quality_blast' }] },
  'Nuke Mine':               { damageType: 'energy',   qualities: [{ qualityId: 'quality_vicious' }, { qualityId: 'quality_breaking' }, { qualityId: 'quality_radioactive' }, { qualityId: 'quality_mine' }, { qualityId: 'quality_blast' }] },
  'Plasma Mine':             { damageType: 'energy',   qualities: [{ qualityId: 'quality_mine' }, { qualityId: 'quality_blast' }] },
  'M79 Grenade Launcher':    { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_blast' }] },
  'Acid Soaker':             { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_persistent' }] },
  'Alien Blaster':           { damageType: 'energy',   qualities: [{ qualityId: 'quality_close_quarters' }] },
  'Assaultron Head Laser':   { damageType: 'energy',   qualities: [{ qualityId: 'quality_piercing_x', value: 2 }, { qualityId: 'quality_two-handed' }] },
  'Mesmetron':               { damageType: 'energy',   qualities: [{ qualityId: 'quality_stun' }] },
  'Tesla Rifle':             { damageType: 'energy',   qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_burst' }] },
  'Broadsider':              { damageType: 'physical', qualities: [{ qualityId: 'quality_vicious' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_blast' }] },
  'Cryolator':               { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_debilitating' }] },
  'Harpoon Gun':             { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 2 }, { qualityId: 'quality_two-handed' }] },
  '.357 Magnum Revolver':    { damageType: 'physical', qualities: [{ qualityId: 'quality_vicious' }, { qualityId: 'quality_close_quarters' }] },
  '12.7mm Pistol':           { damageType: 'physical', qualities: [{ qualityId: 'quality_vicious' }, { qualityId: 'quality_close_quarters' }] },
  '12.7mm SMG':              { damageType: 'physical', qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_inaccurate' }] },
  '25mm Grenade APW':        { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_blast' }] },
  '9mm Pistol':              { damageType: 'physical', qualities: [{ qualityId: 'quality_close_quarters' }, { qualityId: 'quality_reliable' }] },
  'Anti-Materiel Rifle':     { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 2 }, { qualityId: 'quality_two-handed' }] },
  'Battle Rifle':            { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Black Powder Blunderbuss':{ damageType: 'physical', qualities: [{ qualityId: 'quality_spread' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_unreliable' }] },
  'Black Powder Pistol':     { damageType: 'physical', qualities: [{ qualityId: 'quality_unreliable' }] },
  'Black Powder Rifle':      { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_unreliable' }] },
  'Gauss Pistol':            { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }] },
  'Gauss Shotgun':           { damageType: 'physical', qualities: [{ qualityId: 'quality_spread' }, { qualityId: 'quality_two-handed' }] },
  'Lever-Action Rifle':      { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }] },
  'Light Machine Gun':       { damageType: 'physical', qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_inaccurate' }] },
  'Pump-Action Shotgun':     { damageType: 'physical', qualities: [{ qualityId: 'quality_spread' }, { qualityId: 'quality_two-handed' }] },
  'Radium Rifle':            { damageType: 'radiation',qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_burst' }] },
  'Sniper Rifle':            { damageType: 'physical', qualities: [{ qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_two-handed' }] },
  'Bow':                     { damageType: 'physical', qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_silent' }] },
  'Alien Atomizer':          { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_close_quarters' }] },
  'Alien Disintegrator':     { damageType: 'energy',   qualities: [{ qualityId: 'quality_piercing_x', value: 2 }, { qualityId: 'quality_two-handed' }] },
  'Arc Welder':              { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_persistent' }, { qualityId: 'quality_two-handed' }] },
  'Microwave Emitter':       { damageType: 'energy',   qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_debilitating' }] },
  '.50 Cal Machine Gun':     { damageType: 'physical', qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_inaccurate' }] },
};

const weaponsPath = path.join(__dirname, '../data/equipment/weapons.json');
const weapons = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));

let updated = 0;
let notFound = [];

for (const weapon of weapons) {
  const match = weaponData[weapon.imageName];
  if (match) {
    if (!weapon.damageType) weapon.damageType = match.damageType;
    if (!weapon.qualities) weapon.qualities = match.qualities;
    updated++;
  } else {
    // Default: physical, no qualities
    if (!weapon.damageType) weapon.damageType = 'physical';
    if (!weapon.qualities) weapon.qualities = [];
    notFound.push(weapon.imageName);
  }
}

fs.writeFileSync(weaponsPath, JSON.stringify(weapons, null, 2));
console.log(`Updated ${updated} weapons with qualities/damageType`);
if (notFound.length > 0) {
  console.log(`Defaulted to physical/[] for: ${notFound.join(', ')}`);
}
