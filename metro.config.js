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
    if (typeof originalResolveRequest === 'function') {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
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
