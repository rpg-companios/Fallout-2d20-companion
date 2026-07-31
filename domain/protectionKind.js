// domain/protectionKind.js
// Единый определитель вида защитного предмета: броня / одежда / силовая броня.
// Pure functions — no React, no UI dependencies.
//
// ПРАВИЛО (от владельца): вид предмета определяется ТОЛЬКО полями данных —
// itemType, clothingType, armorCategoryKey или id-префиксом семейства брони.
// НИКОГДА не определять вид по названию предмета или по слоту, в котором он
// лежит: одежда может лежать в слоте брони — от этого она бронёй не становится.
//
// ПРАВИЛО (от владельца): неизвестный вид → null, и null означает «модов нет»
// (fail-closed): лучше не показать моды вообще, чем разрешить всё подряд.

export const PROTECTION_KINDS = Object.freeze({
    ARMOR: 'armor',
    CLOTHING: 'clothing',
    POWER_ARMOR: 'powerArmor',
});

// Семейства обычной брони из data/equipment/armor.json — по префиксу id.
// Нужно для старых сохранённых предметов без armorCategoryKey/itemType.
// (перенесено из domain/modsEquip.js — канонический дом определения вида теперь здесь)
const ARMOR_ID_CATEGORY_PREFIX = {
    armor_raider_: 'raiderArmor',
    armor_leather_: 'leatherArmor',
    armor_metal_: 'metalArmor',
    armor_combat_: 'combatArmor',
    armor_synth_: 'synthArmor',
    armor_vault_: 'vaultSecurityArmor',
};

/**
 * Resolves the armor category key (as in data/equipment/armor.json) for an item.
 * (перенесено из domain/modsEquip.js без изменений логики)
 * 1. item.armorCategoryKey, если он известен каталогу;
 * 2. вывод из префикса id (armor_raider_* → raiderArmor и т.д.) — для старых
 *    сохранённых предметов без armorCategoryKey;
 * 3. null, если категорию определить нельзя.
 */
export const resolveArmorCategoryKey = (item, catalog) => {
    if (!item) return null;
    const raw = catalog?.armorRaw;
    const key = item.armorCategoryKey;
    if (key && raw && Object.prototype.hasOwnProperty.call(raw, key)) return key;
    const id = String(item.id || '');
    for (const [prefix, categoryKey] of Object.entries(ARMOR_ID_CATEGORY_PREFIX)) {
        if (id.startsWith(prefix) && (!raw || Object.prototype.hasOwnProperty.call(raw, categoryKey))) {
            return categoryKey;
        }
    }
    return raw && key && Object.prototype.hasOwnProperty.call(raw, key) ? key : null;
};

/**
 * Вид защиты предмета: PROTECTION_KINDS.ARMOR | CLOTHING | POWER_ARMOR | null.
 * Единственный источник правды о виде — его спрашивают UI (показывать ли
 * кнопку модов), домен модов (какие моды доступны) и в будущем — расчёт СУ
 * (приоритет силовой брони, когда она будет подключена).
 */
export const getProtectionKind = (item) => {
    if (!item) return null;
    const itemType = String(item.itemType || '').trim();

    // Силовая броня помечена в данных как itemType: 'powerArmor'
    // (data/equipment/powerArmor.json — пока не подключена к каталогу,
    // но вид уже различается, чтобы логика не строилась на названиях).
    if (itemType === PROTECTION_KINDS.POWER_ARMOR) return PROTECTION_KINDS.POWER_ARMOR;

    // Одежда: обмундирование, костюмы, головные уборы.
    if (itemType === 'clothing' || itemType === 'outfit' || item.clothingType) {
        return PROTECTION_KINDS.CLOTHING;
    }

    // Броня: явный тип из каталога...
    if (itemType === PROTECTION_KINDS.ARMOR) return PROTECTION_KINDS.ARMOR;
    // ...или старый сохранённый предмет без itemType, у которого определяется
    // семейство брони по id (старые сейвы до появления itemType)...
    if (resolveArmorCategoryKey(item)) return PROTECTION_KINDS.ARMOR;
    // ...или id явно заявляет «это броня» (armor_*), но семейство неизвестно:
    // устаревший или удалённый из каталога предмет. Это всё ещё броня — ей
    // доступны универсальные стандартные моды, а уникальных не будет
    // (неизвестное семейство → уникальных нет, fail-closed).
    if (String(item.id || '').startsWith('armor_')) return PROTECTION_KINDS.ARMOR;

    return null;
};
