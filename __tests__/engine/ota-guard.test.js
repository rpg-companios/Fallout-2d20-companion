// Сверка «что тестировали» → «что публикуем».
//
// Правило владельца: сначала OTA уходит на тестовый канал, и только после
// проверки — всем. Эти тесты стерегут вторую половину правила: в продакшн не
// должно уезжать то, чего на тесте не было.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildTestedRecord,
  changedPathsSinceTest,
  compareTestedWithCurrent,
  describeSourceState,
  hashWorkingFiles,
  parseStatus,
  readTestedRecord,
  sourceFingerprint,
  writeTestedRecord,
} from '../../scripts/lib/ota-guard.mjs';

const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(40);

const stateOf = (files = {}, commit = COMMIT) => {
  const lines = Object.entries(files)
    .map(([file, hash]) => (hash === null ? ` M ${file}` : `?? ${file}`))
    .join('\n');
  const hashes = Object.fromEntries(
    Object.entries(files).map(([file, hash]) => [file, hash ?? 'missing']),
  );
  return describeSourceState({ commit, statusPorcelain: lines, hashes });
};

const recordOf = (state, overrides = {}) => buildTestedRecord({
  channel: 'preview',
  state,
  version: '1.0.1',
  runtimeVersion: '1.0.1',
  platform: 'android',
  message: 'проверка',
  at: '2026-10-24T00:00:00.000Z',
  ...overrides,
});

const codesOf = (result) => result.problems.map((problem) => problem.code);

describe('разбор git status', () => {
  it('читает изменённые, новые и переименованные файлы', () => {
    const entries = parseStatus([
      ' M App.js',
      '?? scripts/new.sh',
      'R  old/name.js -> new/name.js',
      'A  data/added.json',
    ].join('\n'));
    expect(entries).toEqual([
      { status: 'M', path: 'App.js' },
      { status: 'A', path: 'data/added.json' },
      { status: 'R', path: 'new/name.js' },
      { status: '??', path: 'scripts/new.sh' },
    ]);
  });

  it('порядок вывода git не влияет на результат', () => {
    const left = parseStatus(' M a.js\n M b.js\n');
    const right = parseStatus(' M b.js\n M a.js\n');
    expect(left).toEqual(right);
  });
});

describe('отпечаток исходников', () => {
  it('чистое дерево на одном коммите — один отпечаток', () => {
    expect(sourceFingerprint(stateOf({}, COMMIT)))
      .toBe(sourceFingerprint(stateOf({}, COMMIT)));
  });

  it('правка меняет отпечаток', () => {
    expect(sourceFingerprint(stateOf({ 'App.js': 'h1' })))
      .not.toBe(sourceFingerprint(stateOf({ 'App.js': 'h2' })));
  });

  it('новый файл меняет отпечаток', () => {
    expect(sourceFingerprint(stateOf({ 'App.js': 'h1' })))
      .not.toBe(sourceFingerprint(stateOf({ 'App.js': 'h1', 'scripts/new.sh': 'h3' })));
  });

  it('нечитаемый коммит — ошибка, а не «совпало»', () => {
    expect(() => describeSourceState({ commit: 'не коммит' })).toThrow(/коммит/);
  });
});

describe('продакшн только после теста', () => {
  it('без записи о тесте — отказ', () => {
    const result = compareTestedWithCurrent({ tested: null, current: stateOf({}) });
    expect(result.ok).toBe(false);
    expect(codesOf(result)).toEqual(['no-tested-record']);
  });

  it('код совпадает с проверенным — можно', () => {
    const state = stateOf({ 'App.js': 'h1' });
    const result = compareTestedWithCurrent({ tested: recordOf(state), current: { ...state, runtimeVersion: '1.0.1' } });
    expect(result).toEqual({ ok: true, problems: [] });
  });

  it('правка после теста — отказ с именем файла', () => {
    const tested = recordOf(stateOf({ 'App.js': 'h1' }));
    const current = { ...stateOf({ 'App.js': 'h2' }), runtimeVersion: '1.0.1' };
    const result = compareTestedWithCurrent({ tested, current });
    expect(codesOf(result)).toEqual(['other-changes']);
    expect(result.problems[0].params.paths).toEqual(['App.js']);
  });

  it('правка затронула два файла — названы оба', () => {
    const tested = recordOf(stateOf({ 'App.js': 'h1', 'src/a.js': 'h2' }));
    const current = { ...stateOf({ 'App.js': 'h9', 'src/a.js': 'h8' }), runtimeVersion: '1.0.1' };
    expect(compareTestedWithCurrent({ tested, current }).problems[0].params.paths)
      .toEqual(['App.js', 'src/a.js']);
  });

  it('новый файл после теста тоже расхождение', () => {
    const tested = recordOf(stateOf({ 'App.js': 'h1' }));
    const current = { ...stateOf({ 'App.js': 'h1', 'src/b.js': 'h5' }), runtimeVersion: '1.0.1' };
    expect(compareTestedWithCurrent({ tested, current }).problems[0].params.paths)
      .toEqual(['src/b.js']);
  });

  it('исчезнувший файл — тоже расхождение', () => {
    const tested = recordOf(stateOf({ 'App.js': 'h1', 'src/c.js': 'h6' }));
    const current = { ...stateOf({ 'App.js': 'h1' }), runtimeVersion: '1.0.1' };
    expect(compareTestedWithCurrent({ tested, current }).problems[0].params.paths)
      .toEqual(['src/c.js']);
  });

  it('другой коммит — отказ даже при чистых деревьях', () => {
    const tested = recordOf(stateOf({}, COMMIT));
    const current = { ...stateOf({}, OTHER_COMMIT), runtimeVersion: '1.0.1' };
    const result = compareTestedWithCurrent({ tested, current });
    expect(codesOf(result)).toEqual(['other-commit']);
  });

  it('версия приложения изменилась — OTA не доедет, отказ', () => {
    const state = stateOf({ 'App.js': 'h1' });
    const tested = recordOf(state, { version: '1.0.1', runtimeVersion: '1.0.1' });
    const result = compareTestedWithCurrent({ tested, current: { ...state, runtimeVersion: '1.0.2' } });
    expect(codesOf(result)).toEqual(['other-runtime-version']);
  });

  it('другая платформа — отказ', () => {
    const state = stateOf({});
    const tested = recordOf(state, { platform: 'android' });
    const result = compareTestedWithCurrent({
      tested,
      current: { ...state, runtimeVersion: '1.0.1' },
      platform: 'ios',
    });
    expect(codesOf(result)).toEqual(['other-platform']);
  });
});

describe('запись о тесте на диске', () => {
  const withRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ota-guard-'));

  it('пишется и читается', () => {
    const root = withRoot();
    const state = stateOf({ 'App.js': 'h1' });
    const record = recordOf(state);
    writeTestedRecord(root, record);
    expect(readTestedRecord(root)).toMatchObject({ commit: COMMIT, dirtyFiles: 1, platform: 'android' });
  });

  it('битый файл считается отсутствующим, а не «всё хорошо»', () => {
    const root = withRoot();
    writeTestedRecord(root, { anything: true });
    expect(readTestedRecord(root)).toBeNull();
    fs.writeFileSync(path.join(root, '.publish/ota/tested.json'), '{ broken');
    expect(readTestedRecord(root)).toBeNull();
  });

  it('нет файла — нет записи', () => {
    expect(readTestedRecord(withRoot())).toBeNull();
  });
});

describe('хеши рабочего дерева', () => {
  it('читает файлы и помечает исчезнувшие', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-files-'));
    fs.writeFileSync(path.join(root, 'a.js'), 'console.log(1);');
    const hashes = hashWorkingFiles(root, ['a.js', 'gone.js']);
    expect(hashes['a.js']).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes['gone.js']).toBe('missing');
  });

  it('одинаковое содержимое — одинаковый хеш', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-files-'));
    fs.writeFileSync(path.join(root, 'a.js'), 'x');
    fs.writeFileSync(path.join(root, 'b.js'), 'x');
    const hashes = hashWorkingFiles(root, ['a.js', 'b.js']);
    expect(hashes['a.js']).toBe(hashes['b.js']);
  });
});

describe('что именно изменилось', () => {
  it('список путей сравнивается по содержимому, а не по числу файлов', () => {
    const tested = recordOf(stateOf({ 'App.js': 'h1', 'b.js': 'h2' }));
    const current = stateOf({ 'App.js': 'h1', 'b.js': 'h3' });
    expect(changedPathsSinceTest(tested, current)).toEqual(['b.js']);
  });
});
