// Сверка «что тестировали» и «что публикуем».
//
// Смысл двух каналов: сначала обновление видит только тестировщик, потом —
// все. Но между этими двумя нажатиями кто-то (и чаще всего сам автор) успевает
// поправить ещё пару строк. Тогда в продакшн уедет не то, что проверяли.
//
// Поэтому тестовая публикация записывает отпечаток исходников: коммит и, для
// каждого изменённого или нового файла, его хеш. Публикация в продакшн
// пересчитывает отпечаток и сравнивает. Не совпало — отказ с перечислением,
// какие именно файлы изменились, и подсказкой «сначала протестируй».
//
// Почему хеши файлов, а не `git diff`: пакеты сеттинга и экраны часто проверяют
// на незакоммиченном дереве, а git diff по этому репозиторию — больше мегабайта.
// Хеш каждого изменённого файла и дешевле, и точнее: видно, что поменялось.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Файл с отпечатком последней тестовой публикации (в .publish — он в .gitignore). */
export const TESTED_STATE_FILE = '.publish/ota/tested.json';
export const TESTED_STATE_VERSION = 1;

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const unquote = (value) => {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  // git экранирует не-ASCII как \320\277 в восьмеричной форме: для отпечатка
  // достаточно стабильного текста, расшифровывать в юникод не нужно.
  return value.slice(1, -1);
};

/**
 * Разобрать `git status --porcelain -uall` в список изменённых путей.
 * Сортировка обязательна: git не гарантирует порядок, а отпечаток должен
 * совпадать у одинакового дерева.
 */
export const parseStatus = (porcelain) => {
  const entries = [];
  for (const raw of String(porcelain ?? '').split('\n')) {
    const line = raw.trimEnd();
    if (line.length < 4) continue;
    const status = line.slice(0, 2).trim();
    // Переименование: «R  старый -> новый» — важен новый путь.
    const rest = line.slice(3);
    const arrow = rest.lastIndexOf(' -> ');
    const target = arrow === -1 ? rest : rest.slice(arrow + 4);
    entries.push({ status, path: unquote(target.trim()) });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
};

/**
 * Состояние исходников, из которых EAS соберёт бандл.
 *
 * @param {object} params
 * @param {string} params.commit              HEAD
 * @param {string} [params.statusPorcelain]  вывод `git status --porcelain -uall`
 * @param {Record<string, string>} [params.hashes]
 *   хеши содержимого по путям из status; для удалённого файла — 'missing'
 */
export const describeSourceState = ({ commit, statusPorcelain, hashes } = {}) => {
  if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit)) {
    throw new Error(`[ota-guard] некорректный коммит: ${String(commit)}`);
  }
  const map = hashes && typeof hashes === 'object' ? hashes : {};
  const files = parseStatus(statusPorcelain).map((entry) => ({
    path: entry.path,
    status: entry.status,
    sha256: String(map[entry.path] ?? ''),
  }));
  return { commit, files };
};

/** Отпечаток состояния: одинаковый отпечаток — одинаковый бандл. */
export const sourceFingerprint = (state) => {
  if (!state || typeof state !== 'object') throw new Error('[ota-guard] нет состояния исходников');
  return sha256(JSON.stringify([
    state.commit,
    (state.files ?? []).map((entry) => [entry.path, entry.status, entry.sha256]),
  ]));
};

/** Запись о тестовой публикации — то, что кладётся в файл. */
export const buildTestedRecord = ({
  channel, state, version, runtimeVersion, platform, environment, message, updateId, at,
}) => ({
  version: TESTED_STATE_VERSION,
  channel,
  commit: state.commit,
  fingerprint: sourceFingerprint(state),
  dirtyFiles: (state.files ?? []).length,
  // Список изменённых путей храним, чтобы отказ в продакшн мог сказать,
  // что именно изменилось после теста, а не «было 7 файлов, стало 7».
  changedPaths: (state.files ?? []).map((entry) => [entry.path, entry.sha256]),
  appVersion: String(version),
  runtimeVersion: String(runtimeVersion),
  platform,
  // Окружение EAS задаёт переменные сборки: то же самое окружение, что было
  // на тесте, обязано быть и в продакшне, иначе бандл отличается.
  environment: environment ?? null,
  message: String(message ?? ''),
  updateId: updateId ?? null,
  at: at ?? new Date().toISOString(),
});

const versionParts = (value) => String(value ?? '').split('.').map((part) => Number(part) || 0);

const sameVersion = (left, right) => {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return false;
  }
  return true;
};

/** Пути, которые отличаются между записью о тесте и текущим деревом. */
export const changedPathsSinceTest = (tested, current) => {
  const before = new Map(Array.isArray(tested?.changedPaths) ? tested.changedPaths : []);
  const after = new Map((current?.files ?? []).map((entry) => [entry.path, entry.sha256]));
  const changed = new Set();
  for (const [file, hash] of after) {
    if (!before.has(file) || before.get(file) !== hash) changed.add(file);
  }
  for (const file of before.keys()) {
    if (!after.has(file)) changed.add(file);
  }
  return [...changed].sort();
};

/**
 * Можно ли публиковать в продакшн то, что сейчас в дереве.
 *
 * @returns {{ok: boolean, problems: Array<{code: string, params: object}>}}
 *   Коды: нет записи о тесте, другой коммит, другие правки, другая версия
 *   приложения (OTA не доедет), другое окружение EAS, другая платформа.
 */
export const compareTestedWithCurrent = ({ tested, current, platform } = {}) => {
  if (!tested || typeof tested !== 'object' || typeof tested.fingerprint !== 'string') {
    return { ok: false, problems: [{ code: 'no-tested-record', params: {} }] };
  }
  if (!current) {
    return { ok: false, problems: [{ code: 'no-current-state', params: {} }] };
  }

  const problems = [];
  if (tested.commit !== current.commit) {
    problems.push({ code: 'other-commit', params: { tested: tested.commit, current: current.commit } });
  } else if (tested.fingerprint !== sourceFingerprint(current)) {
    problems.push({
      code: 'other-changes',
      params: { paths: changedPathsSinceTest(tested, current) },
    });
  }

  // runtimeVersion привязан к expo.version: бандл, собранный под другую версию,
  // EAS не отдаст установленным APK — обновление просто не дойдёт.
  if (tested.runtimeVersion !== undefined && !sameVersion(tested.runtimeVersion, current.runtimeVersion)) {
    problems.push({
      code: 'other-runtime-version',
      params: { tested: String(tested.runtimeVersion), current: String(current.runtimeVersion) },
    });
  }

  if (tested.environment && current.environment && tested.environment !== current.environment) {
    problems.push({
      code: 'other-environment',
      params: { tested: String(tested.environment), current: String(current.environment) },
    });
  }

  if (platform && tested.platform && tested.platform !== platform) {
    problems.push({ code: 'other-platform', params: { tested: tested.platform, current: platform } });
  }

  return { ok: problems.length === 0, problems };
};

/** Прочитать запись о тесте. Битый файл = записи нет (а не «всё хорошо»). */
export const readTestedRecord = (root) => {
  const file = path.join(root, TESTED_STATE_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.fingerprint !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeTestedRecord = (root, record) => {
  const file = path.join(root, TESTED_STATE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
};

/** Прочитать хеши содержимого для списка путей (удалённый файл → 'missing'). */
export const hashWorkingFiles = (root, paths) => {
  const hashes = {};
  for (const relative of paths) {
    try {
      hashes[relative] = sha256(fs.readFileSync(path.join(root, relative)));
    } catch {
      hashes[relative] = 'missing';
    }
  }
  return hashes;
};
