const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: true,
  unstable_conditionNames: ['require', 'react-native', 'default'],
  blockList: [
    /\.local\/.*/,
    /\.kiro\/.*/,
  ],
};

config.watchFolders = (config.watchFolders || []).filter(
  (folder) => !folder.includes('/.local/') && !folder.includes('/.kiro/')
);

module.exports = config;
