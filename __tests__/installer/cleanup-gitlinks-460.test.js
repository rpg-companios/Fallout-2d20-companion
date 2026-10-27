// Регрессионные тесты патча 460:
// 1) неиспользуемые служебные папки и разовые артефакты (.publish, .kiro, .agents,
//    output.txt, fallout 2char.zip, positronium-boot.zip, run-avatar-tests.js,
//    screenshots/, __probe-fields.test.js, заглушки pwa-icon*.svg/placeholder.json)
//    удалены из дерева репозитория;
// 2) живой прогон apply-patch.sh со старой копии установщика (455–459, где shift
//    очищал "$@" перед exec) и с заполненным вложенным .publish/ttrpg-engine/.git
//    на диске отрабатывает с первого запуска (код 0) и вычищает .publish и .kiro.

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

describe('Патч 460: уборка неиспользуемых папок/файлов и безопасное удаление gitlink при обновлении', () => {
  it('неиспользуемые артефакты удалены из проекта, а рабочие папки сохранены', () => {
    const removedPaths = [
      '.publish',
      '.kiro',
      '.agents',
      'output.txt',
      'fallout 2char.zip',
      'positronium-boot.zip',
      'run-avatar-tests.js',
      'screenshots',
      '__tests__/equipment/__probe-fields.test.js',
      'public/pwa-icon.placeholder.json',
      'public/pwa-icon.svg',
      'public/pwa-icon-192.svg',
      'public/pwa-icon-512.svg',
    ];

    for (const rel of removedPaths) {
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} должен быть удалён`).toBe(false);
    }

    // Рабочие каталоги документации и переходный item-forge остаются на месте
    expect(fs.existsSync(path.join(ROOT, 'docs/agents/state.md'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'item-forge'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'public/pwa-icon-192.png'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'public/pwa-icon.png'))).toBe(true);
  });

  it('обновление со старого apply-patch.sh (459) чистит осиротевший gitlink .publish/*/.git и архивы с пробелами', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-460-'));
    const subRepo = path.join(tmp, 'sub-engine');
    const upstream = path.join(tmp, 'upstream');
    const client = path.join(tmp, 'client');

    try {
      // Временный вложенный репо для имитации осиротевшего 160000 gitlink без .gitmodules
      fs.mkdirSync(subRepo, { recursive: true });
      git(subRepo, ['init']);
      fs.writeFileSync(path.join(subRepo, 'engine.js'), 'export const x = 1;\n');
      git(subRepo, ['add', '-A']);
      git(subRepo, ['commit', '-m', 'init sub']);
      const subSha = git(subRepo, ['rev-parse', 'HEAD']).trim();

      fs.mkdirSync(upstream, { recursive: true });
      git(upstream, ['init', '-b', 'arena/c1c60b87-fallout-2d20-companion']);
      fs.mkdirSync(path.join(upstream, 'public'), { recursive: true });
      fs.mkdirSync(path.join(upstream, 'patchs'), { recursive: true });
      fs.mkdirSync(path.join(upstream, '.kiro/specs/old'), { recursive: true });

      // Эмулируем версию apply-patch.sh из 455–459 (со сдвигом $@ до exec и старым git rm -f)
      const currentInstaller = fs.readFileSync(path.join(ROOT, 'apply-patch.sh'), 'utf8');
      const legacy459Installer = currentInstaller
        .replace('ORIG_ARGS=("$@")\n', '')
        .replace(
          'if [[ "$MODE" != "status" && -z "$PATCH_ID" && "${APPLY_PATCH_BOOTSTRAPPED:-}" != "1" ]]; then',
          'if [[ "$MODE" != "status" && -z "$PATCH_ID" ]]; then',
        )
        .replace('exec bash "$FRESH_SELF" "${ORIG_ARGS[@]}"', 'exec bash "$FRESH_SELF" "$@"');

      fs.writeFileSync(path.join(upstream, 'apply-patch.sh'), legacy459Installer, { mode: 0o755 });
      fs.writeFileSync(path.join(upstream, '.kiro/specs/old/tasks.md'), '# old spec\n');
      fs.writeFileSync(path.join(upstream, 'fallout 2char.zip'), 'zip-bytes');
      fs.writeFileSync(
        path.join(upstream, 'public/version.json'),
        JSON.stringify({ version: '459', release: 3, notes: { 'ru-RU': ['459'], 'en-EN': ['459'] } }, null, 2),
      );
      fs.writeFileSync(
        path.join(upstream, 'patchs/baseline.json'),
        JSON.stringify({ baseline: '459' }, null, 2),
      );
      fs.writeFileSync(path.join(upstream, 'patchs/459-prev.patch'), '# 459\n');
      git(upstream, ['add', '-A']);
      // Регистрируем осиротевший gitlink 160000 без .gitmodules, как было в .publish/ttrpg-engine
      git(upstream, ['update-index', '--add', '--cacheinfo', `160000,${subSha},.publish/ttrpg-engine`]);
      git(upstream, ['commit', '-m', 'Patch 459']);
      const sha459 = git(upstream, ['rev-parse', 'HEAD']).trim();

      // Коммит 460 в upstream: новый apply-patch.sh и убранный мусор
      fs.copyFileSync(path.join(ROOT, 'apply-patch.sh'), path.join(upstream, 'apply-patch.sh'));
      git(upstream, ['rm', '-f', '--cached', '.publish/ttrpg-engine']);
      git(upstream, ['rm', '-rf', '.kiro', 'fallout 2char.zip']);
      fs.writeFileSync(
        path.join(upstream, 'public/version.json'),
        JSON.stringify({ version: '460', release: 3, notes: { 'ru-RU': ['460'], 'en-EN': ['460'] } }, null, 2),
      );
      fs.writeFileSync(
        path.join(upstream, 'patchs/baseline.json'),
        JSON.stringify({ baseline: '460' }, null, 2),
      );
      git(upstream, ['add', '-A']);
      const diff460 = git(upstream, ['diff', '--cached']);
      fs.writeFileSync(path.join(upstream, 'patchs/460-cleanup.patch'), diff460);
      git(upstream, ['add', '-A']);
      git(upstream, ['commit', '-m', 'Patch 460']);

      // Клонируем клиент на 459 и наполняем .publish/ttrpg-engine живым .git-репозиторием на диске
      git(tmp, ['clone', '--quiet', upstream, client]);
      git(client, ['checkout', '--quiet', sha459]);
      fs.mkdirSync(path.join(client, '.publish/ttrpg-engine/.git'), { recursive: true });
      fs.writeFileSync(path.join(client, '.publish/ttrpg-engine/.git/HEAD'), 'ref: refs/heads/main\n');
      fs.writeFileSync(path.join(client, '.publish/ttrpg-engine/dirty.txt'), 'untracked\n');

      const out = execFileSync('bash', ['./apply-patch.sh', '460'], {
        cwd: client,
        encoding: 'utf8',
      });

      expect(out).toContain('✓ Установлен патч: №460 (версия 459 → 460)');
      expect(fs.existsSync(path.join(client, '.publish'))).toBe(false);
      expect(fs.existsSync(path.join(client, '.kiro'))).toBe(false);
      expect(fs.existsSync(path.join(client, 'fallout 2char.zip'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
