// ПРИЁМОЧНЫЙ (патч 401): релиз 2 объявлен владельцем. Заметки релиза —
// на языке игрока (без номеров патчей и служебных слов), парные ru/en,
// не дублируют релиз 1 (крафтовое окно/час на крафт/пул ОД/взрывчатка),
// окно «Что нового» покажет их один раз (release 2 > 1).
import { describe, expect, it } from 'vitest';
import notes from '../../public/version.json';

describe('патч 401: заметки релиза — законы языка и парности (440: релиз уже 3)', () => {
  it('релиз только растёт; версия = номер последнего патча (движется каждым); заметки парные', () => {
    // Конкретный номер релиза закрепляет защёлка нового релиза
    // (release-3-notes-440); здесь — только «не меньше двух».
    expect(notes.release).toBeGreaterThanOrEqual(2);
    // version.json.version — номер ПОСЛЕДНЕГО ПАТЧА: каждый патч его двигает,
    // зажимать константой нельзя (402-й урок: заслон упал на version '402').
    expect(String(notes.version)).toMatch(/^\d+[a-z]?$/);
    expect(notes.notes['ru-RU'].length).toBe(notes.notes['en-EN'].length);
    expect(notes.notes['ru-RU'].length).toBeGreaterThanOrEqual(8);
  });

  it('язык игрока: без номеров патчей и служебных слов', () => {
    for (const list of [notes.notes['ru-RU'], notes.notes['en-EN']]) {
      for (const line of list) {
        expect(line).not.toMatch(/патч|patch \d/i);
        // «мост» только как жаргон «мост контуров», не внутри «самостоятельных»
        expect(line).not.toMatch(/агент|baseline|мост контур|bridge|отсечк/i);
      }
    }
  });

  it('не дублирует релиз 1 (крафтовое окно/час/пул ОД как там)', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    expect(ru).not.toContain('квадраты категорий');
    expect(ru).not.toContain('час на изготовление');
  });
});
