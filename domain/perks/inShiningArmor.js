// domain/perks/inShiningArmor.js
// В сияющих доспехах (текст перка — источник; ранг 2 добавлен 405):
// ранг 1 — в металлической броне Сопротивляемость энергетическому урону +2;
// ранг 2 — дополнительно +1, когда надета светозащитная оптика.
// В каталоге из оптики есть только Щиток сварщика (headwear_welding_mask):
// «Солнцезащитные очки» из примера книги в снаряжении приложения не заводились.
// Обе прибавки применяются в derivedStats; ношение считает store.

export const IN_SHINING_ARMOR_ENERGY_DR = 2;
export const IN_SHINING_ARMOR_OPTICS_ENERGY_DR = 1;
// Металлическая броня каталога: все детали штампуются префиксом armor_metal_
// (armor.json → metalArmor.tiers.*.pieces).
export const METAL_ARMOR_ID_PREFIX = 'armor_metal_';
// Светозащитная оптика каталога (примеры книги: маска/щиток сварщика,
// солнцезащитные очки; второй в данных нет — список расширяемый).
export const GLARE_OPTICS_IDS = ['headwear_welding_mask'];

export const isMetalArmorCatalogId = (id) =>
  typeof id === 'string' && id.startsWith(METAL_ARMOR_ID_PREFIX);

export const isGlareOpticsCatalogId = (id) =>
  GLARE_OPTICS_IDS.includes(id);

/**
 * Надета ли светозащитная оптика: любой слот брони/одежды с id из списка.
 * Чистая функция — store вызывает на state.equippedArmor.
 */
export const wearingGlareOpticsInEquippedArmor = (equippedArmor = {}) =>
  Object.values(equippedArmor).some((slotRow) => {
    const ids = [slotRow?.clothing?.weaponId || slotRow?.clothing?.id, slotRow?.armor?.weaponId || slotRow?.armor?.id];
    return ids.some(isGlareOpticsCatalogId);
  });

export const inShiningArmorPerk = {
  id: 'inShiningArmor',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    return { inShiningArmorRank: Math.min(2, Math.max(1, rank)) };
  },
};
