// Fallout's perk-driven "find X, gain additional X" inventory behavior.
import { rollMultipleCombatDice } from '../logic/diceRollsLogic.js';

const itemMatchesBonus = (item, match) => {
  if (!match || typeof match !== 'object' || Array.isArray(match)) return true;
  if (!item || typeof item !== 'object') return false;
  return Object.entries(match).every(([key, value]) => item[key] === value);
};

export function rollFoundItemBonuses(perkBonuses, itemType, item = null) {
  const bonuses = perkBonuses?.foundItemBonuses;
  if (!Array.isArray(bonuses) || !itemType) return [];

  return bonuses.flatMap((bonus) => {
    if (!bonus || bonus.itemType !== itemType) return [];
    if (!itemMatchesBonus(item, bonus.match)) return [];

    const extra = Number(bonus.extra) || 0;
    const combatDice = Number(bonus.combatDice) || 0;
    let amount = extra;
    if (combatDice > 0) amount += rollMultipleCombatDice(combatDice).total;
    if (amount <= 0) return [];

    const event = { perkId: bonus.perkId, itemType, amount };
    if (bonus.extraRandom) {
      event.extraRandom = true;
    } else if (item) {
      if (typeof item.name !== 'string' || item.name.length === 0) {
        throw new Error('[foundItemBonus] For a bonus alert, the item must have a name');
      }
      event.itemName = item.name;
    }
    return [event];
  });
}

export function sumFoundItemBonus(events) {
  return (events || []).reduce((sum, event) => {
    if (event?.extraRandom) return sum;
    return sum + (Number(event.amount) || 0);
  }, 0);
}
