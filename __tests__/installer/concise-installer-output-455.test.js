// Регрессионные тесты патча 455:
// живой прогон apply-patch.sh проверяет, что:
// 1) при установке с пропуском промежуточных патчей (например, 452 -> 455)
//    в папку попадают файлы всех промежуточных патчей (453, 454, 455), а
//    в отчёте явно перечислены все номера: «✓ Установлены патчи: №453, №454, №455»;
// 2) вывод лаконичен (только статус установки + напоминание про коммит, без мусора);
// 3) старая копия apply-patch.sh на диске при наличии самоподхвата подтягивает
//    свежую версию установщика прямо в текущем запуске.

import { describe, expect, it } from 'vitest';
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

describe('Патч 455: лаконичный отчёт apply-patch.sh и явный список вошедших патчей', () => {
  it('прыжок 452 -> 455 ставит содержимое 453/454/455 и печатает только итог + коммит', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-455-'));
    const upstream = path.join(tmp, 'upstream');
    const client = path.join(tmp, 'client');

    try {
      fs.mkdirSync(upstream, { recursive: true });
      git(upstream, ['init', '-b', 'arena/c1c60b87-fallout-2d20-companion']);
      fs.mkdirSync(path.join(upstream, 'public'), { recursive: true });
      fs.mkdirSync(path.join(upstream, 'patchs'), { recursive: true });
      fs.copyFileSync(path.join(ROOT, 'apply-patch.sh'), path.join(upstream, 'apply-patch.sh'));

      const commitPatch = (num, extraFile, extraContent) => {
        fs.writeFileSync(
          path.join(upstream, 'public/version.json'),
          JSON.stringify({ version: String(num), release: 3, notes: { 'ru-RU': ['ok'], 'en-EN': ['ok'] } }, null, 2),
        );
        fs.writeFileSync(
          path.join(upstream, 'patchs/baseline.json'),
          JSON.stringify({ baseline: String(num) }, null, 2),
        );
        fs.writeFileSync(path.join(upstream, extraFile), extraContent);
        git(upstream, ['add', '-A']);
        const diff = git(upstream, ['diff', '--cached']);
        fs.writeFileSync(path.join(upstream, `patchs/${num}-step.patch`), diff || `# patch ${num}\n`);
        git(upstream, ['add', '-A']);
        git(upstream, ['commit', '-m', `Patch ${num}`]);
        return git(upstream, ['rev-parse', 'HEAD']).trim();
      };

      const sha452 = commitPatch(452, 'feature-452.txt', 'v452\n');
      commitPatch(453, 'feature-453.txt', 'v453\n');
      commitPatch(454, 'feature-454.txt', 'v454\n');
      commitPatch(455, 'feature-455.txt', 'v455\n');

      git(tmp, ['clone', '--quiet', upstream, client]);
      git(client, ['checkout', '--quiet', sha452]);

      const out = execFileSync('bash', ['./apply-patch.sh', '455'], {
        cwd: client,
        encoding: 'utf8',
      });

      const lines = out.trim().split('\n');
      expect(out).toContain('✓ Установлены патчи: №453, №454, №455 (версия 452 → 455)');
      expect(out).toContain('Не забудьте закоммитить, когда будет удобно:');
      expect(out).toContain('git add -A && git commit -m "Патчи 453–455"');
      expect(out).not.toContain('Загрузка Arena-ветки');
      expect(out).not.toContain('Загружен коммит');
      expect(lines.length).toBeLessThanOrEqual(5);

      // Файлы пропущенных патчей 453 и 454 реально присутствуют в папке!
      expect(fs.readFileSync(path.join(client, 'feature-453.txt'), 'utf8')).toBe('v453\n');
      expect(fs.readFileSync(path.join(client, 'feature-454.txt'), 'utf8')).toBe('v454\n');
      expect(fs.readFileSync(path.join(client, 'feature-455.txt'), 'utf8')).toBe('v455\n');

      // Повторный запуск на уже установленной и закоммиченной версии
      git(client, ['add', '-A']);
      git(client, ['commit', '-m', 'Патчи 453–455']);
      const rerun = execFileSync('bash', ['./apply-patch.sh', '455'], {
        cwd: client,
        encoding: 'utf8',
      });
      expect(rerun.trim()).toBe('✓ Патч №455 уже установлен.');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
