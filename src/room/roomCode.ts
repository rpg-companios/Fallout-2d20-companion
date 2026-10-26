// src/room/roomCode.ts
// Клиентское зеркало правил адреса комнаты (серверное — server/roomCode.js,
// план gm-rooms §3.2). Сервер — единственный генератор кодов; здесь только
// разбор пользовательского ввода и экранные формы. Согласованность правил
// с сервером проверяет __tests__/room/room-code.test.js.

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const DEFAULT_ROOM_PREFIX = 'GM';

export type ParsedRoomAddress = { prefix: string; code: string };

/**
 * Разбор введённого адреса: верхний регистр, срез небуквенно-цифровых
 * символов (дефисы/пробелы игнорируются), последние ROOM_CODE_LENGTH
 * знаков — код, перед ними префикс 2–3 буквы. Символы 0/O, 1/I/L в
 * настоящих кодах отсутствуют — ввод с ними считается ошибкой (null).
 */
export const parseRoomAddress = (input: string): ParsedRoomAddress | null => {
  const cleaned = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== ROOM_CODE_LENGTH + 2 && cleaned.length !== ROOM_CODE_LENGTH + 3) return null;
  const prefix = cleaned.slice(0, cleaned.length - ROOM_CODE_LENGTH);
  const code = cleaned.slice(cleaned.length - ROOM_CODE_LENGTH);
  if (!/^[A-Z]{2,3}$/.test(prefix)) return null;
  if (![...code].every((char) => ROOM_CODE_ALPHABET.includes(char))) return null;
  return { prefix, code };
};

/** Канонический машинный вид 'GM-7Q3K9M' (провод, БД) или null при ошибке. */
export const toCanonicalRoomCode = (input: string): string | null => {
  const parsed = parseRoomAddress(input);
  return parsed ? `${parsed.prefix}-${parsed.code}` : null;
};

/** Экранный вид группами по 3: 'GM-7Q3-K9M' (принимает канон или ввод). */
export const formatRoomCodeForDisplay = (input: string): string => {
  const parsed = parseRoomAddress(input);
  if (!parsed) return String(input || '');
  const grouped = parsed.code.replace(/(.{3})(?=.)/g, '$1-');
  return `${parsed.prefix}-${grouped}`;
};
