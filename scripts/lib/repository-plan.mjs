// Планирование публикации: какие файлы этого репозитория уезжают в
// репозиторий движка (`ttrpg-engine`) и какие — в репозиторий сеттингов
// (`positronium-game-settings`).
//
// Источник правды — этот checkout. Сначала правки здесь, затем
// scripts/publish-repositories.mjs собирает из них деревья/патчи целевых
// репозиториев. Правила отбора — чистые функции, поэтому проверяются
// тестами без git и без сети.

import fs from 'node:fs';
import path from 'node:path';

export const RELEASE_INDEX_FILE = 'release.json';
export const RELEASE_INDEX_SCHEMA_VERSION = 1;
export const TOOLS_DIR = 'tools';

// Служебные каталоги, которые не публикуются никуда.
const COMMON_IGNORED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', '.expo', 'dist', 'web-build',
  'coverage', '.publish', '.install-backup', '__pycache__',
]);

// Только в этом (совмещённом) репозитории: патчи владельца, сборки, локальные
// кошельки. В движок и сеттинг они не едут.
const COMBINED_ONLY = [
  'patchs', 'artifacts', 'сеттинги', 'output.txt',
  // Рабочие файлы этого чекаута и агентских инструментов — не часть движка.
  '.agents', '.kiro', '.replit', 'replit.md', 'apply-patch.sh',
];

// Только для движка: всё, что относится к сеттингу, уезжает в другой репозиторий.
// Тесты пока остаются в совмещённом репозитории: половина наборов проверяет
// механику сеттинга и требует папки modules/, а унаследованный долг диффа
// (docs/known-test-failures.md) сделал бы публичный движок красно-зелёным.
const ENGINE_ONLY_EXCLUDES = ['modules', '__tests__', 'src/store/__test-setup__'];

// Публикация — механизм совмещённого репозитория: в самом движке этим
// скриптам нечего делать (они собирают в том числе сам движок).
const PUBLISH_ONLY_FILES = [
  'scripts/publish-repositories.mjs',
  'scripts/publish-engine.sh',
  'scripts/publish-setting.sh',
  'scripts/lib/repository-plan.mjs',
  'docs/publishing.md',
  'settings/repositories.json',
];

const SETTING_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export const normalizePosix = (value) => value.split(path.sep).join('/');

// Готовые сборки и архивы — артефакты, а не исходники: в git целевых
// репозиториев они не едут (только через релизы).
const ARCHIVE_RE = /\.(?:zip|trpg|apk|aab|ipa|tgz|tar|gz)$/i;

const isIgnoredFile = (relativePath) => (
  relativePath === 'settings/pins.json'
  || relativePath === 'package-lock — копия.json'
  || relativePath.startsWith('.install-backup/')
  || ARCHIVE_RE.test(relativePath)
);

const toRelative = (root, target) => normalizePosix(path.relative(root, target));

/**
 * Все файлы дерева, кроме служебных каталогов. Возвращает отсортированный
 * список путей (posix, относительно корня).
 */
export const listRepositoryFiles = (root, { exclude = [] } = {}) => {
  const excluded = new Set([...COMBINED_ONLY, ...exclude]);
  const files = [];

  const walk = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = toRelative(root, absolute);
      const topLevel = relative.split('/')[0];
      if (COMMON_IGNORED_DIRS.has(entry.name) || excluded.has(topLevel)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        if (isIgnoredFile(relative)) continue;
        files.push(relative);
      }
    }
  };

  walk(root);
  return files.sort();
};

/** Файлы для репозитория движка: всё, кроме сеттингов и служебных каталогов. */
export const planEngineFiles = (root) => listRepositoryFiles(root, { exclude: ENGINE_ONLY_EXCLUDES })
  .filter((relative) => !PUBLISH_ONLY_FILES.includes(relative));

const assertWallet = (settingId, wallet) => {
  if (!SETTING_ID_RE.test(settingId)) {
    throw new Error(`[publish] invalid setting id: ${settingId}`);
  }
  if (!wallet || typeof wallet.path !== 'string' || !wallet.path) {
    throw new Error(`[publish] wallet "${settingId}" has no source path`);
  }
  if (!/^[A-Za-z0-9._-]+\.trpg$/.test(wallet.asset ?? '')) {
    throw new Error(`[publish] wallet "${settingId}" must declare an .trpg asset name`);
  }
};

/**
 * Файлы для репозитория сеттингов: каждая папка `modules/<id>` становится
 * папкой `<id>` в корне репозитория (папки под сеттинги — решение владельца).
 *
 * @returns {{wallets: Array<{id: string, sourceDir: string, files: string[]}>}}
 */
export const planSettingWallets = (root, wallets) => {
  const planned = [];
  for (const [settingId, wallet] of Object.entries(wallets ?? {})) {
    assertWallet(settingId, wallet);
    const sourceDir = path.resolve(root, wallet.path);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      throw new Error(`[publish] wallet directory not found: ${wallet.path}`);
    }
    const files = listRepositoryFiles(sourceDir);
    if (files.length === 0) {
      throw new Error(`[publish] wallet "${settingId}" is empty`);
    }
    planned.push({ id: settingId, sourceDir, files, asset: wallet.asset });
  }
  return planned;
};

/**
 * Список `engine:` модулей, которые отдаёт хост движка. Сборщик сеттинга
 * сверяет с ним внешние импорты бандла, поэтому файл живёт рядом с tools/:
 * в репозитории сеттинга исходников движка нет.
 */
export const hostModuleIds = (root) => {
  const file = path.join(root, 'src/engine/settings/settingRuntimeHost.js');
  if (!fs.existsSync(file)) return [];
  const source = fs.readFileSync(file, 'utf8');
  return [...new Set(
    [...source.matchAll(/(['"])(engine:[^'"]+)\1\s*:/g)].map((match) => match[2]),
  )].sort();
};

/** package.json для tools/: единственная зависимость — сборщик бандла. */
export const renderToolsPackageJson = ({ engineVersion } = {}) => `${JSON.stringify({
  name: 'positronium-setting-tools',
  private: true,
  description: 'Сборщик пакетов .trpg (checkout движка не требуется)',
  scripts: {
    build: 'python3 pack-setting.py fallout -o dist/fallout.trpg',
  },
  devDependencies: {
    esbuild: engineVersion ?? 'latest',
  },
}, null, 2)}\n`;

/** Инструменты упаковки переезжают в репозиторий сеттинга (папка tools/). */
export const SETTING_TOOL_SOURCES = [
  { from: 'scripts/pack-setting.py', to: `${TOOLS_DIR}/pack-setting.py` },
  { from: 'scripts/unpack-setting.py', to: `${TOOLS_DIR}/unpack-setting.py` },
  { from: 'scripts/build-setting-runtime.mjs', to: `${TOOLS_DIR}/build-setting-runtime.mjs` },
];

export const planSettingToolFiles = (root) => SETTING_TOOL_SOURCES
  .filter(({ from }) => fs.existsSync(path.join(root, from)))
  .map((tool) => ({ ...tool }));

/**
 * Юридические файлы, которые остаются в корне репозитория сеттингов:
 * инструменты сборки — производные движка (AGPL-3.0), поэтому лицензия и
 * NOTICE обязаны ехать вместе с ними.
 */
export const SETTING_LEGAL_FILES = ['LICENSE', 'NOTICE'];

export const planSettingLegalFiles = (root) => SETTING_LEGAL_FILES
  .filter((name) => fs.existsSync(path.join(root, name)));

/** Тег релиза одного кошелька: `<id>-v<version>` (например, fallout-v2). */
export const releaseTag = (settingId, version) => `${settingId}-v${version}`;

/** Адреса скачивания архива релиза. */
export const releaseAssetUrls = ({ repository, tag, asset }) => ({
  assetUrl: `https://github.com/${repository}/releases/download/${tag}/${asset}`,
  latestUrl: `https://github.com/${repository}/releases/latest/download/${asset}`,
});

/**
 * Содержимое release.json: по записи на каждый опубликованный кошелёк.
 * Клиент читает этот файл и решает, обновляться ли (src/engine/settings/
 * settingRelease.js).
 *
 * @param {object} params
 * @param {string} params.repository  owner/name
 * @param {Array<{id: string, manifest: object, asset: string, sha256: string,
 *                bytes: number}>} params.packages
 * @param {string} [params.generatedAt]
 */
export const buildReleaseIndex = ({ repository, packages, generatedAt }) => {
  const settings = {};
  for (const entry of packages) {
    const { id, manifest, asset, sha256, bytes } = entry;
    if (!SETTING_ID_RE.test(id)) throw new Error(`[publish] invalid setting id: ${id}`);
    const tag = releaseTag(id, manifest.version);
    const urls = releaseAssetUrls({ repository, tag, asset });
    settings[id] = {
      id,
      name: manifest.name ?? id,
      version: manifest.version,
      packFormat: manifest.packFormat ?? 1,
      requiresCore: manifest.requiresCore ?? '>=0',
      tag,
      asset,
      bytes,
      sha256,
      ...urls,
    };
  }
  return {
    schemaVersion: RELEASE_INDEX_SCHEMA_VERSION,
    generatedAt: generatedAt ?? new Date().toISOString(),
    repository,
    settings,
  };
};

/** README репозитория сеттингов: папки, сборка, релиз. */
export const renderSettingReadme = ({ repository, wallets, engineRepository }) => {
  const walletList = Object.entries(wallets ?? {})
    .map(([id, wallet]) => `- \`${id}/\` — кошелёк сеттинга (собран из \`${wallet.path}\`)`);
  return [
    '# Positronium game settings',
    '',
    'Кошельки сеттингов для движка Positronium. Папка = сеттинг.',
    '',
    ...walletList,
    '',
    'Каждый кошелёк содержит `manifest.json`, `runtimeEntry.js`, данные, переводы и экраны.',
    '',
    'Сборщик живёт в репозитории: `npm install --prefix tools` ставит esbuild',
    'в `tools/node_modules`. Checkout движка не нужен — кошелёк обращается к',
    'движку только через `engine:<id>`, эти модули отдаёт хост приложения.',
    'Список доступных модулей — `tools/host-modules.json` (обновляет публикация).',
    `Готовый пакет для игрока — файл \`.trpg\`, он публикуется в релизах этого репозитория (см. \`${RELEASE_INDEX_FILE}\`).`,
    '',
    '## Сборка пакета',
    '',
    'Движок для сборки не нужен:',
    '',
    '```sh',
    'npm install --prefix tools',
    'python3 tools/pack-setting.py fallout -o dist/fallout.trpg',
    '```',
    '',
    'Импорты `engine:<id>` остаются в бандле внешними; приложение отдаёт их',
    'из `src/engine/settings/settingRuntimeHost.js` во время работы. Если',
    'кошелёк запросит модуль, которого хост не объявляет, сборка остановится',
    'с ошибкой и списком недостающих id.',
    '',
    '## Лицензия',
    '',
    '`LICENSE` и `NOTICE` относятся к инструментам сборки (`tools/`) — они',
    'производные движка и распространяются под AGPL-3.0. Содержимое папок',
    'сеттингов наполняет сообщество: администраторы следят только за тем,',
    'чтобы в пакетах не было вредоносного кода, а не за лицензиями вкладов.',
    '',
    '## Релиз',
    '',
    `Релизы и \`${RELEASE_INDEX_FILE}\` собирает скрипт публикации из совмещённого репозитория;`,
    'вручную тег и файл не создаются, иначе клиенты не увидят обновление.',
    '',
  ].join('\n');
};

export const renderToolsReadme = () => [
  '# Инструменты упаковки',
  '',
  '`pack-setting.py` — собрать `.trpg` из папки кошелька.',
  '`unpack-setting.py` — проверить и распаковать `.trpg` в отдельную папку.',
  '`build-setting-runtime.mjs` — собрать CommonJS runtime-бандл, объявленный в манифесте.',
  '`host-modules.json` — какие `engine:` модули отдаёт хост движка (обновляет публикация).',
  '',
  'Сборка не требует checkout движка: кошелёк обращается к движку только через',
  '`engine:<id>`, эти импорты остаются внешними и их отдаёт приложение.',
  '',
  '```bash',
  'npm install --prefix tools      # ставит esbuild в tools/node_modules',
  'python3 tools/pack-setting.py fallout -o dist/fallout.trpg',
  'python3 tools/unpack-setting.py dist/fallout.trpg --dest /tmp/check --force',
  '```',
  '',
  'Скрипты не запускают код сеттинга: они только проверяют манифест и укладывают файлы.',
  '',
].join('\n');
