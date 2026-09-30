import { intenseTrainingPerk } from './intenseTraining';
import { educatedPerk } from './educated';
import { snakeaterPerk } from './snakeater';
import { lifeGiverPerk } from './lifeGiver';
import { strongBackPerk } from './strongBack';
import { toughnessPerk } from './toughness';
import { refractorPerk } from './refractor';
import { radResistantPerk } from './radResistant';
import { barbarianPerk } from './barbarian';
import { partyBoyPerk } from './partyBoy';
import { tagPerk } from './tag';
import { nuclearPhysicistPerk } from './nuclearPhysicist';
import { fastMetabolismPerk } from './fastMetabolism';
import { leadBellyPerk } from './leadBelly';
import { scroungerPerk } from './scrounger';
import { fortuneFinderPerk } from './fortuneFinder';
import { canOpenerPerk } from './canOpener';
import { butchersBountyPerk } from './butchersBounty';
import { chemResistantPerk } from './chemResistant';
import { colaNutPerk } from './colaNut';
import { thirstQuencherPerk } from './thirstQuencher';
import { pharmaFarmerPerk } from './pharmaFarmer';
import { oldWorldGourmetPerk } from './oldWorldGourmet';
import { inShiningArmorPerk } from './inShiningArmor';
import { loadAndFirePerk } from './loadAndFire';
import { juryRiggedAmmoPerk } from './juryRiggedAmmo';
import { fieldSurgeonPerk } from './fieldSurgeon';
import { pharmacistPerk } from './pharmacist';
import { powerUserPerk } from './powerUser';
import { capCollectorPerk } from './capCollector';
import { naturalResistancePerk } from './naturalResistance';
import { rejuvenatedPerk } from './rejuvenated';
import { dromedaryPerk } from './dromedary';
import { superDuperPerk } from './superDuper';
import { ghoulishPerk } from './ghoulish';
import { bloodsuckerPerk } from './bloodsucker';
import { chemistPerk } from './chemist';

export const perkEffects = {
  [intenseTrainingPerk.id]: intenseTrainingPerk,
  [educatedPerk.id]: educatedPerk,
  [snakeaterPerk.id]: snakeaterPerk,
  [lifeGiverPerk.id]: lifeGiverPerk,
  [strongBackPerk.id]: strongBackPerk,
  [toughnessPerk.id]: toughnessPerk,
  [refractorPerk.id]: refractorPerk,
  [radResistantPerk.id]: radResistantPerk,
  [barbarianPerk.id]: barbarianPerk,
  [partyBoyPerk.id]: partyBoyPerk,
  [tagPerk.id]: tagPerk,
  [nuclearPhysicistPerk.id]: nuclearPhysicistPerk,
  [fastMetabolismPerk.id]: fastMetabolismPerk,
  [leadBellyPerk.id]: leadBellyPerk,
  [scroungerPerk.id]: scroungerPerk,
  [fortuneFinderPerk.id]: fortuneFinderPerk,
  [canOpenerPerk.id]: canOpenerPerk,
  [butchersBountyPerk.id]: butchersBountyPerk,
  [chemResistantPerk.id]: chemResistantPerk,
  [colaNutPerk.id]: colaNutPerk,
  [thirstQuencherPerk.id]: thirstQuencherPerk,
  [pharmaFarmerPerk.id]: pharmaFarmerPerk,
  [oldWorldGourmetPerk.id]: oldWorldGourmetPerk,
  [inShiningArmorPerk.id]: inShiningArmorPerk,
  [loadAndFirePerk.id]: loadAndFirePerk,
  [juryRiggedAmmoPerk.id]: juryRiggedAmmoPerk,
  [fieldSurgeonPerk.id]: fieldSurgeonPerk,
  [pharmacistPerk.id]: pharmacistPerk,
  [powerUserPerk.id]: powerUserPerk,
  [capCollectorPerk.id]: capCollectorPerk,
  [naturalResistancePerk.id]: naturalResistancePerk,
  [rejuvenatedPerk.id]: rejuvenatedPerk,
  [dromedaryPerk.id]: dromedaryPerk,
  [superDuperPerk.id]: superDuperPerk,
  [ghoulishPerk.id]: ghoulishPerk,
  [bloodsuckerPerk.id]: bloodsuckerPerk,
  [chemistPerk.id]: chemistPerk,
};

export function getPerkEffect(effectId) {
  return effectId ? perkEffects[effectId] || null : null;
}
