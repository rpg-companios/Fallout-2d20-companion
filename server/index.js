'use strict';

// server/index.js — точка входа комнатного сервера Positronium.
// Один процесс = мгновенное открытие порта (статика dist/ с gzip + WebSocket /ws)
// и прозрачная доcборка dist/ с живым экраном статуса, если исходники обновились.
// Запуск: `npm run serve:app` или `PORT=5000 node server/start.js`.

const { createManagedAppServer } = require('./start');

const app = createManagedAppServer();

app.start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[room-server] Ошибка запуска:', err);
  process.exit(1);
});

process.on('SIGTERM', () => app.close().finally(() => process.exit(0)));
process.on('SIGINT', () => app.close().finally(() => process.exit(0)));
