// __tests__/room/terminal-words.test.js
//
// Предохранитель словаря мини-игры взлома (подготовка к патчу баланса).
//
// Что охраняет:
//   1. шесть JSON-файлов побайтно совпадают с тем, что умеет генератор;
//   2. в словаре только реальные слова нужной длины, без дублей и без мусора
//      вроде STOOF; ругань отсеяна;
//   3. примеры владельца и прежние слова мини-игры не потерялись;
//   4. загрузчик по длине/сложности отдаёт ровно нужный файл;
//   5. manifest не врёт про счётчики.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTerminalWords, OUT_DIR, MANIFEST_FILE } from '../../scripts/build-terminal-words.mjs';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const readRepo = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const loader = require(path.join(ROOT, 'server/terminalWords'));

const { outputs, manifest } = buildTerminalWords();
const LENGTHS = manifest.wordLengths;

const allWords = () => {
  const acc = new Set();
  for (const len of LENGTHS) {
    for (const word of JSON.parse(readRepo(`${OUT_DIR}/words-${len}.json`))) acc.add(word);
  }
  return acc;
};

describe('словарь терминалов: соответствие генератору', () => {
  it('все файлы на диске совпадают с генерацией', () => {
    const drift = [];
    for (const [rel, content] of outputs) {
      if (readRepo(rel) !== content) drift.push(rel);
    }
    expect(drift).toEqual([]);
  });

  it('manifest описывает ровно те же файлы и счётчики', () => {
    expect(MANIFEST_FILE).toBe(`${OUT_DIR}/manifest.json`);
    const onDisk = JSON.parse(readRepo(MANIFEST_FILE));
    expect(onDisk.byLength).toEqual(manifest.byLength);
    expect(onDisk.totalWords).toBe(
      LENGTHS.reduce((sum, len) => sum + JSON.parse(readRepo(`${OUT_DIR}/words-${len}.json`)).length, 0),
    );
    expect(onDisk.license).toContain('LICENSES.md');
  });
});

describe('словарь терминалов: инварианты', () => {
  it('шесть файлов, каждый — отсортированный массив слов своей длины', () => {
    expect(LENGTHS).toEqual([4, 5, 6, 7, 8, 9]);
    for (const len of LENGTHS) {
      const words = JSON.parse(readRepo(`${OUT_DIR}/words-${len}.json`));
      expect(Array.isArray(words)).toBe(true);
      expect(words.length).toBeGreaterThan(1000);
      expect(new Set(words).size).toBe(words.length);
      expect(words).toEqual([...words].sort());
      for (const word of words) {
        expect(word).toMatch(new RegExp(`^[A-Z]{${len}}$`));
      }
    }
  });

  it('только реальные слова: STOOF нет, примеры владельца есть', () => {
    const words = allWords();
    expect(words.has('STOOF')).toBe(false);
    expect(words.has('SHIT')).toBe(false);
    const expected = [
      'STEPS', 'DROPS', 'CROSS', 'SCORE', 'COURSE', 'FOOTS', 'BOOTS',
      'BOOST', 'STUFF', 'DICE', 'POST', 'SPOT', 'STOP', 'POTS', 'TOPS',
      'OPTS', 'AFTERLIFE',
    ];
    for (const word of expected) expect(words.has(word), `потеряно слово ${word}`).toBe(true);
  });

  it('прежние слова мини-игры сохранены для преемственности', () => {
    const words = allWords();
    for (const word of ['ORDINANCE', 'EDUCATION', 'GENERATOR', 'ABANDONED', 'DANGEROUS']) {
      expect(words.has(word)).toBe(true);
    }
  });

  it('на коротких словах есть настоящие анаграммные семьи', () => {
    const words4 = JSON.parse(readRepo(`${OUT_DIR}/words-4.json`));
    const families = new Map();
    for (const word of words4) {
      const key = [...word].sort().join('');
      families.set(key, (families.get(key) || 0) + 1);
    }
    const multi = [...families.values()].filter((n) => n >= 2);
    expect(multi.length).toBeGreaterThan(100);
    expect(Math.max(...multi)).toBeGreaterThanOrEqual(5);
    expect(['POST', 'SPOT', 'STOP', 'POTS', 'TOPS'].every((w) => words4.includes(w))).toBe(true);
  });
});

describe('словарь терминалов: ленивый загрузчик', () => {
  it('getWordsByLength отдаёт нужный файл и кеширует его', () => {
    for (const len of LENGTHS) {
      const expected = JSON.parse(readRepo(`${OUT_DIR}/words-${len}.json`));
      expect(loader.getWordsByLength(len)).toEqual(expected);
      expect(loader.getWordsByLength(String(len))).toBe(loader.getWordsByLength(len));
    }
  });

  it('сложность 0–5 → длина 4–9, вне диапазона — пусто', () => {
    for (let difficulty = 0; difficulty <= 5; difficulty += 1) {
      expect(loader.getWordsForDifficulty(difficulty))
        .toBe(loader.getWordsByLength(difficulty + 4));
    }
    expect(loader.getWordsForDifficulty(-3)).toBe(loader.getWordsByLength(4));
    expect(loader.getWordsForDifficulty(9)).toBe(loader.getWordsByLength(9));
    expect(loader.getWordsByLength(3)).toEqual([]);
    expect(loader.getWordsByLength(10)).toEqual([]);
  });
});
