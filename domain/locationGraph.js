'use strict';

/**
 * Патч 523: клиентская точка входа к единому графу пространств.
 * Канон живёт в `server/locationGraph.js` — лёгкий деплой NetAngels
 * раскладывает в app/ только `server/` + `ws`, дубля правил нет.
 */
module.exports = require('../server/locationGraph.js');
