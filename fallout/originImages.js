// Портреты ориджинов. require() нельзя положить в JSON — карта живёт здесь,
// рядом с картинками, и копируется вместе с модулем.

export function getOriginImage(originId) {
  switch (originId) {
    case 'brotherhood': return require('./assets/origins/brotherhood_of_steel.png');
    case 'ncr': return require('./assets/origins/ncr_citizen.png');
    case 'minuteman': return require('./assets/origins/minuteman.png');
    case 'childOfAtom': return require('./assets/origins/child_of_atom.png');
    case 'vaultDweller': return require('./assets/origins/vault_dweller.png');
    case 'protectron': return require('./assets/origins/protectron.png');
    case 'survivor': return require('./assets/origins/survivor.png');
    case 'securitron': return require('./assets/origins/securitron.png');
    case 'ghoul': return require('./assets/origins/ghoul.png');
    case 'assaultron': return require('./assets/origins/assaultron.png');
    case 'superMutant': return require('./assets/origins/super_mutant.png');
    case 'misterHandy': return require('./assets/origins/mister_handy.png');
    case 'brotherhoodOutcast': return require('./assets/origins/brotherhood_outcast.png');
    case 'shadow': return require('./assets/origins/shadow.png');
    case 'synth': return require('./assets/origins/synth.png');
    case 'robobrain': return require('./assets/origins/robobrain.png');
    case 'tribal': return require('./assets/origins/tribal.png');
    case 'TreeFamilies': return require('./assets/origins/3families.png');
    default: return null;
  }
}
