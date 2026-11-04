'use strict';

/**
 * Патч 520: мини-игра взлома замков. Чистое ядро без сетевого состояния —
 * комната держит доску в общем реестре состояний проверок (-terminalStates),
 * поэтому оператор, «один взлом на трансляцию», «Да/Нет» Мастера и уведомление
 * Мастеру работают тем же кодом, что у терминала.
 *
 * Правила: docs/lockpicking-mini-game-design.md. Коротко:
 *   N = 12 − PER + 2·D ячеек, PER 4…10, D 0…5 (D=0 только понижением);
 *   угадывание по позиции, четыре стрелки; провал остаётся в ячейке;
 *   одна отмычка в руке выдерживает S провалов (S = ранг LOCKPICK 0…6);
 *   в момент поломки Удача 4…10 даёт 5…20% спасти отмычку;
 *   при поломке комбинация та же, зелёные стрелки сереют и остаются видны;
 *   победа любого источника открывает точку через общее событие `hacked`.
 */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const ARROWS = Object.freeze(['left', 'up', 'right', 'down']);
const CELL_STATE = Object.freeze({
  HIDDEN: 'hidden',
  GREEN: 'green',
  RED: 'red',
  GREY: 'grey',
});

const LOCK_NODE_MARKER = 'F2D20-LOCK:';

const encodeLockNodeMarker = ({ difficulty = 0, label = '' } = {}) => (
  `${LOCK_NODE_MARKER}${JSON.stringify({
    v: 1,
    d: clamp(Math.floor(Number(difficulty) || 0), 0, 5),
    l: String(label || ''),
  })}`
);

const decodeLockNodeMarker = (value) => {
  const raw = String(value || '');
  if (!raw.startsWith(LOCK_NODE_MARKER)) return null;
  try {
    const parsed = JSON.parse(raw.slice(LOCK_NODE_MARKER.length));
    if (!parsed || parsed.v !== 1) return null;
    return {
      difficulty: clamp(Math.floor(Number(parsed.d) || 0), 0, 5),
      label: String(parsed.l || ''),
    };
  } catch {
    return null;
  }
};

/** Число ячеек и разбивка на ряды (два ряда, когда ячеек больше восьми). */
const lockCellCount = (per, difficulty) => clamp(
  12 - clamp(Math.floor(Number(per) || 4), 4, 10) + 2 * clamp(Math.floor(Number(difficulty) || 0), 0, 5),
  2,
  18,
);

const lockRows = (count) => {
  const total = clamp(Math.floor(Number(count) || 0), 0, 18);
  if (total <= 8) return [total];
  return [Math.ceil(total / 2), total - Math.ceil(total / 2)];
};

const luckSaveChance = (luck) => 0.05 + 0.025 * (clamp(Number(luck) || 4, 4, 10) - 4);

// ---------------------------------------------------------------------------
// Снимок персонажа: те же формы, что понимает terminalHacking.js — массив
// [{ name, value }], объект { STR: 5 }, обёртка data, skills и selectedSkills.
// ---------------------------------------------------------------------------
const namedEntries = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([name, val]) => ({ name, value: val }));
  }
  return [];
};

const toNumber = (entry) => {
  if (entry === null || entry === undefined) return 0;
  if (typeof entry === 'number') return entry;
  if (typeof entry === 'object') {
    let raw = entry.value ?? entry.total ?? entry.base ?? entry.rank;
    // В снимке атрибут может быть вложен ещё раз: { PER: { value: 10 } }.
    if (raw && typeof raw === 'object') raw = raw.value ?? raw.total ?? raw.base;
    return Number(raw) || 0;
  }
  return Number(entry) || 0;
};

const normalizeCharacterSnapshot = (snapshot) => {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const data = source.data && typeof source.data === 'object' ? source.data : null;
  const pick = (key) => (source[key] !== undefined ? source[key] : (data ? data[key] : undefined));
  return {
    attributes: pick('attributes') ?? pick('special') ?? pick('attrs'),
    skills: pick('skills'),
    selectedSkills: pick('selectedSkills'),
    selectedPerks: pick('selectedPerks'),
    items: pick('items'),
    inventory: pick('inventory'),
    equipment: pick('equipment'),
    usedMagazineEffects: pick('usedMagazineEffects'),
    lockPicking: pick('lockPicking'),
  };
};

const ATTR_ALIASES = Object.freeze({
  PER: ['PER', 'PERCEPTION', 'ВОС', 'ВОСПРИЯТИЕ'],
  LCK: ['LCK', 'LUCK', 'УДЧ', 'УДАЧА'],
  LOCKPICK: ['LOCKPICK', 'LOCKPICKING', 'ОТМЫЧКИ', 'ВЗЛОМ'],
});

const findNamed = (entries, aliases) => {
  const found = namedEntries(entries).find((entry) => {
    const name = String(entry?.name ?? entry?.id ?? entry?.key ?? '').trim().toUpperCase();
    return aliases.includes(name);
  });
  return found ? toNumber(found) : 0;
};

const inventoryEntries = (source) => [
  source.items,
  source.equipment?.items,
  source.inventory,
].flatMap((bucket) => {
  if (!bucket) return [];
  if (Array.isArray(bucket)) return bucket;
  if (typeof bucket === 'object') return Object.values(bucket);
  return [];
});

const countBobbyPins = (source) => inventoryEntries(source).reduce((sum, item) => {
  if (!item || typeof item !== 'object') return sum;
  const id = String(item.itemId ?? item.id ?? item.key ?? '').trim();
  if (id !== 'item_bobby_pin') return sum;
  const qty = Number(item.quantity ?? item.count ?? item.qty ?? 1);
  return sum + (Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 1);
}, 0);

const hasDifficultyReduction = (source) => {
  const used = Array.isArray(source.usedMagazineEffects) ? source.usedMagazineEffects : [];
  const fromMagazine = used.some((id) => String(id).includes('tumblers_today_02')) ? 1 : 0;
  const explicit = Math.max(0, Math.floor(Number(source.lockPicking?.difficultyReduction) || 0));
  // Перки/журналы не складываются бесконечно: максимум две ступени.
  return clamp(fromMagazine + explicit, 0, 2);
};

const lockStats = (snapshot) => {
  const source = normalizeCharacterSnapshot(snapshot);
  return {
    per: clamp(findNamed(source.attributes, ATTR_ALIASES.PER) || 4, 4, 10),
    luck: clamp(findNamed(source.attributes, ATTR_ALIASES.LCK) || 4, 4, 10),
    skill: clamp(Math.floor(findNamed(source.skills, ATTR_ALIASES.LOCKPICK)
      || findNamed(source.selectedSkills, ATTR_ALIASES.LOCKPICK) || 0), 0, 6),
    pins: countBobbyPins(source),
    reduction: hasDifficultyReduction(source),
    luckSave: 0, // заполняется ниже после чтения luck
  };
};

const effectiveDifficulty = (config, stats) => Math.max(
  0,
  clamp(Math.floor(Number(config?.difficulty) || 0), 0, 5) - stats.reduction,
);

/**
 * Новая доска. `rng` передаётся извне, чтобы тесты были детерминированы.
 * Секретная комбинация живёт ТОЛЬКО на сервере: publicLockGameState её режет.
 */
const createLockGame = ({
  config = {},
  operatorClientId = null,
  operatorCharacterId = null,
  characterSnapshot = {},
  now = Date.now(),
  rng = Math.random,
  spentPins = 0,
} = {}) => {
  const stats = lockStats(characterSnapshot);
  stats.luckSave = luckSaveChance(stats.luck);
  const alreadySpent = clamp(Math.floor(Number(spentPins) || 0), 0, 100000);
  const availablePins = Math.max(0, stats.pins - alreadySpent);
  const difficulty = effectiveDifficulty(config, stats);
  const cellCount = lockCellCount(stats.per, difficulty);
  const secret = Array.from({ length: cellCount }, () => Math.floor(rng() * ARROWS.length));
  const hasPin = availablePins > 0;
  return {
    status: hasPin ? 'playing' : 'awaitingRetry',
    kind: 'lock',
    result: hasPin ? '' : 'OUT OF PINS',
    scrollUp: false,
    name: String(config?.name || '').trim() || 'Замок',
    description: String(config?.description || '').trim(),
    difficulty,
    configuredDifficulty: clamp(Math.floor(Number(config?.difficulty) || 0), 0, 5),
    cellCount,
    rows: lockRows(cellCount),
    secret,
    cells: Array.from({ length: cellCount }, () => ({ arrow: null, state: CELL_STATE.HIDDEN })),
    cursor: 0,
    per: stats.per,
    luck: stats.luck,
    skill: stats.skill,
    luckSave: stats.luckSave,
    pinsTotal: availablePins,
    pinsRemaining: hasPin ? availablePins - 1 : 0,
    spentPins: alreadySpent,
    pinActive: hasPin,
    pinFailures: 0,
    brokenPins: 0,
    pressedArrows: [],
    attempts: 4,
    attemptsMax: 4,
    operatorClientId,
    operatorCharacterId,
    operatorName: '',
    hackedByKey: false,
    revision: 1,
    updatedAt: now,
  };
};

const keyWonLockGame = (config, now = Date.now()) => ({
  status: 'won',
  kind: 'lock',
  result: 'ACCESS GRANTED',
  scrollUp: true,
  name: String(config?.name || '').trim() || 'Замок',
  description: String(config?.description || '').trim(),
  difficulty: clamp(Math.floor(Number(config?.difficulty) || 0), 0, 5),
  cellCount: 0,
  rows: [0],
  secret: [],
  cells: [],
  cursor: 0,
  per: 4,
  luck: 4,
  skill: 0,
  luckSave: 0,
  pinsTotal: 0,
  pinsRemaining: 0,
  pinActive: false,
  pinFailures: 0,
  brokenPins: 0,
  pressedArrows: [],
  attempts: 4,
  attemptsMax: 4,
  operatorClientId: null,
  operatorCharacterId: null,
  operatorName: '',
  hackedByKey: true,
  revision: 1,
  updatedAt: now,
});

const publicLockGameState = (game) => {
  if (!game) return null;
  const { secret, ...rest } = game;
  return rest;
};

/** Живая правка карточки не должна пересобирать доску (правило 504). */
const syncLockGameConfig = (game, config) => {
  if (!game || !config) return game;
  let next = game;
  for (const field of ['name', 'description']) {
    if (config[field] === undefined || next[field] === config[field]) continue;
    if (next === game) next = { ...game };
    next[field] = config[field];
  }
  return next;
};

const closeLockGame = (game, { now = Date.now() } = {}) => ({
  ...(game || {}),
  status: 'closed',
  result: 'LOCK CLOSED',
  scrollUp: false,
  updatedAt: now,
  revision: (game?.revision || 0) + 1,
});

/**
 * Одно нажатие стрелки. Ошибки возвращаются строкой, реестр комнаты
 * превращает их в ERROR_CODE. Списание отмычек атомарно внутри хода.
 */
const applyLockAction = ({
  game = null,
  config = {},
  action = 'press',
  clientId = null,
  characterId = null,
  characterSnapshot = {},
  value = null,
  now = Date.now(),
  rng = Math.random,
  spentPins = 0,
} = {}) => {
  if (action === 'start') {
    if (game && ['playing', 'won', 'awaitingRetry'].includes(game.status)) {
      return { error: 'LOCK_ALREADY_ACTIVE' };
    }
    return {
      game: createLockGame({
        config, operatorClientId: clientId, operatorCharacterId: characterId,
        characterSnapshot, now, rng, spentPins,
      }),
    };
  }
  if (!game || game.status !== 'playing') return { error: 'LOCK_NOT_ACTIVE' };
  if (game.operatorClientId && game.operatorClientId !== clientId) {
    return { error: 'LOCK_VIEW_ONLY' };
  }
  const arrow = String(value || '').trim();
  if (!ARROWS.includes(arrow)) return { error: 'LOCK_INVALID_ARROW' };
  if (!game.pinActive) return { error: 'LOCK_NO_PINS' };

  const idx = game.cursor;
  const cells = game.cells.map((cell) => ({ ...cell }));
  const pressedArrows = [...(game.pressedArrows || []), arrow].slice(-24);
  let next = {
    ...game,
    cells,
    pressedArrows,
    revision: game.revision + 1,
    updatedAt: now,
  };

  if (ARROWS.indexOf(arrow) === game.secret[idx]) {
    cells[idx] = { arrow, state: CELL_STATE.GREEN };
    next.cursor = idx + 1;
    next.result = '';
    if (next.cursor >= game.cellCount) {
      next.status = 'won';
      next.result = 'ACCESS GRANTED';
      next.scrollUp = true;
    }
    return { game: next };
  }

  // Провал: красный «?» без подсказки, позиция не сдвигается.
  cells[idx] = { arrow: null, state: CELL_STATE.RED };
  next.pinFailures = (game.pinFailures || 0) + 1;
  next.result = 'TRY AGAIN';
  if (next.pinFailures <= game.skill) return { game: next };

  // Отмычка «должна» сломаться. Спас-бросок Удачи не сбрасывает счётчик:
  // следующий провал снова кидает тот же шанс.
  if (rng() < game.luckSave) {
    next.pinFailures = game.skill;
    next.result = 'PIN HELD';
    return { game: next };
  }

  next.brokenPins = (game.brokenPins || 0) + 1;
  next.pinFailures = 0;
  next.cursor = 0;
  // Угаданные стрелки остаются видимыми, но сереют; комбинация та же.
  next.cells = cells.map((cell) => (
    cell.state === CELL_STATE.GREEN
      ? { arrow: cell.arrow, state: CELL_STATE.GREY }
      : { arrow: null, state: CELL_STATE.HIDDEN }
  ));
  if (game.pinsRemaining > 0) {
    next.pinsRemaining = game.pinsRemaining - 1;
    next.pinActive = true;
    next.result = 'PIN BROKEN';
  } else {
    next.pinActive = false;
    next.status = 'awaitingRetry';
    next.result = 'OUT OF PINS';
  }
  return { game: next };
};

module.exports = {
  ARROWS,
  CELL_STATE,
  LOCK_NODE_MARKER,
  encodeLockNodeMarker,
  decodeLockNodeMarker,
  lockCellCount,
  lockRows,
  luckSaveChance,
  lockStats,
  effectiveDifficulty,
  createLockGame,
  keyWonLockGame,
  publicLockGameState,
  syncLockGameConfig,
  closeLockGame,
  applyLockAction,
};
