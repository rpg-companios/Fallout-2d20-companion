// Fallout-specific perk helpers that operate on the SPECIAL attribute model.
import { getCanonicalAttributeKey } from '../logic/characterCreation.js';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function buildFalloutAttributeValueMap(attributes) {
  if (isObject(attributes)) {
    return Object.entries(attributes).reduce((acc, [key, attribute]) => {
      const code = getCanonicalAttributeKey(attribute?.id || attribute?.name || key) || key;
      acc[code] = attribute?.total ?? attribute?.value ?? attribute?.base ?? 0;
      return acc;
    }, {});
  }

  const map = {};
  for (const attribute of attributes || []) {
    const code = getCanonicalAttributeKey(attribute?.id || attribute?.name);
    if (code) map[code] = attribute?.value ?? attribute?.total ?? attribute?.base ?? 0;
  }
  return map;
}
