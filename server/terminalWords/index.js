// server/terminalWords/index.js
//
// Ленивый доступ к словарю мини-игры взлома.
//
// Один файл на длину слова: сложность терминала d задаёт длину d + 4, поэтому
// ещё до генерации доски известно, какой именно список нужен. require() внутри
// ветки — статический литерал, Metro видит его как зависимость, но выполняет
// только при первом обращении: в память попадает один файл ~15–30 КБ, а не все
// шесть и тем более не исходный EOWL на 1,1 МБ.
//
// Слова сгенерированы scripts/build-terminal-words.mjs, правила и источники —
// docs/terminal-words.md и scripts/terminal-words/LICENSES.md. Движок
// server/terminalHacking.js пока использует свой встроенный список; переключение
// на этот словарь — часть следующего патча баланса.

const manifest = require('./manifest.json');

const LOADERS = {
  4: () => require('./words-4.json'),
  5: () => require('./words-5.json'),
  6: () => require('./words-6.json'),
  7: () => require('./words-7.json'),
  8: () => require('./words-8.json'),
  9: () => require('./words-9.json'),
};

const cache = new Map();

/** Слова заданной длины (4–9). Возвращает общий массив, не мутировать. */
const getWordsByLength = (wordLength) => {
  const key = Number(wordLength);
  const load = LOADERS[key];
  if (!load) return [];
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key);
};

/** Слова для эффективной сложности терминала 0–5. */
const getWordsForDifficulty = (difficulty) => {
  const tier = Math.max(0, Math.min(5, Math.floor(Number(difficulty) || 0)));
  return getWordsByLength(tier + 4);
};

module.exports = {
  manifest,
  wordLengths: manifest.wordLengths,
  getWordsByLength,
  getWordsForDifficulty,
};
