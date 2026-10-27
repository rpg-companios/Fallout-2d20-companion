// Адрес комнаты (gm-rooms §3.2): клиентские и серверные правила читают
// код ОДИНАКОВО — зеркала server/roomCode.js и src/room/roomCode.ts.
// Заслон: алфавит без неоднозначных символов, длина по умолчанию 6,
// коллизии при генерации перегенерируются (дубликат невозможен).

import { describe, expect, it } from 'vitest';
import serverCodes from '../../server/roomCode.js';
import {
  DEFAULT_ROOM_PREFIX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  formatRoomCodeForDisplay,
  parseRoomAddress,
  toCanonicalRoomCode,
} from '../../src/room/roomCode';

describe('roomCode: правила совпадают на клиенте и сервере', () => {
  const samples = [
    'GM-7Q3K9M',
    'gm-7q3-k9m',
    'GM7Q3K9M',
    '  gm 7q3 k9m ',
    'VLT-2A4B6C',
  ];

  it('канонизация: одна и та же строка из любых форм', () => {
    for (const sample of samples) {
      expect(toCanonicalRoomCode(sample)).toBe(serverCodes.toCanonicalRoomCode(sample));
    }
    expect(toCanonicalRoomCode('GM-7Q3K9M')).toBe('GM-7Q3K9M');
    expect(toCanonicalRoomCode('gm-7q3-k9m')).toBe('GM-7Q3K9M');
    expect(toCanonicalRoomCode('VLT2A4B6C')).toBe('VLT-2A4B6C');
  });

  it('мусор и неоднозначные символы — null (0/O, 1/I/L в кодах отсутствуют)', () => {
    // «GM-A7Q3K9» — НЕ мусор: валидный код алфавита (учитывается в samples выше).
    const garbage = ['', 'GM-123456', 'GM-000000', 'GM-7O3K9M', 'GM-7I3K9M', 'GM-7L3K9M', 'G-7Q3K9M', 'LONGP-7Q3K9M', 'GM-7Q3K9', 'GM-7Q3K9MX'];
    for (const item of garbage) {
      expect(toCanonicalRoomCode(item), `client: ${item}`).toBeNull();
      expect(serverCodes.toCanonicalRoomCode(item), `server: ${item}`).toBeNull();
    }
  });

  it('алфавит: 31 символ, без 0/O/1/I/L', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
    expect(ROOM_CODE_ALPHABET).toBe(serverCodes.CODE_ALPHABET);
    for (const banned of ['0', 'O', '1', 'I', 'L']) {
      expect(ROOM_CODE_ALPHABET.includes(banned)).toBe(false);
    }
  });

  it('отображение группами по 3: GM-7Q3-K9M', () => {
    expect(formatRoomCodeForDisplay('GM-7Q3K9M')).toBe('GM-7Q3-K9M');
    expect(serverCodes.formatRoomCodeForDisplay('gm7q3k9m')).toBe('GM-7Q3-K9M');
    // Нечитаемый ввод возвращается как есть (никаких исключений в UI).
    expect(formatRoomCodeForDisplay('???')).toBe('???');
  });

  it('parseRoomAddress: префикс 2–3 буквы + код 6 знаков', () => {
    expect(parseRoomAddress('GM-7Q3K9M')).toEqual({ prefix: 'GM', code: '7Q3K9M' });
    expect(parseRoomAddress('VLT-2A4B6C')).toEqual({ prefix: 'VLT', code: '2A4B6C' });
    expect(DEFAULT_ROOM_PREFIX).toBe('GM');
    expect(ROOM_CODE_LENGTH).toBe(6);
  });
});

describe('roomCode: генератор (сервер)', () => {
  it('коды заданной длины из алфавита', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = serverCodes.generateRoomCode();
      expect(code).toHaveLength(6);
      expect([...code].every((char) => serverCodes.CODE_ALPHABET.includes(char))).toBe(true);
    }
  });

  it('rng точечно подменяется: «коллизийная» последовательность детектируема вызывающим', () => {
    // Все вызовы rng возвращают 0 → всегда 'AAAAAA'. Уникальность обеспечивает
    // вызывающий (реестр) циклом генерации — см. room-registry.test.js.
    const constant = serverCodes.generateRoomCode(6, () => 0);
    expect(constant).toBe('AAAAAA');
  });

  it('префикс: чистка до 2–3 букв, дефолт GM', () => {
    expect(serverCodes.sanitizePrefix('vlt')).toBe('VLT');
    expect(serverCodes.sanitizePrefix('ab')).toBe('AB');
    expect(serverCodes.sanitizePrefix('abcd')).toBe('ABC');
    expect(serverCodes.sanitizePrefix('g1')).toBe('GM');
    expect(serverCodes.sanitizePrefix('')).toBe('GM');
    expect(serverCodes.sanitizePrefix(undefined)).toBe('GM');
  });
});
