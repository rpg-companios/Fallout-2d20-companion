// domain/perks/inShiningArmor.js
// В сияющих доспехах (референс владельца, 403; автоматизация 404):
// ранг 1 — в металлической брони Сопротивляемость энергетическому урону +2
// (применяется в derivedStats, когда надета хоть одна металлическая деталь).
// Ранг 2 добавляет защиту от ослепления (светозащитная оптика) — боевая
// сцена вне движка приложения, живёт текстом перка.

export const IN_SHINING_ARMOR_ENERGY_DR = 2;
// Металлическая броня каталога: все детали штампуются префиксом armor_metal_
// (armor.json → metalArmor.tiers.*.pieces).
export const METAL_ARMOR_ID_PREFIX = 'armor_metal_';

export const isMetalArmorCatalogId = (id) =>
  typeof id === 'string' && id.startsWith(METAL_ARMOR_ID_PREFIX);

export const inShiningArmorPerk = {
  id: 'inShiningArmor',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    return { inShiningArmorRank: Math.min(2, Math.max(1, rank)) };
  },
};
