// domain/foundItemBonus.js
// Универсальный бонус «нашёл X → +n того же типа».
// Перк кладёт запись в perkBonuses.foundItemBonuses;
// UI после попадания предметов в инвентарь показывает алерт.
//
// Запись:
//   combatDice — сумма бросков CD;
//   extra — фиксированное число;
//   extraRandom — true: extra штук случайных из каталога типа, не того же предмета;
//   match — поля предмета, которые должны совпасть (например state: 'cooked').
// Имя в алерте: если передан предмет и бонус не extraRandom, берётся item.name.

import { rollMultipleCombatDice } from './diceRollsLogic';

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
    if (combatDice > 0) {
      amount += rollMultipleCombatDice(combatDice).total;
    }
    if (amount <= 0) return [];
    const event = {
      perkId: bonus.perkId,
      itemType,
      amount,
    };
    if (bonus.extraRandom) {
      event.extraRandom = true;
    } else if (item) {
      if (typeof item.name !== 'string' || item.name.length === 0) {
        throw new Error('[foundItemBonus] Для алерта нужно имя предмета');
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

export function pickRandomItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('[foundItemBonus] Нет каталога для случайного предмета');
  }
  const index = Math.floor(Math.random() * items.length);
  const picked = items[index];
  if (!picked || typeof picked.name !== 'string' || picked.name.length === 0) {
    throw new Error('[foundItemBonus] У случайного предмета нет имени');
  }
  return picked;
}
