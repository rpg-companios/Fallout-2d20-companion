// ПРИЁМОЧНЫЙ (патч 426): отсечка установщика — по последнему патчу
// (слово владельца: «для скрипта установки нужна отсечка по последнему
// патчу»). patchs/baseline.json называет ключевой патч: цепочка ДО него
// не проверяется по одному — дерево целиком приводится к его состоянию
// из истории, ставятся только патчи ПОСЛЕ него. Номер переносится
// агентом новым патчем; защёлка требует: отсечка == старший патч ветки.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const patchNumbers = () => readdirSync('patchs')
  .filter((name) => /^\d+[a-z]?-.*\.patch$/.test(name))
  .map((name) => name.match(/^(\d+[a-z]?)-/)[1])
  .sort((a, b) => (a.length !== b.length ? a.length - b.length : a.localeCompare(b)));

describe('Патч 426: отсечка установщика по последнему патчу', () => {
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
    // Файл должен существовать в дереве и упоминать только ключ baseline.
    const raw = readFileSync('patchs/baseline.json', 'utf8');
    expect(Object.keys(JSON.parse(raw))).toEqual(['baseline']);
  });

  it('установщик (431): грязное дерево — правки в архив, затем отсечка', () => {
    const script = () => readFileSync('apply-patch.sh', 'utf8');
    const code = script();
    // правки сохраняются в папку-архив, установка продолжается отсечкой
    expect(code).toContain('.install-backup');
    expect(code).toContain('cp -R "$ROOT_DIR/$part" "$backup_dir/$part"');
    // старое поведение «отсечка не применяется из-за правок» исчезло
    expect(code).not.toContain('не применяется: в дереве незакоммиченные изменения');
    // сам архив не попадает в список правок (иначе архив рос бы сам)
    expect(code).toContain("grep -vE '^\\?\\? \\.install-backup/'");
    // подсказка про пересборку из git — только когда архив создавался
    expect(code).toContain('если проект пересобирается из git');
    // полный проход остался для случаев без отсечки
    expect(code).toContain('Идёт полный проход по цепочке');
  });

  it('установщик (428): отсечка срабатывает и при цели == ключевой патч', () => {
    const script = () => readFileSync('apply-patch.sh', 'utf8');
    // Защёлка «baseline == старший патч» при старом условии («цель строго
    // больше») делала бы установку последней версии всегда полным
    // проходом. Условие 428: цель >= ключевого — дерево разом приводится
    // к состоянию ключевого патча (свежая версия — один шаг).
    const code = script();
    expect(code).toContain('! number_lt "$PATCH_ID" "$BASELINE_NUM"');
    expect(code).not.toContain('! number_le "$PATCH_ID" "$BASELINE_NUM"');
    // полный проход остался для грязного дерева и недоступной отсечки
    expect(code).toContain('Идёт полный проход по цепочке');
  });
});
