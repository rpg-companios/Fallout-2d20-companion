// ПРИЁМОЧНЫЙ (патч 391): «скрипт установки проверяет очень большое кол-во
// патчей… может сделать какую-нибудь отсечку? По ключевым патчам?» (владелец).
// patchs/baseline.json называет ключевой патч; apply-patch.sh на чистом
// дереве приводится к состоянию ключевого патча из истории ветки и
// проверяет/применяет только патчи ПОСЛЕ него. Отсечку переносит агент
// новым патчем (меняет номер в baseline.json). Грязное дерево или
// неполная история — полный проход по цепочке, как раньше.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const script = () => readFileSync('apply-patch.sh', 'utf8');

describe('патч 391: отсечка установки по ключевому патчу', () => {
  it('установщик синтаксически цел (bash -n)', () => {
    execSync('bash -n apply-patch.sh');
  });

  it('baseline.json: номер-формат; отсечку переносит патч (не вручную)', () => {
    // Существование патча-ключа проверяет сам установщик (нет патча —
    // вежливый полный проход). Слово владельца (426): отсечка — по
    // последнему патчу; конкретный номер закрепляет защёлка
    // __tests__/patches/baseline-cutoff.test.js (baseline == старший патч).
    const config = JSON.parse(readFileSync('patchs/baseline.json', 'utf8'));
    expect(String(config.baseline)).toMatch(/^\d+[a-z]?$/);
  });

  it('в установщике есть быстрый путь отсечки', () => {
    const code = script();
    expect(code).toContain('read_baseline_number');
    expect(code).toContain('sync_to_baseline');
    expect(code).toContain("':(exclude)patchs'");
    expect(code).toContain('--diff-filter=A');
    expect(code).toContain('Идёт полный проход по цепочке');
  });

  it('полный проход остался на месте, служебные функции целы', () => {
    const code = script();
    expect(code).toContain('patch_state');
    expect(code).toContain('check_reverse');
    expect(code).toContain('ОСТАНОВКА: цель');
    // Сплайс отсечки не должен глотать соседние функции (урок 391):
    for (const fn of ['is_changelog()', 'patch_files_strong()', 'is_confirmed()', 'added_lines()', 'json_check()']) {
      expect(code).toContain(fn);
    }
  });
});
