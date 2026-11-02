'use strict';

// Server-authoritative rules and board generation for shared terminal hacking.
// Слова для доски. Короткие длины дополнены «семейками» анаграмм (POST/SPOT/
// STOP/TOPS, MEAT/TEAM/MATE/TAME, EARTH/HEART/HATER и т.д.): в Fallout 3
// варианты пароля намеренно похожи — у них общие буквы, но на других
// позициях, поэтому числовая подсказка мала, а отбросить слова глазами нельзя.
const WORDS_BY_LENGTH = {
  4: ['ATOM', 'BOMB', 'CODE', 'DATA', 'DOOR', 'EXIT', 'FUEL', 'GAME', 'HACK', 'LOCK', 'MINE', 'PASS', 'RAID', 'SAFE', 'SHIP', 'VAULT',
    'POST', 'SPOT', 'STOP', 'TOPS', 'POTS', 'OPTS', 'TEAM', 'MEAT', 'MATE', 'TAME', 'RATE', 'TEAR', 'TARE', 'LAST', 'SALT', 'SLAT',
    'STAR', 'RATS', 'ARTS', 'LIVE', 'EVIL', 'VILE', 'VEIL', 'ITEM', 'TIME', 'EMIT', 'MITE', 'DARE', 'READ', 'DEAR', 'NOTE', 'TONE',
    'WARD', 'DRAW', 'HEAT', 'HATE', 'LOST', 'SLOT', 'LOTS'],
  5: ['ABOUT', 'AGENT', 'ALERT', 'ALONE', 'ARMOR', 'AWAIT', 'BLAST', 'BRAIN', 'CABLE', 'CLEAN', 'COVER', 'CRASH', 'DREAM', 'EARTH', 'FIGHT', 'FOUND', 'GHOST', 'GUARD', 'LASER', 'POWER', 'RADIO', 'ROBOT', 'SCORE', 'SHARE', 'SHELL', 'SHOCK', 'SPACE', 'SPELL', 'SWEET', 'TRUST', 'WATER', 'WORLD',
    'HEART', 'HATER', 'BELOW', 'ELBOW', 'BOWEL', 'ANGEL', 'ANGLE', 'GLEAN', 'LEAST', 'SLATE', 'STALE', 'STEAL', 'TALES', 'THERE', 'THREE',
    'ETHER', 'CRATE', 'CATER', 'TRACE', 'REACT', 'SHEAR', 'HARES', 'SPARE', 'SPEAR', 'PARES', 'REAPS', 'STARE', 'RATES', 'TEARS', 'ASTER',
    'ALTER', 'LATER'],
  6: ['ACCESS', 'ACTION', 'ACTIVE', 'AFRAID', 'ANIMAL', 'ANSWER', 'ARREST', 'BEFORE', 'BOTTLE', 'BRIDGE', 'BUTTON', 'CHARGE', 'CHOICE', 'DAMAGE', 'DANGER', 'DOCTOR', 'ENERGY', 'ENGINE', 'FAMILY', 'FUTURE', 'GARDEN', 'HAMMER', 'HIDDEN', 'INSIDE', 'JUNGLE', 'LETTER', 'MARKET', 'MASTER', 'MEMORY', 'MUTANT', 'OBJECT', 'OPTION', 'ORANGE', 'OUTPUT', 'PEOPLE', 'PLANET', 'POCKET', 'REPAIR', 'RETURN', 'SCREEN', 'SECRET', 'SILVER', 'SYSTEM', 'TARGET', 'TUNNEL', 'WEAPON'],
  7: ['ABILITY', 'ACCOUNT', 'AGAINST', 'ANOTHER', 'BATTERY', 'BROTHER', 'CAPTAIN', 'CIRCUIT', 'COMMAND', 'CONTROL', 'DANGER', 'DEFENSE', 'DIAMOND', 'DISPLAY', 'EVACUATE', 'EXPLODE', 'FACTORY', 'FREEDOM', 'GUNFIRE', 'HEALTHY', 'HISTORY', 'HUNTERS', 'IMPROVE', 'JOURNAL', 'LEATHER', 'LIBRARY', 'MACHINE', 'MISSION', 'MONSTER', 'NOTHING', 'NUCLEAR', 'OFFICER', 'PASSAGE', 'PATTERN', 'PROGRAM', 'PROTECT', 'QUALITY', 'SCIENCE', 'STORAGE', 'STRANGE', 'SUCCESS', 'SUPPORT', 'SURVIVE', 'WEATHER'],
  8: ['ASSEMBLY', 'ATTACKER', 'BACKPACK', 'BUILDING', 'COMPUTER', 'CONFLICT', 'CREATURE', 'CULTURAL', 'DAUGHTER', 'DISASTER', 'EQUIPPED', 'EVERYONE', 'EXPLOSION', 'FIGHTING', 'FUNCTION', 'HOSPITAL', 'INDUSTRY', 'INFINITE', 'LANGUAGE', 'MATERIAL', 'MEDICINE', 'MILITARY', 'MOUNTAIN', 'MURDERED', 'NATIONAL', 'OPERATOR', 'PASSWORD', 'PERSONAL', 'PHYSICAL', 'POSSIBLE', 'PRESERVE', 'PROTOCOL', 'QUANTITY', 'RADIATION', 'RESEARCH', 'SECURITY', 'SENTENCE', 'SHELTERS', 'SOLUTION', 'SURVIVAL', 'TOGETHER', 'TREASURE', 'UNIVERSE', 'VALUABLE', 'WASTELAND'],
  9: ['ABANDONED', 'ACCURACY', 'ADVENTURE', 'AFTERLIFE', 'AGREEMENT', 'ATTENTION', 'BEGINNING', 'BLUEPRINT', 'BULLETPROOF', 'CHEMISTRY', 'COMMUNITY', 'DANGEROUS', 'DEADLIEST', 'DETERMINE', 'DIFFICULTY', 'DIRECTION', 'EDUCATION', 'ELECTRICAL', 'EMERGENCY', 'EXPERIENCE', 'EXPLOSIVE', 'FORTUNATE', 'GENERATOR', 'IMPORTANT', 'INVENTORY', 'KNOWLEDGE', 'LABORATORY', 'LANDSCAPE', 'MACHINERY', 'MUTATIONS', 'NECESSARY', 'ORDINANCE', 'PERMISSION', 'PRESIDENT', 'PRODUCTION', 'RADIATION', 'RECOMMEND', 'REINFORCE', 'SCIENTIST', 'TECHNIQUE', 'TREATMENT', 'WONDERFUL'],
};

// Патч 494: баланс мини-игры по мотивам Fallout 3 / New Vegas.
// Сложность задаёт длину пароля и ПОТОЛОК числовой подсказки: чем выше
// сложность, тем меньше букв может совпасть по позиции (4-5 из 9 больше не
// бывает). Слова при этом подбираются похожими — с общим набором букв, но
// расставленными иначе. Список слов тем короче, чем выше ИНТ + Наука.
const MAX_LIKENESS_BY_DIFFICULTY = [3, 3, 3, 2, 2, 2];
const MIN_AMBIGUITY_BY_DIFFICULTY = [3, 3, 3, 3, 3, 4];
const BASE_WORDS_BY_DIFFICULTY = [12, 12, 12, 12, 12, 13];
const MIN_WORDS = 6;

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

// Число совпавших букв на своих местах — ровно та подсказка «N/M правильно»,
// которую показывает терминал в Fallout 3.
const positionalLikeness = (word, password) => [...word]
  .reduce((total, letter, index) => total + (letter === password[index] ? 1 : 0), 0);

// Сколько всего общих букв (без учёта позиции). Высокое значение = слова
// «похожие», но подсказка при этом остаётся маленькой: буквы переставлены.
const sharedLetters = (word, password) => {
  const left = {};
  for (const letter of password) left[letter] = (left[letter] || 0) + 1;
  let total = 0;
  for (const letter of word) {
    if (left[letter] > 0) { left[letter] -= 1; total += 1; }
  }
  return total;
};

// ИНТ 4..10 + Наука 0..6 => 4..16 «очков» и 0..12 бонуса.
const skillScore = (intelligence, science) => (
  clamp(Number(intelligence) || 4, 4, 10) + clamp(Number(science) || 0, 0, 6)
);
const skillBonus = (intelligence, science) => skillScore(intelligence, science) - 4;

// Чем выше показатель, тем меньше слов надо перебирать. Но сложность 5
// остаётся сложной даже при максимуме: 13 -> 12 слов, потолок подсказки 2/9.
const passwordWordCount = (effectiveDifficulty, intelligence, science) => {
  const tier = clamp(Math.floor(Number(effectiveDifficulty) || 0), 0, 5);
  const reduction = clamp(Math.floor(skillBonus(intelligence, science) / 2) - tier, 0, 6);
  return Math.max(MIN_WORDS, BASE_WORDS_BY_DIFFICULTY[tier] - reduction);
};

// Свой ГПСЧ: даже если вызывающий передал вырожденный rng () => 0 (тесты),
// перебор вариантов не зацикливается и остаётся воспроизводимым.
const seededRng = (rng) => {
  let state = Math.floor(rng() * 2147483648) || 0x9e3779b9;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

/**
 * Собирает набор слов для доски.
 *
 * Ключевое свойство (исправляет «нашёл за две попытки»): для любого первого
 * неверного выбора остаётся не меньше MIN_AMBIGUITY кандидатов с такой же
 * подсказкой. Подсказка при этом не превышает потолок сложности, а все слова
 * имеют общий набор букв с паролем. Набор ищется перебором по предвычисленной
 * матрице попарных совпадений; берётся лучший из нескольких вариантов.
 */
const buildPasswordSet = ({ wordLength, effectiveDifficulty, wordCount, rng = Math.random }) => {
  const tier = clamp(Math.floor(Number(effectiveDifficulty) || 0), 0, 5);
  const likenessCap = MAX_LIKENESS_BY_DIFFICULTY[tier];
  const targetAmbiguity = MIN_AMBIGUITY_BY_DIFFICULTY[tier];
  const words = [...new Set((WORDS_BY_LENGTH[wordLength] || []).filter((word) => word.length === wordLength))];
  const total = words.length;
  const likeness = new Uint8Array(total * total);
  const shared = new Uint8Array(total * total);
  for (let i = 0; i < total; i += 1) {
    for (let j = 0; j < total; j += 1) {
      likeness[i * total + j] = positionalLikeness(words[i], words[j]);
      shared[i * total + j] = sharedLetters(words[i], words[j]);
    }
  }
  const internal = seededRng(rng);
  const targetShared = Math.max(1, Math.ceil(wordLength * 0.6));
  // Ниже этого порога не спускаемся: иначе в списке окажутся совсем
  // неродственные слова и «похожесть» пропадёт. Если у пароля мало таких
  // соседей — пробуем другой пароль, а не разбавляем доску чужими словами.
  const minimumShared = wordLength >= 6 ? Math.max(2, Math.floor(wordLength * 0.45)) : 1;

  const evaluate = (set, password) => {
    let minCandidates = 99;
    let minAfterTwo = 99;
    let maxHint = 0;
    let minShared = 99;
    let sharedSum = 0;
    const hintKinds = new Set();
    let decoys = 0;
    for (const word of set) {
      if (word === password) continue;
      const hint = likeness[word * total + password];
      const common = shared[word * total + password];
      maxHint = Math.max(maxHint, hint);
      minShared = Math.min(minShared, common);
      sharedSum += common;
      hintKinds.add(hint);
      decoys += 1;
    }
    for (const guess of set) {
      if (guess === password) continue;
      const hint = likeness[guess * total + password];
      const candidates = [];
      for (const word of set) {
        if (word !== guess && likeness[guess * total + word] === hint) candidates.push(word);
      }
      minCandidates = Math.min(minCandidates, candidates.length);
      for (const second of candidates) {
        if (second === password) continue;
        const secondHint = likeness[second * total + password];
        let survivors = 0;
        for (const word of candidates) {
          if (word !== second && likeness[second * total + word] === secondHint) survivors += 1;
        }
        minAfterTwo = Math.min(minAfterTwo, survivors);
      }
    }
    if (minAfterTwo === 99) minAfterTwo = 9;
    // Сначала гарантируем «не угадать за одну подсказку», затем глубину
    // перебора, затем разнообразие подсказок и похожесть слов.
    const score = Math.min(minCandidates, targetAmbiguity) * 10000
      + (maxHint >= Math.min(2, likenessCap) ? 3000 : maxHint * 500)
      + minAfterTwo * 300
      + hintKinds.size * 100
      + minShared * 10
      + sharedSum / Math.max(decoys, 1);
    return { minCandidates, minAfterTwo, maxHint, minShared, score };
  };

  let best = null;
  const passwordCandidates = shuffle(Array.from({ length: total }, (_, i) => i), internal).slice(0, 32);
  for (const password of passwordCandidates) {
    let similar = [];
    for (let threshold = targetShared; threshold >= minimumShared; threshold -= 1) {
      similar = Array.from({ length: total }, (_, i) => i).filter((i) => (
        i !== password
        && shared[i * total + password] >= threshold
        && likeness[i * total + password] <= likenessCap
      ));
      if (similar.length >= wordCount - 1) break;
    }
    if (similar.length < wordCount - 1) continue;

    // Часть попыток обязательно содержит слово с максимально допустимой
    // подсказкой: иначе перебор скатывается к доскам, где все ответы «0/9»
    // или «1/9», и числовая подсказка перестаёт что-либо подсказывать.
    const loud = similar.filter((i) => likeness[i * total + password] === likenessCap);
    let local = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const decoys = shuffle(similar, internal).slice(0, wordCount - 1);
      if (loud.length && attempt % 2 === 0) {
        const forced = loud[randomInt(loud.length, internal)];
        if (!decoys.includes(forced)) decoys[randomInt(decoys.length, internal)] = forced;
      }
      const set = [password, ...decoys];
      const metrics = evaluate(set, password);
      if (!local || metrics.score > local.metrics.score) local = { set, password, metrics };
    }
    const spare = shuffle(similar.filter((i) => !local.set.includes(i)), internal).slice(0, 8);
    let improved = true;
    let passes = 0;
    while (improved && passes < 2) {
      improved = false;
      passes += 1;
      for (let position = 1; position < local.set.length; position += 1) {
        for (const candidate of spare) {
          if (local.set.includes(candidate)) continue;
          const trial = [...local.set];
          trial[position] = candidate;
          const metrics = evaluate(trial, local.password);
          if (metrics.score > local.metrics.score) {
            local = { ...local, set: trial, metrics };
            improved = true;
          }
        }
      }
    }
    if (!best || local.metrics.score > best.metrics.score) best = { ...local, similar };
    if (best.metrics.minCandidates >= targetAmbiguity && best.metrics.minAfterTwo >= 2 && best.metrics.maxHint <= likenessCap) break;
  }

  // Вырожденный словарь/параметры: всё равно отдаём корректную доску.
  if (!best) {
    const password = shuffle(Array.from({ length: total }, (_, i) => i), internal)[0];
    const compatible = shuffle(
      Array.from({ length: total }, (_, i) => i).filter((i) => i !== password && likeness[i * total + password] <= likenessCap),
      internal,
    );
    const set = [password, ...compatible].slice(0, wordCount);
    best = { set, password, metrics: evaluate(set, password) };
  }

  return {
    words: best.set.map((i) => words[i]),
    password: words[best.password],
    likenessCap,
    minAmbiguity: best.metrics.minCandidates,
    minShared: best.metrics.minShared,
  };
};

const createGame = ({ config, operatorClientId, operatorCharacterId, characterSnapshot, now = Date.now(), rng = Math.random }) => {
  const difficulty = config.difficulty;
  const stats = characterStats(characterSnapshot);
  const effectiveDifficulty = Math.max(0, difficulty - stats.hackerRank);
  const wordLength = effectiveDifficulty + 4;
  const wordCount = passwordWordCount(effectiveDifficulty, stats.intelligence, stats.science);
  const selection = buildPasswordSet({ wordLength, effectiveDifficulty, wordCount, rng });
  const chosen = selection.words;
  const password = selection.password;
  const columns = 2;
  const rowsPerColumn = 17;
  const width = 12;
  const glyphs = '!@#$%^&*()_+-=[]{}<>?/\\|:;,.~';
  const board = Array.from({ length: columns * rowsPerColumn * width }, () => glyphs[randomInt(glyphs.length, rng)]);
  const wordRanges = [];
  const occupied = new Set();
  const rowsCount = board.length / width;
  for (const word of chosen) {
    let start = -1;
    // Полный перебор строк и колонок: слово всегда найдёт место, даже если
    // доска уже плотно заполнена (13 слов по 9 букв = 117 ячеек из 408).
    for (const row of shuffle(Array.from({ length: rowsCount }, (_, index) => index), rng)) {
      if (start >= 0) break;
      for (const col of shuffle(Array.from({ length: width - word.length + 1 }, (_, index) => index), rng)) {
        const proposed = row * width + col;
        let valid = true;
        for (let i = 0; i < word.length; i += 1) if (occupied.has(proposed + i)) valid = false;
        if (valid) { start = proposed; break; }
      }
    }
    if (start < 0) continue;
    for (let i = 0; i < word.length; i += 1) {
      board[start + i] = word[i];
      occupied.add(start + i);
    }
    wordRanges.push({ id: `word_${now}_${start}`, word, start, end: start + word.length, removed: false, guessed: false, isPassword: word === password });
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
  const safePassword = safeWordRanges.find((entry) => entry.isPassword)?.word || password;
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
    skillScore: skillScore(stats.intelligence, stats.science),
    skillBonus: skillBonus(stats.intelligence, stats.science),
    effectiveDifficulty,
    wordLength,
    wordCount: safeWordRanges.length,
    likenessCap: selection.likenessCap,
    minAmbiguity: selection.minAmbiguity,
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
    const likeness = positionalLikeness(range.word, game.password);
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
  skillScore,
  skillBonus,
  passwordWordCount,
  positionalLikeness,
  sharedLetters,
  buildPasswordSet,
  characterStats,
  createGame,
  publicGameState,
  applyGameAction,
};
