'use strict';

// Server-authoritative rules and board generation for shared terminal hacking.
//
// Патч 495: словарь вынесен в server/terminalWords/ — шесть файлов по длине
// слова (EOWL ∩ ESDB/SCOWL). Слова больше не зашиты в этот модуль: сначала из
// словаря нужной длины СЛУЧАЙНО выбирается СЕКРЕТНОЕ СЛОВО, затем из того же
// словаря подбираются пустышки с разной степенью сходства (likeness).
const { getWordsByLength } = require('./terminalWords');

// Ленивые геттеры сохраняют старый экспорт WORDS_BY_LENGTH для тестов и
// вызывающих, но не разворачивают все шесть файлов при импорте модуля.
const WORDS_BY_LENGTH = {
  get 4() { return getWordsByLength(4); },
  get 5() { return getWordsByLength(5); },
  get 6() { return getWordsByLength(6); },
  get 7() { return getWordsByLength(7); },
  get 8() { return getWordsByLength(8); },
  get 9() { return getWordsByLength(9); },
};

// Патч 495: три характеристики — три разных рычага.
//   Сложность 0..5: длина пароля 4+d, потолок подсказки, порог похожести.
//   ИНТ 4..10:      сколько слов на доске (20 -> 12).
//   Наука 0..6:     сколько скобочных комбинаций; с 4 открывает восстановление.
//   Удача 4..10:    шанс появления комбинации «+1 попытка» (10..80 %, не ноль).
// Очки удачи (luckPoints) в мини-игре не тратятся и кодом не трогаются.
const MAX_LIKENESS_BY_DIFFICULTY = [3, 3, 3, 2, 2, 2];
const MIN_AMBIGUITY_BY_DIFFICULTY = [3, 3, 3, 3, 3, 4];
const MIN_SHARED_BY_DIFFICULTY = [1, 2, 3, 3, 4, 4];
const BASE_WORD_COUNT = 20;
const MIN_WORDS = 6;
const MAX_ATTEMPTS = 4;

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

// Удача 4..10 -> 10..80 %; шанс никогда не равен нулю.
const recoveryChancePercent = (luck) => clamp(
  10 + (clamp(Number(luck) || 4, 4, 10) - 4) * (70 / 6),
  10,
  80,
);

// Скобочные комбинации: 2 + Наука, плюс «синергия» при ИНТ >= 8 и Науке >= 4.
const bracketCountFor = (intelligence, science) => {
  const sci = clamp(Number(science) || 0, 0, 6);
  const synergy = (Number(intelligence) || 4) >= 8 && sci >= 4 ? 1 : 0;
  return 2 + sci + synergy;
};

const toNumber = (entry) => Number(typeof entry === 'object'
  ? (entry?.value ?? entry?.base ?? entry?.total ?? entry?.rank)
  : entry) || 0;
const readAttribute = (snapshot, id) => {
  const attrs = snapshot?.attributes || {};
  const keys = { INT: ['INT', 'int', 'intelligence'], SCI: ['SCI', 'science', 'Science'], LCK: ['LCK', 'lck', 'luck'] }[id];
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
  intelligence: clamp(readAttribute(snapshot, 'INT') || 4, 4, 10),
  science: clamp(scienceRank(snapshot), 0, 6),
  luck: clamp(readAttribute(snapshot, 'LCK') || 4, 4, 10),
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

// Справочная сумма ИНТ + Наука (4..16): в UI больше не показывается, но
// сохраняется для обратной совместимости логов и внешних вызывающих.
const skillScore = (intelligence, science) => (
  clamp(Number(intelligence) || 4, 4, 10) + clamp(Number(science) || 0, 0, 6)
);
const skillBonus = (intelligence, science) => skillScore(intelligence, science) - 4;

// ИНТ 4..10 -> 20, 19, 17, 16, 15, 13, 12 слов на доске. Ни сложность, ни
// Наука на число слов не влияют: Наука прореживает доску уже во время взлома.
const passwordWordCount = (effectiveDifficulty, intelligence) => {
  const int = clamp(Number(intelligence) || 4, 4, 10);
  return Math.max(MIN_WORDS, BASE_WORD_COUNT - Math.round((int - 4) * (4 / 3)));
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
 * Порядок ровно тот, который согласован с владельцем: сначала из словаря
 * нужной длины СЛУЧАЙНО выбирается СЕКРЕТНОЕ СЛОВО, затем ИЗ ТОГО ЖЕ СЛОВАРЯ
 * подбираются пустышки с разной степенью сходства (likeness) с паролем.
 *
 * Ограничения:
 *   - подсказка не выше потолка сложности (на d=5 не бывает 4/9);
 *   - после любой первой неверной попытки остаётся >= MIN_AMBIGUITY кандидатов;
 *   - пустышки похожи на пароль по набору букв (кроме d=0, см. ниже);
 *   - в наборе представлены разные значения подсказки 0..cap.
 *
 * d=0 — особый лёгкий режим: пустышки набираются из тесных анаграммных семей
 * (POST/SPOT/STOP/TOPS...), а пароль — «выброс», почти не делящий с ними букв.
 * Порядок «пароль -> пустышки» сохраняется и здесь: пароль выбирается первым,
 * затем подбираются семьи, максимально на него не похожие.
 *
 * Матрица попарных совпадений строится только для выбранных ~20 слов, а не для
 * всего словаря (12 тыс. слов), поэтому генерация остаётся быстрой.
 */
const buildPasswordSet = ({ wordLength, effectiveDifficulty, wordCount, rng = Math.random, excludeWords = [] }) => {
  const tier = clamp(Math.floor(Number(effectiveDifficulty) || 0), 0, 5);
  const likenessCap = MAX_LIKENESS_BY_DIFFICULTY[tier];
  const targetAmbiguity = MIN_AMBIGUITY_BY_DIFFICULTY[tier];
  const wanted = clamp(Math.floor(Number(wordCount) || BASE_WORD_COUNT), 2, 24);
  const excluded = new Set((Array.isArray(excludeWords) ? excludeWords : []).map((word) => String(word).toUpperCase()));
  const pool = [...new Set((getWordsByLength(wordLength) || []).filter((word) => (
    word.length === wordLength && !excluded.has(word)
  )))];
  const internal = seededRng(rng);

  // Настоящие анаграммные семьи (одинаковый набор букв) нужны только d=0.
  const families = new Map();
  if (tier === 0) {
    for (const word of pool) {
      const key = [...word].sort().join('');
      if (!families.has(key)) families.set(key, []);
      families.get(key).push(word);
    }
  }

  const evaluate = (set, password) => {
    let minCandidates = 99;
    let minAfterTwo = 99;
    let weakGuesses = 0;
    let maxHint = 0;
    let minShared = 99;
    let sharedSum = 0;
    const hintKinds = new Set();
    let decoys = 0;
    for (const word of set) {
      if (word === password) continue;
      const hint = positionalLikeness(word, password);
      const common = sharedLetters(word, password);
      maxHint = Math.max(maxHint, hint);
      minShared = Math.min(minShared, common);
      sharedSum += common;
      hintKinds.add(hint);
      decoys += 1;
    }
    for (const guess of set) {
      if (guess === password) continue;
      const hint = positionalLikeness(guess, password);
      const candidates = set.filter((word) => (
        word !== guess && positionalLikeness(guess, word) === hint
      ));
      minCandidates = Math.min(minCandidates, candidates.length);
      if (candidates.length < targetAmbiguity) weakGuesses += 1;
      for (const second of candidates) {
        if (second === password) continue;
        const secondHint = positionalLikeness(second, password);
        let survivors = 0;
        for (const word of candidates) {
          if (word !== second && positionalLikeness(second, word) === secondHint) survivors += 1;
        }
        minAfterTwo = Math.min(minAfterTwo, survivors);
      }
    }
    if (minAfterTwo === 99) minAfterTwo = 9;
    // weakGuesses даёт градиент даже когда «заменить один плохой guess» ещё
    // не поднимает общий минимум: иначе жадный поиск не может починить доску,
    // где сразу несколько слов оставляют по 2 кандидата.
    const score = Math.min(minCandidates, targetAmbiguity) * 10000
      - weakGuesses * 5000
      + (maxHint >= Math.min(2, likenessCap) ? 3000 : maxHint * 500)
      + minAfterTwo * 300
      + hintKinds.size * 100
      + minShared * 10
      + sharedSum / Math.max(decoys, 1);
    return { minCandidates, minAfterTwo, weakGuesses, maxHint, minShared, score };
  };

  let best = null;
  const shuffledPool = shuffle(pool, internal);
  for (let pass = 0; pass < 10 && pool.length > wanted; pass += 1) {
    const password = shuffledPool[pass % shuffledPool.length];
    let candidates;
    if (tier === 0) {
      // Берём КРУПНЫЕ анаграммные семьи, максимально непохожие на пароль:
      // на доске должно быть «очень много слов-анаграмм», а пароль — выброс.
      const groups = [];
      for (const group of families.values()) {
        if (group.length < 2 || group.includes(password)) continue;
        // <= 2: оставляем слова, у которых одна общая буква всё-таки стоит
        // на своём месте, иначе все подсказки выродятся в «0/4».
        if (group.some((word) => sharedLetters(word, password) > 2)) continue;
        groups.push(group);
      }
      if (!groups.length) continue;
      groups.sort((a, b) => b.length - a.length);
      const chosenGroups = [];
      let collected = 0;
      for (const group of groups) {
        if (collected >= wanted - 1) break;
        chosenGroups.push(group);
        collected += group.length;
      }
      candidates = shuffle(chosenGroups, internal)
        .flatMap((group) => shuffle(group, internal))
        .filter((word) => word !== password && positionalLikeness(word, password) <= 1);
    } else {
      const minShared = MIN_SHARED_BY_DIFFICULTY[tier];
      candidates = pool.filter((word) => (
        word !== password
        && sharedLetters(word, password) >= minShared
        && positionalLikeness(word, password) <= likenessCap
      ));
    }
    if (candidates.length < wanted - 1) continue;

    // Разная степень сходства: по одному слову из каждого значения подсказки,
    // затем добор случайными. Слово с максимальной подсказкой обязательно.
    const buckets = new Map();
    for (const word of candidates) {
      const hint = positionalLikeness(word, password);
      if (!buckets.has(hint)) buckets.set(hint, []);
      buckets.get(hint).push(word);
    }
    const shuffledBuckets = new Map(
      [...buckets].map(([hint, list]) => [hint, shuffle(list, internal)]),
    );
    const loud = shuffledBuckets.get(likenessCap) || [];
    const spare = shuffle(candidates, internal);
    let local = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const decoys = [];
      const offset = randomInt(wanted, internal);
      for (let round = 0; decoys.length < wanted - 1; round += 1) {
        let added = 0;
        for (const list of shuffledBuckets.values()) {
          const index = (round + offset) % Math.max(list.length, 1);
          if (round < list.length && decoys.length < wanted - 1) {
            const candidate = list[index];
            if (!decoys.includes(candidate)) { decoys.push(candidate); added += 1; }
          }
        }
        if (!added) break;
      }
      const filler = attempt === 0 ? spare : shuffle(candidates, internal);
      for (const candidate of filler) {
        if (decoys.length >= wanted - 1) break;
        if (!decoys.includes(candidate)) decoys.push(candidate);
      }
      if (decoys.length < wanted - 1) break;
      if (loud.length && !decoys.includes(loud[0])) decoys[decoys.length - 1] = loud[0];
      // Разная степень сходства: если набор подобрался весь с одной
      // подсказкой, принудительно добавляем слово с другим значением.
      const hintsInSet = new Set(decoys.map((word) => positionalLikeness(word, password)));
      if (hintsInSet.size < 2) {
        for (const [hint, list] of shuffledBuckets) {
          if (hintsInSet.has(hint)) continue;
          const replacement = list.find((word) => !decoys.includes(word));
          if (replacement) {
            decoys[decoys.length - 1] = replacement;
            hintsInSet.add(hint);
            break;
          }
        }
      }
      const set = [password, ...decoys];
      const metrics = evaluate(set, password);
      if (!local || metrics.score > local.metrics.score) local = { set, password, metrics };
    }
    if (!local) continue;

    // Локальное улучшение: заменяем пустышек на запасных, пока растёт запас
    // кандидатов после первой подсказки (главная защита от «угадал за два»).
    const replacements = shuffle(candidates.filter((word) => !local.set.includes(word)), internal).slice(0, 6);
    for (let sweep = 0; sweep < 1; sweep += 1) {
      let improved = false;
      for (let position = 1; position < local.set.length; position += 1) {
        for (const candidate of replacements) {
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
      if (!improved) break;
    }
    if (!best || local.metrics.score > best.metrics.score) best = local;
    if (best.metrics.minCandidates >= targetAmbiguity
      && best.metrics.minAfterTwo >= 2
      && best.metrics.maxHint <= likenessCap) break;
  }

  // Финальная полировка: даже если оптимизация свела все подсказки к одному
  // значению, на доске должны присутствовать РАЗНЫЕ степени сходства.
  if (best) {
    const present = new Set(
      best.set.filter((word) => word !== best.password)
        .map((word) => positionalLikeness(word, best.password)),
    );
    if (present.size < 2) {
      const missing = Array.from({ length: likenessCap + 1 }, (_, index) => index)
        .find((hint) => !present.has(hint));
      const replacement = pool.find((word) => (
        word !== best.password
        && !best.set.includes(word)
        && positionalLikeness(word, best.password) === missing
      ));
      if (replacement) {
        const trial = [...best.set];
        trial[trial.length - 1] = replacement;
        best = { ...best, set: trial, metrics: evaluate(trial, best.password) };
      }
    }
  }

  // Редкий случай (короткая доска при ИНТ 10): запас кандидатов просел ниже
  // порога. Догоняем его дополнительными заменами по более широкому пулу —
  // иначе первая подсказка может сузить доску до двух слов.
  if (best && best.metrics.minCandidates < Math.max(3, targetAmbiguity)) {
    const password = best.password;
    const poolForFix = getWordsByLength(wordLength).filter((word) => (
      word !== password && !excluded.has(word)
      && positionalLikeness(word, password) <= likenessCap
      && (tier === 0 || sharedLetters(word, password) >= MIN_SHARED_BY_DIFFICULTY[tier])
    ));
    const wide = shuffle(poolForFix.filter((word) => !best.set.includes(word)), internal).slice(0, 48);
    for (let sweep = 0; sweep < 3 && best.metrics.minCandidates < Math.max(3, targetAmbiguity); sweep += 1) {
      let improved = false;
      for (let position = 1; position < best.set.length; position += 1) {
        for (const candidate of wide) {
          if (best.set.includes(candidate)) continue;
          const trial = [...best.set];
          trial[position] = candidate;
          const metrics = evaluate(trial, password);
          if (metrics.score > best.metrics.score) {
            best = { ...best, set: trial, metrics };
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
  }

  // Вырожденный словарь/параметры: всё равно отдаём корректную доску.
  if (!best) {
    const password = pool[0] || 'WORD';
    const compatible = shuffle(
      pool.filter((word) => word !== password && positionalLikeness(word, password) <= likenessCap),
      internal,
    );
    const set = [password, ...compatible].slice(0, wanted);
    best = { set, password, metrics: evaluate(set, password) };
  }

  return {
    words: best.set,
    password: best.password,
    likenessCap,
    minAmbiguity: best.metrics.minCandidates,
    minShared: best.metrics.minShared,
    wordCount: best.set.length,
  };
};

const createGame = ({ config, operatorClientId, operatorCharacterId, characterSnapshot, now = Date.now(), rng = Math.random, excludeWords = [] }) => {
  const difficulty = config.difficulty;
  const stats = characterStats(characterSnapshot);
  const effectiveDifficulty = Math.max(0, difficulty - stats.hackerRank);
  const wordLength = effectiveDifficulty + 4;
  const wordCount = passwordWordCount(effectiveDifficulty, stats.intelligence);
  const selection = buildPasswordSet({ wordLength, effectiveDifficulty, wordCount, rng, excludeWords });
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
  const bracketCount = bracketCountFor(stats.intelligence, stats.science);
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
  // Восстанавливающие комбинации возможны только с Науки 4. Их появление
  // определяет Удача: первый слот с шансом p, второй — при УДЧ >= 9 с p/2.
  const recoveryChance = recoveryChancePercent(stats.luck);
  let restoreSlots = 0;
  if (stats.science >= 4) {
    if (rng() * 100 < recoveryChance) restoreSlots += 1;
    if (stats.luck >= 9 && rng() * 100 < recoveryChance / 2) restoreSlots += 1;
  }
  restoreSlots = Math.min(restoreSlots, brackets.length);
  if (restoreSlots > 0) {
    const indices = shuffle(Array.from({ length: brackets.length }, (_, index) => index), rng)
      .slice(0, restoreSlots);
    for (const index of indices) brackets[index].recovery = true;
  }
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
    luck: stats.luck,
    skillScore: skillScore(stats.intelligence, stats.science),
    skillBonus: skillBonus(stats.intelligence, stats.science),
    effectiveDifficulty,
    wordLength,
    wordCount: safeWordRanges.length,
    likenessCap: selection.likenessCap,
    minAmbiguity: selection.minAmbiguity,
    attempts: MAX_ATTEMPTS,
    maxAttempts: MAX_ATTEMPTS,
    bracketCount,
    restoreSlots,
    board: board.join(''),
    wordRanges: safeWordRanges,
    password: safePassword,
    bracketRanges: brackets,
    guesses: [],
    result: '',
    scrollUp: false,
    digestEligible: Boolean(stats.hasDigest && !stats.digestUsed),
    digestUsed: false,
    recoveryChancePercent: recoveryChance,
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
    // Патч 495: подчёркивания пароля на d=0 больше нет — игрок, который
    // всё-таки решил сыграть, ищет «слово не из семейки». Сложность 0 по
    // правилам можно не проходить: Мастер просто открывает терминал.
    wordRanges: (game.wordRanges || []).map(({ isPassword, ...word }) => word),
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

const applyGameAction = ({ game, action, clientId, characterId, characterSnapshot, value, now = Date.now(), rng = Math.random, excludeWords = [] }) => {
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
      excludeWords,
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
      // Щедрый бонус: +1 попытка, но не больше исходного максимума.
      next = { ...next, attempts: Math.min(next.maxAttempts, next.attempts + 1) };
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
  BASE_WORD_COUNT,
  MIN_WORDS,
  MAX_ATTEMPTS,
  MIN_SHARED_BY_DIFFICULTY,
  bracketCountFor,
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
