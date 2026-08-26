// __tests__/saves/sanitize-file-name.test.js
// Юнит-тесты мультиязычного `sanitizeFileName` (domain/characterTransfer.js).
// Проверяем, что имена персонажей сохраняют кириллицу/латиницу/акценты/иероглифы,
// а пробелы и «небезопасные» для файла/URL символы заменяются (пустые → character).
import { describe, it, expect } from 'vitest';
import { sanitizeFileName, EXPORT_FILE_EXTENSION } from '../../domain/characterTransfer';

describe('sanitizeFileName', () => {
  it('сохраняет кириллицу', () => {
    expect(sanitizeFileName('Робомозгач')).toBe(`Робомозгач${EXPORT_FILE_EXTENSION}`);
  });
  it('сохраняет латиницу', () => {
    expect(sanitizeFileName('John Doe')).toBe(`John_Doe${EXPORT_FILE_EXTENSION}`);
  });
  it('сохраняет французские акценты', () => {
    expect(sanitizeFileName('François Méliès')).toBe(`François_Méliès${EXPORT_FILE_EXTENSION}`);
  });
  it('сохраняет иероглифы', () => {
    expect(sanitizeFileName('田中　太郎')).toBe(`田中_太郎${EXPORT_FILE_EXTENSION}`);
  });
  it('заменяет пробелы на подчёркивание', () => {
    expect(sanitizeFileName('Сергей Иванов')).toBe(`Сергей_Иванов${EXPORT_FILE_EXTENSION}`);
  });
  it('убирает path-unfriendly символы', () => {
    expect(sanitizeFileName('a/b:c*d')).toBe(`a_b_c_d${EXPORT_FILE_EXTENSION}`);
  });
  it('пустое/пустое имя → character', () => {
    expect(sanitizeFileName('')).toBe(`character${EXPORT_FILE_EXTENSION}`);
    expect(sanitizeFileName(null)).toBe(`character${EXPORT_FILE_EXTENSION}`);
  });
  it('обрезает длинное имя до разумной длины', () => {
    const long = 'ОченьДлинноеИмя'.repeat(10);
    const out = sanitizeFileName(long);
    expect(out.length).toBeLessThanOrEqual(60 + EXPORT_FILE_EXTENSION.length);
  });
  it('не содержит разделителей путей', () => {
    expect(sanitizeFileName('a/b\\c')).not.toMatch(/[/\\]/);
  });
});
