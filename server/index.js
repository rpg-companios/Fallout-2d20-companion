'use strict';

// server/index.js — точка входа комнатного сервера.
// Один процесс = статика dist/ + WebSocket /ws (план gm-rooms, этап 0).
// Запуск: `npm run serve:app` (PORT из окружения, по умолчанию 5000).

const path = require('node:path');
const { createRoomServer } = require('./roomServer');

const port = Number(process.env.PORT || 5000);
const host = process.env.HOST || '0.0.0.0';

const { start, close } = createRoomServer({
  port,
  host,
  distDir: path.join(__dirname, '..', 'dist'),
});

start().then((address) => {
  // eslint-disable-next-line no-console
  console.log(`[room-server] Positronium: статика dist/ + /ws на ${address.address}:${address.port}`);
});

process.on('SIGTERM', () => close().finally(() => process.exit(0)));
process.on('SIGINT', () => close().finally(() => process.exit(0)));
