// Регрессионные тесты патча 465:
// поддержка окружения NetAngels (`na4u.ru`):
// 1) автоподхват `APP_PORT` / `APP_IP`, если `PORT` / `HOST` не заданы;
// 2) автопоиск готовой статики в соседней папке `../www` (структура `app/` + `www/`);
// 3) лёгкий прод-запуск в `app/` без `App.js` и без вызова `expo export`:
//    раздаёт статику из `../www` и создаёт комнаты по WebSocket `/ws`.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as wsPkg from 'ws';

import {
  resolveListenPort,
  resolveListenHost,
  resolveDefaultDistDir,
  resolveDefaultAutoBuild,
  createManagedAppServer,
} from '../../server/start.js';
import { MESSAGE, PROTOCOL_VERSION } from '../../server/protocol.js';

const WebSocket = wsPkg.default || wsPkg.WebSocket || wsPkg;

describe('Патч 465: поддержка окружения NetAngels (APP_IP, APP_PORT, ../www)', () => {
  it('resolveListenPort и resolveListenHost читают APP_PORT и APP_IP при отсутствии PORT и HOST', () => {
    expect(resolveListenPort({ APP_PORT: '58982' })).toBe(58982);
    expect(resolveListenPort({ PORT: '', APP_PORT: '58982' })).toBe(58982);
    expect(resolveListenPort({ PORT: '5000', APP_PORT: '58982' })).toBe(5000);
    expect(resolveListenPort({})).toBe(5000);

    expect(resolveListenHost({ APP_IP: '127.0.4.28' })).toBe('127.0.4.28');
    expect(resolveListenHost({ HOST: '0.0.0.0', APP_IP: '127.0.4.28' })).toBe('0.0.0.0');
    expect(resolveListenHost({})).toBe('0.0.0.0');
  });

  it('лёгкий деплой в app/ без исходников раздаёт ../www и поднимает живой /ws без запуска сборщика', async () => {
    const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'na4u-465-'));
    const appDir = path.join(siteRoot, 'app');
    const wwwDir = path.join(siteRoot, 'www');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(path.join(wwwDir, '_expo/static/js/web'), { recursive: true });
    fs.writeFileSync(path.join(wwwDir, '_expo/static/js/web/index-abc.js'), 'console.log(1);\n');
    fs.writeFileSync(path.join(wwwDir, 'version.json'), JSON.stringify({ version: '465' }));
    fs.writeFileSync(
      path.join(wwwDir, 'index.html'),
      '<!DOCTYPE html><html><body>NA4U-READY<script src="/_expo/static/js/web/index-abc.js"></script></body></html>',
    );

    expect(resolveDefaultDistDir(appDir, {})).toBe(wwwDir);
    expect(resolveDefaultAutoBuild(appDir, wwwDir, { NODE_ENV: 'production' })).toBe(false);

    let exportCalled = 0;
    const srv = createManagedAppServer({
      port: 0,
      host: '127.0.0.1',
      rootDir: appDir,
      runExportBuild: async () => {
        exportCalled += 1;
      },
    });

    try {
      const { port } = await srv.start();
      expect(exportCalled).toBe(0);
      expect(srv.getBootStatus().version).toBe('465');

      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('NA4U-READY');

      // Проверяем создание комнаты по WebSocket /ws
      const created = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error('WS timeout'));
        }, 5000);
        ws.on('open', () => {
          ws.send(JSON.stringify({
            v: PROTOCOL_VERSION,
            type: MESSAGE.ROOM_CREATE,
            roomCode: null,
            clientId: 'gm-na4u-465',
            ts: Date.now(),
            payload: { name: 'NA4U Room', prefix: 'VT', requestId: 'r-465' },
          }));
        });
        ws.on('message', (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.payload?.requestId === 'r-465') {
            clearTimeout(timer);
            ws.close();
            resolve(msg);
          }
        });
        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      expect(created.type).toBe(MESSAGE.ROOM_CREATED);
      expect(created.roomCode).toMatch(/^VT-/);
    } finally {
      await srv.close();
      fs.rmSync(siteRoot, { recursive: true, force: true });
    }
  });
});
