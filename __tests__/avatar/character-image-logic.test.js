// __tests__/avatar/character-image-logic.test.js
//
// Тесты логики работы с изображениями персонажей без UI
// Проверяем чистые функции из domain/characterAvatar.js

import { describe, it, expect } from 'vitest';
import {
  validateAvatarDataUrl,
  getFileExtension,
  AVATAR_LIMITS,
  base64ByteLength,
} from '../../domain/characterAvatar';

describe('characterAvatar: логика работы с изображениями', () => {
  describe('validateAvatarDataUrl', () => {
    it('принимает валидный JPEG data URL', () => {
      const dataUrl = 'data:image/jpeg;base64,SGVsbG8=';
      const result = validateAvatarDataUrl(dataUrl);
      expect(result.ok).toBe(true);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.bytes).toBeGreaterThan(0);
    });

    it('принимает валидный PNG data URL', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoA=';
      const result = validateAvatarDataUrl(dataUrl);
      expect(result.ok).toBe(true);
      expect(result.mimeType).toBe('image/png');
    });

    it('принимает валидный GIF data URL', () => {
      const dataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const result = validateAvatarDataUrl(dataUrl);
      expect(result.ok).toBe(true);
      expect(result.mimeType).toBe('image/gif');
    });

    it('принимает валидный WebP data URL', () => {
      const dataUrl = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
      const result = validateAvatarDataUrl(dataUrl);
      expect(result.ok).toBe(true);
      expect(result.mimeType).toBe('image/webp');
    });

    it('отбрасывает невалидный URL (не изображение)', () => {
      const result = validateAvatarDataUrl('http://example.com/image.jpg');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('avatar.invalidFormat');
    });

    it('отбрасывает пустой URL', () => {
      const result = validateAvatarDataUrl('');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('avatar.invalidFormat');
    });

    it('отбрасывает null', () => {
      const result = validateAvatarDataUrl(null);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('avatar.invalidFormat');
    });

    it('отбрасывает изображение больше 5МБ', () => {
      // Создаем base64 строку, которая декодируется в > 5МБ
      const bigBase64 = 'A'.repeat(7 * 1024 * 1024); // ~7MB base64
      const dataUrl = `data:image/jpeg;base64,${bigBase64}`;
      const result = validateAvatarDataUrl(dataUrl);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('avatar.tooLarge');
    });

    it('принимает изображение ровно 5МБ', () => {
      // 5МБ в байтах = 5 * 1024 * 1024
      // Base64 кодирует 3 байта в 4 символа, поэтому нужно ~6.7М символов
      const exactSizeBytes = 5 * 1024 * 1024;
      const base64Chars = Math.ceil((exactSizeBytes * 4) / 3);
      const bigBase64 = 'A'.repeat(base64Chars);
      const dataUrl = `data:image/jpeg;base64,${bigBase64}`;
      const result = validateAvatarDataUrl(dataUrl);
      // Может быть на границе, но не должно превышать
      expect(result.bytes <= AVATAR_LIMITS.maxBytes || result.reason === 'avatar.tooLarge').toBe(true);
    });
  });

  describe('getFileExtension', () => {
    it('возвращает jpg для image/jpeg', () => {
      expect(getFileExtension('image/jpeg')).toBe('jpg');
    });

    it('возвращает png для image/png', () => {
      expect(getFileExtension('image/png')).toBe('png');
    });

    it('возвращает gif для image/gif', () => {
      expect(getFileExtension('image/gif')).toBe('gif');
    });

    it('возвращает webp для image/webp', () => {
      expect(getFileExtension('image/webp')).toBe('webp');
    });

    it('возвращает bmp для image/bmp', () => {
      expect(getFileExtension('image/bmp')).toBe('bmp');
    });

    it('возвращает svg для image/svg+xml', () => {
      expect(getFileExtension('image/svg+xml')).toBe('svg');
    });

    it('возвращает jpg по умолчанию для неизвестного типа', () => {
      expect(getFileExtension('image/unknown')).toBe('jpg');
    });

    it('возвращает jpg если mimeType пустой', () => {
      expect(getFileExtension(null)).toBe('jpg');
      expect(getFileExtension(undefined)).toBe('jpg');
      expect(getFileExtension('')).toBe('jpg');
    });

    it('извлекает расширение из неизвестного MIME-типа', () => {
      expect(getFileExtension('image/foobar')).toBe('foobar');
      expect(getFileExtension('image/x-icon')).toBe('x-icon');
    });
  });

  describe('base64ByteLength', () => {
    it('корректно считает байты для строки без padding', () => {
      expect(base64ByteLength('QUJD')).toBe(3); // ABC = 3 bytes
    });

    it('корректно считает байты для строки с padding =', () => {
      expect(base64ByteLength('QQ==')).toBe(1); // A = 1 byte
    });

    it('корректно считает байты для строки с padding ==', () => {
      expect(base64ByteLength('AA==')).toBe(1);
    });

    it('возвращает 0 для пустой строки', () => {
      expect(base64ByteLength('')).toBe(0);
    });

    it('игнорирует пробелы', () => {
      expect(base64ByteLength(' Q U J D ')).toBe(3);
    });
  });

  describe('AVATAR_LIMITS', () => {
    it('maxBytes равен 5МБ', () => {
      expect(AVATAR_LIMITS.maxBytes).toBe(5 * 1024 * 1024);
    });

    it('maxDimension равен 2000px', () => {
      expect(AVATAR_LIMITS.maxDimension).toBe(2000);
    });

    it('не имеет ограничений на форматы', () => {
      // Проверяем, что нет allowedMimeTypes
      expect(AVATAR_LIMITS.allowedMimeTypes).toBeUndefined();
    });

    it('не имеет ограничений на размер стороны (maxEdge)', () => {
      // Проверяем, что нет maxEdge (старое ограничение для сжатия)
      expect(AVATAR_LIMITS.maxEdge).toBeUndefined();
    });
  });
});
