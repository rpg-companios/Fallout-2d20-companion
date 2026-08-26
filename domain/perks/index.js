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
};

export function getPerkEffect(effectId) {
  return effectId ? perkEffects[effectId] || null : null;
}
