#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// esbuild — devDependency движка, а скрипт может лежать и в репозитории
// сеттинга (tools/), где node_modules нет вовсе. Поэтому пакет ищется от
// корня движка, а не от файла скрипта; отсутствие объясняется по-человечески,
// а не стектрейсом ERR_MODULE_NOT_FOUND.
const ESBUILD_MISSING = [
  'esbuild не установлен — без него нельзя собрать manifest.runtime.source.',
  'Поставьте зависимости движка (npm install) или укажите каталог со сборщиком',
  'через NODE_PATH=/path/to/node_modules.',
].join(' ');

const loadEsbuild = async (appRoot) => {
  const anchors = [
    path.join(appRoot, 'package.json'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'),
    path.join(process.cwd(), 'package.json'),
  ];
  for (const anchor of anchors) {
    if (!fs.existsSync(anchor)) continue;
    try {
      const resolved = createRequire(anchor).resolve('esbuild');
      const loaded = await import(pathToFileURL(resolved).href);
      return loaded.default ?? loaded;
    } catch {
      // пробуем следующий якорь: node_modules может лежать у движка, а не здесь
    }
  }
  throw new Error(ESBUILD_MISSING);
};

// Корень движка. По умолчанию — репозиторий, в котором лежит скрипт
// (совмещённый checkout: <root>/scripts/build-setting-runtime.mjs).
const defaultAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const parseArguments = (argv) => {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
};

const isWithin = (parent, target) => {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

const resolveRelativeFile = (basePath) => {
  const candidates = path.extname(basePath)
    ? [basePath]
    : [
      `${basePath}.js`, `${basePath}.jsx`, `${basePath}.ts`, `${basePath}.tsx`,
      `${basePath}.json`, `${basePath}.png`, `${basePath}.jpg`, `${basePath}.jpeg`,
      `${basePath}.webp`, `${basePath}.ttf`, `${basePath}.otf`,
      path.join(basePath, 'index.js'), path.join(basePath, 'index.jsx'),
      path.join(basePath, 'index.ts'), path.join(basePath, 'index.tsx'),
    ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? basePath;
};

const normalizePath = (value) => value.split(path.sep).join('/');
const stripSourceExtension = (value) => value.replace(/\.(?:js|jsx|ts|tsx|json)$/i, '');
const isAsset = (value) => /\.(?:png|jpe?g|webp|gif|ttf|otf)$/i.test(value);
const isSharedEngineModule = (relativePath) => (
  /^(?:src\/store|src\/saves|src\/debug|components\/alerts)(?:\/|$)/.test(relativePath)
  || /^components\/screens\/InventoryScreen\/(?:InventoryScreen|logic\/inventoryI18n|modals\/AddItemModal)(?:\.[^/]+)?$/.test(relativePath)
  || /^db\/(?:Database|catalogSource)(?:\.[^/]+)?$/.test(relativePath)
  || /^i18n\/(?:locale|equipmentCatalog)(?:\.[^/]+)?$/.test(relativePath)
  || /^domain\/(?:counters|craftingEngine|d20Checks|deepMerge|diceRollsLogic|effects|equipEquip|equipmentKits|equippedArmor|immunities|itemfitRules|levelBands|modsEquip|moduleLocale|numericModifier|origins|perks|protectionKind|registry|resolveItem|sceneRiskChecks)(?:\.[^/]+)?$/.test(relativePath)
  || /^src\/engine\/(?:debug\/runtimeTrace|items\/weaponMods|settings\/activeSettingRuntime)(?:\.[^/]+)?$/.test(relativePath)
);

const run = async () => {
  const args = parseArguments(process.argv.slice(2));
  // В репозитории сеттинга исходников движка нет: путь передаётся
  // --engine (или POSITRONIUM_ENGINE), упаковщик делает это сам.
  const appRoot = path.resolve(args.engine ?? process.env.POSITRONIUM_ENGINE ?? defaultAppRoot);
  if (!fs.existsSync(path.join(appRoot, 'src', 'engine'))) {
    throw new Error(`engine root has no src/engine: ${appRoot}`);
  }
  const walletRoot = path.resolve(args.wallet ?? 'modules/fallout');
  const sourceRelativePath = args.source;
  const outputPath = path.resolve(args.output ?? 'runtime/setting.cjs');
  if (!sourceRelativePath) throw new Error('--source is required');
  if (path.isAbsolute(sourceRelativePath) || sourceRelativePath.split(/[\\/]/).some((part) => part === '..')) {
    throw new Error('--source must be a safe relative path within the setting wallet');
  }

  const sourcePath = path.resolve(walletRoot, sourceRelativePath);
  if (!isWithin(walletRoot, sourcePath) || !fs.statSync(sourcePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`setting runtime source not found: ${sourcePath}`);
  }

  const esbuild = await loadEsbuild(appRoot);
  const result = await esbuild.build({
    absWorkingDir: appRoot,
    entryPoints: [sourcePath],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'cjs',
    target: 'es2020',
    packages: 'external',
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.tsx': 'tsx' },
    plugins: [{
      name: 'setting-runtime-host-boundary',
      setup(build) {
        build.onResolve({ filter: /^\.\.?\// }, (resolveArgs) => {
          const resolvedPath = resolveRelativeFile(path.resolve(resolveArgs.resolveDir, resolveArgs.path));
          if (!path.isAbsolute(resolvedPath)) return undefined;
          const inWallet = isWithin(walletRoot, resolvedPath);
          const inApp = isWithin(appRoot, resolvedPath);
          if (!inWallet && !inApp) {
            return { errors: [{ text: `setting import escapes wallet and app roots: ${resolveArgs.path}` }] };
          }

          if (isAsset(resolvedPath)) {
            if (inWallet) {
              return {
                path: `setting-asset:${normalizePath(path.relative(walletRoot, resolvedPath))}`,
                external: true,
              };
            }
            return {
              path: `engine-asset:${normalizePath(path.relative(appRoot, resolvedPath))}`,
              external: true,
            };
          }

          const appRelativePath = normalizePath(path.relative(appRoot, resolvedPath));
          if (!inWallet && isSharedEngineModule(appRelativePath)) {
            return { path: `engine:${stripSourceExtension(appRelativePath)}`, external: true };
          }

          return undefined;
        });
      },
    }],
    logLevel: 'silent',
  });

  const output = result.outputFiles[0]?.contents;
  if (!output || output.byteLength === 0) throw new Error('esbuild produced an empty setting runtime bundle');

  const externalImports = Object.values(result.metafile.outputs)
    .flatMap((entry) => entry.imports)
    .filter((entry) => entry.external)
    .map((entry) => entry.path);
  const hostModuleIds = new Set(
    [...fs.readFileSync(path.join(appRoot, 'src/engine/settings/settingRuntimeHost.js'), 'utf8')
      .matchAll(/(['"])(engine:[^'"]+)\1\s*:/g)]
      .map((match) => match[2]),
  );
  const missingHostModules = [...new Set(externalImports)]
    .filter((moduleId) => moduleId.startsWith('engine:') && !hostModuleIds.has(moduleId))
    .sort();
  if (missingHostModules.length > 0) {
    throw new Error(`engine imports missing from settingRuntimeHost.js: ${missingHostModules.join(', ')}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  process.stdout.write(JSON.stringify({
    output: outputPath,
    bytes: output.byteLength,
    externalImports: [...new Set(externalImports)].sort(),
  }) + '\n');
};

run().catch((error) => {
  process.stderr.write(`[build-setting-runtime] ${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
});
