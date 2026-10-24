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

import {
  APP_RELEASE_FILE,
  APP_RELEASE_SCHEMA_VERSION,
  ENGINE_AAB_ASSET,
  ENGINE_APK_ASSET,
  ENGINE_RELEASE_NOTES,
  buildAppReleaseIndex,
  engineReleaseTag,
  readEngineVersion,
  releaseNotesLines,
  renderAppReleaseIndex,
  renderReleaseBody,
} from './app-release.mjs';
import { parseHostModuleIds } from './host-modules.mjs';
import { parseReleaseNotes, readReleaseNotes as readReleaseNotesFile } from './release-notes.mjs';
import {
  RELEASE_INDEX_FILE,
  RELEASE_INDEX_SCHEMA_VERSION,
  buildReleaseIndex,
  isLegacyReleaseTag,
  releaseAssetUrls,
  releaseNotesFile,
  releaseTag,
} from './setting-release.mjs';
import {
  RELEASE_LEVELS,
  SEMVER_RE,
  bumpVersion,
  compareSemver,
  isSemanticVersion,
  nextReleaseVersion,
  parseSemver,
} from './semver.mjs';

// Общее с репозиторием движка: релиз выпускается там же, где собирается APK
// (scripts/release.mjs), и правила про версию/заметки/index обязаны совпадать.
// Реэкспорт сохраняет прежние импорты из repository-plan.mjs.
export {
  APP_RELEASE_FILE,
  APP_RELEASE_SCHEMA_VERSION,
  ENGINE_AAB_ASSET,
  ENGINE_APK_ASSET,
  ENGINE_RELEASE_NOTES,
  RELEASE_INDEX_FILE,
  RELEASE_INDEX_SCHEMA_VERSION,
  RELEASE_LEVELS,
  SEMVER_RE,
  buildAppReleaseIndex,
  buildReleaseIndex,
  bumpVersion,
  compareSemver,
  engineReleaseTag,
  isLegacyReleaseTag,
  isSemanticVersion,
  nextReleaseVersion,
  parseReleaseNotes,
  parseSemver,
  readEngineVersion,
  releaseAssetUrls,
  releaseNotesFile,
  releaseNotesLines,
  releaseTag,
  renderAppReleaseIndex,
  renderReleaseBody,
};




export const TOOLS_DIR = 'tools';

/** Верхняя секция заметок из рабочего дерева (null, если файла нет). */
export const readReleaseNotes = (root, settingId) => (
  readReleaseNotesFile(root, `release-notes/${settingId}.md`)
);

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

// Инструменты сборки сеттинга и генераторы данных Fallout: они нужны в
// совмещённом репозитории и в репозитории сеттинга, но не в движке. Там
// остаются только то, что собирает приложение, и сценарий релиза.
const ENGINE_ONLY_SETTING_TOOLS = [
  'scripts/pack-setting.py',
  'scripts/unpack-setting.py',
  'scripts/build-setting-runtime.mjs',
  'scripts/setting-status.py',
  'scripts/split-i18n-setting.py',
  'scripts/build-crafting-data.mjs',
  'scripts/build-scrap-data.mjs',
  'scripts/scrap-source.json',
  'scripts/validate-robot-data.mjs',
  'scripts/migrate-bodyplans.mjs',
  'scripts/migrate-robot-limbs.mjs',
];

// Справочники и скриншоты по сеттингу тоже не часть движка.
const ENGINE_ONLY_SETTING_DOCS = [
  'docs/reference-data/',
  'docs/agents/',
  'screenshots/',
  'tools/fix-double-json.js',
  'settings/pins.example.json',
];

const isEngineExcluded = (relative) => (
  ENGINE_ONLY_SETTING_TOOLS.includes(relative)
  || ENGINE_ONLY_SETTING_DOCS.some((prefix) => (
    prefix.endsWith('/') ? relative.startsWith(prefix) : relative === prefix
  ))
);

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

/**
 * Файлы для репозитория движка: всё, кроме сеттингов и служебных каталогов.
 *
 * app-release.json сюда не входит осознанно: его пишет только публикация
 * релиза (версия + размер и sha256 APK), а обычный push должен сохранять
 * то, что уже лежит в репозитории, — иначе индекс обновлений откатится.
 */
export const planEngineFiles = (root) => listRepositoryFiles(root, { exclude: ENGINE_ONLY_EXCLUDES })
  .filter((relative) => !isEngineExcluded(relative))
  .filter((relative) => !PUBLISH_ONLY_FILES.includes(relative))
  .filter((relative) => relative !== APP_RELEASE_FILE)
  .filter((relative) => (
    !relative.startsWith('release-notes/') || relative === ENGINE_RELEASE_NOTES
  ));

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
 * Манифест для целевого репозитория: версия не откатывается публикацией кода.
 *
 * Релиз поднимает номер в репозитории сеттинга (и коммитит его), а исходники
 * здесь могут остаться на старом. Публикация кода берёт номер оттуда, чтобы
 * push не превратил 1.0.1 обратно в 1.0.0.
 */
export const keepPublishedVersion = (incoming, published) => {
  if (!published || String(published.version) === String(incoming.version)) return incoming;
  const comparison = compareSemver(String(published.version), String(incoming.version));
  if (comparison === null || comparison <= 0) return incoming;
  return { ...incoming, version: published.version };
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
/**
 * Все id, которые движок отдаёт пакету: `engine:*` и обычные пакеты
 * (`react`, `react-native`, `zustand/react/shallow`, `@expo/vector-icons`,
 * `react/jsx-runtime`).
 *
 * Пакетные id нужны не для красоты: сборщик пакета проверяет, что бандл не
 * требует ничего лишнего. Пока в списке были только `engine:*`, требование
 * `react/jsx-runtime` проходило мимо проверки — и пакет падал на APK, где
 * такого модуля нет.
 */
export const hostModuleIds = (root) => {
  const file = path.join(root, 'src/engine/settings/settingRuntimeHost.js');
  if (!fs.existsSync(file)) return [];
  return [...new Set(parseHostModuleIds(fs.readFileSync(file, 'utf8')))].sort();
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
 * Сценарий релиза переезжает в репозиторий сеттинга: там собирается `.trpg`,
 * выпускается GitHub Release и пишется release.json. Скрипт универсальный —
 * он же релизит движок, — поэтому едут все его зависимости.
 */
export const SETTING_RELEASE_FILES = [
  'scripts/release.mjs',
  'scripts/release.sh',
  'scripts/lib/semver.mjs',
  'scripts/lib/release-notes.mjs',
  'scripts/lib/app-release.mjs',
  'scripts/lib/setting-release.mjs',
  'scripts/lib/git-sync.mjs',
];

export const planSettingReleaseFiles = (root) => SETTING_RELEASE_FILES
  .filter((relative) => fs.existsSync(path.join(root, relative)));

/**
 * Юридические файлы, которые остаются в корне репозитория сеттингов:
 * инструменты сборки — производные движка (AGPL-3.0), поэтому лицензия и
 * NOTICE обязаны ехать вместе с ними.
 */
export const SETTING_LEGAL_FILES = ['LICENSE', 'NOTICE'];

export const planSettingLegalFiles = (root) => SETTING_LEGAL_FILES
  .filter((name) => fs.existsSync(path.join(root, name)));

/**
 * Версии пакетов — семантические `MAJOR.MINOR.PATCH`.
 *
 * Старые релизы нумеровались целыми (`fallout-v1`): такая версия считается
 * до-семантической и не продолжает линию — первый семантический выпуск
 * получает номер из манифеста (1.0.0), а старый тег убирается публикацией.
 */








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
    'Заметки о релизах — `release-notes/<id>.md`: верхняя секция приезжает в текст',
    'GitHub Release вместе с новой версией пакета.',
    '',
    'Сборщик живёт в репозитории: `npm install --prefix tools` ставит esbuild',
    'в `tools/node_modules`. Checkout движка не нужен — кошелёк обращается к',
    'движку только через `engine:<id>`, эти модули отдаёт хост приложения.',
    'Список доступных модулей — `tools/host-modules.json` (обновляет публикация).',
    `Готовый пакет для игрока — файл \`.trpg\`, он публикуется в релизах этого репозитория (см. \`${RELEASE_INDEX_FILE}\`).`,
    '',
    '## Сборка и релиз',
    '',
    'Движок для сборки не нужен. Одна команда собирает пакеты, выпускает',
    'GitHub Release и обновляет `release.json`:',
    '',
    '```sh',
    './scripts/release.sh                 # шаг patch',
    './scripts/release.sh --bump minor   # 1.0.1 → 1.1.0',
    './scripts/release.sh --version 2.0.0',
    './scripts/release.sh --dry-run      # показать план',
    '```',
    '',
    'Только собрать пакет без релиза:',
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
    `Релизы и \`${RELEASE_INDEX_FILE}\` рождаются здесь, рядом с кошельком.`,
    '`./scripts/release.sh` поднимает версию в `manifest.json` (по умолчанию патч),',
    'берёт текст из верхней секции `release-notes/<id>.md`, собирает `.trpg`,',
    'создаёт GitHub Release `<id>-v<версия>` и коммитит индекс обновлений.',
    `Версия в верхней секции заметок должна совпадать с выпускаемой — иначе`,
    'релиз останавливается до сборки. Файл релиза называется одинаково от',
    'версии к версии, поэтому постоянная ссылка не ломается:',
    `\`https://github.com/${repository}/releases/latest/download/fallout.trpg\`.`,
    '',
    'Публикация кода из совмещённого репозитория (`publish-setting.sh`) приезжает',
    'сюда же, но `release.json` и версию в манифесте не откатывает: их меняет',
    'только релиз.',
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
