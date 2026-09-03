import { describe, expect, it } from 'vitest';
import { drainActiveCore, adjustPieceHp, repairPowerArmorPiece } from '../../domain/powerArmor';

// Правило 4 (docs/architecture/counters-storage.md): заряд ядерного блока и
// прочность части силовой брони — каунтеры, но их current живёт в самом
// предмете, а потолок берётся из данных каталога.

describe('заряд ядерного блока: каунтер внутри предмета', () => {
  const framed = (charges) => ({ frame: { catalogId: 'pa_frame', core: { charges } } });

  it('расход списывает заряды', () => {
    const { equipped, depleted } = drainActiveCore(framed(12), 5);
    expect(equipped.frame.core.charges).toBe(7);
    expect(depleted).toBe(false);
  });

  it('на нуле блок исчезает, а не уходит в минус', () => {
    const { equipped, depleted } = drainActiveCore(framed(3), 3);
    expect(equipped.frame.core).toBeNull();
    expect(depleted).toBe(true);
  });

  it('расход больше остатка не даёт отрицательных зарядов', () => {
    const { equipped, depleted } = drainActiveCore(framed(2), 99);
    expect(equipped.frame.core).toBeNull();
    expect(depleted).toBe(true);
  });

  it('заряды сверх потолка не усекаются («Ядерный физик», 23/20)', () => {
    // Потолок блока 20, но перк выдал 23 — расход считается от факта.
    const { equipped } = drainActiveCore(framed(23), 1);
    expect(equipped.frame.core.charges).toBe(22);
  });

  it('без блока или без расхода состояние не меняется', () => {
    expect(drainActiveCore({ frame: { core: null } }, 5).depleted).toBe(false);
    expect(drainActiveCore(framed(10), 0).equipped.frame.core.charges).toBe(10);
  });
});

describe('прочность части силовой брони: каунтер внутри предмета', () => {
  const piece = (hpCurrent) => ({ catalogId: 'pa_torso', hpCurrent });

  it('минус не уводит ниже нуля', () => {
    expect(adjustPieceHp(piece(2), -5, 10).hpCurrent).toBe(0);
  });

  it('плюс не поднимает выше потолка из каталога', () => {
    expect(adjustPieceHp(piece(9), 5, 10).hpCurrent).toBe(10);
  });

  it('шаг в пределах границ работает как обычно', () => {
    expect(adjustPieceHp(piece(5), -1, 10).hpCurrent).toBe(4);
    expect(adjustPieceHp(piece(5), 1, 10).hpCurrent).toBe(6);
  });

  it('починка ставит максимум из каталога', () => {
    expect(repairPowerArmorPiece(piece(0), 10).hpCurrent).toBe(10);
  });

  it('не мутирует исходную часть', () => {
    const original = piece(5);
    adjustPieceHp(original, -3, 10);
    expect(original.hpCurrent).toBe(5);
  });
});
