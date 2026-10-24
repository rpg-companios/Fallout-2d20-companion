// Сборка рантайм-бандла сеттинга: JSX и проверка host-модулей.
//
// История: пакет Fallout собирался в репозитории сеттинга с автоматическим
// JSX и требовал `react/jsx-runtime`. В APK engine-v1.0.1 такого host-модуля
// нет — пакет ставился и не запускался («Не удалось запустить сеттинг»),
// причём APK ещё и прятал причину. Проверка ловила только `engine:*`.
//
// Теперь: `react/jsx-runtime` собирается внутрь пакета (шим над `react`),
// а проверяется каждый внешний импорт.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BUILDER = path.join(ROOT, 'scripts', 'build-setting-runtime.mjs');

const makeWallet = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setting-wallet-'));
  for (const [name, contents] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
};

const build = (wallet, { output = 'runtime/setting.cjs' } = {}) => {
  const outputPath = path.join(wallet, output);
  const stdout = execFileSync(process.execPath, [
    BUILDER,
    '--wallet', wallet,
    '--source', 'entry.js',
    '--output', outputPath,
    '--engine', ROOT,
  ], { encoding: 'utf8', cwd: wallet });
  return { outputPath, source: fs.readFileSync(outputPath, 'utf8'), report: JSON.parse(stdout.trim()) };
};

const hostModule = 'engine:domain/d20Checks';

describe('сборка рантайма: JSX не зависит от host-модуля', () => {
  const walletFiles = {
    'entry.js': [
      "import * as D20 from 'engine:domain/d20Checks';",
      'export default function createRuntime() {',
      '  return { id: "wallet", modules: D20, view: () => <div title="x" /> };',
      '}',
      '',
    ].join('\n'),
  };

  it('react/jsx-runtime собирается внутрь, а не запрашивается у хоста', () => {
    const wallet = makeWallet(walletFiles);
    const { source } = build(wallet);
    expect(source).not.toMatch(/require\(["']react\/jsx-runtime["']\)/);
    expect(source).not.toMatch(/require\(["']react\/jsx-dev-runtime["']\)/);
    // Шим опирается на `react` — он есть в карте host-модулей у любой сборки.
    expect(source).toMatch(/require\(["']react["']\)/);
  });

  it('host-модуль остаётся внешним', () => {
    const wallet = makeWallet(walletFiles);
    const { source, report } = build(wallet);
    expect(source).toMatch(new RegExp(`require\\(["']${hostModule}["']\\)`));
    expect(report.externalImports).toContain(hostModule);
  });

  it('tsconfig рядом с кошельком не меняет бандл', () => {
    // В совмещённом репозитории "jsx": "react" переключал трансформ на
    // классический, в репозитории сеттинга — нет. Один кошелёк давал разные
    // пакеты. Трансформ зафиксирован, поэтому обе сборки совпадают.
    // Имена временных каталогов попадают в комментарии-заголовки модулей —
    // сравниваем код, а не пути.
    const stripPaths = (source) => source.replace(/\/\/[^\n]*entry\.js/g, '// entry.js');
    const plain = stripPaths(build(makeWallet(walletFiles)).source);
    const withTsconfig = stripPaths(build(makeWallet({
      ...walletFiles,
      'tsconfig.json': '{"compilerOptions":{"jsx":"react","jsxFactory":"h"}}',
    })).source);
    expect(withTsconfig).toBe(plain);
    expect(withTsconfig).not.toMatch(/require\(["']react\/jsx-runtime["']\)/);
  });
});

describe('сборка рантайма: проверка host-модулей', () => {
  it('неизвестный engine-модуль останавливает сборку', () => {
    const wallet = makeWallet({
      'entry.js': "import * as Missing from 'engine:domain/noSuchModule';\nexport default () => ({ id: 'w', Missing });\n",
    });
    expect(() => build(wallet)).toThrow(/does not provide/);
  });

  it('пакетный модуль, которого нет у хоста, тоже останавливает сборку', () => {
    const wallet = makeWallet({
      'entry.js': "import leftPad from 'left-pad';\nexport default () => ({ id: 'w', leftPad });\n",
    });
    expect(() => build(wallet)).toThrow(/left-pad/);
  });

  it('свои ассеты проверку не ломают', () => {
    const wallet = makeWallet({
      'entry.js': "import icon from './assets/icon.png';\nexport default () => ({ id: 'w', icon });\n",
      'assets/icon.png': 'not really a png',
    });
    const { report } = build(wallet);
    expect(report.externalImports.some((id) => id.startsWith('setting-asset:'))).toBe(true);
  });
});
