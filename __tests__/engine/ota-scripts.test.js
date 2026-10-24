// Обёртки `testing-push.sh` / `product-push.sh`: каждая — свой канал.
//
// Проверяем дешёвую, но важную часть: скрипт нельзя попросить уйти в чужой
// канал. Всё остальное (сверка, сборка, отправка) живёт в ota-push.mjs и
// проверяется в ota-guard.test.js.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const runScript = (script, args = []) => {
  try {
    const stdout = execFileSync('bash', [path.join(ROOT, 'scripts', script), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return { code: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
};

describe('скрипты публикации', () => {
  it('помощь показывает оба сценария', () => {
    const { code, stdout } = runScript('testing-push.sh', ['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('./scripts/testing-push.sh');
    expect(stdout).toContain('./scripts/product-push.sh');
  });

  it('тестовый скрипт не пускает в продакшн', () => {
    const { code, stderr } = runScript('testing-push.sh', ['--channel', 'production']);
    expect(code).toBe(2);
    expect(stderr).toContain('product-push.sh');
  });

  it('публичный скрипт не пускает в тестовый канал', () => {
    const { code, stderr } = runScript('product-push.sh', ['--channel=preview']);
    expect(code).toBe(2);
    expect(stderr).toContain('testing-push.sh');
  });
});
