const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const workspaceLocalDir = path.resolve(__dirname, '.local');
const workspaceKiroDir = path.resolve(__dirname, '.kiro');
const workspaceBackupDir = path.resolve(__dirname, '.install-backup');

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
  // Блокируем только служебные каталоги ВНУТРИ проекта (.local, .kiro, .install-backup),
  // не затрагивая глобальное хранилище pnpm (/home/runner/.local/share/pnpm/...).
  blockList: [
    ...defaultBlockList,
    new RegExp(`^${escapeRegExp(workspaceLocalDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceKiroDir)}[/\\\\].*`),
    new RegExp(`^${escapeRegExp(workspaceBackupDir)}[/\\\\].*`),
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
