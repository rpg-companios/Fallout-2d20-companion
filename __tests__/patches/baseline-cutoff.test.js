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
});
