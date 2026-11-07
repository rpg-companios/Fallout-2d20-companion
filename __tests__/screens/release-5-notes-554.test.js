// ПРИЁМОЧНЫЙ (патч 554): релиз 5 объявлен владельцем.
//
// Владелец: «нужен новый список, что вошло в релиз»; источник — прошлый релиз
// (чтобы не повторять темы), чейнджлог и патчи: берём СОЗДАННОЕ, а не
// исправления прошлых патчей. Отдельно сказано: игрокам не интересна
// внутренняя кухня — лицензии, «канон хранилища», две панели склада, перенос
// через JSON и карточки ключей в админке в список не входят.
//
// Заметки — на языке игрока (без номеров патчей и служебных слов), парные
// ru/en, описывают, что игрок сможет сделать за столом. Окно «Что нового»
// покажет их один раз (release 5 > 4).
import { describe, expect, it } from 'vitest';
import notes from '../../public/version.json';

describe('патч 554: релиз 5 — заметки «Что нового»', () => {
  it('релиз поднят до 5; версия — номер последнего патча; заметки парные', () => {
    expect(notes.release).toBe(5);
    expect(String(notes.version)).toMatch(/^\d+[a-z]?$/);
    expect(Number(notes.version)).toBeGreaterThanOrEqual(554);
    expect(notes.notes['ru-RU'].length).toBe(notes.notes['en-EN'].length);
    expect(notes.notes['ru-RU'].length).toBeGreaterThanOrEqual(10);
  });

  it('язык игрока: без номеров патчей и внутренней технической кухни', () => {
    for (const list of [notes.notes['ru-RU'], notes.notes['en-EN']]) {
      for (const line of list) {
        expect(line).not.toMatch(/патч|patch \d/i);
        expect(line).not.toMatch(/агент|baseline|мост контур|bridge|отсечк|metro|vitest|gitlink|kiro/i);
      }
    }
  });

  it('внутренняя кухня и админские термины в релиз не попали', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    const en = notes.notes['en-EN'].join(' ');

    expect(ru).not.toMatch(/лицензи|канон|две панели|JSON|карточк[аи] ключ/i);
    expect(en).not.toMatch(/licen[cs]e|canonical|two panels|JSON/i);
  });

  it('главные темы релиза 5 присутствуют с каноническими названиями из словарей', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    const en = notes.notes['en-EN'].join(' ');

    expect(ru).toContain('комнате');
    expect(ru).toContain('Локации');
    expect(ru).toContain('Запертая дверь');
    expect(ru).toContain('Взлом замков');
    expect(ru).toContain('Взлом терминалов');
    expect(ru).toContain('Ключи и записки');
    expect(ru).toContain('Ворота');
    expect(ru).toContain('Общий склад партии');
    expect(ru).toContain('Добыча и торговцы');

    expect(en).toContain('room with your GM');
    expect(en).toContain('Locations');
    expect(en).toContain('locked door');
    expect(en).toContain('Lockpicking');
    expect(en).toContain('Terminal hacking');
    expect(en).toContain('Keys and notes');
    expect(en).toContain('Gates');
    expect(en).toContain('Party storage');
    expect(en).toContain('Loot and traders');
  });

  it('не дублирует релиз 4 (его темы ушли вместе с его заметками)', () => {
    const ru = notes.notes['ru-RU'].join(' ');
    const en = notes.notes['en-EN'].join(' ');

    expect(ru).not.toContain('портрет персонажа');
    expect(ru).not.toContain('Собственное снаряжение');
    expect(ru).not.toContain('Самодельное снаряжение');
    expect(ru).not.toContain('живой индикатор запуска');

    expect(en).not.toContain('Custom character portrait');
    expect(en).not.toContain('Own equipment');
    expect(en).not.toContain('Homebrew Equipment');
  });
});
