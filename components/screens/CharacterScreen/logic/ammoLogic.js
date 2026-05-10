// components/screens/CharacterScreen/logic/ammoLogic.js
import { calculateDamage, parseFormula } from '../../../../../domain/diceRollsLogic';

/**
 * Парсит формулу вида "X+Nfn{CD} <tag>" или "N <tag>".
 * @param {string} lootFormula - Формула для лута.
 * @returns {{quantityFormula: string, tag: string}|null}
 */
function parseLootFormula(lootFormula) {
    if (!lootFormula || typeof lootFormula !== 'string') return null;
    
    const regex = /^(.*?)<(\w+)>$/;
    const match = lootFormula.match(regex);

    if (match) {
        return {
            quantityFormula: match[1].trim(),
            tag: match[2].toLowerCase(),
        };
    }
    return null;
}

/**
 * Рассчитывает конкретный предмет и его количество на основе формулы лута.
 *
 * @deprecated Для тега <ammo> используйте resolveAmmoQuantity из kitResolver.js,
 *   который принимает weaponId и получает тип патрона через weapon.ammo_id из БД.
 *   Параметр context.weaponName больше не поддерживается для поиска патронов.
 *
 * @param {string} lootFormula - Формула, например "5+5fn{CD} <caps>".
 * @param {object} [context] - Контекст (не используется для <ammo>).
 * @returns {{name: string, quantity: number, type: string}|null}
 */
export function resolveLoot(lootFormula, context) {
    const parsed = parseLootFormula(lootFormula);
    if (!parsed) {
        return null;
    }

    const { quantityFormula, tag } = parsed;
    
    const { baseValue, diceCount } = parseFormula(quantityFormula);
    const { finalValue: quantity } = calculateDamage(baseValue, diceCount);

    switch (tag) {
        case 'ammo':
            // @deprecated: разрешение патронов по weaponName удалено.
            // Используйте resolveAmmoQuantity из kitResolver.js с weaponId.
            return null;

        case 'caps':
            return { name: 'Крышки', quantity, type: 'currency', Цена: 1, Вес: 0 };

        case 'basicmaterial':
            return { name: 'Базовые материалы', quantity, type: 'material' };

        default:
            return null;
    }
}
