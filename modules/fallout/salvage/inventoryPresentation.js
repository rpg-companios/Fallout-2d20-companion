import { formatInventoryText, tInventory } from 'engine:components/screens/InventoryScreen/logic/inventoryI18n';
import { salvageButtonForItem } from './subline.js';

/** Localized button and subline presentation for Fallout's optional salvage feature. */
export const getFalloutSalvageInventoryPresentation = (item, state) => {
  const button = salvageButtonForItem(item, state);
  if (!button) return null;

  let subline = null;
  if (button.hasComposition && !item?.isEquipped) {
    const details = button.parts.length
      ? button.parts.map((part) => (
          part.count != null ? `${part.name} ×${part.count}` : part.name
        )).join(', ')
      : button.gate === 'rank'
        ? formatInventoryText(tInventory('screen.salvage.requiresRank'), { rank: button.requiredRank })
        : tInventory('screen.salvage.unavailable');
    subline = `${tInventory('screen.salvage.label')}: ${details}`;
  }

  return {
    button: {
      enabled: button.enabled,
      label: tInventory('screen.salvage.action'),
    },
    subline,
  };
};
