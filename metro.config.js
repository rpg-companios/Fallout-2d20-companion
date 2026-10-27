const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const workspaceExpoDir = path.resolve(__dirname, '.expo');

// Служебные и не-рантаймовые каталоги ВНУТРИ корня проекта, которые Metro не
// должен обходить ни в резолвере (blockList), ни в вотчере (watchFolders).
// Все пути привязаны строго к __dirname, чтобы не затрагивать глобальное
// хранилище pnpm (/home/runner/.local/share/pnpm/...).
const IGNORED_WORKSPACE_DIR_NAMES = [
  '.local',
  '.kiro',
  '.install-backup',
  '.installbackup',
  '.publish',
  '.agents',
  '.expo',
  'patchs',
  'dist',
  'docs',
  'item-forge',
  'screenshots',
  'сеттинги',
];
const ignoredWorkspaceDirs = IGNORED_WORKSPACE_DIR_NAMES.map((name) =>
  path.resolve(__dirname, name),
);

// Храним кэш трансформации Metro внутри .expo/metro-cache (в рабочей папке, а не
// в /tmp), чтобы при перезапуске контейнера Replit и после установки патчей
// пересобирались только изменённые файлы (секунды вместо минут).
try {
  const metroConfigEntry = require.resolve('expo/metro-config');
  const metroCachePath = require.resolve('metro-cache', { paths: [metroConfigEntry, __dirname] });
  const { FileStore } = require(metroCachePath);
  if (typeof FileStore === 'function') {
    config.cacheStores = [
      new FileStore({ root: path.join(workspaceExpoDir, 'metro-cache') }),
    ];
  }
} catch {
  // Если в нестандартной среде пакет metro-cache недоступен напрямую — остаётся дефолтный кэш.
}

const defaultBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
    ? [config.resolver.blockList]
    : [];

const originalResolveRequest = config.resolver.resolveRequest;
const fontObserverShimPath = path.resolve(__dirname, 'src/web/fontfaceobserverShim.ts');
const vectorIconsWebPath = path.resolve(__dirname, 'src/web/vectorIconsWeb.js');
const { attachRoomWebSocketServer, attachSmartCacheHeaders } = require('./server/roomServer');

config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: true,
  unstable_conditionNames: ['require', 'react-native', 'default'],
  blockList: [
    ...defaultBlockList,
    ...ignoredWorkspaceDirs.map(
      (dirPath) => new RegExp(`^${escapeRegExp(dirPath)}[/\\\\].*`),
    ),
  ],
  resolveRequest(context, moduleName, platform) {
    if (platform === 'web' && moduleName === 'fontfaceobserver') {
      return {
        type: 'sourceFile',
        filePath: fontObserverShimPath,
      };
    }
    if (
      platform === 'web' &&
      moduleName === '@expo/vector-icons' &&
      context.originModulePath !== vectorIconsWebPath
    ) {
      return {
        type: 'sourceFile',
        filePath: vectorIconsWebPath,
      };
    }
    if (typeof originalResolveRequest === 'function') {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// Подключаем WebSocket-релей комнат (/ws) прямо к HTTP(S)-серверу Metro,
// чтобы создание и вход в комнаты мастера работали и при запуске через
// `expo start --web` (например, в dev-режиме Replit), сразу с момента старта порта
// (даже если уже открытая вкладка переподключается по WebSocket без нового HTTP GET).
const http = require('node:http');
const https = require('node:https');

const interceptNextHttpServer = () => {
  const origHttpCreate = http.createServer;
  const origHttpsCreate = https.createServer;
  const restore = () => {
    http.createServer = origHttpCreate;
    https.createServer = origHttpsCreate;
  };
  http.createServer = function createMetroHttpWithRoomWs(...args) {
    restore();
    const srv = origHttpCreate.apply(this, args);
    attachRoomWebSocketServer(srv);
    attachSmartCacheHeaders(srv);
    return srv;
  };
  https.createServer = function createMetroHttpsWithRoomWs(...args) {
    restore();
    const srv = origHttpsCreate.apply(this, args);
    attachRoomWebSocketServer(srv);
    attachSmartCacheHeaders(srv);
    return srv;
  };
};

const prevEnhanceMiddleware = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware(metroMiddleware, metroServer) {
    interceptNextHttpServer();
    const baseMiddleware = typeof prevEnhanceMiddleware === 'function'
      ? prevEnhanceMiddleware(metroMiddleware, metroServer)
      : metroMiddleware;
    return (req, res, next) => {
      const httpServer = req?.socket?.server;
      if (httpServer && !httpServer.__positroniumRoomWs) {
        attachRoomWebSocketServer(httpServer);
      }
      if (httpServer && !httpServer.__positroniumCacheHeaders) {
        attachSmartCacheHeaders(httpServer);
      }
      return baseMiddleware(req, res, next);
    };
  },
};

config.watchFolders = (config.watchFolders || []).filter(
  (folder) => {
    const resolved = path.resolve(folder);
    return !ignoredWorkspaceDirs.some(
      (ignored) => resolved === ignored || resolved.startsWith(`${ignored}${path.sep}`),
    );
  }
);

module.exports = config;
