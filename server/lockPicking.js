'use strict';

/**
 * Патч 520: мини-игра взлома замков. Чистое ядро без сетевого состояния —
 * комната держит доску в общем реестре состояний проверок (terminalStates).
 * Патч 526: «один взлом на трансляцию» убран — игрок сам решает, когда
 * начать новый подход (купил заколки, прокачал PER/LOCKPICK). Замки пока
 * НЕ блокируются: shouldBlockLock() — единственная точка, куда владелец
 * позже добавит своё условие блокировки. Терминал сохраняет блокировку
 * после провала и решение Мастера «Да/Нет».
 *
 * Правила: docs/lockpicking-mini-game-design.md. Коротко:
 *   N = 12 − PER + 2·D ячеек, PER 4…10, D 0…5 (D=0 только понижением);
 *   угадывание по позиции, четыре стрелки; провал остаётся в ячейке;
 *   одна заколка в руке выдерживает S провалов (S = ранг LOCKPICK 0…6);
 *   в момент поломки Удача 4…10 даёт 5…20% спасти заколку;
 *   при поломке комбинация та же, угаданные позиции ЗАПОМИНАЮТСЯ и серыми
 *   стрелками остаются видны, курсор остаётся на первой неотгаданной ячейке;
 *   победа любого источника открывает точку через общее событие `hacked`.
 *
 * Патч 532: «Сломанная заколка не лишает прогресса ... Но прогресс не
 * слетит». Память живёт весь взлом точки: поломка, «кончились заколки»,
 * «Ещё подход», закрытие окна и смена оператора НЕ перегенерируют секрет и
 * НЕ стирают угаданный префикс. Свежий лист при новом подходе обновляет
 * только заколки/навык/удачу. Сброс — ACCESS GRANTED или повторная выдача
 * Мастером. Прогресс общий для всех игроков точки (в т.ч. привязанных комнат).
 */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const ARROWS = Object.freeze(['left', 'up', 'right', 'down']);
// Патч 528: когда на нажатии сломалась заколка, красный «?» показывается
// ещё недолго, и только потом цвета обновляются (красный гаснет, угаданные
// стрелки уже серые). Если заколка НЕ сломалась — красный остаётся до
// следующего нажатия. Длительность живёт в состоянии доски, поэтому её видят
// и зрители, и переподключившиеся вкладки.
const BREAK_HIGHLIGHT_MS = 650;
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

/**
 * Патч 526: задел под будущее условие блокировки замка.
 * Владелец: «Замки пока не блокировать, но в будущем будут, когда я придумаю
 * условие блокировки». Пока политика выключена и новый подход доступен всегда.
 * Когда условие появится — меняется ТОЛЬКО эта функция (и, при желании,
 * `enabled`): сервер, клиент и локальный резерв уже спрашивают её.
 */
const LOCK_BLOCK_POLICY = Object.freeze({ enabled: false });
/**
 * Патч 535: владелец включил блокировку замка по усмотрению Мастера.
 * Автоблокировка по провалам ПО-ПРЕЖНЕМУ выключена (закон 526):
 * `LOCK_BLOCK_POLICY.enabled` не поднимаем. Единственное новое условие —
 * явный флаг GM (`gmBlocked`), который приходит из состояния точки.
 * Так будущие условия блокировки по-прежнему вставляются ТОЛЬКО сюда.
 */
const shouldBlockLock = ({ game, config, gmBlocked = false } = {}) => {
  if (LOCK_BLOCK_POLICY.enabled) return true;
  void game;
  void config;
  return Boolean(gmBlocked);
};

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
    bag: pick('bag'),
    usedMagazineEffects: pick('usedMagazineEffects'),
    lockPicking: pick('lockPicking'),
  };
};

const ATTR_ALIASES = Object.freeze({
  PER: ['PER', 'PERCEPTION', 'ВОС', 'ВОСПРИЯТИЕ', 'В'],
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

// Патч 524: заколки в живом инвентаре могут лежать и в словаре items (ключ —
// id экземпляра), и в массиве equipment.items, и в обёртке itemSnapshot. Канон
// каталога при этом живёт в разных полях: itemId / catalogId / weaponId / code
// / id, а старые сейвы оставляют только ключ записи. Проверяем все формы и
// считаем каждый экземпляр один раз — иначе доска стартовала с «0 заколок».
const PIN_ID_FIELDS = Object.freeze([
  'itemId', 'catalogId', 'weaponId', 'code', 'id', 'key', 'Name',
]);
const PIN_BUCKETS = (source) => [
  source.items,
  source.equipment?.items,
  source.inventory,
  source.bag,
];
const PIN_QUANTITY_FIELDS = Object.freeze(['quantity', 'count', 'qty', 'amount']);
const quantityFieldOf = (item) => PIN_QUANTITY_FIELDS.find(
  (field) => item && Object.prototype.hasOwnProperty.call(item, field),
) || 'quantity';
// Патч 527: старые сейвы прячут предмет в item/snapshot/data. Списывать
// quantity надо именно там, где он живёт, иначе «списанная» заколка останется
// в инвентаре в неизменной вложенной записи.
const quantityHolderOf = (item) => {
  for (const candidate of [item, item?.item, item?.snapshot, item?.data]) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (PIN_QUANTITY_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(candidate, field))) {
      return candidate;
    }
  }
  return item && typeof item === 'object' ? item : null;
};

const candidatePinIds = (key, item) => {
  const ids = [String(key || '').trim()];
  const collect = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const field of PIN_ID_FIELDS) {
      const raw = value[field];
      if (typeof raw === 'string' || typeof raw === 'number') ids.push(String(raw).trim());
    }
  };
  collect(item);
  for (const nested of [item?.item, item?.snapshot, item?.data]) collect(nested);
  return ids;
};

const pinQuantity = (item) => {
  const holder = quantityHolderOf(item);
  const raw = holder ? holder[quantityFieldOf(holder)] : 1;
  const parsed = Number(String(raw ?? 1).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1;
};

const countBobbyPins = (source) => {
  const objectKeys = new Set();
  const counted = new Set();
  let total = 0;
  PIN_BUCKETS(source).forEach((bucket, bucketIdx) => {
    if (!bucket) return;
    const isArray = Array.isArray(bucket);
    const entries = isArray
      ? bucket.map((item, idx) => [`${bucketIdx}:${idx}`, item])
      : (typeof bucket === 'object' ? Object.entries(bucket) : []);
    for (const [key, value] of entries) {
      if (!value || typeof value !== 'object') continue;
      if (!candidatePinIds(key, value).includes('item_bobby_pin')) continue;
      // Один и тот же экземпляр может быть представлен и в словаре items, и
      // в массиве equipment.items. Сверяем id экземпляра с ключами словарей;
      // каталожный id 'item_bobby_pin' не считается ключом экземпляра, иначе
      // несколько разных стопок склеились бы в одну.
      const aliases = [
        value.instanceId, value.uniqueId, value.key, value.id,
        value.item?.instanceId, value.item?.id,
        value.snapshot?.instanceId, value.snapshot?.id,
      ].filter((raw) => typeof raw === 'string' || typeof raw === 'number').map(String);
      const shared = isArray
        ? aliases.find((alias) => alias !== 'item_bobby_pin' && objectKeys.has(alias))
        : null;
      const marker = shared || (isArray ? `${bucketIdx}:${key}` : String(key));
      if (!isArray) objectKeys.add(String(key));
      if (counted.has(marker)) continue;
      counted.add(marker);
      total += pinQuantity(value);
    }
  });
  return total;
};

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

/**
 * Патч 527: сломанные заколки ДОЛЖНЫ исчезать из инвентаря. Сервер держит
 * последний опубликованный снимок листа — он и есть источник истины для
 * числа заколок в мини-игре. При поломке уменьшаем quantity в самом снимке,
 * сохраняя все остальные поля предмета (правило 522: поля не обрезаются).
 * Клиент зеркально списывает заколку из локального инвентаря и сохраняет лист.
 * Возвращает НОВЫЙ снимок — исходный не мутируется.
 */
const consumeBobbyPins = (snapshot, count = 1) => {
  const need = Math.max(0, Math.floor(Number(count) || 0));
  let clone;
  try {
    clone = JSON.parse(JSON.stringify(snapshot || {}));
  } catch {
    return { snapshot, consumed: 0 };
  }
  if (!need) return { snapshot: clone, consumed: 0 };
  let remaining = need;
  const roots = [clone, clone.data && typeof clone.data === 'object' ? clone.data : null]
    .filter(Boolean);
  const seen = new Set();
  for (const root of roots) {
    for (const path of [['items'], ['equipment', 'items'], ['inventory'], ['bag']]) {
      let parent = root;
      for (let i = 0; i < path.length - 1; i += 1) parent = parent?.[path[i]];
      if (!parent || typeof parent !== 'object') continue;
      const key = path[path.length - 1];
      const bucket = parent[key];
      if (!bucket || typeof bucket !== 'object') continue;
      const isArray = Array.isArray(bucket);
      const entries = isArray
        ? bucket.map((item, idx) => [String(idx), item])
        : Object.entries(bucket);
      const nextArray = [];
      const nextObject = { ...bucket };
      for (const [entryKey, value] of entries) {
        if (!value || typeof value !== 'object') {
          if (isArray) nextArray.push(value);
          continue;
        }
        const isPin = candidatePinIds(entryKey, value).includes('item_bobby_pin');
        if (!isPin || remaining <= 0) {
          if (isArray) nextArray.push(value);
          continue;
        }
        // Один экземпляр мог быть продублирован в items и equipment.items.
        const instance = String(value.instanceId ?? value.uniqueId ?? value.key ?? '');
        const dedupeKey = instance && instance !== 'item_bobby_pin'
          ? `id:${instance}`
          : `path:${path.join('.')}:${entryKey}`;
        if (seen.has(dedupeKey)) {
          if (isArray) nextArray.push(value);
          continue;
        }
        seen.add(dedupeKey);
        const holder = quantityHolderOf(value) || value;
        const field = quantityFieldOf(holder);
        let qty = pinQuantity(value);
        const take = Math.min(qty, remaining);
        qty -= take;
        remaining -= take;
        holder[field] = qty;
        if (qty <= 0) {
          if (!isArray) delete nextObject[entryKey];
        } else if (isArray) {
          nextArray.push(value);
        }
      }
      parent[key] = isArray ? nextArray : nextObject;
    }
  }
  return { snapshot: clone, consumed: need - remaining };
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
    // Патч 532: сколько позиций уже угадано и запомнено на этой точке.
    knownPositions: 0,
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

// ---------------------------------------------------------------------------
// Патч 532: память угаданных позиций на весь взлом точки.
// ---------------------------------------------------------------------------

/** Непрерывный префикс уже угаданных ячеек (green/grey) слева направо. */
const guessedLockPositions = (game) => {
  const cells = Array.isArray(game?.cells) ? game.cells : [];
  const guessed = [];
  for (const cell of cells) {
    if (!cell || !ARROWS.includes(cell.arrow)) break;
    if (cell.state !== CELL_STATE.GREEN && cell.state !== CELL_STATE.GREY) break;
    guessed.push(cell.arrow);
  }
  return guessed;
};

/** Ячейки для продолжения: угаданные -> grey, красные/пустые -> hidden. */
const rememberedLockCells = (game) => {
  const count = clamp(Math.floor(Number(game?.cellCount) || 0), 0, 18);
  return Array.from({ length: count }, (_, idx) => {
    const cell = Array.isArray(game?.cells) ? game.cells[idx] : null;
    if (!cell || !ARROWS.includes(cell.arrow)) return { arrow: null, state: CELL_STATE.HIDDEN };
    if (cell.state === CELL_STATE.GREEN || cell.state === CELL_STATE.GREY) {
      return { arrow: cell.arrow, state: CELL_STATE.GREY };
    }
    return { arrow: null, state: CELL_STATE.HIDDEN };
  });
};

/** Доска ещё не выиграна и не закрыта Мастером — её можно продолжить. */
const isResumableLockGame = (game) => Boolean(
  game
  && game.kind === 'lock'
  && Array.isArray(game.secret)
  && game.secret.length > 0
  && game.status !== 'won'
  && game.status !== 'closed',
);

/**
 * Продолжить взлом: ТОТ ЖЕ секрет и угаданный префикс, курсор на первой
 * неотгаданной ячейке. Обновляются только заколки, навык, удача, оператор и
 * служебные счётчики хода. PER/сложность/число ячеек зафиксированы на время
 * взлома, иначе новая длина комбинации обесценила бы уже угаданные позиции.
 *
 * Если продолжать нечего (первый взлом, победа, повторная выдача Мастером) —
 * собирается свежая доска с новым секретом.
 */
const resumeLockGame = ({
  game = null,
  config = {},
  operatorClientId = null,
  operatorCharacterId = null,
  characterSnapshot = {},
  now = Date.now(),
  rng = Math.random,
  spentPins = 0,
} = {}) => {
  if (!isResumableLockGame(game)) {
    return createLockGame({
      config, operatorClientId, operatorCharacterId,
      characterSnapshot, now, rng, spentPins,
    });
  }
  const stats = lockStats(characterSnapshot);
  stats.luckSave = luckSaveChance(stats.luck);
  const alreadySpent = clamp(Math.floor(Number(spentPins) || 0), 0, 100000);
  const availablePins = Math.max(0, stats.pins - alreadySpent);
  const hasPin = availablePins > 0;
  const cells = rememberedLockCells(game);
  const known = guessedLockPositions({ ...game, cells });
  const next = {
    ...game,
    cells,
    cursor: known.length,
    knownPositions: known.length,
    status: hasPin ? 'playing' : 'awaitingRetry',
    result: hasPin ? '' : 'OUT OF PINS',
    scrollUp: false,
    pinsTotal: availablePins,
    pinsRemaining: hasPin ? availablePins - 1 : 0,
    spentPins: alreadySpent,
    pinActive: hasPin,
    pinFailures: 0,
    skill: stats.skill,
    luck: stats.luck,
    luckSave: stats.luckSave,
    pressedArrows: Array.isArray(game.pressedArrows) ? game.pressedArrows.slice(-24) : [],
    breakHighlight: null,
    operatorClientId,
    operatorCharacterId,
    revision: (Number(game.revision) || 0) + 1,
    updatedAt: now,
  };
  return syncLockGameConfig(next, config);
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
  knownPositions: 0,
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
/**
 * Патч 535: Мастер открыл точку своим решением. Доска выигранная, доступ
 * выдан сразу (семантика 530), но это НЕ ключ: `hackedByGm`, уведомление
 * Мастеру не нужно — решение и так его. Прогресс 532 сбрасывается победой.
 */
const gmWonLockGame = (config, at = Date.now()) => ({
  ...keyWonLockGame(config, at),
  hackedByKey: false,
  hackedByGm: true,
});


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
 * превращает их в ERROR_CODE. Списание заколок атомарно внутри хода.
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
  // Патч 526: ЯВНЫЙ новый подход игрока. Отличается от 'start' тем, что
  // пересобирает доску по ТЕКУЩЕМУ листу в любом состоянии (в т.ч. после
  // победы, провала или «кончились заколки»). Автоматический рестарт после
  // ACCESS GRANTED по-прежнему невозможен: это действие шлётся только по
  // нажатию кнопки, а start запрещён при won/playing.
  if (action === 'newAttempt') {
    // Патч 547 (слово владельца): «успешные попытки не должны вызывать ещё
    // попытку». Победа оконечна: новый секрет после ACCESS GRANTED снова
    // запирал уже открытую точку. Новую партию даёт только Мастер («Открыть»
    // или повторная выдача снимает доску), поэтому здесь отказ без мутации.
    if (game?.status === 'won') return { game, error: 'LOCK_ALREADY_WON' };
    if (shouldBlockLock({ game, config })) return { error: 'LOCK_BLOCKED' };
    // Патч 532: явный подход ПРОДОЛЖАЕТ тот же взлом, а не собирает новую
    // комбинацию. Свежий лист меняет заколки/навык/удачу, угаданные позиции
    // остаются. Победа и повторная выдача Мастера дают новый секрет.
    return {
      game: resumeLockGame({
        game, config, operatorClientId: clientId, operatorCharacterId: characterId,
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
  // Патч 527: прошлый ошибочный «?» не должен оставаться на доске вечно.
  // Каждое нажатие начинается с чистого листа: только ОДНА красная ячейка —
  // та, в которой ошиблись сейчас.
  const cells = game.cells.map((cell) => (
    cell?.state === CELL_STATE.RED
      ? { arrow: null, state: CELL_STATE.HIDDEN }
      : { ...cell }
  ));
  const pressedArrows = [...(game.pressedArrows || []), arrow].slice(-24);
  // Патч 532: сколько позиций уже угадано ДО этого нажатия. Именно столько
  // останется в памяти, если нажатие сломает заколку.
  const knownBefore = guessedLockPositions({ ...game, cells }).length;
  let next = {
    ...game,
    cells,
    pressedArrows,
    knownPositions: knownBefore,
    breakHighlight: null,
    revision: game.revision + 1,
    updatedAt: now,
  };

  if (ARROWS.indexOf(arrow) === game.secret[idx]) {
    cells[idx] = { arrow, state: CELL_STATE.GREEN };
    next.cursor = idx + 1;
    next.knownPositions = next.cursor;
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

  // Заколка «должна» сломаться. Спас-бросок Удачи не сбрасывает счётчик:
  // следующий провал снова кидает тот же шанс.
  if (rng() < game.luckSave) {
    next.pinFailures = game.skill;
    next.result = 'PIN HELD';
    return { game: next };
  }

  next.brokenPins = (game.brokenPins || 0) + 1;
  next.pinFailures = 0;
  // Патч 532: курсор НЕ откатывается в начало. Угаданные позиции запомнены,
  // игрок продолжает с той же ячейки, в которой ошибся. Повторять префикс
  // больше не нужно — именно это отнимало время при маленькой ВОС.
  next.cursor = idx;
  next.knownPositions = knownBefore;
  // Пауза перед обновлением цветов: сервер сохраняет красный «?» в cells, а
  // клиент по истечении breakHighlight.durationMs рисует его скрытым.
  next.breakHighlight = { durationMs: BREAK_HIGHLIGHT_MS };
  // Угаданные стрелки остаются видимыми, но сереют; комбинация та же.
  // Патч 527: ошибочную ячейку НЕ стираем — игрок должен увидеть красный
  // «?» даже когда на этом же ходе сломалась заколка (раньше при навыке 0
  // красный не показывался вообще). Патч 532: уже серые стрелки тоже остаются
  // серыми, а не исчезают — это память позиций между заколками.
  next.cells = cells.map((cell, cellIdx) => (
    cellIdx === idx
      ? { arrow: null, state: CELL_STATE.RED }
      : ((cell.state === CELL_STATE.GREEN || cell.state === CELL_STATE.GREY)
        && ARROWS.includes(cell.arrow)
        ? { arrow: cell.arrow, state: CELL_STATE.GREY }
        : { arrow: null, state: CELL_STATE.HIDDEN })
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
  BREAK_HIGHLIGHT_MS,
  CELL_STATE,
  LOCK_NODE_MARKER,
  encodeLockNodeMarker,
  decodeLockNodeMarker,
  lockCellCount,
  lockRows,
  luckSaveChance,
  LOCK_BLOCK_POLICY,
  shouldBlockLock,
  lockStats,
  countBobbyPins,
  consumeBobbyPins,
  effectiveDifficulty,
  createLockGame,
  guessedLockPositions,
  rememberedLockCells,
  isResumableLockGame,
  resumeLockGame,
  keyWonLockGame,
  gmWonLockGame,
  publicLockGameState,
  syncLockGameConfig,
  closeLockGame,
  applyLockAction,
};
