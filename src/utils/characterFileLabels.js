import { getSettingService } from '../../domain/registry.js';

/** Return the active setting's localized character-file picker label. */
export const getCharacterFilePickerDescription = (options = {}) => {
  const getDescription = getSettingService('characterFiles')?.getPickerDescription;
  if (typeof getDescription === 'function') {
    const description = getDescription(options);
    if (typeof description === 'string' && description.length > 0) return description;
  }
  return options.withExtensions ? 'Character file (.json)' : 'Character file';
};
