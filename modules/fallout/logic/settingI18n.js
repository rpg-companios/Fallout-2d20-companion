import { getSettingNames } from 'engine:domain/registry';

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});

/** Fallout-owned compatibility projection over its declared locale dictionaries. */
export const getFalloutModuleI18n = (locale) => {
  const names = getSettingNames(locale);
  const system = names?.system ?? EMPTY_OBJECT;
  const equipment = names?.equipment ?? EMPTY_OBJECT;
  const armor = equipment.armor ?? EMPTY_OBJECT;
  const consumables = names?.consumables ?? EMPTY_OBJECT;
  const junk = names?.junk ?? EMPTY_OBJECT;
  return {
    origins: system.origins ?? EMPTY_OBJECT,
    traits: system.traits ?? EMPTY_OBJECT,
    equipmentKits: system.equipmentKits ?? EMPTY_OBJECT,
    uniqQualities: system.uniqQualities ?? EMPTY_ARRAY,
    qualities: system.qualities ?? EMPTY_ARRAY,
    effects: system.effects ?? EMPTY_OBJECT,
    damageEffects: system.damageEffects ?? EMPTY_ARRAY,
    ammoTypes: equipment.ammoTypes ?? EMPTY_ARRAY,
    weapons: equipment.weapons ?? EMPTY_ARRAY,
    clothes: equipment.clothes ?? EMPTY_ARRAY,
    generalGoods: equipment.generalGoods ?? EMPTY_ARRAY,
    weaponMods: equipment.weaponMods ?? EMPTY_ARRAY,
    food: consumables.food ?? EMPTY_ARRAY,
    drinks: consumables.drinks ?? EMPTY_ARRAY,
    settings: system.settings ?? EMPTY_OBJECT,
    armor,
    junk: junk.items ?? EMPTY_ARRAY,
    materials: junk.materials ?? EMPTY_ARRAY,
  };
};
