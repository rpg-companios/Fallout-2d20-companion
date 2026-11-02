// ПРИЁМОЧНЫЙ (патч 493): цель установки равна самой отсечке, поэтому
// цепочка патчей не применяется вообще — дерево целиком приходит из коммита
// ключевого патча. Без синхронизации каталога patchs/ локальный
// baseline.json оставался бы от старой версии, а файл ключевого патча
// отсутствовал бы (и приёмка «отсечка == старший патч в patchs/» падала).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const BRANCH = 'arena/054e6676-fallout-2d20-companion';

const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });

const versionJson = (num) => JSON.stringify({
  version: String(num),
  release: 4,
  notes: { 'ru-RU': ['ok'], 'en-EN': ['ok'] },
}, null, 2);

describe('Патч 493: отсечка синхронизирует и сам каталог patchs/', () => {
  it('цель == ключевой патч: версия, baseline.json и файл патча приходят вместе', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-493-'));
    const upstream = path.join(tmp, 'upstream');
    const client = path.join(tmp, 'client');

    try {
      fs.mkdirSync(path.join(upstream, 'public'), { recursive: true });
      fs.mkdirSync(path.join(upstream, 'patchs'), { recursive: true });
      git(upstream, ['init', '-b', BRANCH]);
      fs.copyFileSync(path.join(ROOT, 'apply-patch.sh'), path.join(upstream, 'apply-patch.sh'));

      const commit = (num) => {
        fs.writeFileSync(path.join(upstream, 'public/version.json'), versionJson(num));
        fs.writeFileSync(
          path.join(upstream, 'patchs/baseline.json'),
          JSON.stringify({ baseline: String(num) }, null, 2),
        );
        fs.writeFileSync(path.join(upstream, 'feature.txt'), `v${num}\n`);
        fs.writeFileSync(path.join(upstream, `patchs/${num}-step.patch`), `# patch ${num}\n`);
        git(upstream, ['add', '-A']);
        git(upstream, ['commit', '-m', `Patch ${num}`]);
        return git(upstream, ['rev-parse', 'HEAD']).trim();
      };

      const sha492 = commit(492);
      commit(493);

      git(tmp, ['clone', '--quiet', upstream, client]);
      git(client, ['checkout', '--quiet', sha492]);
      expect(fs.readFileSync(path.join(client, 'patchs/baseline.json'), 'utf8')).toContain('"492"');

      const out = execFileSync('bash', ['./apply-patch.sh', '493'], {
        cwd: client,
        encoding: 'utf8',
      });
      expect(out).toContain('✓ Установлен патч: №493');
      expect(fs.readFileSync(path.join(client, 'public/version.json'), 'utf8')).toContain('"493"');
      expect(fs.readFileSync(path.join(client, 'feature.txt'), 'utf8')).toBe('v493\n');
      expect(fs.readFileSync(path.join(client, 'patchs/baseline.json'), 'utf8')).toContain('"493"');
      expect(fs.existsSync(path.join(client, 'patchs/493-step.patch'))).toBe(true);

      // Повторный запуск на уже установленной версии ничего не ломает.
      const rerun = execFileSync('bash', ['./apply-patch.sh', '493'], {
        cwd: client,
        encoding: 'utf8',
      });
      expect(rerun).toContain('✓ Патч №493 уже установлен.');
      expect(fs.readFileSync(path.join(client, 'patchs/baseline.json'), 'utf8')).toContain('"493"');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('в установщике есть явная синхронизация patchs/ при отсечке', () => {
    const code = fs.readFileSync(path.join(ROOT, 'apply-patch.sh'), 'utf8');
    expect(code).toContain('archive "$BASELINE_COMMIT" -- patchs');
    expect(code).toContain("':(exclude)patchs'");
  });
});
