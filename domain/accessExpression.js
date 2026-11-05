'use strict';

/**
 * Патч 538: клиентская точка входа к требованиям доступа «И/ИЛИ».
 * Канон живёт в `server/accessExpression.js` — лёгкий деплой NetAngels
 * раскладывает в app/ только `server/` + `ws`, дубля правил нет.
 */
module.exports = require('../server/accessExpression.js');
