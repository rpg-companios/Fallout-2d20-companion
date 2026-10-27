// ПРИЁМОЧНЫЙ (патч 440): релиз 3 объявлен владельцем («Теперь делаем
// описание релиза. ЧТо изменилось от прошлой версии»). Покрывает патчи
// 402–439. Заметки — на языке игрока (без номеров патчей и служебных
// слов), парные ru/en, не дублируют релизы 1–2, окно «Что нового»
// покажет их один раз (release 3 > 2).
import { describe, expect, it } from 'vitest';
import notes from '../../public/version.json';

describe('патч 440: релиз 3 — заметки «Что нового»', () => {
  it('релиз поднят до 3; версия — номер последнего патча; заметки парные', () => {
    expect(notes.release).toBe(3);
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

  it('главные темы релиза 3 присутствуют', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    expect(ru).toContain('Перки');
    expect(ru).toContain('Ремонт');
    expect(ru).toContain('Редкость');
    expect(ru).toContain('воронка');
    expect(ru).toContain('Найдено: N');
    expect(ru).toContain('Сон\\Ждать');
    expect(ru).toContain('Ожидание');
    expect(ru).toContain('Персонаж умер');
  });

  it('не дублирует релиз 2 (его темы ушли вместе с его заметками)', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    expect(ru).not.toContain('Бета-волновой тюнер');
    expect(ru).not.toContain('Посох Атома');
    expect(ru).not.toContain('mod_043');
  });
});
