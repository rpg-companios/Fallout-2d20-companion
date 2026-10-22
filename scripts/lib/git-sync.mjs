// scripts/lib/git-sync.mjs
// Обновление checkout'а перед релизом: релиз всегда собирается из того, что
// лежит в origin, — иначе в GitHub уедет старый код, а push индекса упрётся
// в non-fast-forward.
//
// Правила намеренно осторожные:
//   • только fast-forward (никаких merge-коммитов и перезаписи истории);
//   • незакоммиченные правки — стоп: их судьбу решает человек, а не скрипт;
//   • нет git/remote/ветки в origin — не ошибка, релиз продолжается.
//
// Файл едет в оба целевых репозитория (движок и сеттинг) вместе с release.mjs,
// поэтому зависимостей нет — только node:child_process.

import { execFileSync } from 'node:child_process';

const git = (root, args, { allowFail = false } = {}) => {
  try {
    const out = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // Никаких интерактивных запросов логина: в Replit/CI они вешают релиз.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { ok: true, out: String(out ?? '').trim() };
  } catch (error) {
    if (allowFail) return { ok: false, out: '' };
    const detail = String(error?.stderr ?? error?.stdout ?? '')
      .trim()
      .split('\n')
      .slice(-3)
      .join(' ');
    throw new Error(`git ${args.join(' ')}: ${detail || error?.message || 'неизвестная ошибка'}`);
  }
};

/** Работаем внутри git-репозитория? (release из tar-архива — не ошибка.) */
export const isGitCheckout = (root) => (
  git(root, ['rev-parse', '--is-inside-work-tree'], { allowFail: true }).out === 'true'
);

/** Текущая ветка; отсоединённый HEAD → null. */
export const currentGitBranch = (root) => {
  const { out } = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  return out && out !== 'HEAD' ? out : null;
};

/**
 * Подтянуть origin/<ветка> в текущий checkout.
 *
 * @param {object} options
 * @param {string} options.root корень репозитория
 * @param {string} [options.remote] имя remote (по умолчанию origin)
 * @param {boolean} [options.dryRun] только показать, что доступно
 * @param {string} [options.label] префикс сообщений (`release` / `publish`)
 * @param {(message: string) => void} [options.log]
 * @returns {{skipped?: string, updated?: boolean, branch?: string, before?: string, after?: string, changed?: string[], available?: string}}
 */
export const syncCheckout = ({
  root,
  remote = 'origin',
  dryRun = false,
  label = 'release',
  log = console.log,
} = {}) => {
  if (!isGitCheckout(root)) {
    log(`[${label}] это не git-репозиторий — обновление из origin пропущено`);
    return { skipped: 'not-a-git-repo' };
  }

  const branch = process.env.RELEASE_BRANCH || currentGitBranch(root);
  if (!branch) {
    log(`[${label}] отсоединённый HEAD — обновление из origin пропущено`);
    return { skipped: 'detached-head' };
  }

  // Имена файлов берём из diff, а не из `status --porcelain`: тот кодирует
  // статус двумя символами, и любая обрезка/trim легко съедает букву пути.
  const dirty = [...new Set([
    ...git(root, ['diff', '--name-only']).out.split('\n'),
    ...git(root, ['diff', '--cached', '--name-only']).out.split('\n'),
  ].filter(Boolean))];
  if (dirty.length > 0) {
    const shown = dirty.slice(0, 5).join(', ');
    throw new Error(
      `незакоммиченные изменения (${shown}${dirty.length > 5 ? ', …' : ''}): `
      + 'закоммитьте или уберите их, либо запустите с --no-pull',
    );
  }

  if (!git(root, ['remote', 'get-url', remote], { allowFail: true }).ok) {
    log(`[${label}] нет remote ${remote} — обновление пропущено`);
    return { skipped: 'no-remote', branch };
  }

  git(root, ['fetch', '--prune', remote]);
  const target = `refs/remotes/${remote}/${branch}`;
  const remoteHead = git(root, ['rev-parse', '--verify', target], { allowFail: true });
  if (!remoteHead.ok) {
    log(`[${label}] в ${remote} ещё нет ветки ${branch} — обновление пропущено`);
    return { skipped: 'no-upstream', branch };
  }

  const before = git(root, ['rev-parse', 'HEAD']).out;
  if (before === remoteHead.out) {
    log(`[${label}] код уже совпадает с ${remote}/${branch} (${before.slice(0, 7)})`);
    return { updated: false, branch, before, after: before, changed: [] };
  }

  const ancestor = git(root, ['merge-base', '--is-ancestor', 'HEAD', target], { allowFail: true });
  if (!ancestor.ok) {
    // Показываем, что именно не отправлено: без этого «разошлась» не даёт
    // понять, свой ли это коммит и что с ним делать.
    const ahead = git(root, ['log', '--oneline', `${remote}/${branch}..HEAD`], { allowFail: true }).out;
    const commits = ahead
      ? ` Не отправлено (${ahead.split('\n').length}): ${ahead.split('\n').slice(0, 3).join('; ')}.`
      : '';
    throw new Error(
      `ветка ${branch} разошлась с ${remote}/${branch}: локальные коммиты не отправлены.${commits} `
      + 'Приведите checkout в порядок (git pull / git push для обычных коммитов; '
      + 'git reset --hard origin/<ветка>, если локальные коммиты не нужны) '
      + 'или запустите релиз с --no-pull',
    );
  }

  if (dryRun) {
    log(`[${label}] доступно обновление ${before.slice(0, 7)} → ${remoteHead.out.slice(0, 7)} (dry-run: не применяю)`);
    return { updated: false, available: remoteHead.out, branch, before, after: before, changed: [] };
  }

  git(root, ['merge', '--ff-only', target]);
  const after = git(root, ['rev-parse', 'HEAD']).out;
  const changed = git(root, ['diff', '--name-only', before, after])
    .out
    .split('\n')
    .filter(Boolean);
  log(`[${label}] обновлено ${before.slice(0, 7)} → ${after.slice(0, 7)} (${remote}/${branch}, файлов: ${changed.length})`);
  return { updated: true, branch, before, after, changed };
};
