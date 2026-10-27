// ПРИЁМОЧНЫЙ (патч 461): релиз 4 объявлен владельцем («давай новый релиз
// сделаем и на этом пока всё»). Покрывает патчи 441–460. Заметки — на языке
// игрока (без номеров патчей и внутренней кухни), парные ru/en, опираются на
// реальные названия разделов из словарей, не дублируют релиз 3, окно «Что
// нового» покажет их один раз (release 4 > 3).
import { describe, expect, it } from 'vitest';
import notes from '../../public/version.json';

describe('патч 461: релиз 4 — заметки «Что нового»', () => {
  it('релиз поднят до 4; версия — номер последнего патча; заметки парные', () => {
    expect(notes.release).toBe(4);
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

  it('главные темы релиза 4 присутствуют с каноническими названиями из словарей', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    const en = notes.notes['en-EN'].join(' ');

    expect(ru).toContain('портрет персонажа');
    expect(ru).toContain('Собственное снаряжение');
    expect(ru).toContain('Самодельное снаряжение');
    expect(ru).toContain('Экран администратора');
    expect(ru).toContain('Сервер');
    expect(ru).toContain('Пользователь');
    expect(ru).toContain('Админ');
    expect(ru).toContain('живой индикатор запуска');

    expect(en).toContain('Custom character portrait');
    expect(en).toContain('Own equipment');
    expect(en).toContain('Homebrew Equipment');
    expect(en).toContain('Admin screen');
    expect(en).toContain('Server');
    expect(en).toContain('User');
    expect(en).toContain('Admin');
  });

  it('не дублирует релиз 3 (его темы ушли вместе с его заметками)', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    expect(ru).not.toContain('Супер Дупер');
    expect(ru).not.toContain('Очумелые ручки');
    expect(ru).not.toContain('Персонаж умер');
    expect(ru).not.toContain('Найдено: N');
  });
});
