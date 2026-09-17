// scripts/build-crafting-data.mjs
//
// Генератор ДАННЫХ крафта (патчи 249–250).
//
// Что делает: берёт сырой датасет рецептов (docs/reference-data/pipboyapp_crafting.json
// — справочные данные стороннего приложения, где всё названо человеческими именами) и
// перекладывает его в пакет сеттинга — modules/fallout/data/crafting/*.json — так, чтобы
// в итоговых файлах НЕ ОСТАЛОСЬ ни одной ссылки по имени: предмет-результат,
// ингредиенты и перки записаны только id наших каталогов, навык — ключом UPPER_SNAKE_CASE.
//
// Почему так: движок крафта (следующий патч) не знает Fallout и не умеет читать названия;
// имена всегда собирает каталог (docs/architecture/engine-dna.md, §4.2–4.3). Разрешение
// «имя → id» — работа этого генератора, а не программы.
//
// Что в данные НЕ попадает (и объясняется в отчёте docs/reference-data/CRAFTING-MAPPING.md):
//   - рецепты модификаций (оружие, броня, силовая броня, роботы) — ветка модов
//     настраивается отдельно, по решению владельца;
//   - рецепты, помеченные в источнике как самодеятельность того приложения (appGenerated):
//     в книге их нет;
//   - рецепты, у которых результат или хоть один ингредиент не найден в наших каталогах:
//     придумывать предмет или его вес/цену генератор права не имеет. Такие позиции не
//     теряются — они уходят в файл-обменник docs/reference-data/Missing_craft.json:
//     та же форма рецепта, а где данных нет — строка "unknown". Владелец дописывает
//     недостающее по своим книгам и возвращает файл для слияния.
//   - печатные числа, которые владелец диктует поверх источника: таблица
//     BOOK_CORRECTIONS ниже; каждая подмена видна в отчёте, мёртвая правка — ошибка.
//
// Запуск:
//   node scripts/build-crafting-data.mjs          — перегенерировать данные и отчёт
//   node scripts/build-crafting-data.mjs --check  — проверить, что лежащие в репо файлы
//                                                   совпадают с генерацией (предохранитель
//                                                   __tests__/crafting/crafting-data.test.js)

import { mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const RAW_FILE = 'docs/reference-data/pipboyapp_crafting.json';
const AMMO_BRIDGE_FILE = 'docs/reference-data/AMMO-FOUND-TABLE.md';
export const OUT_DIR = 'modules/fallout/data/recipes';
export const REPORT_FILE = 'docs/reference-data/CRAFTING-MAPPING.md';
export const MISSING_FILE = 'docs/reference-data/Missing_craft.json';

// Каталог сеттинга: зеркало en-имён данных. bucket = во какой файл рецептов
// попадёт предмет; itemType — тот ключ, которым каталог описывает предмет.
const CATALOG_SOURCES = [
  { file: 'i18n/en-EN/data/equipment/weapons/weapons.json', itemType: 'weapon', bucket: 'weapons' },
  { file: 'i18n/en-EN/data/equipment/ammo/ammo_types.json', itemType: 'ammo', bucket: 'ammo' },
  { file: 'i18n/en-EN/data/consumables/chems.json', itemType: 'chem', bucket: 'chems' },
  { file: 'i18n/en-EN/data/consumables/drinks.json', itemType: 'drinks', bucket: 'drinks' },
  { file: 'i18n/en-EN/data/consumables/food.json', itemType: 'food', bucket: 'food' },
  { file: 'i18n/en-EN/data/equipment/general_goods.json', itemType: 'misc', bucket: 'items' },
  { file: 'i18n/en-EN/data/equipment/oddities.json', itemType: 'misc', bucket: 'items' },
  { file: 'i18n/en-EN/data/consumables/magazines.json', itemType: 'magazine', bucket: 'items' },
  { file: 'i18n/en-EN/data/equipment/armor/armor.json', itemType: 'armor', bucket: 'armor' },
  { file: 'i18n/en-EN/data/equipment/armor/clothes.json', itemType: 'clothing', bucket: 'armor' },
  { file: 'i18n/en-EN/data/equipment/armor/powerArmor.json', itemType: 'powerArmor', bucket: 'powerArmor' },
  { file: 'i18n/en-EN/data/equipment/armor/armor_mods.json', itemType: 'armorMod', bucket: 'mod' },
  { file: 'i18n/en-EN/data/equipment/armor/uniq_armor_mods.json', itemType: 'armorMod', bucket: 'mod' },
  { file: 'i18n/en-EN/data/equipment/weapon_mods.json', itemType: 'weaponMod', bucket: 'mod' },
  // Хлам и материалы — справочники владельца (патч 250): их добавили, чтобы закрыть
  // дыры каталога в ингредиентах («Антисептик», «Кровяной мешок», «Абраксо»…).
  { file: 'i18n/en-EN/data/junk/junk.json', itemType: 'junk', bucket: 'items' },
  { file: 'i18n/en-EN/data/junk/material.json', itemType: 'misc', bucket: 'items' },
];

const PERKS_FILE = 'i18n/en-EN/data/perks/perks.json';

// Материалы по умолчанию, если рецепт не называет особых ингредиентов: в книге
// «все рецепты используют материалы, определяемые сложностью рецепта» (с. 210).
// Кривая сверена с колонками materials, уже проставленными на 151 моде оружия в
// modules/fallout/data/equipment/weapon_mods.json.
export const MATERIALS_BY_COMPLEXITY = {
  1: { common: 2, uncommon: 0, rare: 0 },
  2: { common: 3, uncommon: 0, rare: 0 },
  3: { common: 4, uncommon: 2, rare: 0 },
  4: { common: 5, uncommon: 3, rare: 0 },
  5: { common: 6, uncommon: 4, rare: 2 },
  6: { common: 7, uncommon: 5, rare: 3 },
  7: { common: 8, uncommon: 6, rare: 4 },
};
const MATERIAL_ITEM_IDS = {
  common: 'item_common_materials',
  uncommon: 'item_uncommon_materials',
  rare: 'item_rare_materials',
};

export const BENCHES = ['weapons', 'armor', 'powerArmor', 'robot', 'chemistry', 'cooking'];
const BENCH_BURNS = { cooking: true, chemistry: true };
// Навыки-носители того же правила (270): сверка в генераторе обязывает
// совпадать, дублировать флаг в 74 записи больше нечего.
const BURN_SKILLS = new Set(['SCIENCE', 'SURVIVAL', 'EXPLOSIVES']);
const BENCH_BY_SOURCE = {
  weapons: 'weapons',
  armor: 'armor',
  power_armor: 'powerArmor',
  robot: 'robot',
  chemistry: 'chemistry',
  cooking: 'cooking',
};

// Навык из источника (человеческое имя) → ключ навыка.
const SKILL_BY_SOURCE = {
  repair: 'REPAIR',
  science: 'SCIENCE',
  survival: 'SURVIVAL',
  explosives: 'EXPLOSIVES',
};

// Ручные соответствия: то же самый предмет, записанный в источнике иначе, чем у
// нас. Причина по каждому — в отчёт, чтобы владелец мог проверить решение.
export const ITEM_NAME_ALIASES = {
  // Материалы редкостей (переименование владельца 2026-09-17): источник печатает
  // «Common/Uncommon/Rare Materials», в UI с 265 — «обычный/необычный/редкий
  // материал». Id не менялись: связь имени с item_*_materials держим здесь.
  'common materials': { itemId: 'item_common_materials', reason: 'переименование владельца 2026-09-17: «Common Materials» = наш «Common material»' },
  'uncommon materials': { itemId: 'item_uncommon_materials', reason: 'переименование владельца 2026-09-17: «Uncommon Materials» = наш «Uncommon material»' },
  'rare materials': { itemId: 'item_rare_materials', reason: 'переименование владельца 2026-09-17: «Rare Materials» = наш «Rare material»' },
  'baked bloatfly': { itemId: 'food_grilled_bloatfly', reason: 'то же блюдо: наше ru-имя — «Печёный дутень»' },
  'cooked softshell meat': { itemId: 'food_cooked_softshell_mirelurk', reason: 'то же блюдо: у нас названо по животному' },
  'iguana soup': { itemId: 'food_iguana_stew', reason: 'то же блюдо: ru-имя у обеих записей «Кусочки игуаны»' },
  'mole rat chunks': { itemId: 'food_mole_rat_chops', reason: 'то же блюдо: ru «Отбивные из кротокрыса»' },
  'mutt chops': { itemId: 'food_dog_chops', reason: 'то же блюдо: ru «Отбивные из собачатины»' },
  'noodle cup': { itemId: 'food_noodle_bowl', reason: 'то же блюдо: ru «Миска лапши»' },
  'stingwing filet': { itemId: 'food_stingwing_fillet', reason: 'разница написания: filet / fillet' },
  'queen mirelurk meat': { itemId: 'food_mirelurk_queen_meat', reason: 'тот же продукт: у нас имя по животному, потом по части' },
  'mongrel dog meat': { itemId: 'food_dog_meat', reason: 'то же сырьё: наше ru-имя — «Собачатина»' },
  'fusion cell': { itemId: 'ammo_energy_cell', reason: 'книжная графа «Fusion Cell» = наша «Energy Cell» (см. AMMO-FOUND-TABLE.md)' },
  'tato juice': { itemId: 'drink_potato_juice', reason: 'тот же напиток: книга зовёт «Tato Juice», у нас — «Potato Juice»' },
  'mutant hound chops': { itemId: 'food_mutant_hound_ribs', reason: 'то же блюдо: эффект совпадает («Heals 2 Radiation damage»), у нас имя — «Mutant Hound Ribs»' },
  'berserk syringe': { itemId: 'ammo_syringe_berserk', reason: 'ингредиент «Fury» — он же дротик шприцера «Berserk» (соответствие владельца)' },
};

// Ингредиенты, названные в книге именами предметов, которых у нас в каталоге нет.
// Список держим явно: генератор обязан объяснить «нет предмета», а не молча
// заменить его материалом. Пуст сейчас: все дыры прошлого среза владелец закрыл
// предметами (дикоросы в еде, хлам и материалы в отдельных каталогах, патч 250).
export const MISSING_INGREDIENT_ITEMS = [];
const MISSING_INGREDIENTS = new Set(MISSING_INGREDIENT_ITEMS);

/**
 * Исправления печатных чисел книги. Ключ — «группа_источника|имя строки».
 * Числа диктует владелец (он же сверяет с книгами); генератор подменяет ими
 * сырую строку источника ДО разрешения имён и показывает подмену в отчёте.
 * Ключ без сработавшей строки — ошибка: исправление не имеет права тихо
 * протухнуть, когда источник обновится.
 */
export const BOOK_CORRECTIONS = {
  'chems|mentats': {
    reason: 'владелец 2026-09-15: материалы «Mentats» — Необычные ×3, Редкие ×2 и Мозговой гриб ×2 (вместо книжного «Abraxo Cleaner»)',
    materials: { 'Uncommon Materials': 3, 'Rare Materials': 2, 'Brain Fungus': 2 },
  },
};

/**
 * Печатные таблицы рецептов, которые входят в этот срез: они описывают
 * ИЗГОТОВЛЕНИЕ ПРЕДМЕТОВ. Всё остальное в источнике — таблицы модификаций,
 * брони, силовой брони и роботов; ветка модов настраивается отдельно (решение
 * владельца), и мешать её с предметными рецептами генератор не должен.
 */
export const IMPORTED_GROUPS = [
  'AMMUNITION',
  'SYRINGER AMMUNITION',
  'EXPLOSIVES',
  'CHEMS',
  'FOOD',
  'BEVERAGE',
  'REPAIR KITS',
  'UTILITY DEVICES',
  'WORKBENCH',
];
const IMPORTED = new Set(IMPORTED_GROUPS);

export const FILE_BY_BUCKET = {
  ammo: 'ammo.json',
  weapons: 'weapons.json',
  chems: 'chems.json',
  food: 'food.json',
  drinks: 'drinks.json',
  items: 'items.json',
};
export const BUCKET_ORDER = ['ammo', 'weapons', 'chems', 'food', 'drinks', 'items'];
const BENCH_BY_BUCKET = {
  ammo: 'weapons',
  weapons: 'chemistry',
  chems: 'chemistry',
  food: 'cooking',
  drinks: 'cooking',
  items: 'chemistry',
};

/**
 * Нормализация имени для сверки с каталогом. Скобки СОХРАНЯЕМ как слова:
 * «RadAway» и «RadAway (Diluted)» — разные предметы, склейка их в один ключ
 * выдала бы рецепт разбавленного препарата как рецепт обычного.
 */
const norm = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[()«»"']/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+round$/, '');

const readRepoJson = (relPath) => JSON.parse(readFileSync(join(REPO, relPath), 'utf8'));

const walkForEntries = (node, visit) => {
  if (Array.isArray(node)) {
    for (const child of node) walkForEntries(child, visit);
    return;
  }
  if (node && typeof node === 'object') {
    if (typeof node.id === 'string' && typeof node.name === 'string') visit(node);
    for (const value of Object.values(node)) walkForEntries(value, visit);
  }
};

/**
 * en-имя → { itemId, itemType, bucket }. Имя, под которым в каталоге лежат два
 * разных предмета, помечается неоднозначным: разрешать такую ссылку «по первому
 * совпадению» генератор не вправе — рецепт с неоднозначной ссылкой не выпускается.
 */
const buildNameIndex = () => {
  const index = new Map();
  const ambiguous = new Map();
  const put = (key, entry) => {
    const current = index.get(key);
    if (!current) { index.set(key, entry); return; }
    if (current.itemId === entry.itemId) return;
    if (!ambiguous.has(key)) ambiguous.set(key, [current.itemId]);
    if (!ambiguous.get(key).includes(entry.itemId)) ambiguous.get(key).push(entry.itemId);
  };
  for (const source of CATALOG_SOURCES) {
    walkForEntries(readRepoJson(join('modules/fallout', source.file)), (entry) => {
      const key = norm(entry.name);
      if (key) put(key, { itemId: entry.id, itemType: source.itemType, bucket: source.bucket });
    });
  }
  for (const key of ambiguous.keys()) index.delete(key);
  return { index, ambiguous };
};

/** id каталога → его же запись: соответствие по alias не должно висеть в воздухе. */
const buildIdIndex = (nameIndex) => {
  const byId = new Map();
  for (const entry of nameIndex.values()) {
    if (!byId.has(entry.itemId)) byId.set(entry.itemId, entry);
  }
  return byId;
};

const buildPerkIndex = () => {
  const index = new Map();
  walkForEntries(readRepoJson(join('modules/fallout', PERKS_FILE)), (entry) => {
    const key = norm(entry.name);
    if (key) index.set(key, entry.id);
  });
  return index;
};

/**
 * Мост «название боеприпаса в книге → наш id + объём находки» — из нашей же
 * таблицы docs/reference-data/AMMO-FOUND-TABLE.md: книга называет патроны коротко
 * («.38», «Fusion Cell»), наш каталог — полно («.38 Round»). Объём находки — он же
 * количество, которое выдаёт крафт боеприпаса (решение владельца).
 */
const buildAmmoBridge = () => {
  const text = readFileSync(join(REPO, AMMO_BRIDGE_FILE), 'utf8');
  const byName = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^\|\s*`(ammo_[a-z0-9_]+)`\s*\|\s*([^|]+?)\s*\|\s*\*\*(\d+)(?:\+(\d+)CD)?\*\*/);
    if (!match) continue;
    const [, itemId, bookName, base, cd] = match;
    const key = norm(bookName);
    if (!key || byName.has(key)) continue;
    byName.set(key, { itemId, base: Number(base), cd: cd ? Number(cd) : 0 });
  }
  const byId = new Map();
  for (const entry of byName.values()) {
    if (!byId.has(entry.itemId)) byId.set(entry.itemId, entry);
  }
  return { byName, byId };
};

/** Строка требований источника ("Armorer 1, Science! 2") → [{ perkId, rank }]. */
const parsePerkRequirements = (value, perkIndex) => {
  const text = String(value ?? '').trim();
  if (!text || text === '–' || text === '-') return { perks: [], error: null };
  const perks = [];
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const match = part.match(/^(.*?)\s*(\d+)?$/);
    const label = (match?.[1] ?? part).trim();
    const rank = Math.max(1, Number(match?.[2] || 1));
    const perkId = perkIndex.get(norm(label));
    if (!perkId) return { perks: [], error: `в каталоге перков нет требования «${label}»` };
    perks.push({ perkId, rank });
  }
  return { perks: perks.sort((a, b) => (a.perkId < b.perkId ? -1 : 1)), error: null };
};

const materialsFromComplexity = (complexity) => {
  const curve = MATERIALS_BY_COMPLEXITY[Math.min(7, Math.max(1, Number(complexity) || 1))];
  return Object.entries(curve)
    .filter(([, count]) => count > 0)
    .map(([tier, count]) => ({ itemId: MATERIAL_ITEM_IDS[tier], count }));
};

/**
 * Явный список ингредиентов рецепта → [{ itemId, count }].
 * Если хоть одна позиция не разрешилась — ошибка и весь рецепт не выпускается:
 * половинчатых рецептов движок видеть не должен.
 */
const resolveMaterials = (materials, ctx, trace) => {
  const out = [];
  for (const [name, count] of Object.entries(materials)) {
    const amount = Number(count || 0);
    if (!Number.isInteger(amount) || amount <= 0) {
      return { error: `некорректное количество у «${name}»` };
    }
    const key = norm(name);
    const alias = ITEM_NAME_ALIASES[key];
    if (alias) {
      const target = ctx.byId.get(alias.itemId);
      if (!target) return { error: `соответствие «${name}» ведёт на несуществующий id ${alias.itemId}` };
      trace.push({ name, itemId: alias.itemId, reason: alias.reason, stage: 'ингредиент' });
      out.push({ itemId: alias.itemId, count: amount });
      continue;
    }
    const direct = ctx.nameIndex.get(key);
    if (direct) { out.push({ itemId: direct.itemId, count: amount }); continue; }
    if (ctx.ambiguous.has(key)) return { error: `имя ингредиента «${name}» в каталоге неоднозначно` };
    const ammo = ctx.ammo.byName.get(key);
    if (ammo) { out.push({ itemId: ammo.itemId, count: amount }); continue; }
    if (MISSING_INGREDIENTS.has(key)) {
      return { error: `в каталоге нет предмета-ингредиента «${name}»` };
    }
    return { error: `нет соответствия для ингредиента «${name}»` };
  }
  return { materials: out.sort((a, b) => (a.itemId < b.itemId ? -1 : 1)) };
};

/**
 * Разбиение незакрытых позиций для файла-обменника: чем является недостающая
 * вещь. Категории договорные (решение владельца): chem, food, loot, ammo.
 */
export const MISSING_CATEGORY_BY_GROUP = {
  CHEMS: 'chem',
  FOOD: 'food',
  BEVERAGE: 'food',
  AMMUNITION: 'ammo',
  'SYRINGER AMMUNITION': 'ammo',
  EXPLOSIVES: 'loot',
  'REPAIR KITS': 'loot',
  'UTILITY DEVICES': 'loot',
  WORKBENCH: 'loot',
};
export const MISSING_CATEGORY_ORDER = ['chem', 'food', 'loot', 'ammo'];
const MISSING_TYPE_BY_SOURCE_OUTPUT = {
  aid: 'chem',
  food: 'food',
  beverages: 'drinks',
  ammo: 'ammo',
  misc: 'misc',
};

/**
 * То же разрешение, что и в данных, но БЕЗ отказов: находим — ссылаемся id,
 * чего нет — позиция уходит в обменник как { itemId: "unknown", sourceName, count }.
 * Снисжительность нужна только обменнику; данные рецептов остаются строгими.
 */
const resolveMaterialsLenient = (materials, ctx, trace) => {
  const rows = [];
  const unknown = [];
  for (const [name, count] of Object.entries(materials)) {
    const amount = Number(count || 0);
    const key = norm(name);
    const alias = ITEM_NAME_ALIASES[key];
    if (alias) {
      const target = ctx.byId.get(alias.itemId);
      if (target) {
        trace.push({ name, itemId: alias.itemId, reason: alias.reason, stage: 'ингредиент' });
        rows.push({ itemId: alias.itemId, count: amount });
        continue;
      }
    }
    const found = ctx.nameIndex.get(key) || ctx.ammo.byName.get(key);
    if (found) { rows.push({ itemId: found.itemId, count: amount }); continue; }
    unknown.push(name);
    rows.push({ itemId: 'unknown', sourceName: name, count: Number.isFinite(amount) ? amount : 'unknown' });
  }
  rows.sort((a, b) => (`${a.itemId}|${a.sourceName || ''}` < `${b.itemId}|${b.sourceName || ''}` ? -1 : 1));
  return { materials: rows, unknown };
};

/**
 * Главный проход: сырой датасет → рецепты со ссылками только по id.
 * @returns {{entries: Array<{bucket: string, record: object}>, index: object,
 *            dropped: Array, aliases: Array, stats: object, report: string}}
 */
export function buildCraftingData() {
  const raw = readRepoJson(RAW_FILE);
  const { index: nameIndex, ambiguous } = buildNameIndex();
  const ctx = {
    nameIndex,
    ambiguous,
    byId: buildIdIndex(nameIndex),
    perks: buildPerkIndex(),
    ammo: buildAmmoBridge(),
  };

  const entries = [];
  const dropped = [];
  const holes = [];
  const aliases = [];
  const corrections = [];
  const correctionsUsed = new Set();
  const ids = new Set();

  for (const source of raw.records) {
    const outputName = source.outputName || source.name;
    const key = norm(outputName);
    const group = String(source.group || '').toUpperCase();
    const drop = (reason) => dropped.push({ name: outputName, group: source.group, workbench: source.workbench, reason });

    if (source.appGenerated) {
      drop('рецепт помечен в источнике как самодеятельность приложения (в книге нет)');
      continue;
    }
    // Отсев по таблице-источнику ДО разрешения имён: иначе одно и то же слово
    // («Стелс-бой») притянется к предмету из чужой ветки — мод силовой брони
    // станет препаратом.
    if (!IMPORTED.has(group)) {
      drop('не предметный рецепт (модификации, броня, силовая броня, роботы) — ветка отложена');
      continue;
    }

    const skill = SKILL_BY_SOURCE[norm(source.skill)];
    if (!skill) { drop(`неизвестный навык «${source.skill}»`); continue; }

    const parsed = parsePerkRequirements(source.perks, ctx.perks);
    if (parsed.error) { drop(parsed.error); continue; }

    const complexity = Math.min(7, Math.max(1, Number(source.complexity) || 1));
    const requires = { skill, complexity, ...(parsed.perks.length ? { perks: parsed.perks } : {}) };
    // Исправления владельца подменяют материалы сырой строки (см. BOOK_CORRECTIONS).
    const correctionKey = `${group.toLowerCase()}|${norm(source.name)}`;
    const correction = BOOK_CORRECTIONS[correctionKey];
    if (correction) {
      correctionsUsed.add(correctionKey);
      corrections.push({ name: outputName, reason: correction.reason, materials: correction.materials });
    }
    const materialsSource = correction ? correction.materials : source.materials;
    const hasSourceMaterials = Boolean(materialsSource && typeof materialsSource === 'object');

    let output = null;
    const alias = ITEM_NAME_ALIASES[key];
    if (alias) {
      const target = ctx.byId.get(alias.itemId);
      if (!target) { drop(`ручное соответствие ведёт на несуществующий id ${alias.itemId}`); continue; }
      aliases.push({ name: outputName, itemId: alias.itemId, reason: alias.reason, stage: 'результат' });
      output = target;
    } else {
      output = ctx.nameIndex.get(key) || null;
      if (!output && ctx.ambiguous.has(key)) {
        drop(`имя результата «${outputName}» неоднозначно: в каталоге ${ctx.ambiguous.get(key).join(', ')}`);
        continue;
      }
    }
    if (!output) {
      const ammo = ctx.ammo.byName.get(key);
      if (ammo) output = { itemId: ammo.itemId, itemType: 'ammo', bucket: 'ammo' };
    }
    const ammo = ctx.ammo.byName.get(key) || (output ? ctx.ammo.byId.get(output.itemId) : null);
    const quantity = output && output.itemType === 'ammo' && ammo && ammo.cd > 0
      ? { base: ammo.base, cd: ammo.cd }
      : (output && output.itemType === 'ammo' && ammo
        ? { base: ammo.base }
        : (output ? 1 : 'unknown'));

    // Форма записи для файла-обменника: те же поля, что у рецепта, но там, где
    // у нас нет данных, — «unknown». Числа придумывать не вправе ни генератор,
    // ни этот файл: их дописывает владелец по своим книгам.
    const holeRecord = (materials, derived, blockedBy) => ({
      id: output ? output.itemId : 'unknown',
      requires,
      materials,
      ...(derived ? { derivedMaterials: true } : {}),
      outputQuantity: output ? quantity : 'unknown',
      ...(output ? {} : { outputType: MISSING_TYPE_BY_SOURCE_OUTPUT[norm(source.outputCategory)] || 'unknown' }),
      ...(Number.isFinite(Number(source.sourcePage)) ? { sourcePage: Number(source.sourcePage) } : {}),
      sourceName: outputName,
      blockedBy,
    });
    const quoteNames = (names) => names.map((n) => `«${n}»`).join(', ');

    if (!output) {
      const lenient = hasSourceMaterials
        ? resolveMaterialsLenient(materialsSource, ctx, aliases)
        : { materials: materialsFromComplexity(complexity), unknown: [], derived: true };
      holes.push({
        category: MISSING_CATEGORY_BY_GROUP[group] || 'loot',
        record: holeRecord(
          lenient.materials,
          Boolean(lenient.derived),
          `в каталоге сеттинга нет такого предмета-результата${lenient.unknown.length ? `; нет и ингредиентов: ${quoteNames(lenient.unknown)}` : ''}`,
        ),
      });
      drop('в каталоге сеттинга нет такого предмета-результата');
      continue;
    }
    if (!BUCKET_ORDER.includes(output.bucket)) {
      drop(`тип результата «${output.itemType}» в срез предметного крафта не входит`);
      continue;
    }

    let materials;
    let derivedMaterials = false;
    if (hasSourceMaterials) {
      const resolved = resolveMaterials(materialsSource, ctx, aliases);
      if (resolved.error) {
        // Рецепт упирается в дыру каталога: в данные он не идёт, но отправляется
        // в обменник со всеми разрешимыми ингредиентами — владельцу останется
        // подставить недостающее, а не переписывать рецепт с нуля.
        const lenient = resolveMaterialsLenient(materialsSource, ctx, aliases);
        holes.push({
          category: MISSING_CATEGORY_BY_GROUP[group] || 'loot',
          record: holeRecord(
            lenient.materials,
            false,
            lenient.unknown.length ? `нет предметов-ингредиентов: ${quoteNames(lenient.unknown)}` : resolved.error,
          ),
        });
        drop(resolved.error);
        continue;
      }
      materials = resolved.materials;
    } else {
      materials = materialsFromComplexity(complexity);
      // Пометка для сверки: ингредиенты взяты не из таблицы рецепта, а по
      // печатному правилу «материалы определяет сложность» (с. 210).
      derivedMaterials = true;
    }

    // Идентификатор рецепта — это id ПРЕДМЕТА, который он даёт: «скрафтить
    // ягодные ментаты» = chem_mentats_berry, а не «craft_something». Если один и
    // тот же предмет умеют давать несколько рецептов (у книги такое есть на
    // боеприпасах: ранг перка меняет рецепт), различие въедает в id — так он
    // остаётся человекочитаемым и при этом однозначным.
    let id = output.itemId;
    if (ids.has(id)) {
      const perkTag = parsed.perks.map((perk) => `${perk.perkId}${perk.rank}`).join('_');
      const base = perkTag || String(source.workbench || 'variant');
      id = `${output.itemId}_${base}`;
      for (let n = 2; ids.has(id); n += 1) id = `${output.itemId}_${base}_${n}`;
    }
    ids.add(id);

    // Форма записи (реформа владельца 2026-09-17): предмет результата — это id
    // рецепта; отдельного «output.itemId» нет. Количество — outputQuantity:
    // целое или {base, cd} (боевые кубики). Верстака и страниц в данных нет.
    // Сгорание при провале в записи тоже не дублируется (микропатч 270):
    // печатное правило «кухня и химия жгут» в наших данных совпадает с проверочным
    // навыком — правило живёт одной строкой в CRAFT_RULES (реестр модуля).
    // Генератор лишь сверяет: навык recipes обязан давать ровно тот же разрез,
    // что печатный верстак источника, — иначе молча потеряем число.
    const bench = BENCH_BY_SOURCE[source.workbench] || BENCH_BY_BUCKET[output.bucket];
    if (Boolean(BENCH_BURNS[bench]) !== (BURN_SKILLS.has(skill))) {
      throw new Error(`${outputName}: верстак «${bench}» и навык «${skill}» расходятся в правиле сгорания — реши явно`);
    }
    entries.push({
      bucket: output.bucket,
      record: {
        id,
        requires: {
          skill,
          complexity,
          ...(parsed.perks.length ? { perks: parsed.perks } : {}),
        },
        materials,
        outputQuantity: quantity,
      },
    });
  }

  // Исправление без сработавшей строки — подозрение, что источник обновился,
  // а правку забыли: пусть генератор падает, чем тихо потеряет число владельца.
  const deadFixes = Object.keys(BOOK_CORRECTIONS).filter((key) => !correctionsUsed.has(key));
  if (deadFixes.length) {
    throw new Error(`BOOK_CORRECTIONS: для ключей ${deadFixes.join(', ')} нет строки в источнике — исправление мертво`);
  }

  const byBucket = {};
  // (BENCH_BURNS — печатное правило сгорания; объявлено рядом с картой верстаков.)
  for (const bucket of BUCKET_ORDER) {
    const list = entries.filter((e) => e.bucket === bucket).map((e) => e.record);
    if (list.length) byBucket[bucket] = list;
  }

  const files = Object.entries(byBucket).map(([bucket, list]) => ({
    file: FILE_BY_BUCKET[bucket],
    bucket,
    content: `${JSON.stringify(list, null, 2)}\n`,
  }));

  const index = {
    id: 'crafting',
    recipes: Object.keys(byBucket).sort().map((bucket) => ({
      file: FILE_BY_BUCKET[bucket],
      category: bucket,
      count: byBucket[bucket].length,
    })),
  };

  const holesByCategory = Object.fromEntries(
    MISSING_CATEGORY_ORDER.map((c) => [c, holes.filter((h) => h.category === c)]),
  );

  const stats = {
    source: raw.records.length,
    emitted: entries.length,
    dropped: dropped.length,
    holes: holes.length,
    holesByCategory: Object.fromEntries(Object.entries(holesByCategory).map(([c, l]) => [c, l.length])),
    perBucket: Object.fromEntries(Object.entries(byBucket).map(([b, l]) => [b, l.length])),
  };

  return {
    files,
    index,
    dropped,
    holesByCategory,
    stats,
    missingContent: renderMissing(holesByCategory),
    report: renderReport(stats, dropped, dedupeAliases(aliases), holesByCategory, corrections),
  };
}

const MISSING_INTRO = {
  purpose: 'Рецепты, которые упираются в дыры каталога: результат или ингредиент названы в источнике, но предмета с таким id у нас нет.',
  format: 'Поля — как у рецептов данных (modules/fallout/data/recipes): id (=предмет результата), requires, materials, outputQuantity. Где данных нет — строка "unknown"; для неизвестных ингредиентов id неизвестен, но напечатанное имя и количество сохранены (sourceName, count), чтобы было что сличить с книгами.',
  howToMerge: 'Дописать недостающее (предмет в каталог либо замену слота), убрать "unknown" и вернуть файл; затем правила переезжают в генератор (соответствия/числа), а данные перегенерируются. Генератор перезаписывает этот файл — руками его чинить можно только как черновик.',
  categories: { chem: 'препараты', food: 'еда и напитки', loot: 'вещи (станки, взрывчатка, ремкомплекты)', ammo: 'боеприпасы, включая дротики' },
};

const renderMissing = (holesByCategory) => {
  const buckets = Object.fromEntries(
    MISSING_CATEGORY_ORDER.map((c) => [
      c,
      [...holesByCategory[c]].sort((a, b) => (a.record.sourceName < b.record.sourceName ? -1 : 1)).map((h) => h.record),
    ]),
  );
  const doc = {
    _meta: {
      generated: 'scripts/build-crafting-data.mjs',
      ...MISSING_INTRO,
      counts: Object.fromEntries(Object.entries(buckets).map(([c, l]) => [c, l.length])),
    },
    ...buckets,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
};

const dedupeAliases = (aliases) => {
  const seen = new Set();
  const out = [];
  for (const a of aliases) {
    const key = `${a.stage}|${a.name}|${a.itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((x, y) => (x.stage + x.name < y.stage + y.name ? -1 : 1));
};

const GROUP_MEANING = {
  AMMUNITION: 'боеприпасы (количество — по объёму находки)',
  'SYRINGER AMMUNITION': 'дротики для шприцера',
  EXPLOSIVES: 'гранаты, мины, «Молотов»',
  CHEMS: 'препараты',
  FOOD: 'еда',
  BEVERAGE: 'напитки',
  'REPAIR KITS': 'ремкомплекты',
  'UTILITY DEVICES': 'полезные устройства',
  WORKBENCH: 'сам верстак (кухня)',
};

const renderReport = (stats, dropped, aliases, holesByCategory, corrections = []) => {
  const byReason = new Map();
  for (const d of dropped) byReason.set(d.reason, (byReason.get(d.reason) || 0) + 1);
  const L = [];
  L.push('# Крафт: как датасет рецептов стал данными каталога');
  L.push('');
  L.push('> Порождается `scripts/build-crafting-data.mjs` — руками не править.');
  L.push('> Перегенерация: `node scripts/build-crafting-data.mjs`.');
  L.push('> `__tests__/crafting/crafting-data.test.js` падает, если данные в репо');
  L.push('> разошлись с тем, что умеет генератор.');
  L.push('');
  L.push('## Поток данных');
  L.push('');
  L.push('```text');
  L.push(`${RAW_FILE}   — чужие имена и строки (справочные данные)`);
  L.push('        │  генератор: имя → id нашего каталога (perк, предмет, ингредиент)');
  L.push('        ▼');
  L.push(`${OUT_DIR}/*.json — только id: результат, материалы, перки, ключ навыка`);
  L.push('        ▼');
  L.push('реестр данных сеттинга → движок крафта (следующий патч)');
  L.push('');
  L.push(`${MISSING_FILE} — обменник: то, где каталог молчит, с «unknown» вместо чисел`);
  L.push('```');
  L.push('');
  L.push('## Покрытие');
  L.push('');
  L.push(`- рецептов в источнике: **${stats.source}**`);
  L.push(`- выпущено в данные: **${stats.emitted}** (${Object.entries(stats.perBucket).map(([b, n]) => `${b}: ${n}`).join(', ')})`);
  L.push(`- не выпущено: **${stats.dropped}**`);
  L.push(`- из них упирается в дыры каталога и выгружено в обменник: **${stats.holes}** (${Object.entries(stats.holesByCategory).map(([c, n]) => `${c}: ${n}`).join(', ')})`);
  L.push('');
  L.push('## Какие таблицы книги вошли');
  L.push('');
  L.push('| Таблица источника | Что за неё берутся материалы |');
  L.push('|---|---|');
  for (const g of IMPORTED_GROUPS) L.push(`| ${g} | ${GROUP_MEANING[g] || '—'} |`);
  L.push('');
  L.push('Всё остальное в источнике — таблицы модификаций (оружие, броня, силовая');
  L.push('броня, роботы): они не выпускаются, пока не настроена ветка модов.');
  L.push('');
  L.push('## Не выпущено — по причинам');
  L.push('');
  L.push('| Причина | Сколько |');
  L.push('|---|---|');
  for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`| ${reason} | ${count} |`);
  }
  L.push('');
  L.push('## Ручные соответствия (то же самое, названо иначе)');
  L.push('');
  L.push('| В источнике | Наш id | Где применено | Почему считаем тем же предметом |');
  L.push('|---|---|---|---|');
  for (const a of aliases) L.push(`| ${a.name} | \`${a.itemId}\` | ${a.stage} | ${a.reason} |`);
  L.push('');
  if (corrections.length) {
    L.push('## Исправления владельца к печатным числам');
    L.push('');
    L.push('Где источник расходится с книгой (или ссылается на предметы, которых в');
    L.push('игре нет), числа диктует владелец — они в `BOOK_CORRECTIONS` генератора.');
    L.push('');
    L.push('| Строка источника | Материалы по исправлению | Примечание |');
    L.push('|---|---|---|');
    for (const c of corrections) {
      const mats = Object.entries(c.materials).map(([name, qty]) => `${name} ×${qty}`).join(', ');
      L.push(`| ${c.name} | ${mats} | ${c.reason} |`);
    }
    L.push('');
  }
  L.push('## Незакрытые позиции: файл-обменник');
  L.push('');
  L.push('Всё, что не выпустилось из-за дыр каталога (нет предмета-результата или');
  L.push('недостающий ингредиент), лежит в `docs/reference-data/Missing_craft.json`:');
  L.push('структура полей — как у рецептов, где данных нет — строка «unknown».');
  L.push('Генератор не решает за владельца, каких книг касаться: он только выгружает');
  L.push('позиции со всеми известными числами. Сейчас в обменнике:');
  L.push('');
  for (const category of MISSING_CATEGORY_ORDER) {
    const list = holesByCategory[category];
    L.push(`- **${category}** (${list.length}) — ${list.length ? list.map((h) => `«${h.record.sourceName}»`).join(', ') : 'пусто'}`);
  }
  L.push('');
  L.push('Файл перегенерируется: починить руками его можно как черновик, но в данные');
  L.push('позиции попадают только после того, как соответствия и числа переедут в');
  L.push('генератор (аллиас или явные ингредиенты) и рецепт пройдёт строгую сверку.');
  L.push('');
  L.push('**Модификации** в обменник не попадают намеренно: это не дыра каталога, а');
  L.push('отложенная ветка (решение владельца). Колонки сложности/перков/материалов');
  L.push('уже проставлены на 205 модах оружия и на модах брони — когда ветку настроим,');
  L.push('генератору останется переложить их в тот же формат.');
  L.push('');
  L.push('## Список непрошедших рецептов');
  L.push('');
  L.push('| Рецепт | Группа источника | Верстак | Причина |');
  L.push('|---|---|---|---|');
  for (const d of dropped) L.push(`| ${d.name} | ${d.group || '—'} | ${d.workbench || '—'} | ${d.reason} |`);
  L.push('');
  // Одна пустая строка на конце: без лишних «хвостов» (git ругается на blank line at EOF).
  return `${L.join('\n').replace(/\n+$/, '')}\n`;
};

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const check = process.argv.includes('--check');
  const result = buildCraftingData();
  const wanted = [
    { file: 'index.json', content: `${JSON.stringify(result.index, null, 2)}\n` },
    ...result.files,
  ];

  if (check) {
    const drift = [];
    for (const item of wanted) {
      let current = null;
      try { current = readFileSync(join(REPO, OUT_DIR, item.file), 'utf8'); } catch { current = null; }
      if (current !== item.content) drift.push(item.file);
    }
    const existing = (() => {
      try { return readFileSync(join(REPO, REPORT_FILE), 'utf8'); } catch { return null; }
    })();
    if (existing !== result.report) drift.push(REPORT_FILE);
    const missingOnDisk = (() => {
      try { return readFileSync(join(REPO, MISSING_FILE), 'utf8'); } catch { return null; }
    })();
    if (missingOnDisk !== result.missingContent) drift.push(MISSING_FILE);
    if (drift.length) {
      console.error(`расхождение с генератором: ${drift.join(', ')} — запустите node scripts/build-crafting-data.mjs`);
      process.exitCode = 1;
    } else {
      console.log(`ok: ${result.stats.emitted} рецептов в ${wanted.length} файлах совпадают с генератором`);
    }
  } else {
    for (const item of wanted) {
      mkdirSync(join(REPO, OUT_DIR), { recursive: true });
      writeFileSync(join(REPO, OUT_DIR, item.file), item.content);
      console.log(`→ ${OUT_DIR}/${item.file}`);
    }
    writeFileSync(join(REPO, REPORT_FILE), result.report);
    console.log(`→ ${REPORT_FILE}`);
    writeFileSync(join(REPO, MISSING_FILE), result.missingContent);
    console.log(`→ ${MISSING_FILE}`);
    console.log(`выпущено ${result.stats.emitted} из ${result.stats.source}, отброшено ${result.stats.dropped}, в обменнике ${result.stats.holes}`);
  }
}
