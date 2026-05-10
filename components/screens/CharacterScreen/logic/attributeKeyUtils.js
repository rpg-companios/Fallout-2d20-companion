// @deprecated: перенесено в domain/characterCreation.js
export * from '../../../../domain/characterCreation';

// getAttributeLabel depends on i18n and stays here
import { tCharacterScreen } from './characterScreenI18n';
import { getCanonicalAttributeKey } from '../../../../domain/characterCreation';

export const getAttributeLabel = (key) => {
  const canonical = getCanonicalAttributeKey(key);
  if (!canonical) return 'key value error';
  return tCharacterScreen(`attributes.${canonical}`, canonical);
};
