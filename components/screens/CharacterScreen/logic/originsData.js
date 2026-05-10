import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { loadOriginsData, tOrigin } from '../../../../domain/traits';

const ORIGIN_IMAGES = {
  brotherhood: require('../../../../assets/origins/brotherhood_of_steel.png'),
  ncr: require('../../../../assets/origins/ncr_citizen.png'),
  minuteman: require('../../../../assets/origins/minuteman.png'),
  childOfAtom: require('../../../../assets/origins/child_of_atom.png'),
  vaultDweller: require('../../../../assets/origins/vault_dweller.png'),
  protectron: require('../../../../assets/origins/protectron.png'),
  survivor: require('../../../../assets/origins/survivor.png'),
  securitron: require('../../../../assets/origins/securitron.png'),
  ghoul: require('../../../../assets/origins/ghoul.png'),
  assaultron: require('../../../../assets/origins/assaultron.png'),
  superMutant: require('../../../../assets/origins/super_mutant.png'),
  misterHandy: require('../../../../assets/origins/mister_handy.png'),
  brotherhoodOutcast: require('../../../../assets/origins/brotherhood_outcast.png'),
  shadow: require('../../../../assets/origins/shadow.png'),
  synth: require('../../../../assets/origins/synth.png'),
  robobrain: require('../../../../assets/origins/robobrain.png'),
  savage: require('../../../../assets/origins/savage.png'),
};

const { equipmentKits: equipmentKitGroups } = getEquipmentCatalog();

// Build ORIGINS from data/origins/origins.json — single source of truth for origin ids/structure.
// Names come from i18n via tOrigin(id). Equipment kits come from equipmentKits.json.
export const ORIGINS = loadOriginsData().map((origin) => {
  const kitIds = origin.equipmentKitIds || [];
  const equipmentKits = kitIds
    .map((kitId) => ({ id: kitId, ...(equipmentKitGroups[kitId] || {}) }))
    .filter((kit) => Array.isArray(kit.items));

  return {
    id: origin.id,
    name: tOrigin(origin.id),
    image: ORIGIN_IMAGES[origin.id] || null,
    isRobot: origin.isRobot || false,
    isMutant: origin.isMutant || false,
    canWearStandardArmor: origin.canWearStandardArmor ?? true,
    canWearRobotArmor: origin.canWearRobotArmor ?? false,
    canWearMutantArmor: origin.canWearMutantArmor ?? false,
    traitIds: origin.traitIds || [],
    equipmentKits,
  };
});
