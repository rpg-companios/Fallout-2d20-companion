// Generic adapter for setting-owned item summary presentation.
import { getSettingService } from './registry.js';

export const describeItemBasics = (item, locale) => {
  const describe = getSettingService('inventory')?.describeItemBasics;
  return typeof describe === 'function' ? describe(item, locale) : '';
};
