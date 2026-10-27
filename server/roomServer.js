'use strict';

// server/roomServer.js
// Комнатный сервер Positronium: раздаёт статику dist/ и принимает WebSocket
// на /ws — релей комнат мастера поверх реестра roomRegistry. Протокол —
// server/protocol.js (конверт { v, type, roomCode, clientId, ts, payload },
// requestId в payload эхом возвращается в ответах create/join/error).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { PROTOCOL_VERSION, MESSAGE, ERROR_CODE, LIMITS } = require('./protocol');
const { createRoomRegistry } = require('./roomRegistry');
const { toCanonicalRoomCode } = require('./roomCode');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const serveStatic = (distDir) => (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400); res.end('Bad request'); return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const normalized = path.normalize(urlPath).replace(/^([/\\])+/, '');
  const filePath = path.join(distDir, normalized);
  if (!filePath.startsWith(distDir)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (!err) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
      return;
    }
    // SPA-фолбэк: «навигационные» пути без расширения ведут на index.html.
    if (!path.extname(urlPath)) {
      fs.readFile(path.join(distDir, 'index.html'), (fallbackErr, html) => {
        if (fallbackErr) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    res.writeHead(404); res.end('Not found');
  });
};

const attachRoomWebSocketServer = (httpServer, {
  registry = createRoomRegistry(),
} = {}) => {
  if (httpServer.__positroniumRoomWs) {
    return httpServer.__positroniumRoomWs;
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.MAX_MESSAGE_BYTES });

  const sendEnvelope = (ws, type, payload = {}, roomCode = null, clientId = null) => {
    if (ws.readyState !== ws.OPEN && ws.readyState !== 1) return;
    const envelope = {
      v: PROTOCOL_VERSION, type, roomCode, clientId, ts: Date.now(), payload,
    };
    try { ws.send(JSON.stringify(envelope)); } catch { /* сокол умер на записи — close доберёт */ }
  };

  const sendError = (ws, clientId, code, requestId = null, roomCode = null) => {
    sendEnvelope(ws, MESSAGE.ERROR, { code, requestId }, roomCode, clientId);
  };

  const broadcastMembers = (room, exceptClientId = null) => {
    const members = [...room.members.values()].map((member) => ({
      clientId: member.clientId, name: member.name, role: member.role,
    }));
    for (const member of room.members.values()) {
      if (member.clientId === exceptClientId || !member.ws) continue;
      sendEnvelope(member.ws, MESSAGE.ROOM_MEMBER, { members }, room.code, member.clientId);
    }
  };

  const broadcastToRoom = (room, exceptClientId, type, payload) => {
    for (const member of room.members.values()) {
      if (member.clientId === exceptClientId || !member.ws) continue;
      sendEnvelope(member.ws, type, payload, room.code, member.clientId);
    }
  };

  const handleUpgrade = (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      wss.emit('connection', ws, req);
    });
  };

  const isRoomWsUpgrade = (req) => {
    if (typeof req?.url !== 'string') return false;
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      return pathname === '/ws';
    } catch {
      const clean = req.url.split('?')[0];
      return clean === '/ws';
    }
  };

  // Node.js http.Server вызывает ветку upgrade ТОЛЬКО когда listenerCount('upgrade') > 0
  // (иначе запрос с заголовком Upgrade уходит в обычный request -> 404).
  // При этом в Metro (@expo/cli runServer-fork) штатный слушатель upgrade
  // вызывает socket.destroy() для всех путей кроме /hot. Поэтому:
  // 1) держим собственный слушатель 'upgrade', чтобы ветка upgrade всегда была активна;
  // 2) перехватываем emit('upgrade', ...) для /ws ДО сторонних слушателей Metro.
  const fallbackUpgradeListener = (_req, socket) => {
    if (httpServer.listenerCount('upgrade') <= 1) {
      socket?.destroy?.();
    }
  };
  httpServer.on('upgrade', fallbackUpgradeListener);

  const rawEmit = httpServer.emit.bind(httpServer);
  httpServer.emit = function emitWithRoomWs(event, req, socket, head, ...rest) {
    if (event === 'upgrade' && isRoomWsUpgrade(req)) {
      handleUpgrade(req, socket, head);
      return true;
    }
    return rawEmit(event, req, socket, head, ...rest);
  };

  wss.on('connection', (ws) => {
    // ws.meta = { clientId, rooms: Set<string> } — заполняется по мере join/create.
    ws.meta = { clientId: null, rooms: new Set() };
    ws.on('error', () => { /* защита процесса от битых/слишком крупных фреймов */ });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch {
        sendError(ws, ws.meta.clientId, ERROR_CODE.BAD_MESSAGE);
        return;
      }
      const { type, roomCode, clientId, payload = {} } = msg || {};
      if (!clientId || typeof type !== 'string') {
        sendError(ws, clientId || null, ERROR_CODE.BAD_MESSAGE, payload?.requestId || null);
        return;
      }
      ws.meta.clientId = clientId;

      switch (type) {
        case MESSAGE.PRESENCE_PING: {
          sendEnvelope(ws, MESSAGE.PRESENCE_PONG, {}, null, clientId);
          break;
        }

        case MESSAGE.ROOM_CREATE: {
          const requestedCode = payload.requestedCode ? toCanonicalRoomCode(payload.requestedCode) : null;
          if (payload.requestedCode && !requestedCode) {
            sendError(ws, clientId, ERROR_CODE.ROOM_CODE_TAKEN, payload.requestId);
            break;
          }
          const result = registry.createRoom({
            clientId,
            ip: ws.clientIp,
            prefix: payload.prefix,
            requestedCode,
            ownerToken: payload.ownerToken || null,
            name: payload.name,
          });
          if (result.error) {
            sendError(ws, clientId, result.error, payload.requestId);
            break;
          }
          ws.meta.rooms.add(result.room.code);
          sendEnvelope(ws, MESSAGE.ROOM_CREATED, {
            code: result.room.code,
            name: result.room.name,
            ownerToken: result.room.ownerToken,
            rebound: result.rebound,
            requestId: payload.requestId || null,
          }, result.room.code, clientId);
          break;
        }

        case MESSAGE.ROOM_JOIN: {
          const canonical = toCanonicalRoomCode(payload.code || roomCode || '');
          if (!canonical) {
            sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId);
            break;
          }
          const result = registry.joinRoom({
            code: canonical,
            clientId,
            ip: ws.clientIp,
            name: payload.name,
            role: payload.role,
            ws,
          });
          if (result.error) {
            sendError(ws, clientId, result.error, payload.requestId, canonical);
            break;
          }
          ws.meta.rooms.add(canonical);
          sendEnvelope(ws, MESSAGE.ROOM_STATE, { ...result.state, requestId: payload.requestId || null }, canonical, clientId);
          broadcastMembers(result.room, clientId);
          break;
        }

        case MESSAGE.ROOM_LEAVE: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          if (!canonical) break;
          const { room, left } = registry.leaveRoom({ code: canonical, clientId });
          ws.meta.rooms.delete(canonical);
          if (left && room) broadcastMembers(room, clientId);
          break;
        }

        case MESSAGE.CHAR_PUBLISH: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          const room = canonical && registry.getRoom(canonical);
          if (!room || !room.members.has(clientId)) {
            sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId, canonical);
            break;
          }
          const member = room.members.get(clientId);
          registry.putSnapshot({
            code: canonical,
            characterId: payload.characterId,
            revision: payload.revision,
            snapshot: payload.snapshot,
            fromClientId: clientId,
            fromName: member?.name,
          });
          broadcastToRoom(room, clientId, MESSAGE.CHAR_PUBLISH, {
            characterId: payload.characterId,
            revision: payload.revision,
            snapshot: payload.snapshot,
            fromClientId: clientId,
            fromName: member?.name,
            fromRole: member?.role,
          });
          break;
        }

        case MESSAGE.CHAR_FOCUS: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          const room = canonical && registry.getRoom(canonical);
          if (!room || !room.members.has(clientId)) break;
          broadcastToRoom(room, clientId, MESSAGE.CHAR_FOCUS, {
            characterId: payload.characterId,
            editing: Boolean(payload.editing),
            fromClientId: clientId,
            fromName: room.members.get(clientId)?.name,
          });
          break;
        }

        case MESSAGE.GM_DIRECTIVE: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          const room = canonical && registry.getRoom(canonical);
          if (!room) { sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId, canonical); break; }
          if (!registry.isOwner(canonical, clientId)) {
            sendError(ws, clientId, ERROR_CODE.NOT_ROOM_OWNER, payload.requestId, canonical);
            break;
          }
          broadcastToRoom(room, clientId, MESSAGE.GM_DIRECTIVE, {
            ...payload,
            fromClientId: clientId,
            fromName: room.members.get(clientId)?.name,
          });
          break;
        }

        default:
          sendError(ws, clientId, ERROR_CODE.UNKNOWN_TYPE, payload.requestId || null, roomCode || null);
      }
    });

    ws.on('close', () => {
      if (!ws.meta.clientId) return;
      for (const code of ws.meta.rooms) {
        const { room, left } = registry.leaveRoom({ code, clientId: ws.meta.clientId });
        if (left && room) broadcastMembers(room, ws.meta.clientId);
      }
      ws.meta.rooms.clear();
    });
  });

  const sweepTimer = setInterval(() => registry.sweep(), 5 * 60 * 1000);
  if (sweepTimer.unref) sweepTimer.unref();

  let closed = false;
  const closeWs = () => new Promise((resolve) => {
    if (closed) { resolve(); return; }
    closed = true;
    clearInterval(sweepTimer);
    for (const client of wss.clients) { try { client.terminate(); } catch { /* уже мёртв */ } }
    wss.close(() => resolve());
  });

  httpServer.once('close', () => { closeWs(); });

  const attached = { wss, registry, handleUpgrade, closeWs };
  Object.defineProperty(httpServer, '__positroniumRoomWs', {
    value: attached,
    configurable: true,
  });
  return attached;
};

const createRoomServer = ({
  port = 5000,
  host = '0.0.0.0',
  distDir = path.join(__dirname, '..', 'dist'),
  registry = createRoomRegistry(),
} = {}) => {
  const server = http.createServer(serveStatic(distDir));
  const { wss, closeWs } = attachRoomWebSocketServer(server, { registry });

  const start = () => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address()));
  });

  const close = () => new Promise((resolve) => {
    closeWs().then(() => server.close(() => resolve()));
    // server.close ждёт висящие keep-alive сокеты — у нас их нет (ws terminate).
  });

  return { server, wss, registry, start, close };
};

module.exports = { createRoomServer, attachRoomWebSocketServer };
