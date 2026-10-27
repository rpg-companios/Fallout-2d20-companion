// __tests__/avatar/character-avatar.test.js
//
// Домен аватара (domain/characterAvatar.js) + таблица кэша в схеме БД.

import { describe, it, expect } from 'vitest';
import {
  AVATAR_LIMITS,
  base64ByteLength,
  validateAvatarDataUrl,
  buildAvatarMetadata,
} from '../../domain/characterAvatar';
import { CREATE_TABLES } from '../../db/schema';

const smallJpeg = (bytes = 1024) => `data:image/jpeg;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;

describe('avatar: лимиты и валидация', () => {
  it('лимит размера зафиксирован: 5МБ', () => {
    expect(AVATAR_LIMITS.maxBytes).toBe(5 * 1024 * 1024);
  });

  it('base64ByteLength считает байты без atob', () => {
    expect(base64ByteLength('QUJD')).toBe(3); // 'ABC'
    expect(base64ByteLength('QQ==')).toBe(1); // 'A'
    expect(base64ByteLength('')).toBe(0);
  });

  it('валидный JPEG data URL проходит', () => {
    const check = validateAvatarDataUrl(smallJpeg(2048));
    expect(check.ok).toBe(true);
    expect(check.reason).toBeNull();
    expect(check.bytes).toBeGreaterThan(0);
  });

  it('любые изображения валидны, невалидные URL отбрасываются', () => {
    // Валидные изображения разных форматов
    expect(validateAvatarDataUrl('data:image/png;base64,AAAA').ok).toBe(true);
    expect(validateAvatarDataUrl('data:image/gif;base64,AAAA').ok).toBe(true);
    expect(validateAvatarDataUrl('data:image/webp;base64,AAAA').ok).toBe(true);
    // Невалидные URL
    expect(validateAvatarDataUrl('http://x/y.jpg').ok).toBe(false);
    expect(validateAvatarDataUrl(null).ok).toBe(false);
    expect(validateAvatarDataUrl('').ok).toBe(false);
  });

  it('файл больше 300КБ отбрасывается', () => {
    const check = validateAvatarDataUrl(smallJpeg(AVATAR_LIMITS.maxBytes + 4096));
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('avatar.tooLarge');
  });
});

describe('avatar: метаданные для сейва', () => {
  it('метаданные — только md5 и updatedAt (+mimeType с 445), не фото', () => {
    const meta = buildAvatarMetadata({ characterId: 'c1', md5: 'abc', updated_at: 123 });
    expect(meta).toEqual({ md5: 'abc', updatedAt: 123, mimeType: null });
  });

  it('без записи кэша метаданных нет', () => {
    expect(buildAvatarMetadata(null)).toBeNull();
    expect(buildAvatarMetadata({})).toBeNull();
  });
});



describe('avatar: схема БД', () => {
  it('таблица character_avatars объявлена в CREATE_TABLES', () => {
    const ddl = CREATE_TABLES.join('\n');
    expect(ddl).toContain('character_avatars');
    expect(ddl).toContain('data_url TEXT NOT NULL');
    expect(ddl).toContain('md5 TEXT');
  });
});
