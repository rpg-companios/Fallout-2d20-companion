'use strict';

// server/accessExpression.js
// Патч 538: требования доступа «И/ИЛИ» вместо принудительного «ИЛИ».
//
// Слово владельца: «Запирание локации не принудительное "или", а возможность
// выбора и/или… кнопки "+" и "/"… + — и, / — или… Замок 1 + = нельзя,
// + Замок = нельзя, Замок + Терминал = можно, Замок / Терминал = можно».
//
// Выражение — чередующаяся последовательность токенов:
//   { type: 'check', id }  — операнд (точка-проверка: терминал или замок);
//   { type: 'op', op }     — оператор: '+' = И (AND), '/' = ИЛИ (OR).
// Корректное выражение начинается и заканчивается операндом, операторы не
// идут подряд и не стоят в начале/конце. Приоритет: «И» (+) связывает сильнее
// «ИЛИ» (/), т.е. «A + B / C» = (A И B) ИЛИ C. Скобок нет (слово владельца).
//
// Обратная совместимость: старые карточки хранят linkedCheckIds (до двух,
// ИЛИ). Из них собирается выражение со всеми операторами '/'. Новое поле
// accessExpression имеет приоритет; linkedCheckIds остаётся списком операндов
// для старых читателей.

const ACCESS_OP = Object.freeze({ AND: '+', OR: '/' });

const isNonEmptyId = (value) => String(value || '').trim().length > 0;

const makeCheckToken = (id) => ({ type: 'check', id: String(id || '').trim() });
const makeOpToken = (op) => ({ type: 'op', op: op === ACCESS_OP.AND ? ACCESS_OP.AND : ACCESS_OP.OR });

/** Нормализация токена; возвращает null для мусора. */
const normalizeAccessToken = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'check' && isNonEmptyId(raw.id)) return makeCheckToken(raw.id);
  if (raw.type === 'op' && (raw.op === ACCESS_OP.AND || raw.op === ACCESS_OP.OR)) {
    return makeOpToken(raw.op);
  }
  return null;
};

/**
 * Привести сырое выражение к массиву токенов. Принимает массив токенов,
 * объект { tokens } или legacy-список linkedCheckIds (ИЛИ). Подряд идущие
 * операнды или операторы отбрасываем как мусор (чередование обязательно);
 * осознанный повтор операнда через оператор сохраняется.
 */
const normalizeAccessExpression = (raw) => {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && Array.isArray(raw.tokens)) list = raw.tokens;
  else if (raw && Array.isArray(raw.linkedCheckIds)) {
    // Legacy: список источников через ИЛИ.
    const ids = raw.linkedCheckIds.filter(isNonEmptyId);
    const tokens = [];
    ids.forEach((id, idx) => {
      if (idx > 0) tokens.push(makeOpToken(ACCESS_OP.OR));
      tokens.push(makeCheckToken(id));
    });
    return tokens;
  }
  const out = [];
  for (const item of list) {
    const token = normalizeAccessToken(item);
    if (!token) continue;
    const prev = out[out.length - 1];
    // Не допускаем два операнда или два оператора подряд.
    if (prev && prev.type === token.type) continue;
    out.push(token);
  }
  return out;
};

/** Выражение завершено: непустое, начинается и заканчивается операндом. */
const isCompleteAccessExpression = (tokens) => {
  const list = Array.isArray(tokens) ? tokens : [];
  if (list.length === 0) return false;
  if (list.length % 2 === 0) return false; // операндов на 1 больше, чем операторов
  for (let i = 0; i < list.length; i += 1) {
    const expected = i % 2 === 0 ? 'check' : 'op';
    if (!list[i] || list[i].type !== expected) return false;
    if (expected === 'check' && !isNonEmptyId(list[i].id)) return false;
    if (expected === 'op' && list[i].op !== ACCESS_OP.AND && list[i].op !== ACCESS_OP.OR) return false;
  }
  return true;
};

/** Можно ли добавить операнд: пусто или последний токен — оператор. */
const canAppendCheck = (tokens) => {
  const list = Array.isArray(tokens) ? tokens : [];
  if (list.length === 0) return true;
  return list[list.length - 1].type === 'op';
};

/** Можно ли добавить оператор: последний токен — операнд. */
const canAppendOp = (tokens) => {
  const list = Array.isArray(tokens) ? tokens : [];
  if (list.length === 0) return false;
  return list[list.length - 1].type === 'check';
};

/** Добавить операнд (если можно). Возвращает новый массив. */
const appendCheck = (tokens, id) => {
  const list = Array.isArray(tokens) ? tokens : [];
  if (!canAppendCheck(list) || !isNonEmptyId(id)) return list;
  return [...list, makeCheckToken(id)];
};

/** Добавить оператор (если можно). Возвращает новый массив. */
const appendOp = (tokens, op) => {
  const list = Array.isArray(tokens) ? tokens : [];
  if (!canAppendOp(list)) return list;
  return [...list, makeOpToken(op)];
};

/** Убрать последний токен (шаг назад при сборке). */
const removeLastToken = (tokens) => {
  const list = Array.isArray(tokens) ? tokens : [];
  return list.slice(0, -1);
};

/** Список id операндов (для legacy-поля linkedCheckIds и отображения). */
const expressionCheckIds = (tokens) => {
  const list = Array.isArray(tokens) ? tokens : [];
  const seen = new Set();
  const out = [];
  for (const token of list) {
    if (token?.type === 'check' && isNonEmptyId(token.id) && !seen.has(token.id)) {
      seen.add(token.id);
      out.push(token.id);
    }
  }
  return out;
};

/**
 * Вычислить выражение. `isPassed(id)` сообщает, пройдена ли проверка.
 * Пустое/незавершённое выражение трактуем как «требования нет» → true.
 * Приоритет: И (+) сильнее ИЛИ (/): дизъюнкция конъюнкций.
 */
const evaluateAccessExpression = (tokens, isPassed) => {
  const list = Array.isArray(tokens) ? tokens : [];
  if (list.length === 0) return true;
  const passed = typeof isPassed === 'function' ? isPassed : () => false;
  // Разбиваем на ИЛИ-группы; внутри группы — И.
  let groupResult = true;
  let anyGroupPassed = false;
  let expectCheck = true;
  for (const token of list) {
    if (token?.type === 'check') {
      if (!expectCheck) continue;
      groupResult = groupResult && Boolean(passed(token.id));
      expectCheck = false;
    } else if (token?.type === 'op') {
      if (expectCheck) continue;
      if (token.op === ACCESS_OP.OR) {
        anyGroupPassed = anyGroupPassed || groupResult;
        groupResult = true;
      }
      // AND: продолжаем накапливать groupResult.
      expectCheck = true;
    }
  }
  anyGroupPassed = anyGroupPassed || groupResult;
  return anyGroupPassed;
};

/** Человекочитаемая строка: «Замок 1 + Терминал 1». getName(id) → имя. */
const formatAccessExpression = (tokens, getName) => {
  const list = Array.isArray(tokens) ? tokens : [];
  const name = typeof getName === 'function' ? getName : (id) => id;
  return list.map((token) => (
    token?.type === 'check' ? String(name(token.id) ?? token.id) : ` ${token.op} `
  )).join('');
};

/** Legacy linkedCheckIds (ИЛИ) → выражение. */
const linkedCheckIdsToExpression = (ids) => {
  const list = (Array.isArray(ids) ? ids : []).filter(isNonEmptyId);
  const tokens = [];
  list.forEach((id, idx) => {
    if (idx > 0) tokens.push(makeOpToken(ACCESS_OP.OR));
    tokens.push(makeCheckToken(id));
  });
  return tokens;
};

/**
 * Выбрать актуальное выражение точки: если есть валидное accessExpression —
 * оно; иначе legacy linkedCheckIds/linkedCheckId (ИЛИ). Пустой массив = нет
 * требования.
 */
const resolveAccessExpression = (raw = {}) => {
  const explicit = normalizeAccessExpression(raw?.accessExpression);
  if (explicit.length > 0) return explicit;
  const legacyIds = [
    ...(Array.isArray(raw?.linkedCheckIds) ? raw.linkedCheckIds : []),
    raw?.linkedCheckId,
  ].filter(isNonEmptyId);
  return linkedCheckIdsToExpression(legacyIds);
};

module.exports = {
  ACCESS_OP,
  makeCheckToken,
  makeOpToken,
  normalizeAccessToken,
  normalizeAccessExpression,
  isCompleteAccessExpression,
  canAppendCheck,
  canAppendOp,
  appendCheck,
  appendOp,
  removeLastToken,
  expressionCheckIds,
  evaluateAccessExpression,
  formatAccessExpression,
  linkedCheckIdsToExpression,
  resolveAccessExpression,
};
