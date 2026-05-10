import { evaluateFormula, evaluateFormulaMulti, rollDie } from '../../../../domain/diceRollsLogic';
import trinkets from '../../../../assets/RandomLoot/trinkets.json';
import food from '../../../../assets/RandomLoot/food.json';
import brewery from '../../../../assets/RandomLoot/brewery.json';
import chems from '../../../../assets/RandomLoot/chems.json';
import outcast from '../../../../assets/RandomLoot/outcast.json';
import { getWeaponByName } from '../../../../db/Database';
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
    // Формат: [формула]<тег>  — формула может содержать запятые для раздельных бросков
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
 * Разрешает один предмет из таблицы лута по результату броска.
 */
async function resolveItemFromTable(rollResult, tag, lootTable) {
    const equipmentCatalog = getEquipmentCatalog();
    const fullChemsData = equipmentCatalog.chems;
    const armorData = equipmentCatalog.armor;
    const clothesData = equipmentCatalog.clothes;
    const miscData = equipmentCatalog.miscellaneous;

    const foundItem = lootTable.find(loot => loot.roll === rollResult);
    if (!foundItem) {
        return { Название: `[Не найдено] ${tag}`, quantity: 1 };
    }

    const { roll, name, ref, ...otherProps } = foundItem;

    // Жёсткие ссылки на конкретные источники
    if (ref && ref.source && ref.name) {
        const source = ref.source;
        const refName = ref.name;
        try {
            if (source === 'chems') {
                const chem = fullChemsData.find(x => (x.Название === refName || x.name === refName));
                if (chem) return { ...chem, name: refName, Название: refName, quantity: 1, itemType: 'chem' };
            } else if (['light_weapons', 'heavy_weapons', 'energy_weapons', 'melee_weapons'].includes(source)) {
                const weapon = await getWeaponByName(refName);
                if (weapon) return { ...weapon, name: weapon.name, quantity: 1, itemType: 'weapon' };
            } else if (source === 'armor') {
                const allArmorItems = armorData.armor.flatMap(a => a.items);
                const ar = allArmorItems.find(x => (x.Название === refName || x.name === refName));
                if (ar) return { ...ar, name: ar.name || ar.Название, Название: ar.Название || ar.name, quantity: 1, itemType: 'armor' };
            } else if (source === 'clothes') {
                const allClothesItems = clothesData.clothes.flatMap(c => c.items);
                const cl = allClothesItems.find(x => (x.Название === refName || x.name === refName));
                if (cl) return { ...cl, name: cl.name || cl.Название, Название: cl.Название || cl.name, quantity: 1, itemType: 'clothes' };
            } else if (source === 'misc') {
                const allMiscItems = miscData.miscellaneous.flatMap(category => category.items);
                const mi = allMiscItems.find(x => (x.Название === refName || x.name === refName));
                if (mi) return { ...mi, name: mi.name || mi.Название, Название: mi.Название || mi.name, quantity: 1, itemType: mi.itemType || 'misc' };
            }
        } catch (e) {
        }
    }

    if (tag === 'chem') {
        const fullChemData = fullChemsData.find(chem => chem.Название === name || chem.name === name);
        if (fullChemData) return { ...fullChemData, name, Название: name, quantity: 1, itemType: 'chem' };
    }

    if (tag === 'outcast') {
        const fullChemData2 = fullChemsData.find(chem => chem.Название === name || chem.name === name);
        if (fullChemData2) return { ...fullChemData2, name, Название: name, quantity: 1, itemType: 'chem' };
        const weapon = await getWeaponByName(name);
        if (weapon) return { ...weapon, name: weapon.name, quantity: 1, itemType: 'weapon' };
        const allArmorItems = armorData.armor.flatMap(a => a.items);
        const armor = allArmorItems.find(i => i.Название === name || i.name === name);
        if (armor) return { ...armor, name: armor.name || armor.Название, Название: armor.Название || armor.name, quantity: 1, itemType: 'armor' };
        const allClothesItems = clothesData.clothes.flatMap(c => c.items);
        const clothes = allClothesItems.find(i => i.Название === name || i.name === name);
        if (clothes) return { ...clothes, name: clothes.name || clothes.Название, Название: clothes.Название || clothes.name, quantity: 1, itemType: 'clothes' };
        const allMiscItems = miscData.miscellaneous.flatMap(category => category.items);
        const misc = allMiscItems.find(i => i.Название === name || i.name === name);
        if (misc) return { ...misc, name: misc.name || misc.Название, Название: misc.Название || misc.name, quantity: 1, itemType: misc.itemType || 'misc' };
    }

    return { ...otherProps, name, Название: name, quantity: 1, itemType: tag === 'chem' ? 'chem' : 'loot' };
}

/**
 * Разрешает формулу лута.
 * - Одиночный бросок: "d20<food>" → один предмет (или null)
 * - Раздельные броски: "d20,d20<food>" → массив предметов
 *
 * Возвращает один объект предмета, или массив если бросков несколько.
 */
export async function resolveRandomLoot(lootFormula) {
    const parsed = parseLootFormula(lootFormula);
    if (!parsed) return null;

    const { quantityFormula, tag } = parsed;
    const lootTable = lootTables[tag];
    if (!lootTable) return null;

    // Раздельные броски: "d20,d20"
    if (quantityFormula.includes(',')) {
        const rolls = evaluateFormulaMulti(quantityFormula);
        const items = await Promise.all(rolls.map(r => resolveItemFromTable(r, tag, lootTable)));
        return items;
    }

    // Одиночный бросок
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
