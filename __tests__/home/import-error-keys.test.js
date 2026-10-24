// Тексты ошибок импорта персонажа обязаны существовать в словаре.
//
// Было две беды, обе видел человек:
//   1) IMPORT_ERRORS указывал на `import.errors.*`, а раздел в словаре
//      называется `upload.errors.*` — при любой ошибке разбора на экране
//      появлялся сам путь ключа;
//   2) любая ошибка обработчика (например, запись в базу) показывала
//      «проверьте, что выбран корректный .json/.rpgc» — человек шёл
//      перевыбирать исправный файл.
import { describe, expect, it } from 'vitest';

import ruHome from '../../i18n/ru-RU/screens/home/screen.json';
import enHome from '../../i18n/en-EN/screens/home/screen.json';
import { IMPORT_ERRORS } from '../../domain/characterTransfer';

const resolve = (dictionary, path) => path
  .split('.')
  .reduce((value, part) => value?.[part], dictionary);

describe('словарь импорта персонажа', () => {
  it('каждый код ошибки разбора имеет текст в обеих локалях', () => {
    for (const key of Object.values(IMPORT_ERRORS)) {
      expect(resolve(ruHome, key), `ru: ${key}`).toEqual(expect.any(String));
      expect(resolve(enHome, key), `en: ${key}`).toEqual(expect.any(String));
    }
  });

  it('код, которого нет в словаре, называет расширение файла персонажа', () => {
    // invalidJson — самый частый случай: человек выбрал архив правил (.trpg).
    expect(resolve(ruHome, IMPORT_ERRORS.invalidJson)).toMatch(/\.rpgc|\.trpg/);
  });

  it('падение обработчика показывает причину, а не «проверьте файл»', () => {
    expect(resolve(ruHome, 'upload.errors.unexpected')).toContain('{message}');
    expect(resolve(enHome, 'upload.errors.unexpected')).toContain('{message}');
  });
});
