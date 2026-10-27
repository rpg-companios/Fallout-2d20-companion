const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const workspaceLocalDir = path.resolve(__dirname, '.local');
const workspaceKiroDir = path.resolve(__dirname, '.kiro');
const workspaceBackupDir = path.resolve(__dirname, '.install-backup');
const workspacePatchesDir = path.resolve(__dirname, 'patchs');
const workspaceDistDir = path.resolve(__dirname, 'dist');
const workspaceDocsDir = path.resolve(__dirname, 'docs');
const workspaceItemForgeDir = path.resolve(__dirname, 'item-forge');
const workspaceScreenshotsDir = path.resolve(__dirname, 'screenshots');
const workspaceExpoDir = path.resolve(__dirname, '.expo');

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
  // Блокируем только служебные и не-рантаймовые каталоги ВНУТРИ проекта
  // (.local, .kiro, .install-backup, patchs, dist, docs, item-forge, screenshots, .expo),
  // не затрагивая глобальное хранилище pnpm (/home/runner/.local/share/pnpm/...).
  blockList: [
    ...defaultBlockList,
    new RegExp(`^${escapeRegExp(workspaceLocalDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceKiroDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceBackupDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspacePatchesDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceDistDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceDocsDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceItemForgeDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceScreenshotsDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceExpoDir)}[/\\\\].*`),
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
    return (
      resolved !== workspaceLocalDir &&
      !resolved.startsWith(`${workspaceLocalDir}${path.sep}`) &&
      resolved !== workspaceKiroDir &&
      !resolved.startsWith(`${workspaceKiroDir}${path.sep}`)
    );
  }
);

module.exports = config;
