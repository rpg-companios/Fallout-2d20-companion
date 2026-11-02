'use strict';

// Server-authoritative rules and board generation for shared terminal hacking.
const WORDS_BY_LENGTH = {
  4: ['ATOM', 'BOMB', 'CODE', 'DATA', 'DOOR', 'EXIT', 'FUEL', 'GAME', 'HACK', 'LOCK', 'MINE', 'PASS', 'RAID', 'SAFE', 'SHIP', 'VAULT'],
  5: ['ABOUT', 'AGENT', 'ALERT', 'ALONE', 'ARMOR', 'AWAIT', 'BLAST', 'BRAIN', 'CABLE', 'CLEAN', 'COVER', 'CRASH', 'DREAM', 'EARTH', 'FIGHT', 'FOUND', 'GHOST', 'GUARD', 'LASER', 'POWER', 'RADIO', 'ROBOT', 'SCORE', 'SHARE', 'SHELL', 'SHOCK', 'SPACE', 'SPELL', 'SWEET', 'TRUST', 'WATER', 'WORLD'],
  6: ['ACCESS', 'ACTION', 'ACTIVE', 'AFRAID', 'ANIMAL', 'ANSWER', 'ARREST', 'BEFORE', 'BOTTLE', 'BRIDGE', 'BUTTON', 'CHARGE', 'CHOICE', 'DAMAGE', 'DANGER', 'DOCTOR', 'ENERGY', 'ENGINE', 'FAMILY', 'FUTURE', 'GARDEN', 'HAMMER', 'HIDDEN', 'INSIDE', 'JUNGLE', 'LETTER', 'MARKET', 'MASTER', 'MEMORY', 'MUTANT', 'OBJECT', 'OPTION', 'ORANGE', 'OUTPUT', 'PEOPLE', 'PLANET', 'POCKET', 'REPAIR', 'RETURN', 'SCREEN', 'SECRET', 'SILVER', 'SYSTEM', 'TARGET', 'TUNNEL', 'WEAPON'],
  7: ['ABILITY', 'ACCOUNT', 'AGAINST', 'ANOTHER', 'BATTERY', 'BROTHER', 'CAPTAIN', 'CIRCUIT', 'COMMAND', 'CONTROL', 'DANGER', 'DEFENSE', 'DIAMOND', 'DISPLAY', 'EVACUATE', 'EXPLODE', 'FACTORY', 'FREEDOM', 'GUNFIRE', 'HEALTHY', 'HISTORY', 'HUNTERS', 'IMPROVE', 'JOURNAL', 'LEATHER', 'LIBRARY', 'MACHINE', 'MISSION', 'MONSTER', 'NOTHING', 'NUCLEAR', 'OFFICER', 'PASSAGE', 'PATTERN', 'PROGRAM', 'PROTECT', 'QUALITY', 'SCIENCE', 'STORAGE', 'STRANGE', 'SUCCESS', 'SUPPORT', 'SURVIVE', 'WEATHER'],
  8: ['ASSEMBLY', 'ATTACKER', 'BACKPACK', 'BUILDING', 'COMPUTER', 'CONFLICT', 'CREATURE', 'CULTURAL', 'DAUGHTER', 'DISASTER', 'EQUIPPED', 'EVERYONE', 'EXPLOSION', 'FIGHTING', 'FUNCTION', 'HOSPITAL', 'INDUSTRY', 'INFINITE', 'LANGUAGE', 'MATERIAL', 'MEDICINE', 'MILITARY', 'MOUNTAIN', 'MURDERED', 'NATIONAL', 'OPERATOR', 'PASSWORD', 'PERSONAL', 'PHYSICAL', 'POSSIBLE', 'PRESERVE', 'PROTOCOL', 'QUANTITY', 'RADIATION', 'RESEARCH', 'SECURITY', 'SENTENCE', 'SHELTERS', 'SOLUTION', 'SURVIVAL', 'TOGETHER', 'TREASURE', 'UNIVERSE', 'VALUABLE', 'WASTELAND'],
  9: ['ABANDONED', 'ACCURACY', 'ADVENTURE', 'AFTERLIFE', 'AGREEMENT', 'ATTENTION', 'BEGINNING', 'BLUEPRINT', 'BULLETPROOF', 'CHEMISTRY', 'COMMUNITY', 'DANGEROUS', 'DEADLIEST', 'DETERMINE', 'DIFFICULTY', 'DIRECTION', 'EDUCATION', 'ELECTRICAL', 'EMERGENCY', 'EXPERIENCE', 'EXPLOSIVE', 'FORTUNATE', 'GENERATOR', 'IMPORTANT', 'INVENTORY', 'KNOWLEDGE', 'LABORATORY', 'LANDSCAPE', 'MACHINERY', 'MUTATIONS', 'NECESSARY', 'ORDINANCE', 'PERMISSION', 'PRESIDENT', 'PRODUCTION', 'RADIATION', 'RECOMMEND', 'REINFORCE', 'SCIENTIST', 'TECHNIQUE', 'TREATMENT', 'WONDERFUL'],
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const randomInt = (max, rng = Math.random) => Math.floor(rng() * max);
const normalizeTerminalConfig = (raw = {}) => ({
  containerId: String(raw.containerId || raw.id || '').trim(),
  name: String(raw.name || '').trim(),
  description: String(raw.description || '').trim(),
  difficulty: clamp(Math.floor(Number(raw.difficulty) || 0), 0, 5),
  lockOnFailure: Boolean(raw.lockOnFailure),
});

// CJS-копия маркера из domain/lootTrade.js: формат должен совпадать побайтово.
// Старые серверы комнат понижали `kind: 'terminal'` узла локации до 'loot' и
// теряли difficulty/lockOnFailure; lockLabel при этом сохранялся. Обновлённый
// сервер восстанавливает терминал из маркера, а клиент — даже если сервер
// вообще не обновлялся (локальная мини-игра).
const TERMINAL_NODE_MARKER = 'F2D20-TERM:';
const encodeTerminalNodeMarker = ({ difficulty = 0, lockOnFailure = false, label = '' } = {}) => (
  `${TERMINAL_NODE_MARKER}${JSON.stringify({
    v: 1,
    d: clamp(Math.floor(Number(difficulty) || 0), 0, 5),
    f: lockOnFailure ? 1 : 0,
    l: String(label || ''),
  })}`
);
const decodeTerminalNodeMarker = (value) => {
  const raw = String(value || '');
  if (!raw.startsWith(TERMINAL_NODE_MARKER)) return null;
  try {
    const parsed = JSON.parse(raw.slice(TERMINAL_NODE_MARKER.length));
    if (!parsed || parsed.v !== 1) return null;
    return {
      difficulty: clamp(Math.floor(Number(parsed.d) || 0), 0, 5),
      lockOnFailure: Boolean(parsed.f),
      label: String(parsed.l || ''),
    };
  } catch {
    return null;
  }
};

const recoveryChancePercent = (intelligence, science) => clamp(
  10 * ((Number(intelligence) || 0) - 4) + (10 / 3) * (Number(science) || 0),
  0,
  80,
);

const toNumber = (entry) => Number(typeof entry === 'object'
  ? (entry?.value ?? entry?.base ?? entry?.total ?? entry?.rank)
  : entry) || 0;
const readAttribute = (snapshot, id) => {
  const attrs = snapshot?.attributes || {};
  const keys = { INT: ['INT', 'int', 'intelligence'], SCI: ['SCI', 'science', 'Science'] }[id];
  for (const key of keys) if (attrs[key] !== undefined) return toNumber(attrs[key]);
  if (Array.isArray(attrs)) {
    const found = attrs.find((x) => String(x?.id || x?.key || '').toUpperCase() === id);
    if (found) return toNumber(found);
  }
  return 0;
};
const scienceRank = (snapshot) => {
  const skills = snapshot?.skills || {};
  if (Array.isArray(skills)) {
    const found = skills.find((x) => /^(science|наука)$/i.test(String(x?.id || x?.name || '')));
    return Math.max(0, Math.floor(toNumber(found?.rank !== undefined ? found.rank : found)));
  }
  for (const key of ['science', 'Science', 'SCIENCE', 'Наука', 'наука']) {
    if (skills[key] !== undefined) return Math.max(0, Math.floor(toNumber(skills[key])));
  }
  const selected = Array.isArray(snapshot?.selectedSkills) ? snapshot.selectedSkills : [];
  const selectedScience = selected.find((x) => /^(science|наука)$/i.test(String(typeof x === 'string' ? x : x?.id || x?.name || '')));
  return Math.max(0, Math.floor(toNumber(selectedScience?.rank !== undefined ? selectedScience.rank : selectedScience)));
};
const rankOfPerk = (snapshot, id) => (Array.isArray(snapshot?.selectedPerks) ? snapshot.selectedPerks : [])
  .reduce((rank, entry) => {
    const entryId = typeof entry === 'string' ? entry : (entry?.id || entry?.perkId);
    if (entryId !== id) return rank;
    return Math.max(rank, Math.max(1, Math.floor(Number(entry?.rank ?? entry?.ranks ?? entry?.count) || 1)));
  }, 0);

const characterStats = (snapshot) => ({
  intelligence: readAttribute(snapshot, 'INT'),
  science: scienceRank(snapshot),
  hackerRank: rankOfPerk(snapshot, 'hacker'),
  digestUsed: Boolean(snapshot?.terminalHacking?.digestUsed)
    || (Array.isArray(snapshot?.usedMagazineEffects) ? snapshot.usedMagazineEffects : []).includes('mag_programmers_digest'),
  hasDigest: Boolean(snapshot?.terminalHacking?.hasProgrammersDigest) || Object.entries(snapshot?.items || {}).some(([key, item]) => (
    key === 'mag_programmers_digest'
    || item?.itemId === 'mag_programmers_digest'
    || item?.catalogId === 'mag_programmers_digest'
    || item?.id === 'mag_programmers_digest'
    || item?.snapshot?.id === 'mag_programmers_digest'
  )),
});

const shuffle = (items, rng) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1, rng);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const createGame = ({ config, operatorClientId, operatorCharacterId, characterSnapshot, now = Date.now(), rng = Math.random }) => {
  const difficulty = config.difficulty;
  const stats = characterStats(characterSnapshot);
  const effectiveDifficulty = Math.max(0, difficulty - stats.hackerRank);
  const wordLength = effectiveDifficulty + 4;
  const wordPool = [...new Set(WORDS_BY_LENGTH[wordLength].filter((word) => word.length === wordLength))];
  const chosen = shuffle(wordPool, rng).slice(0, 12);
  const passwordIndex = randomInt(chosen.length, rng);
  const columns = 2;
  const rowsPerColumn = 17;
  const width = 12;
  const glyphs = '!@#$%^&*()_+-=[]{}<>?/\\|:;,.~';
  const board = Array.from({ length: columns * rowsPerColumn * width }, () => glyphs[randomInt(glyphs.length, rng)]);
  const wordRanges = [];
  const occupied = new Set();
  for (const word of chosen) {
    const candidates = shuffle(Array.from({ length: board.length / width }, (_, row) => row), rng);
    let start = -1;
    for (const row of candidates) {
      const rowStart = row * width;
      const col = randomInt(width - word.length + 1, rng);
      const proposed = rowStart + col;
      let valid = true;
      for (let i = 0; i < word.length; i += 1) if (occupied.has(proposed + i)) valid = false;
      if (valid) { start = proposed; break; }
    }
    if (start < 0) continue;
    for (let i = 0; i < word.length; i += 1) {
      board[start + i] = word[i];
      occupied.add(start + i);
    }
    wordRanges.push({ id: `word_${now}_${start}`, word, start, end: start + word.length, removed: false, guessed: false, isPassword: chosen[passwordIndex] === word });
  }
  const brackets = [];
  const bracketPairs = ['()', '[]', '{}', '<>'];
  const bracketCount = 4 + randomInt(4, rng);
  for (let groupIndex = 0; groupIndex < bracketCount; groupIndex += 1) {
    const pair = bracketPairs[randomInt(bracketPairs.length, rng)];
    const length = 3 + randomInt(6, rng);
    const preferredRow = randomInt(board.length / width, rng);
    let start = -1;
    const candidateWidth = width - length + 1;
    for (let rowOffset = 0; rowOffset < board.length / width && start < 0; rowOffset += 1) {
      const row = (preferredRow + rowOffset) % (board.length / width);
      const preferredCol = randomInt(candidateWidth, rng);
      for (let colOffset = 0; colOffset < candidateWidth; colOffset += 1) {
        const candidate = row * width + ((preferredCol + colOffset) % candidateWidth);
        let free = true;
        for (let i = 0; i < length; i += 1) if (occupied.has(candidate + i)) free = false;
        if (free) { start = candidate; break; }
      }
    }
    if (start < 0) break;
    board[start] = pair[0];
    board[start + length - 1] = pair[1];
    for (let i = 1; i < length - 1; i += 1) board[start + i] = ['@', '#', '$', '%', '&', '*', '+', '-', '/', ':', ';', '?'][randomInt(12, rng)];
    for (let i = 0; i < length; i += 1) occupied.add(start + i);
    brackets.push({ id: `bracket_${now}_${start}`, start, end: start + length, text: board.slice(start, start + length).join(''), used: false, recovery: false });
  }
  const hasRecovery = rng() * 100 < recoveryChancePercent(stats.intelligence, stats.science);
  if (hasRecovery && brackets.length > 0) brackets[randomInt(brackets.length, rng)].recovery = true;
  const safeWordRanges = wordRanges.length ? wordRanges : [];
  const safePassword = safeWordRanges.find((entry) => entry.isPassword)?.word || chosen[0];
  return {
    containerId: config.containerId,
    name: config.name,
    description: config.description,
    difficulty,
    lockOnFailure: config.lockOnFailure,
    status: 'playing',
    operatorClientId,
    operatorCharacterId,
    operatorName: '',
    intelligence: stats.intelligence,
    science: stats.science,
    effectiveDifficulty,
    wordLength,
    attempts: 4,
    maxAttempts: 4,
    board: board.join(''),
    wordRanges: safeWordRanges,
    password: safePassword,
    bracketRanges: brackets,
    guesses: [],
    result: '',
    scrollUp: false,
    digestEligible: Boolean(stats.hasDigest && !stats.digestUsed),
    digestUsed: false,
    recoveryChancePercent: recoveryChancePercent(stats.intelligence, stats.science),
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
};

const publicGameState = (game) => {
  if (!game) return null;
  const { password, operatorClientId, digestEligible, ...rest } = game;
  return {
    ...rest,
    operatorClientId,
    digestEligible: game.status === 'pendingDigest' && digestEligible,
    bracketRanges: (game.bracketRanges || []).map(({ recovery, ...bracket }) => bracket),
    wordRanges: (game.wordRanges || []).map(({ isPassword, ...word }) => ({
      ...word,
      ...(game.effectiveDifficulty === 0 && isPassword ? { isPassword: true } : {}),
    })),
  };
};

const failGame = (game, { now }) => {
  if (game.attempts > 0) return game;
  if (game.lockOnFailure && game.digestEligible && !game.digestUsed) {
    return { ...game, status: 'pendingDigest', result: '', scrollUp: false, updatedAt: now, revision: game.revision + 1 };
  }
  if (game.lockOnFailure) {
    return { ...game, status: 'locked', result: 'ACCESS DENIED', scrollUp: false, updatedAt: now, revision: game.revision + 1 };
  }
  return { ...game, status: 'failed', result: '', scrollUp: false, updatedAt: now, revision: game.revision + 1 };
};

const applyGameAction = ({ game, action, clientId, characterId, characterSnapshot, value, now = Date.now(), rng = Math.random }) => {
  if (!game) return { error: 'TERMINAL_NOT_ISSUED' };
  if (action === 'unlock' || action === 'reset') return { error: 'TERMINAL_GM_ONLY' };
  if (game.status === 'locked') return { error: 'TERMINAL_LOCKED' };
  if (action === 'start') {
    if (game.status === 'won') return { error: 'TERMINAL_ALREADY_ACTIVE' };
    const stats = characterStats(characterSnapshot);
    const effectiveDifficulty = Math.max(0, game.difficulty - stats.hackerRank);
    const fresh = createGame({
      config: game,
      operatorClientId: clientId,
      operatorCharacterId: characterId,
      characterSnapshot,
      now,
      rng,
    });
    fresh.operatorName = String(characterSnapshot?.characterName || characterSnapshot?.name || '');
    return { game: fresh };
  }
  if (game.status === 'pendingDigest') {
    if (game.operatorClientId !== clientId || game.operatorCharacterId !== characterId) return { error: 'TERMINAL_VIEW_ONLY' };
    if (action === 'useDigest') {
      if (!game.digestEligible || game.digestUsed || !characterStats(characterSnapshot).hasDigest) return { error: 'TERMINAL_DIGEST_UNAVAILABLE' };
      return { game: { ...game, status: 'playing', attempts: 1, digestEligible: false, digestUsed: true, result: 'DIGEST USED', updatedAt: now, revision: game.revision + 1 }, usedDigest: true };
    }
    if (action === 'declineDigest') {
      const status = game.lockOnFailure ? 'locked' : 'failed';
      return { game: { ...game, status, digestEligible: false, result: status === 'locked' ? 'ACCESS DENIED' : '', updatedAt: now, revision: game.revision + 1 } };
    }
    return { error: 'TERMINAL_DIGEST_DECISION_REQUIRED' };
  }
  if (game.status !== 'playing') return { error: 'TERMINAL_NOT_ACTIVE' };
  if (game.operatorClientId !== clientId || game.operatorCharacterId !== characterId) return { error: 'TERMINAL_VIEW_ONLY' };
  if (action === 'guess') {
    const range = game.wordRanges.find((entry) => entry.id === value || entry.word === String(value).toUpperCase());
    if (!range || range.removed || range.guessed) return { error: 'TERMINAL_INVALID_GUESS' };
    if (range.word === game.password) {
      return { game: { ...game, status: 'won', result: 'ACCESS GRANTED', scrollUp: true, updatedAt: now, revision: game.revision + 1, wordRanges: game.wordRanges.map((entry) => ({ ...entry, removed: true })) } };
    }
    const likeness = [...range.word].reduce((total, letter, index) => total + (letter === game.password[index] ? 1 : 0), 0);
    const next = {
      ...game,
      attempts: Math.max(0, game.attempts - 1),
      guesses: [...game.guesses, { word: range.word, likeness }],
      wordRanges: game.wordRanges.map((entry) => entry.id === range.id ? { ...entry, guessed: true, removed: true } : entry),
      updatedAt: now,
      revision: game.revision + 1,
    };
    return { game: failGame(next, { now }) };
  }
  if (action === 'bracket') {
    const bracket = game.bracketRanges.find((entry) => entry.id === value);
    if (!bracket || bracket.used) return { error: 'TERMINAL_INVALID_BRACKET' };
    let next = { ...game, bracketRanges: game.bracketRanges.map((entry) => entry.id === bracket.id ? { ...entry, used: true } : entry) };
    if (bracket.recovery) {
      next = { ...next, attempts: next.maxAttempts };
      next.result = 'ATTEMPTS RESTORED';
    } else {
      const duds = next.wordRanges.filter((entry) => !entry.isPassword && !entry.removed);
      if (duds.length) {
        const dud = duds[randomInt(duds.length, rng)];
        next.wordRanges = next.wordRanges.map((entry) => entry.id === dud.id ? { ...entry, removed: true } : entry);
      }
      next.result = 'DUD REMOVED';
    }
    next.updatedAt = now;
    next.revision += 1;
    return { game: next };
  }
  return { error: 'BAD_MESSAGE' };
};

module.exports = {
  WORDS_BY_LENGTH,
  TERMINAL_NODE_MARKER,
  encodeTerminalNodeMarker,
  decodeTerminalNodeMarker,
  normalizeTerminalConfig,
  recoveryChancePercent,
  characterStats,
  createGame,
  publicGameState,
  applyGameAction,
};
