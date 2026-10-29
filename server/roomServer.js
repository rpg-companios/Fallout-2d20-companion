'use strict';

// server/roomServer.js
// Комнатный сервер Positronium: раздаёт статику dist/ и принимает WebSocket
// на /ws — релей комнат мастера поверх реестра roomRegistry. Протокол —
// server/protocol.js (конверт { v, type, roomCode, clientId, ts, payload },
// requestId в payload эхом возвращается в ответах create/join/error).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { PROTOCOL_VERSION, MESSAGE, ERROR_CODE, LIMITS } = require('./protocol');
const { createRoomRegistry } = require('./roomRegistry');
const { toCanonicalRoomCode } = require('./roomCode');

// Совместимость ws@6/7 (экспортирует ws.Server, где ws.WebSocketServer === undefined,
// часто всплывает при старом node_modules на Windows из-за транзитивного ws@7 в Metro)
// и ws@8+ (экспортирует и ws.WebSocketServer, и ws.Server).
const resolveWebSocketServer = (wsPkg) => {
  if (!wsPkg) return null;
  const candidate =
    wsPkg.WebSocketServer ||
    wsPkg.Server ||
    wsPkg.default?.WebSocketServer ||
    wsPkg.default?.Server ||
    (typeof wsPkg === 'function' &&
    wsPkg.prototype &&
    typeof wsPkg.prototype.handleUpgrade === 'function'
      ? wsPkg
      : null);
  return typeof candidate === 'function' ? candidate : null;
};

let cachedWsServerCtor;
const loadDefaultWebSocketServer = () => {
  if (cachedWsServerCtor !== undefined) return cachedWsServerCtor;
  const searchPaths = [__dirname, path.resolve(__dirname, '..')];
  try {
    searchPaths.push(path.dirname(require.resolve('expo/package.json')));
  } catch {
    // expo может отсутствовать в минимальном окружении
  }
  for (const base of [null, ...searchPaths]) {
    try {
      const mod = base
        ? require(require.resolve('ws', { paths: [base] }))
        : require('ws');
      const ctor = resolveWebSocketServer(mod);
      if (ctor) {
        cachedWsServerCtor = ctor;
        return ctor;
      }
    } catch {
      // пробуем следующий путь резолва
    }
    try {
      const pkgJsonPath = base
        ? require.resolve('ws/package.json', { paths: [base] })
        : require.resolve('ws/package.json');
      const directIndex = require(path.join(path.dirname(pkgJsonPath), 'index.js'));
      const ctor = resolveWebSocketServer(directIndex);
      if (ctor) {
        cachedWsServerCtor = ctor;
        return ctor;
      }
    } catch {
      // пробуем следующий путь резолва
    }
  }
  cachedWsServerCtor = null;
  return null;
};

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

const IMMUTABLE_FONT_RE = /\.(ttf|woff2?|otf)$/i;
const IMMUTABLE_HASHED_RE = /[-.][0-9a-f]{20,}\.(js|css|png|jpg|jpeg|webp|gif|svg|ico|ttf|woff2?|otf)$/i;
const COMPRESSIBLE_EXT = new Set(['.js', '.css', '.html', '.json', '.svg', '.webmanifest', '.txt']);
const MAX_GZIP_CACHE_ENTRIES = 64;
const immutableGzipCache = new Map();

const acceptsGzip = (req) => {
  const header = req?.headers?.['accept-encoding'];
  return typeof header === 'string' && /\bgzip\b/i.test(header);
};

const sendStaticPayload = (req, res, { data, ext, policy, contentType, cacheKey }) => {
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': policy,
  };
  if (policy.startsWith('no-store')) {
    headers.Pragma = 'no-cache';
    headers.Expires = '0';
  }
  const compressible = COMPRESSIBLE_EXT.has(ext) && data.length >= 1024;
  if (compressible) {
    headers.Vary = 'Accept-Encoding';
  }
  if (!compressible || !acceptsGzip(req)) {
    res.writeHead(200, headers);
    res.end(data);
    return;
  }

  const isImmutable = policy.includes('immutable') && Boolean(cacheKey);
  if (isImmutable) {
    const cached = immutableGzipCache.get(cacheKey);
    if (cached) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      res.end(cached);
      return;
    }
  }

  zlib.gzip(data, { level: 6 }, (gzErr, compressed) => {
    if (gzErr || !compressed) {
      res.writeHead(200, headers);
      res.end(data);
      return;
    }
    if (isImmutable) {
      if (immutableGzipCache.size >= MAX_GZIP_CACHE_ENTRIES) {
        const oldest = immutableGzipCache.keys().next().value;
        if (oldest) immutableGzipCache.delete(oldest);
      }
      immutableGzipCache.set(cacheKey, compressed);
    }
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(compressed);
  });
};

const cacheControlForPath = (urlPath = '/', search = '') => {
  if (IMMUTABLE_FONT_RE.test(urlPath) || IMMUTABLE_HASHED_RE.test(urlPath)) {
    return 'public, max-age=31536000, immutable';
  }
  if (search && urlPath.startsWith('/assets/')) {
    try {
      const decoded = decodeURIComponent(search);
      if (/\.(ttf|woff2?|otf)(?:&|$)/i.test(decoded)) {
        return 'public, max-age=31536000, immutable';
      }
    } catch {
      // Некорректная строка запроса — отдаём без долгого кэширования.
    }
  }
  return 'no-store, no-cache, must-revalidate';
};

const attachSmartCacheHeaders = (httpServer) => {
  if (!httpServer || httpServer.__positroniumCacheHeaders) return;
  Object.defineProperty(httpServer, '__positroniumCacheHeaders', {
    value: true,
    configurable: true,
  });
  const register = typeof httpServer.prependListener === 'function'
    ? httpServer.prependListener.bind(httpServer)
    : httpServer.on.bind(httpServer);
  register('request', (req, res) => {
    const rawUrl = typeof req?.url === 'string' ? req.url : '/';
    const qIdx = rawUrl.indexOf('?');
    const pathname = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
    const search = qIdx >= 0 ? rawUrl.slice(qIdx) : '';
    const policy = cacheControlForPath(pathname, search);
    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function writeHeadWithCachePolicy(statusCode, ...rest) {
      if (statusCode === 200 && !res.headersSent) {
        res.setHeader('Cache-Control', policy);
        if (policy.startsWith('no-store')) {
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
      return origWriteHead(statusCode, ...rest);
    };
  });
};

const serveStatic = (distDir) => (req, res) => {
  let urlPath;
  const rawUrl = req.url || '/';
  const qIdx = rawUrl.indexOf('?');
  const rawSearch = qIdx >= 0 ? rawUrl.slice(qIdx) : '';
  try {
    urlPath = decodeURIComponent(qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl);
  } catch {
    res.writeHead(400); res.end('Bad request'); return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const normalized = path.normalize(urlPath).replace(/^([/\\])+/, '');
  const filePath = path.join(distDir, normalized);
  if (!filePath.startsWith(distDir)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (!err) {
      const ext = path.extname(filePath).toLowerCase();
      const policy = cacheControlForPath(urlPath, rawSearch);
      sendStaticPayload(req, res, {
        data,
        ext,
        policy,
        contentType: MIME[ext] || 'application/octet-stream',
        cacheKey: `${filePath}:${data.length}`,
      });
      return;
    }
    // SPA-фолбэк: «навигационные» пути без расширения ведут на index.html.
    if (!path.extname(urlPath)) {
      fs.readFile(path.join(distDir, 'index.html'), (fallbackErr, html) => {
        if (fallbackErr) { res.writeHead(404); res.end('Not found'); return; }
        sendStaticPayload(req, res, {
          data: html,
          ext: '.html',
          policy: 'no-store, no-cache, must-revalidate',
          contentType: MIME['.html'],
          cacheKey: null,
        });
      });
      return;
    }
    res.writeHead(404); res.end('Not found');
  });
};

const attachRoomWebSocketServer = (httpServer, {
  registry = createRoomRegistry(),
  WebSocketServerImpl,
  optional = false,
} = {}) => {
  if (!httpServer) return null;
  if (httpServer.__positroniumRoomWs) {
    return httpServer.__positroniumRoomWs;
  }

  const WsServer = WebSocketServerImpl !== undefined
    ? resolveWebSocketServer(WebSocketServerImpl) || (typeof WebSocketServerImpl === 'function' ? WebSocketServerImpl : null)
    : loadDefaultWebSocketServer();

  if (typeof WsServer !== 'function') {
    if (optional) return null;
    throw new Error('Пакет ws (WebSocketServer / ws.Server) не найден для комнатного сервера.');
  }

  const wss = new WsServer({ noServer: true, maxPayload: LIMITS.MAX_MESSAGE_BYTES });

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
          const { room, left, closedSession, closedReason } = registry.leaveRoom({ code: canonical, clientId });
          ws.meta.rooms.delete(canonical);
          if (left && room) {
            broadcastMembers(room, clientId);
            if (closedSession) {
              broadcastToRoom(room, clientId, MESSAGE.SESSION_STATE, {
                session: null,
                closedContainerId: closedSession.containerId || null,
                closedSession,
                closedReason: closedReason || null,
              });
            }
          }
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
          const isRemoved = Boolean(payload.removed || payload.snapshot === null);
          registry.putSnapshot({
            code: canonical,
            characterId: payload.characterId,
            revision: payload.revision,
            snapshot: isRemoved ? null : payload.snapshot,
            fromClientId: clientId,
            fromName: member?.name,
            removed: isRemoved,
          });
          broadcastToRoom(room, clientId, MESSAGE.CHAR_PUBLISH, {
            characterId: payload.characterId,
            revision: payload.revision,
            snapshot: isRemoved ? null : payload.snapshot,
            removed: isRemoved,
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

        case MESSAGE.SESSION_OPEN: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          if (!canonical) {
            sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId);
            break;
          }
          const result = registry.openSession({
            code: canonical,
            clientId,
            session: payload.session,
          });
          if (result.error) {
            sendError(ws, clientId, result.error, payload.requestId, canonical);
            break;
          }
          sendEnvelope(ws, MESSAGE.SESSION_STATE, {
            session: result.session,
            requestId: payload.requestId || null,
          }, canonical, clientId);
          broadcastToRoom(result.room, clientId, MESSAGE.SESSION_STATE, {
            session: result.session,
          });
          break;
        }

        case MESSAGE.SESSION_UPDATE_RATES: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          if (!canonical) {
            sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId);
            break;
          }
          const result = registry.updateSession({
            code: canonical,
            clientId,
            payload,
          });
          if (result.error) {
            sendError(ws, clientId, result.error, payload.requestId, canonical);
            break;
          }
          sendEnvelope(ws, MESSAGE.SESSION_STATE, {
            session: result.session,
            requestId: payload.requestId || null,
          }, canonical, clientId);
          broadcastToRoom(result.room, clientId, MESSAGE.SESSION_STATE, {
            session: result.session,
          });
          break;
        }

        case MESSAGE.SESSION_CLOSE: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          if (!canonical) {
            sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId);
            break;
          }
          const result = registry.closeSession({
            code: canonical,
            clientId,
            sessionId: payload.sessionId || null,
          });
          if (result.error) {
            sendError(ws, clientId, result.error, payload.requestId, canonical);
            break;
          }
          const closePayload = {
            session: result.session,
            closedContainerId: result.closedSession?.containerId || null,
            closedSession: result.closedSession || null,
          };
          sendEnvelope(ws, MESSAGE.SESSION_STATE, {
            ...closePayload,
            requestId: payload.requestId || null,
          }, canonical, clientId);
          broadcastToRoom(result.room, clientId, MESSAGE.SESSION_STATE, closePayload);
          break;
        }

        case MESSAGE.SESSION_PLAYER_CLOSE: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          if (!canonical) {
            sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId);
            break;
          }
          const result = registry.playerCloseSession({
            code: canonical,
            clientId,
            sessionId: payload.sessionId || null,
          });
          if (result.error) {
            sendError(ws, clientId, result.error, payload.requestId, canonical);
            break;
          }
          const closeMeta = result.closedSession
            ? {
                closedContainerId: result.closedSession.containerId || null,
                closedSession: result.closedSession,
                closedReason: result.closedReason || null,
              }
            : {};
          sendEnvelope(ws, MESSAGE.SESSION_STATE, {
            session: result.session,
            ...closeMeta,
            requestId: payload.requestId || null,
          }, canonical, clientId);
          broadcastToRoom(result.room, clientId, MESSAGE.SESSION_STATE, {
            session: result.session,
            ...closeMeta,
          });
          break;
        }

        case MESSAGE.SESSION_LOOT_TAKE: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          if (!canonical) {
            sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId);
            break;
          }
          const result = registry.lootTake({
            code: canonical,
            clientId,
            payload,
          });
          if (result.error) {
            sendEnvelope(ws, MESSAGE.ERROR, {
              code: result.error,
              requestId: payload.requestId || null,
              session: result.session || null,
            }, canonical, clientId);
            break;
          }
          const closeMeta = result.closedSession
            ? {
                closedContainerId: result.closedSession.containerId || null,
                closedSession: result.closedSession,
                closedReason: result.autoClosedReason || null,
              }
            : {};
          sendEnvelope(ws, MESSAGE.SESSION_LOOT_TAKE, {
            granted: result.granted,
            session: result.session,
            ...closeMeta,
            requestId: payload.requestId || null,
          }, canonical, clientId);
          broadcastToRoom(result.room, null, MESSAGE.SESSION_STATE, {
            session: result.session,
            ...closeMeta,
          });
          break;
        }

        case MESSAGE.SESSION_TRADE_COMMIT: {
          const canonical = toCanonicalRoomCode(roomCode || payload.code || '');
          if (!canonical) {
            sendError(ws, clientId, ERROR_CODE.ROOM_NOT_FOUND, payload.requestId);
            break;
          }
          const result = registry.tradeCommit({
            code: canonical,
            clientId,
            payload,
          });
          if (result.error) {
            sendEnvelope(ws, MESSAGE.ERROR, {
              code: result.error,
              merchantCaps: result.merchantCaps,
              owedCaps: result.owedCaps,
              session: result.session || null,
              requestId: payload.requestId || null,
            }, canonical, clientId);
            break;
          }
          sendEnvelope(ws, MESSAGE.SESSION_TRADE_COMMIT, {
            committed: result.committed,
            session: result.session,
            requestId: payload.requestId || null,
          }, canonical, clientId);
          broadcastToRoom(result.room, null, MESSAGE.SESSION_STATE, {
            session: result.session,
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
        const { room, left, closedSession, closedReason } = registry.leaveRoom({
          code,
          clientId: ws.meta.clientId,
        });
        if (left && room) {
          broadcastMembers(room, ws.meta.clientId);
          if (closedSession) {
            broadcastToRoom(room, ws.meta.clientId, MESSAGE.SESSION_STATE, {
              session: null,
              closedContainerId: closedSession.containerId || null,
              closedSession,
              closedReason: closedReason || null,
            });
          }
        }
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
  beforeStatic = null,
} = {}) => {
  const staticHandler = serveStatic(distDir);
  const requestHandler = typeof beforeStatic === 'function'
    ? (req, res) => {
        if (beforeStatic(req, res) === true) return;
        staticHandler(req, res);
      }
    : staticHandler;
  const server = http.createServer(requestHandler);
  const { wss, closeWs } = attachRoomWebSocketServer(server, { registry });

  const start = () => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address()));
  });

  const close = () => new Promise((resolve) => {
    closeWs().then(() => {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close(() => resolve());
    });
  });

  return { server, wss, registry, start, close };
};

module.exports = {
  createRoomServer,
  attachRoomWebSocketServer,
  attachSmartCacheHeaders,
  cacheControlForPath,
  resolveWebSocketServer,
};
