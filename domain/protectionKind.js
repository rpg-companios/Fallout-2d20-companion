// domain/protectionKind.js
// Единый определитель вида защитного предмета: броня / одежда / силовая броня.
// Pure functions — no React, no UI dependencies.
//
// ПРАВИЛО (от владельца): вид предмета определяется ТОЛЬКО ЯВНЫМИ полями
// данных — itemType, clothingType, armorCategoryKey. НИКОГДА не определять вид
// по названию предмета, по префиксу id или по слоту, в котором он лежит:
// одежда может лежать в слоте брони — от этого она бронёй не становится.
//
// ПРАВИЛО (от владельца, 2026-07-31): никакого легаси, нормализаторов и
// фоллбэков. Нет явных полей — вид неизвестен (null), а не «угадывается».
// Неизвестный вид → «модов нет» и «не экипируется» (fail-closed).

export const PROTECTION_KINDS = Object.freeze({
    ARMOR: 'armor',
    CLOTHING: 'clothing',
    POWER_ARMOR: 'powerArmor',
});

/**
 * Ключ семейства брони (как в data/equipment/armor.json) или null.
 * Берётся ТОЛЬКО из явного поля item.armorCategoryKey (его выставляет каталог)
 * и только если такое семейство существует в данных. Префиксов id и прочего
 * угадывания здесь нет — ПРАВИЛО (от владельца, 2026-07-31).
 */
export const resolveArmorCategoryKey = (item, catalog) => {
    if (!item) return null;
    const key = item.armorCategoryKey;
    const raw = catalog?.armorRaw;
    if (key && raw && Object.prototype.hasOwnProperty.call(raw, key)) return key;
    return null;
};

/**
 * Вид защиты предмета: PROTECTION_KINDS.ARMOR | CLOTHING | POWER_ARMOR | null.
 * Единственный источник правды о виде — его спрашивают UI (показывать ли
 * кнопку модов), домен модов (какие моды доступны), маршрутизация экипировки
 * (в какой слот класть) и в будущем — расчёт СУ (приоритет силовой брони).
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

    // Броня: явный тип из каталога или явный семейный ключ
    // (armorCategoryKey выставляется сборщиком каталога на предметах брони).
    if (itemType === PROTECTION_KINDS.ARMOR || item.armorCategoryKey) {
        return PROTECTION_KINDS.ARMOR;
    }

    return null;
};
