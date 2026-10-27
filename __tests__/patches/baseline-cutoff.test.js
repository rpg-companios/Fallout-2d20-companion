// ПРИЁМОЧНЫЙ (патч 426, обновлён в 455): отсечка установщика — по последнему патчу
// (слово владельца: «для скрипта установки нужна отсечка по последнему
// патчу»; 455: «уменьшить бы вывод информации от скрипта. Там по факту
// интересно только встали ли патчи или нет. И напоминание про комит»).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const patchNumbers = () => readdirSync('patchs')
  .filter((name) => /^\d+[a-z]?-.*\.patch$/.test(name))
  .map((name) => name.match(/^(\d+[a-z]?)-/)[1])
  .sort((a, b) => (a.length !== b.length ? a.length - b.length : a.localeCompare(b)));

describe('Патч 426 / 455: отсечка установщика по последнему патчу и лаконичный отчёт', () => {
  it('baseline.json: валидный JSON, отсечка = старший патч в patchs/', () => {
    const raw = readFileSync('patchs/baseline.json', 'utf8');
    const parsed = JSON.parse(raw);
    const baseline = String(parsed.baseline);
    expect(baseline).toMatch(/^\d+[a-z]?$/);
    const numbers = patchNumbers();
    expect(numbers.length).toBeGreaterThan(0);
    expect(baseline).toBe(numbers[numbers.length - 1]);
  });

  it('baseline.json менялся в истории (переносится патчами, не вручную)', () => {
    const raw = readFileSync('patchs/baseline.json', 'utf8');
    expect(Object.keys(JSON.parse(raw))).toEqual(['baseline']);
  });

  it('установщик (431 + 455): грязное дерево — правки в архив, вывод короткий + коммит', () => {
    const code = readFileSync('apply-patch.sh', 'utf8');
    // правки сохраняются в папку-архив, установка продолжается отсечкой
    expect(code).toContain('.install-backup');
    expect(code).toContain('cp -R "$ROOT_DIR/$part" "$backup_dir/$part"');
    expect(code).not.toContain('не применяется: в дереве незакоммиченные изменения');
    expect(code).toContain("grep -vE '^\\?\\? \\.install-backup/'");
    // команда быстрого отката из архива осталась в одной компактной строке
    expect(code).toContain('cp -R .install-backup/$BACKUP_CREATED/. .');
    // лаконичный отчёт 455: встали ли патчи + напоминание про коммит
    expect(code).toContain('✓ Установлен патч:');
    expect(code).toContain('✓ Установлены патчи:');
    expect(code).toContain('✓ Патч №$PATCH_ID уже установлен.');
    expect(code).toContain('Не забудьте закоммитить, когда будет удобно:');
    expect(code).toContain('git add -A && git commit -m \\"$commit_label\\"');
    // полный проход остался для случаев без отсечки
    expect(code).toContain('Идёт полный проход по цепочке');
  });

  it('установщик (428): отсечка срабатывает и при цели == ключевой патч', () => {
    const code = readFileSync('apply-patch.sh', 'utf8');
    expect(code).toContain('! number_lt "$PATCH_ID" "$BASELINE_NUM"');
    expect(code).not.toContain('! number_le "$PATCH_ID" "$BASELINE_NUM"');
    expect(code).toContain('Идёт полный проход по цепочке');
  });
});
