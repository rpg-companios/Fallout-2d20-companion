// ПРИЁМОЧНЫЙ (патч 461): релиз 4 объявлен владельцем.
//
// Патч 554 начал релиз 5 и заменил заметки: темы релиза 4 (портрет, своё и
// самодельное снаряжение, живой индикатор запуска) вместе с его списком ушли,
// поэтому здесь остаются только законы, которые обязаны переживать любой релиз:
// номер релиза только растёт, версия — номер последнего патча, заметки парные
// ru/en, язык игрока без служебных слов, темы релиза 3 не возвращаются.
// Конкретные темы текущего релиза закрепляет защёлка старшего релиза
// (release-5-notes-554).
import { describe, expect, it } from 'vitest';
import notes from '../../public/version.json';

describe('патч 461: законы заметок релиза (461 → релиз 5)', () => {
  it('релиз только растёт; версия — номер последнего патча; заметки парные', () => {
    expect(notes.release).toBeGreaterThanOrEqual(4);
    expect(String(notes.version)).toMatch(/^\d+[a-z]?$/);
    expect(notes.notes['ru-RU'].length).toBe(notes.notes['en-EN'].length);
    expect(notes.notes['ru-RU'].length).toBeGreaterThanOrEqual(8);
  });

  it('язык игрока: без номеров патчей и внутренней технической кухни', () => {
    for (const list of [notes.notes['ru-RU'], notes.notes['en-EN']]) {
      for (const line of list) {
        expect(line).not.toMatch(/патч|patch \d/i);
        expect(line).not.toMatch(/агент|baseline|мост контур|bridge|отсечк|metro|vitest|gitlink|kiro/i);
      }
    }
  });

  it('не дублирует релиз 3 (его темы ушли вместе с его заметками)', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    expect(ru).not.toContain('Супер Дупер');
    expect(ru).not.toContain('Очумелые ручки');
    expect(ru).not.toContain('Персонаж умер');
    expect(ru).not.toContain('Найдено: N');
  });
});
