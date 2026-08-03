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
};

export function getPerkEffect(effectId) {
  return effectId ? perkEffects[effectId] || null : null;
}
