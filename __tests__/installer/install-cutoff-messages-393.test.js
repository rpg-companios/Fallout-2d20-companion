// ПРИЁМОЧНЫЙ (патч 393, обновлён в 455 по слову владельца):
// Вместо прежних многословных пояснений об отсечке установщик явно
// перечисляет все вошедшие номера патчей (например: «✓ Установлены патчи:
// №453, №454, №455») и напоминает про коммит без лишнего шума.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const script = () => readFileSync('apply-patch.sh', 'utf8');

describe('патч 393 / 455: установщик явно показывает вошедшие патчи без лишнего шума', () => {
  it('синтаксически цел (bash -n)', () => {
    execSync('bash -n apply-patch.sh');
  });

  it('при прыжке через отсечку вычисляет и перечисляет все промежуточные патчи', () => {
    const code = script();
    expect(code).toContain('PREV_VERSION="$(read_app_version || true)"');
    expect(code).toContain('print_concise_summary');
    expect(code).toContain('✓ Установлены патчи: $joined');
    expect(code).toContain('✓ Установлен патч: ${nums[0]}');
  });

  it('лишний технический мусор убран из стандартного вывода', () => {
    const code = script();
    expect(code).not.toContain('Загрузка Arena-ветки:');
    expect(code).not.toContain('Загружен коммит:');
    expect(code).not.toContain('Привожу папку сразу к состоянию');
    expect(code).not.toContain('Источник: $REMOTE/$ARENA_BRANCH');
  });

  it('usage объясняет работу отсечки при вызове --help', () => {
    expect(script()).toContain('по одному они не применяются\nи в списке «Применено» не появятся');
  });
});
