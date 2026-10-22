import { canConsumeOnSelf, canConsumeOnOther } from 'engine:domain/itemfitRules';
import { tInventory } from 'engine:components/screens/InventoryScreen/logic/inventoryI18n';
import { buildConsumableResultReport } from './resultReport.js';

const NO_RADIATION_PREVIEW = Object.freeze({
  requestedAmount: null,
  receivedRadiationDamage: 0,
  rolls: null,
  canOfferReroll: false,
});

/** Fallout-owned inventory prompts and consumable application choices. */
export const handleFalloutInventoryConsumableUse = ({
  item,
  character,
  getState,
  applyConsumable,
  removeItem,
  getItemName,
  showAlert,
  showChoice,
  consumablesCapability,
  inventoryFeature,
} = {}) => {
  const consumableItem = { ...item };
  const itemName = getItemName?.(consumableItem) ?? consumableItem.name ?? consumableItem.Name ?? '';

  const applyToSelf = async () => {
    if (!canConsumeOnSelf(consumableItem, character)) {
      showAlert(
        tInventory('screen.alerts.robotCannotSelfUseTitle'),
        tInventory('screen.alerts.robotCannotSelfUseMessage'),
      );
      return;
    }

    const finish = (radiationRequestedAmount) => {
      const result = applyConsumable(consumableItem, { radiationRequestedAmount });
      const report = buildConsumableResultReport({ itemName, ...result });
      showAlert(report.title, report.message);
      removeItem(consumableItem, 1);
    };

    const preview = consumablesCapability?.previewRadiation?.({
      item: consumableItem,
      state: getState?.(),
    }) ?? NO_RADIATION_PREVIEW;
    if (!preview.canOfferReroll || typeof inventoryFeature?.rerollRadiation !== 'function') {
      finish(preview.requestedAmount);
      return;
    }

    const choice = await showChoice('leadBellyReroll', {
      radiationAmount: preview.receivedRadiationDamage,
    });
    if (choice === 'reroll') {
      const rerolled = inventoryFeature.rerollRadiation(consumableItem, preview.rolls);
      finish(rerolled.requestedAmount);
    } else {
      finish(preview.requestedAmount);
    }
  };

  const applyToOther = () => {
    if (!canConsumeOnOther(consumableItem, character)) {
      showAlert(
        tInventory('screen.alerts.robotCannotSelfUseTitle'),
        tInventory('screen.alerts.robotCannotSelfUseMessage'),
      );
      return;
    }
    const report = buildConsumableResultReport({ itemName });
    showAlert(report.title, report.message);
    removeItem(consumableItem, 1);
  };

  showChoice('applyConsumable', { itemName }).then(async (choice) => {
    if (choice === 'self') await applyToSelf();
    else if (choice === 'other') applyToOther();
  });
};
