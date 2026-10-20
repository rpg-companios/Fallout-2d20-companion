import { getOrigins, getOriginI18n } from '../../domain/registry.js';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog.js';
import { getCurrentModuleLocale } from '../../i18n/locale.js';
import { getOriginImage } from './originImages.js';

const getFalloutOriginName = (id) => {
  if (!id) return '';
  const locale = getCurrentModuleLocale();
  const dictionary = getOriginI18n(locale);
  if (!dictionary) {
    throw new Error(`[origins] Для языка сеттинга "${locale}" нет словаря ориджинов`);
  }
  const translated = dictionary[id];
  if (typeof translated !== 'string' || translated.length === 0) {
    throw new Error(`[origins] Для ориджина "${id}" нет перевода`);
  }
  return translated;
};

const getUniversalKitIds = (kitGroups) => Object.keys(kitGroups)
  .filter((kitId) => kitGroups[kitId]?.universal === true);

/** Enrich Fallout origin records with their localized names, kit lists, and presentation assets. */
export const getFalloutEnrichedOrigins = () => {
  const { equipmentKits: kitGroups } = getEquipmentCatalog();
  const universalKitIds = getUniversalKitIds(kitGroups);
  return getOrigins().map((origin) => {
    const ownKitIds = origin.equipmentKitIds || [];
    const kitIds = [
      ...ownKitIds,
      ...universalKitIds.filter((id) => !ownKitIds.includes(id)),
    ];
    const equipmentKits = kitIds.map((kitId) => {
      const kit = kitGroups[kitId];
      if (!kit || !Array.isArray(kit.items)) {
        throw new Error(`[origins] Для комплекта "${kitId}" ориджина "${origin.id}" нет локализованных данных`);
      }
      return { id: kitId, ...kit };
    });
    return {
      id: origin.id,
      characterType: origin.characterType,
      name: getFalloutOriginName(origin.id),
      image: getOriginImage(origin.id) ?? null,
      traitIds: origin.traitIds || [],
      equipmentKitIds: kitIds,
      equipmentKits,
      bodyPlan: origin.bodyPlan ?? null,
    };
  });
};
