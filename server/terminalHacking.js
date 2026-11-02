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

// Патч 497: «последовательность» владельца + канонические 4 попытки.
//   N = max(4, 20 + 2·D − ИНТ): на D5 это 26 слов при ИНТ 4 и 20 при ИНТ 10.
//   L = 4 + D. Попыток всегда 4, потолок 4; скобки выше 4 не поднимают.
//   Наука 0 -> скобок нет; иначе число пар {0:4,1:4,2:3,3:3,4:2,5:2}.
//   Пакеты Науки детерминированы: (слов убрать, попыток вернуть).
//   Удача 4..10 -> шанс 5..20 % полного восстановления на КАЖДУЮ скобку.
//   Слова: РЕАЛЬНЫЕ, «почти одинаковые» — не менее L−3 общих букв с опорным
//   словом и не более 2 совпавших позиций. Пароль выбирается ВНУТРИ набора,
//   чтобы он не был «самым центральным» словом (дыра, закрытая ещё в 496).
// Очки удачи (luckPoints) в мини-игре не тратятся и кодом не трогаются.
const MAX_LIKENESS_BY_DIFFICULTY = [3, 3, 3, 2, 2, 2];
// Жёсткий пол: сколько кандидатов обязано остаться после ЛЮБОГО первого хода.
const MIN_AMBIGUITY_BY_DIFFICULTY = [2, 2, 2, 2, 4, 4];
// Цель для градиентного ремонта: на D4–D5 поднята, чтобы думающий игрок
// опустился с ~95 % до 85–90 %, оставшись выше 80 %+.
const AMBIGUITY_TARGET_BY_DIFFICULTY = [2, 2, 2, 2, 8, 8];
// Минимум общих букв с опорным словом = L − 3.
const MIN_SHARED_BY_DIFFICULTY = [1, 2, 3, 4, 5, 6];
// Патч 500: N = 15 + 2·D − ИНТ. На сложности 5 это «25 − ИНТ»:
// 21 слово при ИНТ 4 и 15 при ИНТ 10. База при ИНТ 4 = 11 + 2·D,
// дальше каждое очко ИНТ убирает ровно одно слово.
const BASE_WORDS_BY_DIFFICULTY = [11, 13, 15, 17, 19, 21];
const MIN_WORDS_BY_DIFFICULTY = [4, 4, 4, 4, 4, 4];
const BASE_WORD_COUNT = 15; // запасной размер доски, если wordCount не передан
const MIN_WORDS = 4;
const MAX_ATTEMPTS = 4;     // канон: 4 попытки на любой сложности
// Патч 499: запись «W слов + A попыток» означает W+A СКОБОК, а не эффекты
// одной скобки. W скобок убирают по одному ложному слову, A скобок дают
// по +1 попытке. Одна скобка = ровно один эффект. Число скобок задаёт Наука
// на ВСЕХ сложностях (таблица сложности 497 больше не ограничивает).
// Наука:      0     1        2      3      4      5      6
// словных:    0   монетка    1      1      2      1      2
// ходовых:    0   монетка    0      1      1      2      2
// всего:      0     1        1      2      3      3      4
const BRACKET_SPLIT_BY_SCIENCE = [[0, 0], [0, 0], [1, 0], [1, 1], [2, 1], [1, 2], [2, 2]];
const BRACKET_COUNT_BY_SCIENCE = [0, 1, 1, 2, 3, 3, 4];
const SCI5_MONO = false;    // true: Наука 5 = 2 словных + 2 ходовых скобки
const SCI1_WORD_CHANCE = 0.5;

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

// Шанс полного восстановления попыток при использовании ОДНОЙ скобки.
const luckRestoreChance = (luck) => 0.05 + 0.025 * (clamp(Number(luck) || 4, 4, 10) - 4);
const recoveryChancePercent = (luck) => Math.round(luckRestoreChance(luck) * 100);

// Состав скобок по Науке: [сколько убирают слово, сколько дают попытку].
const bracketSplitFor = (science) => {
  const sci = clamp(Number(science) || 0, 0, 6);
  if (sci === 5 && SCI5_MONO) return [2, 2];
  return BRACKET_SPLIT_BY_SCIENCE[sci];
};

// Число скобок задаёт ТОЛЬКО Наука. Сложность не ограничивает: на 1-м уровне
// при высоких Науке + ИНТ взлом действительно лёгкий, на 5-м Наука 6 даёт
// все 4 скобки. Предохранитель N−1: с маленькой доски (D0/ИНТ 10 = 5 слов)
// Наука 6 всё равно получает 4 скобки, но пустышки не кончаются полностью.
const bracketCountFor = (difficulty, science, wordCount = 20) => {
  const sci = clamp(Number(science) || 0, 0, 6);
  const split = bracketSplitFor(sci);
  const count = sci === 1 ? 1 : split[0] + split[1];
  const n = Math.max(4, Math.floor(Number(wordCount) || 20));
  // difficulty сохранён в сигнатуре для совместимости вызывающих:
  // сложность больше НЕ влияет на число скобок.
  void difficulty;
  return Math.max(0, Math.min(count, n - 1));
};

// Эффект ОДНОЙ скобки: kind = 'word' -> убрать 1 ложное слово,
// kind = 'attempt' -> +1 попытка. При Удаче возвращаются ВСЕ 4 попытки;
// на Науке >=2 «словесная» скобка всё равно убирает слово, на Науке 1 удача
// заменяет весь эффект. Попытки никогда не превышают 4.
const bracketEffectFor = (science, luck, rng = Math.random, kind = 'word') => {
  const sci = clamp(Number(science) || 0, 0, 6);
  if (sci === 0) return { words: 0, attempts: 0, full: false, kind: 'none' };
  const full = rng() < luckRestoreChance(luck);
  const replaced = full && sci === 1;
  const words = !replaced && kind === 'word' ? 1 : 0;
  const attempts = !replaced && kind === 'attempt' ? 1 : 0;
  return { words, attempts: full ? 0 : attempts, full, kind };
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

// Патч 500: N = max(4, 15 + 2·D − ИНТ) = «25 − ИНТ» на D5.
// ИНТ 10 на D5 -> 15 слов, ИНТ 4 -> 21.
const passwordWordCount = (effectiveDifficulty, intelligence) => {
  const tier = clamp(Math.floor(Number(effectiveDifficulty) || 0), 0, 5);
  const int = clamp(Number(intelligence) || 4, 4, 10);
  return Math.max(MIN_WORDS_BY_DIFFICULTY[tier], BASE_WORDS_BY_DIFFICULTY[tier] - (int - 4));
};

// Канон: 4 попытки на всех шести сложностях.
const attemptsForDifficulty = () => MAX_ATTEMPTS;

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
 * Патч 497: доска «последовательности».
 *
 * D=0 — особый лёгкий режим: пустышки набираются из настоящих анаграммных
 * семей (POST/SPOT/STOP/POTS), а пароль — «выброс», почти не делящий с ними
 * букв. Игрок просто ищет самое непохожее слово.
 *
 * D>=1 — сначала из словаря берётся СЛУЧАЙНОЕ ОПОРНОЕ слово; из того же
 * словаря подбираются реальные слова-«родственники» с не менее L−3 общими
 * буквами и не более чем 2 совпавшими позициями (те же буквы, другой порядок).
 * Пароль выбирается ВНУТРИ уже собранного набора из наименее «центральных»
 * членов: так он не выдаёт себя как слово, похожее на все остальные.
 *
 * Ограничения:
 *   - подсказка не выше потолка сложности (на D4–D5 не бывает 3+/L);
 *   - после ЛЮБОГО первого неверного хода остаётся >= MIN_AMBIGUITY кандидатов
 *     (на D4–D5 пол поднят до 4, цель ремонта — 8);
 *   - ни один двухбуквенный префикс не повторяется больше двух раз;
 *   - представлены разные значения подсказки.
 *
 * Матрица попарных совпадений считается только для выбранных ~26 слов.
 */
const buildPasswordSet = ({ wordLength, effectiveDifficulty, wordCount, rng = Math.random, excludeWords = [] }) => {
  const tier = clamp(Math.floor(Number(effectiveDifficulty) || 0), 0, 5);
  const likenessCap = MAX_LIKENESS_BY_DIFFICULTY[tier];
  const floor = MIN_AMBIGUITY_BY_DIFFICULTY[tier];
  const target = AMBIGUITY_TARGET_BY_DIFFICULTY[tier];
  const minShared = MIN_SHARED_BY_DIFFICULTY[tier];
  const wanted = clamp(Math.floor(Number(wordCount) || BASE_WORD_COUNT), 2, 32);
  const excluded = new Set((Array.isArray(excludeWords) ? excludeWords : []).map((word) => String(word).toUpperCase()));
  const pool = [...new Set((getWordsByLength(wordLength) || []).filter((word) => (
    word.length === wordLength && !excluded.has(word)
  )))];
  const internal = seededRng(rng);

  // Сколько кандидатов остаётся после неверного хода; weak — число «слабых»
  // ходов, дающих градиент для жадного ремонта.
  const evaluate = (set, password) => {
    let minCandidates = 99;
    let weak = 0;
    let sum = 0;
    let n = 0;
    const hintKinds = new Set();
    for (const guess of set) {
      if (guess === password) continue;
      const hint = positionalLikeness(guess, password);
      hintKinds.add(hint);
      let candidates = 0;
      for (const word of set) if (word !== guess && positionalLikeness(guess, word) === hint) candidates += 1;
      minCandidates = Math.min(minCandidates, candidates);
      if (candidates < target) weak += 1;
      sum += candidates;
      n += 1;
    }
    const score = Math.min(minCandidates, target) * 1000 - weak * 100
      + hintKinds.size * 50 + sum / Math.max(n, 1);
    return { minCandidates, weak, score, hintKinds: hintKinds.size };
  };
  const centralityRank = (set, password) => {
    const sums = set.map((x) => set.reduce((total, w) => total + (w === x ? 0 : sharedLetters(x, w)), 0));
    const own = sums[set.indexOf(password)];
    return sums.filter((value) => value > own).length + 1;
  };
  const prefixAllowed = (set, position, word) => {
    const prefix = word.slice(0, 2);
    return set.filter((x, index) => index !== position && x.slice(0, 2) === prefix).length < 2;
  };
  const resultOf = (set, password, metrics) => ({
    words: set,
    password,
    likenessCap,
    minAmbiguity: metrics.minCandidates,
    minShared: Math.min(...set.filter((w) => w !== password).map((w) => sharedLetters(w, password))),
    centralityRank: centralityRank(set, password),
    wordCount: set.length,
  });

  // ---- D=0: анаграммные семьи + пароль-выброс --------------------------------
  if (tier === 0) {
    const families = new Map();
    for (const word of pool) {
      const key = [...word].sort().join('');
      if (!families.has(key)) families.set(key, []);
      families.get(key).push(word);
    }
    const shuffled = shuffle(pool, internal);
    let best = null;
    for (let pass = 0; pass < 24; pass += 1) {
      const password = shuffled[pass % shuffled.length];
      const groups = [];
      for (const group of families.values()) {
        if (group.length < 2 || group.includes(password)) continue;
        if (group.some((word) => sharedLetters(word, password) > 2)) continue;
        groups.push(group);
      }
      groups.sort((a, b) => b.length - a.length);
      const decoys = [];
      const prefixes = new Map([[password.slice(0, 2), 1]]);
      for (const group of shuffle(groups, internal)) {
        for (const word of shuffle(group, internal)) {
          if (decoys.length >= wanted - 1) break;
          if (positionalLikeness(word, password) > 1) continue;
          const prefix = word.slice(0, 2);
          if ((prefixes.get(prefix) || 0) >= 2) continue;
          prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
          decoys.push(word);
        }
        if (decoys.length >= wanted - 1) break;
      }
      if (decoys.length < wanted - 1) continue;
      const set = [password, ...decoys];
      const metrics = evaluate(set, password);
      if (!best || metrics.score > best.metrics.score) best = { set, password, metrics };
      if (metrics.minCandidates >= floor && metrics.hintKinds >= 2) break;
    }
    if (best) return resultOf(best.set, best.password, best.metrics);
  } else {
    // ---- D>=1: кластер почти одинаковых слов, пароль внутри набора -----------
    const anchors = shuffle(pool, internal);
    let fallback = null;
    for (let pass = 0; pass < 30 && pool.length > wanted; pass += 1) {
      const anchor = anchors[pass % anchors.length];
      const candidates = pool.filter((word) => (
        sharedLetters(word, anchor) >= minShared
        && positionalLikeness(word, anchor) <= likenessCap
      ));
      if (candidates.length < wanted) continue;
      candidates.sort((a, b) => sharedLetters(b, anchor) - sharedLetters(a, anchor));
      const ordered = [
        ...shuffle(candidates.slice(0, 110), internal),
        ...shuffle(candidates.slice(110), internal),
      ];
      const set = [];
      const prefixes = new Map();
      for (const word of ordered) {
        if (set.length >= wanted) break;
        const prefix = word.slice(0, 2);
        if ((prefixes.get(prefix) || 0) >= 2) continue;
        prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
        set.push(word);
      }
      if (set.length !== wanted) continue;
      const sums = set.map((x) => set.reduce((total, w) => total + (w === x ? 0 : sharedLetters(x, w)), 0));
      const byCentrality = set.map((word, index) => ({ word, sum: sums[index] })).sort((a, b) => a.sum - b.sum);
      // Пароль берём из СЕРЕДИНЫ распределения центральности: не «самый
      // похожий на всех» и не «самый непохожий», иначе его выдаёт обратная
      // эвристика. Небольшой разброс сохраняет случайность выбора.
      const middle = clamp(
        Math.floor(wanted / 2) + randomInt(3, internal) - 1,
        0,
        Math.max(0, byCentrality.length - 1),
      );
      const password = byCentrality[middle].word;

      // Предел подсказки считается относительно ПАРОЛЯ, а не опорного слова.
      let current = set.filter((word) => word === password || positionalLikeness(word, password) <= likenessCap);
      for (const word of ordered) {
        if (current.length >= wanted) break;
        if (current.includes(word) || positionalLikeness(word, password) > likenessCap) continue;
        if (!prefixAllowed(current, -1, word)) continue;
        current.push(word);
      }
      if (current.length !== wanted) continue;

      let metrics = evaluate(current, password);
      const replacements = ordered.filter((word) => (
        !current.includes(word) && positionalLikeness(word, password) <= likenessCap
      )).slice(0, 80);
      for (let sweep = 0; sweep < 14 && metrics.weak > 0; sweep += 1) {
        let improved = false;
        for (let position = 0; position < current.length; position += 1) {
          if (current[position] === password) continue;
          for (const word of shuffle(replacements, internal).slice(0, 26)) {
            if (current.includes(word) || !prefixAllowed(current, position, word)) continue;
            const trial = [...current];
            trial[position] = word;
            const candidate = evaluate(trial, password);
            if (candidate.score > metrics.score) {
              current = trial; metrics = candidate; improved = true; break;
            }
          }
          if (improved) break;
        }
        if (!improved) break;
      }

      // Разные значения подсказки: если свелось к одному, добавляем другое.
      if (metrics.hintKinds < 2) {
        const present = new Set(current.filter((w) => w !== password).map((w) => positionalLikeness(w, password)));
        const missing = Array.from({ length: likenessCap + 1 }, (_, i) => i).find((h) => !present.has(h));
        const replacement = replacements.find((word) => positionalLikeness(word, password) === missing);
        if (replacement !== undefined) {
          const position = current.findIndex((w, i) => i > 0 && w !== password);
          if (position > 0 && prefixAllowed(current, position, replacement)) {
            const trial = [...current]; trial[position] = replacement;
            const candidate = evaluate(trial, password);
            if (candidate.minCandidates >= floor) { current = trial; metrics = candidate; }
          }
        }
      }

      const rank = centralityRank(current, password);
      if (rank <= 3) continue;
      if (metrics.minCandidates < floor) {
        if (!fallback || metrics.score > fallback.metrics.score) fallback = { set: current, password, metrics };
        continue;
      }
      return resultOf(current, password, metrics);
    }
    if (fallback) return resultOf(fallback.set, fallback.password, fallback.metrics);
  }

  // Вырожденный словарь: всё равно отдаём корректную доску.
  const password = pool[0] || 'WORD';
  const compatible = shuffle(pool.filter((word) => (
    word !== password && positionalLikeness(word, password) <= likenessCap
  )), internal);
  const set = [password, ...compatible].slice(0, wanted);
  return resultOf(set, password, evaluate(set, password));
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
  // Патч 499: сорта скобок определяются Наукой, число — тоже Наукой.
  // Наука 1 — одна скобка, её сорт выбирается монеткой; остальные сорта
  // перемешиваются по доске, чтобы нельзя было угадать по позиции.
  const split = bracketSplitFor(stats.science);
  let kinds;
  if (stats.science === 1) {
    kinds = [rng() < SCI1_WORD_CHANCE ? 'word' : 'attempt'];
  } else {
    kinds = [...Array(split[0]).fill('word'), ...Array(split[1]).fill('attempt')];
  }
  kinds = shuffle(kinds, rng);
  const bracketCount = bracketCountFor(effectiveDifficulty, stats.science, chosen.length);
  for (let groupIndex = 0; groupIndex < bracketCount; groupIndex += 1) {
    const kind = kinds[groupIndex] || 'word';
    const effect = bracketEffectFor(stats.science, stats.luck, rng, kind);
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
    brackets.push({
      id: `bracket_${now}_${start}`,
      start,
      end: start + length,
      text: board.slice(start, start + length).join(''),
      used: false,
      effect,
      // Поле сохранено для старых клиентов; факт определяет `effect`.
      recovery: effect.full || effect.attempts > 0,
      kind,
    });
  }
  const recoveryChance = recoveryChancePercent(stats.luck);
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
    centralityRank: selection.centralityRank,
    bracketSplit: bracketSplitFor(stats.science),
    attempts: attemptsForDifficulty(effectiveDifficulty),
    maxAttempts: attemptsForDifficulty(effectiveDifficulty),
    bonusAttempts: 0,
    resetUsed: false,
    bracketCount,
    restoreSlots: 0,
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
    // Эффект скобки игрок узнаёт только после нажатия — как в Fallout 3.
    bracketRanges: (game.bracketRanges || []).map(({ recovery, effect, kind, ...bracket }) => bracket),
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
    // Патч 497: пакет Науки + удача. Попытки НИКОГДА не выше 4.
    const effect = bracket.effect || { words: 0, attempts: 0, full: Boolean(bracket.recovery) };
    for (let i = 0; i < (effect.words || 0); i += 1) {
      const duds = next.wordRanges.filter((entry) => !entry.isPassword && !entry.removed);
      if (duds.length) {
        const dud = duds[randomInt(duds.length, rng)];
        next.wordRanges = next.wordRanges.map((entry) => entry.id === dud.id ? { ...entry, removed: true } : entry);
      }
    }
    const before = next.attempts;
    if (effect.full) {
      next.attempts = next.maxAttempts;
      next.resetUsed = true;
      next.result = 'ATTEMPTS RESET';
    } else if (effect.attempts > 0) {
      next.attempts = Math.min(next.maxAttempts, next.attempts + effect.attempts);
      next.result = 'ATTEMPT RESTORED';
    } else {
      next.result = 'DUD REMOVED';
    }
    next.bonusAttempts = (next.bonusAttempts || 0) + Math.max(0, next.attempts - before);
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
  BASE_WORDS_BY_DIFFICULTY,
  MIN_WORDS_BY_DIFFICULTY,
  MAX_LIKENESS_BY_DIFFICULTY,
  MIN_AMBIGUITY_BY_DIFFICULTY,
  AMBIGUITY_TARGET_BY_DIFFICULTY,
  MIN_SHARED_BY_DIFFICULTY,
  BRACKET_SPLIT_BY_SCIENCE,
  BRACKET_COUNT_BY_SCIENCE,
  SCI5_MONO,
  bracketSplitFor,
  bracketCountFor,
  bracketEffectFor,
  luckRestoreChance,
  attemptsForDifficulty,
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
