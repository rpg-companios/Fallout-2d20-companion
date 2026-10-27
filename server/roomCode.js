'use strict';

// server/roomCode.js
// Адрес комнаты: «PP-XXXXXX» (пример GM-7Q3K9M). Код генерирует ТОЛЬКО
// сервер — уникальность конструктивная (§3.2 плана gm-rooms). Клиентское
// зеркало правил разбора/отображения — src/room/roomCode.ts; согласованность
// проверяет __tests__/room/room-code.test.js.

const crypto = require('node:crypto');
const { LIMITS } = require('./protocol');

// Алфавит без неоднозначных символов (нет 0/O, 1/I/L):
// 23 буквы + 8 цифр = 31 символ; 6 знаков ≈ 887 млн комбинаций.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEFAULT_PREFIX = 'GM';

// rng(maxExclusive) -> int [0, maxExclusive) — инъецируемо для тестов
// (проверка перегенерации при коллизии); по умолчанию крипто.
const defaultRandomInt = (maxExclusive) => crypto.randomInt(maxExclusive);

const generateRoomCode = (length = LIMITS.CODE_LENGTH, rng = defaultRandomInt) => {
  let code = '';
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[rng(CODE_ALPHABET.length)];
  return code;
};

// Префикс — косметика (§3.2): чистится до 2–3 латинских букв, иначе GM.
const sanitizePrefix = (raw) => {
  const cleaned = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  return cleaned.length >= 2 ? cleaned : DEFAULT_PREFIX;
};

/**
 * Разбор адреса, введённого пользователем: верхний регистр, срез всего,
 * кроме букв/цифр, последние codeLength символов — код, перед ними
 * префикс 2–3 буквы. Возвращает { prefix, code } | null.
 * Пользовательский ввод O/I/L/0/1 не восстанавливаем: в настоящих кодах
 * их нет, такой ввод считается ошибкой (null).
 */
const parseRoomAddress = (input, codeLength = LIMITS.CODE_LENGTH) => {
  const cleaned = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== codeLength + 2 && cleaned.length !== codeLength + 3) return null;
  const prefix = cleaned.slice(0, cleaned.length - codeLength);
  const code = cleaned.slice(cleaned.length - codeLength);
  if (!/^[A-Z]{2,3}$/.test(prefix)) return null;
  if (![...code].every((char) => CODE_ALPHABET.includes(char))) return null;
  return { prefix, code };
};

/** Канонический машинный вид: 'GM-7Q3K9M' (то, что ходит по сети и лежит в БД). */
const toCanonicalRoomCode = (input) => {
  const parsed = parseRoomAddress(input);
  return parsed ? `${parsed.prefix}-${parsed.code}` : null;
};

/** Экранный вид группами по 3: 'GM-7Q3-K9M'. Принимает канон или сырой ввод. */
const formatRoomCodeForDisplay = (input) => {
  const parsed = parseRoomAddress(input);
  if (!parsed) return String(input || '');
  const grouped = parsed.code.replace(/(.{3})(?=.)/g, '$1-');
  return `${parsed.prefix}-${grouped}`;
};

module.exports = {
  CODE_ALPHABET,
  DEFAULT_PREFIX,
  generateRoomCode,
  sanitizePrefix,
  parseRoomAddress,
  toCanonicalRoomCode,
  formatRoomCodeForDisplay,
};
