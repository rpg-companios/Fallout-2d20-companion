// Регрессионные тесты патча 464:
// 1) восстановлен обновлённый портрет `modules/fallout/assets/origins/ghoul.png`
//    из коммита владельца `39bb5593205fb3cd18ac2147f70cc28c524e0bd1` (988 400 байт, PNG 2048x2732);
// 2) `apply-patch.sh` при переходе по отсечке не затирает файлы, изменённые или
//    добавленные владельцем в собственных коммитах поверх предыдущего патча, если
//    сама Arena эти файлы между версиями не меняла.

import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');

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

const gitBlobOid = (buf) => {
  const header = Buffer.from(`blob ${buf.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
};

describe('Патч 464: восстановление ghoul.png из 39bb559 и сохранение коммитов владельца в apply-patch.sh', () => {
  it('modules/fallout/assets/origins/ghoul.png соответствует коммиту 39bb559 (988 400 байт, PNG 2048x2732)', () => {
    const ghoulPath = path.join(ROOT, 'modules/fallout/assets/origins/ghoul.png');
    const buf = fs.readFileSync(ghoulPath);
    expect(buf.length).toBe(988400);
    expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(buf.readUInt32BE(16)).toBe(2048);
    expect(buf.readUInt32BE(20)).toBe(2732);
    expect(gitBlobOid(buf)).toBe('73d60cf3a7678e5dc7a61f45118f120b28f62056');
  });

  it('apply-patch.sh при отсечке сохраняет закоммиченные владельцем ассеты и собственные файлы, обновляя только изменённые в Arena', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-464-'));
    const upstream = path.join(tmp, 'upstream');
    const client = path.join(tmp, 'client');

    try {
      fs.mkdirSync(path.join(upstream, 'public'), { recursive: true });
      fs.mkdirSync(path.join(upstream, 'patchs'), { recursive: true });
      fs.mkdirSync(path.join(upstream, 'modules/fallout/assets/origins'), { recursive: true });
      git(upstream, ['init', '-b', 'arena/c1c60b87-fallout-2d20-companion']);

      fs.copyFileSync(path.join(ROOT, 'apply-patch.sh'), path.join(upstream, 'apply-patch.sh'));
      fs.writeFileSync(path.join(upstream, 'modules/fallout/assets/origins/survivor.png'), 'arena-survivor-v1');
      fs.writeFileSync(path.join(upstream, 'modules/fallout/assets/origins/ghoul.png'), 'arena-ghoul-old');
      fs.writeFileSync(path.join(upstream, 'obsolete-by-arena.txt'), 'remove-me-in-464\n');
      fs.writeFileSync(
        path.join(upstream, 'public/version.json'),
        JSON.stringify({ version: '463', release: 4, notes: { 'ru-RU': ['463'], 'en-EN': ['463'] } }, null, 2),
      );
      fs.writeFileSync(path.join(upstream, 'patchs/baseline.json'), JSON.stringify({ baseline: '463' }, null, 2));
      fs.writeFileSync(path.join(upstream, 'patchs/463-prev.patch'), '# 463\n');
      git(upstream, ['add', '-A']);
      git(upstream, ['commit', '-m', 'Patch 463']);
      const sha463 = git(upstream, ['rev-parse', 'HEAD']).trim();

      // В Arena выходит патч 464: обновляет ghoul.png и удаляет obsolete-by-arena.txt, но НЕ трогает survivor.png
      fs.writeFileSync(path.join(upstream, 'modules/fallout/assets/origins/ghoul.png'), 'arena-ghoul-new-464');
      git(upstream, ['rm', '-f', 'obsolete-by-arena.txt']);
      fs.writeFileSync(
        path.join(upstream, 'public/version.json'),
        JSON.stringify({ version: '464', release: 4, notes: { 'ru-RU': ['464'], 'en-EN': ['464'] } }, null, 2),
      );
      fs.writeFileSync(path.join(upstream, 'patchs/baseline.json'), JSON.stringify({ baseline: '464' }, null, 2));
      git(upstream, ['add', '-A']);
      const diff464 = git(upstream, ['diff', '--cached']);
      fs.writeFileSync(path.join(upstream, 'patchs/464-next.patch'), diff464);
      git(upstream, ['add', '-A']);
      git(upstream, ['commit', '-m', 'Patch 464']);

      // Владелец на базе 463 закоммитил свой новый survivor.png и свой файл google-verify.html
      git(tmp, ['clone', '--quiet', upstream, client]);
      git(client, ['checkout', '--quiet', '-B', 'main', sha463]);
      fs.writeFileSync(path.join(client, 'modules/fallout/assets/origins/survivor.png'), 'OWNER-CUSTOM-SURVIVOR-PNG');
      fs.writeFileSync(path.join(client, 'public/google-verify.html'), 'google-site-verification');
      git(client, ['add', '-A']);
      git(client, ['commit', '-m', 'replace survivor avatar and add verification']);

      const out = execFileSync('bash', ['./apply-patch.sh', '464'], {
        cwd: client,
        encoding: 'utf8',
      });

      expect(out).toContain('✓ Установлен патч: №464 (версия 463 → 464)');
      // То, что Arena обновила в 464 — приехало
      expect(fs.readFileSync(path.join(client, 'modules/fallout/assets/origins/ghoul.png'), 'utf8')).toBe('arena-ghoul-new-464');
      // То, что Arena удалила в 464 — удалено
      expect(fs.existsSync(path.join(client, 'obsolete-by-arena.txt'))).toBe(false);
      // Собственные коммиты владельца на нетронутых Arena файлах — сохранены!
      expect(fs.readFileSync(path.join(client, 'modules/fallout/assets/origins/survivor.png'), 'utf8')).toBe('OWNER-CUSTOM-SURVIVOR-PNG');
      expect(fs.readFileSync(path.join(client, 'public/google-verify.html'), 'utf8')).toBe('google-site-verification');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
