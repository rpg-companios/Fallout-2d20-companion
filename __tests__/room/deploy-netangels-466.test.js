import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WsPkg = require('ws');
const WebSocket = WsPkg.WebSocket || WsPkg;

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEPLOY_SCRIPT = path.join(REPO_ROOT, 'deploy-netangels.sh');

const tempDirs = [];
const childProcs = [];

const makeTempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });

const httpGet = (host, port, reqPath) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: reqPath, timeout: 2500 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
  });

afterEach(async () => {
  while (childProcs.length > 0) {
    const proc = childProcs.pop();
    if (proc && proc.exitCode === null) {
      proc.kill('SIGTERM');
      await new Promise((r) => {
        const t = setTimeout(r, 1500);
        proc.once('exit', () => {
          clearTimeout(t);
          r();
        });
      });
    }
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup race
    }
  }
});

describe('Патч 466: deploy-netangels.sh — автоматическая сборка и деплой на na4u.ru', () => {
  it('скрипт существует, выводит справку --help и зарегистрирован в package.json', () => {
    expect(fs.existsSync(DEPLOY_SCRIPT)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['deploy:netangels']).toBe('bash ./deploy-netangels.sh');

    const res = spawnSync('bash', [DEPLOY_SCRIPT, '--help'], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('deploy-netangels.sh');
    expect(res.stdout).toContain('positronium-engine.na4u.ru');
  });

  it('отклоняет сайт со статическим типом (html) с понятной подсказкой про Node.js', () => {
    const sandbox = makeTempDir('na4u-html-466-');
    const siteDir = path.join(sandbox, 'positronium-engine.na4u.ru');
    fs.mkdirSync(path.join(siteDir, 'etc', 'environment'), { recursive: true });
    fs.mkdirSync(path.join(siteDir, 'app'), { recursive: true });
    fs.mkdirSync(path.join(siteDir, 'www'), { recursive: true });
    fs.writeFileSync(path.join(siteDir, 'etc', 'environment', 'PROMPT_SUFFIX'), '(html)\n');

    const res = spawnSync('bash', [DEPLOY_SCRIPT, '--site', siteDir, '--skip-pull', '--skip-build'], {
      encoding: 'utf8',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('Статический HTML');
    expect(res.stderr).toContain('Node.js');
  });

  it('раскладывает www/ и app/, сохраняет google*.html и .well-known, запускает app/hello.js и проходит живой healthcheck /ws', async () => {
    const sandbox = makeTempDir('na4u-deploy-466-');
    const siteDir = path.join(sandbox, 'positronium-engine.na4u.ru');
    const envDir = path.join(siteDir, 'etc', 'environment');
    const appDir = path.join(siteDir, 'app');
    const wwwDir = path.join(siteDir, 'www');
    const repoDir = path.join(siteDir, 'repo');

    const appPort = await getFreePort();
    const nodeBinDir = path.dirname(process.execPath);

    fs.mkdirSync(envDir, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(path.join(wwwDir, '.well-known', 'acme-challenge'), { recursive: true });
    fs.mkdirSync(path.join(siteDir, 'log', 'node-runlog'), { recursive: true });

    fs.writeFileSync(path.join(envDir, 'APP_IP'), '127.0.0.1\n');
    fs.writeFileSync(path.join(envDir, 'APP_PORT'), `${appPort}\n`);
    fs.writeFileSync(path.join(envDir, 'APP_PATH'), `${path.join(appDir, 'hello.js')}\n`);
    fs.writeFileSync(path.join(envDir, 'NODE_ENV'), 'production\n');
    fs.writeFileSync(path.join(envDir, 'PATH'), `${nodeBinDir}:/usr/bin:/bin\n`);
    fs.writeFileSync(path.join(envDir, 'PROMPT_SUFFIX'), '(node.js v22.21.1)\n');

    // Существующие проверочные файлы домена и устаревший мусор в www/, плюс дефолтный hello.js
    fs.writeFileSync(
      path.join(wwwDir, 'google62dc2ee2742f4b2d.html'),
      'google-site-verification: google62dc2ee2742f4b2d.html',
    );
    fs.writeFileSync(
      path.join(wwwDir, '.well-known', 'acme-challenge', 'ssl-token'),
      'acme-ok',
    );
    fs.writeFileSync(path.join(wwwDir, 'old-august-artifact.txt'), 'obsolete');
    fs.writeFileSync(path.join(appDir, 'hello.js'), '// default netangels stub\n');

    // Готовим облегчённую копию исходников в <сайт>/repo с готовым dist/
    fs.mkdirSync(path.join(repoDir, 'dist', '_expo', 'static', 'js', 'web'), { recursive: true });
    fs.mkdirSync(path.join(repoDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'App.js'), '// Positronium entry\n');
    fs.copyFileSync(path.join(REPO_ROOT, 'package.json'), path.join(repoDir, 'package.json'));
    fs.copyFileSync(DEPLOY_SCRIPT, path.join(repoDir, 'deploy-netangels.sh'));
    fs.cpSync(path.join(REPO_ROOT, 'server'), path.join(repoDir, 'server'), { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, 'node_modules', 'ws'), path.join(repoDir, 'node_modules', 'ws'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(repoDir, 'dist', 'index.html'),
      '<!doctype html><html><body>Positronium NetAngels 466</body></html>',
    );
    fs.writeFileSync(
      path.join(repoDir, 'dist', '_expo', 'static', 'js', 'web', 'index-466.js'),
      'console.log("positronium-466");',
    );
    fs.writeFileSync(
      path.join(repoDir, 'dist', 'version.json'),
      JSON.stringify({ version: '466', release: 4 }),
    );

    // 1. Первичная раскладка (сервер ещё не запущен супервизором -> --no-healthcheck)
    const firstDeploy = spawnSync(
      'bash',
      [path.join(repoDir, 'deploy-netangels.sh'), '--skip-pull', '--skip-build', '--no-healthcheck'],
      { cwd: repoDir, encoding: 'utf8' },
    );
    expect(firstDeploy.status).toBe(0);

    // Проверяем раскладку www/
    expect(fs.readFileSync(path.join(wwwDir, 'index.html'), 'utf8')).toContain('Positronium NetAngels 466');
    expect(fs.existsSync(path.join(wwwDir, '_expo', 'static', 'js', 'web', 'index-466.js'))).toBe(true);
    expect(fs.readFileSync(path.join(wwwDir, 'google62dc2ee2742f4b2d.html'), 'utf8')).toContain(
      'google62dc2ee2742f4b2d',
    );
    expect(fs.readFileSync(path.join(wwwDir, '.well-known', 'acme-challenge', 'ssl-token'), 'utf8')).toBe('acme-ok');
    expect(fs.existsSync(path.join(wwwDir, 'old-august-artifact.txt'))).toBe(false);

    // Проверяем раскладку app/ (тонкий рантайм без App.js)
    expect(fs.existsSync(path.join(appDir, 'App.js'))).toBe(false);
    expect(fs.existsSync(path.join(appDir, 'server', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'node_modules', 'ws', 'package.json'))).toBe(true);
    const appPkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    expect(appPkg.scripts.start).toBe('node server/index.js');
    expect(fs.readFileSync(path.join(appDir, 'hello.js'), 'utf8')).toContain("require('./server/index.js')");
    expect(fs.existsSync(path.join(siteDir, 'deploy-netangels.sh'))).toBe(true);
    expect(fs.existsSync(path.join(siteDir, 'reload'))).toBe(true);

    // 2. Имитируем запуск демона супервизором NetAngels по стандартному APP_PATH = .../app/hello.js
    const serverProc = spawn(process.execPath, [path.join(appDir, 'hello.js')], {
      cwd: appDir,
      env: {
        ...process.env,
        PORT: '',
        HOST: '',
        APP_IP: '127.0.0.1',
        APP_PORT: String(appPort),
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    childProcs.push(serverProc);

    // Дожидаемся поднятия сокета
    let statusBody = null;
    for (let i = 0; i < 25; i += 1) {
      try {
        const resp = await httpGet('127.0.0.1', appPort, '/__boot-status');
        if (resp.statusCode === 200) {
          statusBody = JSON.parse(resp.body);
          break;
        }
      } catch {
        // ещё поднимается
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(statusBody).toMatchObject({ state: 'ready', version: '466' });

    const googleResp = await httpGet('127.0.0.1', appPort, '/google62dc2ee2742f4b2d.html');
    expect(googleResp.statusCode).toBe(200);
    expect(googleResp.body).toContain('google62dc2ee2742f4b2d');

    // Проверяем живое создание комнаты Мастера по WebSocket /ws
    const createdRoom = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${appPort}/ws`);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('ROOM_CREATE timeout'));
      }, 3000);
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'room.create',
            clientId: 'gm-na4u-466',
            ts: Date.now(),
            payload: { name: 'Убежище 466', requestId: 'req-466' },
          }),
        );
      });
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'room.created') {
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
    expect(createdRoom.payload.code).toMatch(/^GM-[A-Z0-9]{6}$/);

    // 3. Повторный запуск прямо из корня сайта (~/positronium-engine.na4u.ru/deploy-netangels.sh)
    // с активным живым healthcheck против работающего APP_IP:APP_PORT!
    const secondDeploy = spawnSync(
      'bash',
      [path.join(siteDir, 'deploy-netangels.sh'), '--skip-pull', '--skip-build'],
      { cwd: siteDir, encoding: 'utf8' },
    );
    expect(secondDeploy.status).toBe(0);
    expect(secondDeploy.stdout).toContain('WebSocket /ws: OK');
  }, 25000);
});
