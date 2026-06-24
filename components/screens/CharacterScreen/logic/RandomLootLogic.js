import { evaluateFormula, evaluateFormulaMulti, rollDie } from '../../../../domain/diceRollsLogic';
import trinkets from '../../../../assets/RandomLoot/trinkets.json';
import food from '../../../../assets/RandomLoot/food.json';
import brewery from '../../../../assets/RandomLoot/brewery.json';
import chems from '../../../../assets/RandomLoot/chems.json';
import outcast from '../../../../assets/RandomLoot/outcast.json';
import { getWeaponById } from '../../../../db/Database';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';

const lootTables = {
  trinklet: trinkets,
  food: food,
  brewery: brewery,
  chem: chems,
  outcast: outcast,
};

export const supportedLootTags = Object.keys(lootTables);

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
 * Builds an id→item lookup index from the equipment catalog.
 * All catalog items are indexed by their `id` field.
 */
function buildCatalogIndex() {
    const catalog = getEquipmentCatalog();
    const index = new Map();

    const addAll = (items, itemType) => {
        if (!items) return;
        const list = Array.isArray(items) ? items : [];
        for (const item of list) {
            if (item.id) index.set(item.id, { ...item, itemType: item.itemType || itemType });
        }
    };

    // Flat lists
    addAll(catalog.chems, 'chem');
    addAll(catalog.drinks, 'drinks');
    addAll(catalog.food, 'food');
    addAll(catalog.weapons, 'weapon');
    addAll(catalog.generalGoods, 'misc');
    addAll(catalog.oddities, 'misc');

    // Armor — flatMap from groups
    const armorItems = (catalog.armor?.armor || []).flatMap(g => g.items || []);
    addAll(armorItems, 'armor');

    // Clothes — flatMap from groups
    const clothesItems = (catalog.clothes?.clothes || []).flatMap(g => g.items || []);
    addAll(clothesItems, 'clothing');

    // Miscellaneous — flatMap from groups
    const miscData = catalog.miscellaneous;
    if (miscData?.miscellaneous) {
        const miscItems = miscData.miscellaneous.flatMap(g => g.items || []);
        addAll(miscItems, 'misc');
    }

    return index;
}

/**
 * Resolves a single item from a loot table by roll result.
 * Uses `id` as the primary lookup key into the equipment catalog.
 * Falls back to name-based search if the id is not found in the catalog
 * (e.g., for synthetic loot_* ids).
 */
async function resolveItemFromTable(rollResult, tag, lootTable) {
    const catalogIndex = buildCatalogIndex();
    const equipmentCatalog = getEquipmentCatalog();

    const foundItem = lootTable.find(loot => loot.roll === rollResult);
    if (!foundItem) {
        return { name: `[Not found] ${tag}`, quantity: 1, id: `loot_miss_${tag}_${rollResult}` };
    }

    const { roll, name, ref, ...otherProps } = foundItem;

    // ── Handle ref (hard reference to another catalog item) ──
    if (ref && ref.source && ref.id) {
        try {
            if (ref.source === 'chems') {
                const catalogItem = catalogIndex.get(ref.id);
                if (catalogItem) return { ...catalogItem, quantity: 1, itemType: 'chem' };
            } else if (['light_weapons', 'heavy_weapons', 'energy_weapons', 'melee_weapons'].includes(ref.source)) {
                const weapon = await getWeaponById(ref.id);
                if (weapon) return { ...weapon, name: weapon.name, quantity: 1, itemType: 'weapon' };
            } else if (ref.source === 'armor') {
                const catalogItem = catalogIndex.get(ref.id);
                if (catalogItem) return { ...catalogItem, quantity: 1, itemType: 'armor' };
            } else if (ref.source === 'clothes') {
                const catalogItem = catalogIndex.get(ref.id);
                if (catalogItem) return { ...catalogItem, quantity: 1, itemType: 'clothing' };
            } else if (ref.source === 'misc') {
                const catalogItem = catalogIndex.get(ref.id);
                if (catalogItem) return { ...catalogItem, quantity: 1, itemType: catalogItem.itemType || 'misc' };
            }
        } catch (e) {
            // fall through to id-based lookup
        }
    }

    // ── Primary: id-based lookup ──
    const itemId = foundItem.id;
    if (itemId) {
        const catalogItem = catalogIndex.get(itemId);
        if (catalogItem) {
            return { ...catalogItem, quantity: 1, itemType: catalogItem.itemType || (tag === 'chem' ? 'chem' : 'loot') };
        }

        // For weapon ids, try DB
        if (itemId.startsWith('weapon_')) {
            try {
                const weapon = await getWeaponById(itemId);
                if (weapon) return { ...weapon, name: weapon.name, quantity: 1, itemType: 'weapon' };
            } catch (e) {}
        }
    }

    // ── Fallback: name-based search (only for items not in main catalog) ──
    // This handles loot-only items (trinkets, some foods) that have synthetic ids
    if (tag === 'outcast') {
        // Try chems by name
        const chemList = equipmentCatalog.chems || [];
        const chemMatch = chemList.find(c => c.name === name);
        if (chemMatch) return { ...chemMatch, name, quantity: 1, itemType: 'chem' };

        // Try weapons by name via DB
        try {
            const { getWeaponByName } = await import('../../../../db/Database');
            const weapon = await getWeaponByName(name);
            if (weapon) return { ...weapon, name: weapon.name, quantity: 1, itemType: 'weapon' };
        } catch (e) {}

        // Try armor by name
        const armorItems = (equipmentCatalog.armor?.armor || []).flatMap(g => g.items || []);
        const armorMatch = armorItems.find(i => i.name === name);
        if (armorMatch) return { ...armorMatch, name: armorMatch.name, quantity: 1, itemType: 'armor' };

        // Try clothes by name
        const clothesItems = (equipmentCatalog.clothes?.clothes || []).flatMap(g => g.items || []);
        const clothesMatch = clothesItems.find(i => i.name === name);
        if (clothesMatch) return { ...clothesMatch, name: clothesMatch.name, quantity: 1, itemType: 'clothing' };

        // Try misc by name
        const miscData = equipmentCatalog.miscellaneous;
        const miscItems = miscData?.miscellaneous ? miscData.miscellaneous.flatMap(g => g.items || []) : [];
        const miscMatch = miscItems.find(i => i.name === name);
        if (miscMatch) return { ...miscMatch, name: miscMatch.name, quantity: 1, itemType: miscMatch.itemType || 'misc' };
    }

    // ── Last resort: return the loot table entry as-is with its id ──
    return {
        ...otherProps,
        id: itemId,
        name,
        quantity: 1,
        itemType: tag === 'chem' ? 'chem' : 'loot',
    };
}

/**
 * Разрешает формулу лута.
 * - Одиночный бросок: "d20<food>" → один предмет (или null)
 * - Раздельные броски: "d20,d20<food>" → массив предметов
 */
export async function resolveRandomLoot(lootFormula) {
    const parsed = parseLootFormula(lootFormula);
    if (!parsed) return null;

    const { quantityFormula, tag } = parsed;
    const lootTable = lootTables[tag];
    if (!lootTable) return null;

    if (quantityFormula.includes(',')) {
        const rolls = evaluateFormulaMulti(quantityFormula);
        const items = await Promise.all(rolls.map(r => resolveItemFromTable(r, tag, lootTable)));
        return items;
    }

    const rollResult = evaluateFormula(quantityFormula);
    return resolveItemFromTable(rollResult, tag, lootTable);
}

export async function resolveRandomLootByRoll(tag, count = 1) {
    const normalizedTag = String(tag || '').toLowerCase();

    // Таблица диковин — берётся из каталога, не из assets/RandomLoot
    if (normalizedTag === 'oddity') {
        const catalog = getEquipmentCatalog();
        const oddities = catalog?.oddities || [];
        if (!oddities.length) return [];
        const totalRolls = Math.max(0, parseInt(count, 10) || 0);
        const items = [];
        for (let i = 0; i < totalRolls; i++) {
            const idx = (rollDie(20) - 1) % oddities.length;
            const item = oddities[idx];
            if (item) items.push({ ...item, quantity: 1, itemType: item.itemType || 'misc' });
        }
        return items;
    }

    const lootTable = lootTables[normalizedTag];
    if (!lootTable) return [];

    const totalRolls = Math.max(0, parseInt(count, 10) || 0);
    const items = [];
    for (let i = 0; i < totalRolls; i++) {
        const rollResult = rollDie(20);
        const item = await resolveItemFromTable(rollResult, normalizedTag, lootTable);
        if (item) items.push(item);
    }
    return items;
}