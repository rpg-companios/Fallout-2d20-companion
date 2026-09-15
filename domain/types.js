// domain/types.js
// Общие типы движка (JSDoc typedefs). Файл без рантайм-кода: типы нужны
// редакторам и typecheck'у, описывают контракты, которые движок даёт слоям
// выше (стору, экранам).

/**
 * Успешное списание ресурса (см. characterStore.spendCurrency).
 *
 * @typedef {Object} SpendResult
 * @property {true} ok
 */

/**
 * Отказ списания: баланс не тронут, вызывающий решает, как сообщить
 * пользователю.
 *
 * @typedef {Object} SpendRejected
 * @property {false} ok
 * @property {string} reason - например, 'not-enough-currency'
 */

/** @typedef {SpendResult|SpendRejected} SpendOutcome */

export {};
