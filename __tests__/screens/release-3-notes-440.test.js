// ПРИЁМОЧНЫЙ (патч 440): релиз 3 объявлен владельцем. По образцу
// release-2-notes-401.test.js: конкретный номер текущего релиза и его
// темы закрепляет защёлка старшего релиза (release-4-notes-461), здесь —
// законы языка, парности и недублирования релиза 2.
import { describe, expect, it } from 'vitest';
import notes from '../../public/version.json';

describe('патч 440: заметки релиза — законы языка и парности (461: релиз уже 4)', () => {
  it('релиз только растёт; версия — номер последнего патча; заметки парные', () => {
    expect(notes.release).toBeGreaterThanOrEqual(3);
    expect(String(notes.version)).toMatch(/^\d+[a-z]?$/);
    expect(notes.notes['ru-RU'].length).toBe(notes.notes['en-EN'].length);
    expect(notes.notes['ru-RU'].length).toBeGreaterThanOrEqual(8);
  });

  it('язык игрока: без номеров патчей и служебных слов', () => {
    for (const list of [notes.notes['ru-RU'], notes.notes['en-EN']]) {
      for (const line of list) {
        expect(line).not.toMatch(/патч|patch \d/i);
        // «мост» только как жаргон «мост контур», не внутри «самостоятельных»
        expect(line).not.toMatch(/агент|baseline|мост контур|bridge|отсечк/i);
      }
    }
  });

  it('не дублирует релиз 2 (его темы ушли вместе с его заметками)', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    expect(ru).not.toContain('Бета-волновой тюнер');
    expect(ru).not.toContain('Посох Атома');
    expect(ru).not.toContain('mod_043');
  });
});
