// @deprecated: rules live in the Fallout setting package.
export * from '../../../logic/characterCreation.js';

// getAttributeLabel depends on i18n and stays here
import { tCharacterScreen } from './characterScreenI18n';
import { getCanonicalAttributeKey } from '../../../logic/characterCreation.js';

export const getAttributeLabel = (key) => {
  const canonical = getCanonicalAttributeKey(key);
  if (!canonical) return 'key value error';
  return tCharacterScreen(`attributes.${canonical}`, canonical);
};
