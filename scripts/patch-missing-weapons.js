const fs = require('fs');
const path = require('path');

const patches = {
  'weapon_auto_grenade_launcher': { damageType: 'physical', qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_blast' }] },
  'weapon_drone_cannon':          { damageType: 'energy',   qualities: [{ qualityId: 'quality_two-handed' }, { qualityId: 'quality_blast' }] },
  'weapon_gatling_gun':           { damageType: 'physical', qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_gatling' }, { qualityId: 'quality_inaccurate' }] },
  'weapon_gatling_plasma':        { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_gatling' }, { qualityId: 'quality_inaccurate' }] },
  'weapon_gauss_minigun':         { damageType: 'physical', qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_piercing_x', value: 1 }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_gatling' }] },
  'weapon_plasma_caster':         { damageType: 'energy',   qualities: [{ qualityId: 'quality_two-handed' }] },
  'weapon_tesla_cannon':          { damageType: 'energy',   qualities: [{ qualityId: 'quality_burst' }, { qualityId: 'quality_two-handed' }, { qualityId: 'quality_blast' }] },
};

const weaponsPath = path.join(__dirname, '../data/equipment/weapons.json');
const weapons = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));

for (const weapon of weapons) {
  const patch = patches[weapon.id];
  if (patch) {
    weapon.damageType = patch.damageType;
    weapon.qualities = patch.qualities;
    console.log(`Patched: ${weapon.id}`);
  }
}

fs.writeFileSync(weaponsPath, JSON.stringify(weapons, null, 2));
console.log('Done');
