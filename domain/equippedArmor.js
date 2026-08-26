// domain/equippedArmor.js
// Чистые правила слотов экипировки брони/одежды. Pure functions — no React, no UI.
//
// Модель слотов: 6 слотов тела (head, body, leftArm, rightArm, leftLeg, rightLeg),
// в каждом два под-слота: clothing (одежда) и armor (броня).
//
// ПРАВИЛО (от владельца): в под-слоте armor лежит ТОЛЬКО броня,
// в под-слоте clothing — ТОЛЬКО одежда (обмундирование и костюмы вместе).
// Одежда, запрещающая броню поверх себя (outfit, allowsArmor: false), НЕ
// «притворяется» бронёй переездом в чужой слот — запрет ВЫЧИСЛЯЕТСЯ функцией
// blocksArmorOver(). Слот никогда не решает, чем является предмет: это решает
// domain/protectionKind.js по полям данных.
//
// ПРАВИЛО (от владельца, 2026-07-31): никакого легаси, никаких нормализаторов
// и фоллбэков в маршрутизации. Неизвестный вид предмета НЕ экипируется,
// а не «кладётся куда-нибудь по умолчанию».

import { getProtectionKind, PROTECTION_KINDS } from './protectionKind.js';

/** Пустая карта слотов экипировки. Единственный источник этого литерала. */
export const createEmptyEquippedArmor = () => ({
    head: { armor: null, clothing: null },
    body: { armor: null, clothing: null },
    leftArm: { armor: null, clothing: null },
    rightArm: { armor: null, clothing: null },
    leftLeg: { armor: null, clothing: null },
    rightLeg: { armor: null, clothing: null },
});

/**
 * В какой под-слот класть предмет при экипировке:
 * 'armor' | 'clothing' | null (предмет не защита — не экипируется).
 * Новые виды защиты (напр. силовая броня) добавляются сюда ЯВНЫМ правилом.
 */
export const resolveTargetLayer = (item) => {
    const kind = getProtectionKind(item);
    if (kind === PROTECTION_KINDS.ARMOR) return 'armor';
    if (kind === PROTECTION_KINDS.CLOTHING) return 'clothing';
    return null;
};

/**
 * Запрещает ли одежда надевание брони поверх себя (обмундирование).
 * Возвращает true только для ОДЕЖДЫ, которую нельзя носить под бронёй:
 * allowsArmor !== true и clothingType !== 'suit'. Для брони и прочих предметов
 * всегда false — они сами занимают под-слот armor и вытесняются из него.
 */
export const blocksArmorOver = (item) => {
    if (getProtectionKind(item) !== PROTECTION_KINDS.CLOTHING) return false;
    return !(item.allowsArmor === true || item.clothingType === 'suit');
};
