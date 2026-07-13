import { intenseTrainingPerk } from './intenseTraining';
import { educatedPerk } from './educated';
import { snakeaterPerk } from './snakeater';

export const perkEffects = {
  [intenseTrainingPerk.id]: intenseTrainingPerk,
  [educatedPerk.id]: educatedPerk,
  [snakeaterPerk.id]: snakeaterPerk,
};

export function getPerkEffect(effectId) {
  return effectId ? perkEffects[effectId] || null : null;
}
