#!/usr/bin/env node
// scripts/build-terminal-words.mjs
//
// Генератор ДАННЫХ словаря мини-игры взлома терминалов.
//
// Источник слов — EOWL v1.1.2 (UKACD), фильтр узнаваемости — ESDB/SCOWL
// размера <=35 (об источниках и лицензиях см. scripts/terminal-words/LICENSES.md).
// Всё это лежит рядом в scripts/terminal-words/ и НЕ попадает в бандл
// приложения: в рантайм уходят только шесть маленьких JSON-файлов, по одному
// на длину слова (длина = сложность терминала + 4).
//
// Правила (обсуждены с владельцем):
//   - только РЕАЛЬНЫЕ слова: берём из EOWL; белый список — проверенные слова,
//     которых в UKACD нет (AFTERLIFE) или которые не прошли частотный фильтр
//     (FOOTS, OPTS, прежние 282 слова мини-игры). Генератор не умеет
//     «дорисовывать» слова: STOOF сюда попасть не может.
//   - доска строится из ПОХОЖИХ слов и настоящих анаграмм, а не из выдуманных
//     перестановок; точные анаграммы считаем и кладём в манифест как справку.
//   - ругань отсекается чёрным списком.
//   - формат результата — массив слов в верхнем регистре, отсортированный.
//
// Запуск:
//   node scripts/build-terminal-words.mjs          — перегенерировать
//   node scripts/build-terminal-words.mjs --check — сверить с диском (для теста)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const ROOT = path.resolve(HERE, '..');
const SRC_DIR = path.join(HERE, 'terminal-words');
export const OUT_DIR = 'server/terminalWords';
export const MANIFEST_FILE = `${OUT_DIR}/manifest.json`;

const CHECK = process.argv.includes('--check');
const pretty = (x) => `${JSON.stringify(x, null, 2)}\n`;

const readLines = (file) => fs.readFileSync(path.join(SRC_DIR, file), 'utf8').split(/\r?\n/);
const lowerWord = (s) => /^[a-z]+$/.test(s) ? s : null;

/** Собрать словарь: вернуть карту «относительный путь → содержимое файла». */
export function buildTerminalWords() {
  const cfg = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'filter.json'), 'utf8'));
  const { lengths, commonWordsFile, allowlist, blocklist } = cfg;
  const verifiedNonEowl = new Set((cfg.verifiedNonEowl || []).map((w) => w.toUpperCase()));
  const blocked = new Set(blocklist.map((w) => w.toUpperCase()));

  const eowl = new Set();
  for (const line of readLines('eowl-words.txt')) {
    const w = lowerWord(line.trim().toLowerCase());
    if (w) eowl.add(w);
  }
  if (eowl.size < 100000) throw new Error(`EOWL выглядит обрезанным: ${eowl.size} слов`);

  const common = new Set();
  for (const line of readLines(commonWordsFile)) {
    const w = lowerWord(line.trim().toLowerCase());
    if (w) common.add(w);
  }
  if (common.size < 10000) {
    throw new Error(`список ESDB/SCOWL выглядит обрезанным: ${common.size} слов`);
  }

  const outputs = new Map();
  const stats = {
    sourceEowlWords: eowl.size,
    commonWords: common.size,
    allowlist: allowlist.length,
    blocklist: blocklist.length,
    byLength: {},
  };

  for (const len of lengths) {
    const found = new Set();
    for (const w of eowl) {
      if (w.length !== len) continue;
      const up = w.toUpperCase();
      if (!common.has(w) || blocked.has(up)) continue;
      found.add(up);
    }
    const curated = [];
    for (const entry of allowlist) {
      const up = String(entry).toUpperCase();
      if (up.length !== len || blocked.has(up)) continue;
      curated.push(up);
      found.add(up);
    }

    const words = [...found].sort();
    for (const w of words) {
      if (!(new RegExp(`^[A-Z]{${len}}$`)).test(w)) {
        throw new Error(`мусорное слово в длине ${len}: ${JSON.stringify(w)}`);
      }
    }
    for (const w of curated) {
      if (!eowl.has(w.toLowerCase()) && !verifiedNonEowl.has(w)) {
        throw new Error(`белый список: «${w}» нет ни в EOWL, ни в verifiedNonEowl`);
      }
    }
    if (words.length < 150) throw new Error(`слишком мало слов длины ${len}: ${words.length}`);

    // Справка для дизайна: сколько настоящих анаграммных семей есть в файле.
    const families = new Map();
    for (const w of words) {
      const key = [...w].sort().join('');
      families.set(key, (families.get(key) || 0) + 1);
    }
    const multi = [...families.values()].filter((n) => n >= 2);
    stats.byLength[len] = {
      count: words.length,
      bytes: Buffer.byteLength(pretty(words), 'utf8'),
      curatedAdded: curated.filter((w) => !common.has(w.toLowerCase())).length,
      anagramFamilies: multi.length,
      maxAnagramFamily: Math.max(...multi, 1),
    };
    outputs.set(`${OUT_DIR}/words-${len}.json`, pretty(words));
  }

  const total = Object.values(stats.byLength).reduce((s, x) => s + x.count, 0);
  const manifest = {
    version: 1,
    description: 'Словарь мини-игры взлома: EOWL ∩ ESDB/SCOWL (size <= 35), один файл на длину слова.',
    wordLengths: lengths,
    totalWords: total,
    byLength: Object.fromEntries(lengths.map((l) => [l, stats.byLength[l].count])),
    sources: {
      words: 'scripts/terminal-words/eowl-words.txt (EOWL v1.1.2 / UKACD v1.6)',
      commonWordsFilter: 'scripts/terminal-words/scowl-common-35.txt (ESDB/SCOWL, size <= 35)',
      filter: 'scripts/terminal-words/filter.json',
    },
    license: 'scripts/terminal-words/LICENSES.md (уведомление UKACD включать при распространении)',
    format: 'массив слов в верхнем регистре, отсортирован по алфавиту',
    generatedBy: 'node scripts/build-terminal-words.mjs',
  };
  outputs.set(MANIFEST_FILE, pretty(manifest));
  return { outputs, stats, manifest };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// При импорте из теста модуль не должен ничего перезаписывать на диске.
const isMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try { return fs.realpathSync(entry) === fs.realpathSync(SELF); } catch { return false; }
})();

if (isMain) {
  const { outputs, stats } = buildTerminalWords();
  if (CHECK) {
    let bad = 0;
    for (const [rel, content] of outputs) {
      const file = path.join(ROOT, rel);
      const onDisk = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (onDisk !== content) {
        console.error(`--check: расходится: ${rel}`);
        bad += 1;
      }
    }
    if (bad) process.exit(1);
    console.log(`--check OK: ${outputs.size} файлов соответствуют источнику`);
  } else {
    for (const [rel, content] of outputs) {
      const file = path.join(ROOT, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    const total = Object.values(stats.byLength).reduce((sum, x) => sum + x.count, 0);
    console.log(`Записано файлов: ${outputs.size}; слов: ${total}`);
    for (const len of Object.keys(stats.byLength)) {
      const x = stats.byLength[len];
      console.log(
        `  ${len} букв: ${x.count} слов, ${(x.bytes / 1024).toFixed(1)} КБ, ` +
        `анаграммных семей ${x.anagramFamilies} (макс. ${x.maxAnagramFamily}), ` +
        `добавлено белым списком ${x.curatedAdded}`,
      );
    }
  }
}
