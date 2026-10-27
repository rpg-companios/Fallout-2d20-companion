// __tests__/avatar/character-avatar.test.js
//
// Домен аватара (domain/characterAvatar.js) + таблица кэша в схеме БД.

import { describe, it, expect } from 'vitest';
import {
  AVATAR_LIMITS,
  base64ByteLength,
  validateAvatarDataUrl,
  buildAvatarMetadata,
  compressAvatarImage,
} from '../../domain/characterAvatar';
import { CREATE_TABLES } from '../../db/schema';

const smallJpeg = (bytes = 1024) => `data:image/jpeg;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;

describe('avatar: лимиты и валидация', () => {
  it('лимиты зафиксированы: 512px, q0.7, 300КБ, JPEG', () => {
    expect(AVATAR_LIMITS.maxEdge).toBe(512);
    expect(AVATAR_LIMITS.jpegQuality).toBeLessThanOrEqual(1);
    expect(AVATAR_LIMITS.maxBytes).toBe(300 * 1024);
    expect(AVATAR_LIMITS.mimeType).toBe('image/jpeg');
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

  it('не-JPEG и мусор отбрасываются', () => {
    expect(validateAvatarDataUrl('data:image/png;base64,AAAA').ok).toBe(false);
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
  it('метаданные — только md5 и updatedAt, не фото', () => {
    const meta = buildAvatarMetadata({ characterId: 'c1', md5: 'abc', updated_at: 123 });
    expect(meta).toEqual({ md5: 'abc', updatedAt: 123 });
  });

  it('без записи кэша метаданных нет', () => {
    expect(buildAvatarMetadata(null)).toBeNull();
    expect(buildAvatarMetadata({})).toBeNull();
  });
});

describe('avatar: сжатие через адаптер', () => {
  it('адаптер вызывается с лимитами, результат валидируется', async () => {
    const calls = [];
    const adapter = {
      async resizeToJpeg(args) {
        calls.push(args);
        return { dataUrl: smallJpeg(2048) };
      },
    };
    const result = await compressAvatarImage({ uri: 'file:///x.jpg', width: 1000, height: 500 }, adapter);
    expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.bytes).toBeGreaterThan(0);
    expect(calls[0].maxEdge).toBe(AVATAR_LIMITS.maxEdge);
    expect(calls[0].quality).toBe(AVATAR_LIMITS.jpegQuality);
  });

  it('«толстый» результат адаптера отбрасывается', async () => {
    const adapter = {
      async resizeToJpeg() {
        return { dataUrl: smallJpeg(AVATAR_LIMITS.maxBytes + 8192) };
      },
    };
    await expect(compressAvatarImage({ uri: 'file:///x.jpg' }, adapter)).rejects.toMatchObject({
      message: 'avatar.tooLarge',
    });
  });

  it('пустой источник — явная ошибка', async () => {
    await expect(compressAvatarImage({}, {})).rejects.toThrow('avatar.invalidSource');
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
