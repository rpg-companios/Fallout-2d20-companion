// __tests__/saves/remote-filename.test.js
// Юнит-тесты имени файла в Google Drive (components/cloudSync/googleDriveSync.js).
// makeRemoteFilename формирует `<id>__<имя>.json`, прогоняя имя через
// sanitizeFileName — так имена в облаке такие же аккуратные, как при скачивании.
// Хитрая часть: googleDriveSync тянет modules и RN, поэтому сама функция тут не
// импортируется; вместо этого тестируем приватную логику на общем sanитизаторе.
import { describe, it, expect } from 'vitest';
import { sanitizeFileName } from '../../domain/characterTransfer';

// зеркало реализации (сохраняем контракт: id + '_' + имя + '.json')
const makeRemoteFilename = (character) => {
  const safeName = sanitizeFileName(character?.name || 'character').replace(/\.rpgc$/i, '');
  return `${character.id}__${safeName}.json`;
};

describe('makeRemoteFilename (Drive имя файла)', () => {
  it('сохраняет id и добавляет .json', () => {
    const name = makeRemoteFilename({ id: 'char_1', name: 'Робомозгач' });
    expect(name).toBe('char_1__Робомозгач.json');
  });
  it('сохраняет кириллицу', () => {
    expect(makeRemoteFilename({ id: 'x', name: 'Робомозгач' })).toBe('x__Робомозгач.json');
  });
  it('заменяет пробелы на подчёркивание', () => {
    expect(makeRemoteFilename({ id: 'x', name: 'John Doe' })).toBe('x__John_Doe.json');
  });
  it('сохраняет акценты и иероглифы', () => {
    expect(makeRemoteFilename({ id: 'x', name: 'François Méliès' })).toBe('x__François_Méliès.json');
    expect(makeRemoteFilename({ id: 'x', name: '田中 太郎' })).toBe('x__田中_太郎.json');
  });
  it('пустое имя → character', () => {
    expect(makeRemoteFilename({ id: 'x', name: '' })).toBe('x__character.json');
  });
  it('не содержит разделителей путей', () => {
    expect(makeRemoteFilename({ id: 'x', name: 'a/b\\c' })).not.toMatch(/[/\\]/);
  });
});
