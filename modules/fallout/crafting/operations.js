// Операции крафта — адаптер сеттинга над универсальным движком (патч 251).
//
// Движок знает ФОРМУ рецепта и умеет решать «можно / нельзя / сделано». Здесь —
// всё остальное: откуда брать рецепты (реестр данных пакета), чем мерить ранги
// (стор), какие кубики кидать (движковая dice-логика), как атомарно списывать
// (стор-операция spendItemStacks) и что значит «выдать предмет» (addNewItem,
// сам резолвит id по каталогу). Сюда же смотрит движок за правилами-числами:
// на каких верстаках провал сжигает материалы (CRAFT_RULES).
//
// Как и операции выживания: читают СВЕЖЕЕ состояние прямо из стора, пишут —
// действиями того же стора; React-контекста модуль не знает.

import useCharacterStore from '../../../src/store/characterStore';
import { debugLog } from '../../../src/debug/falloutDebug';
import { getCraftingRecipeById, getScrapMaterials } from '../../../domain/registry';
import { evaluateCraft, runCraft } from '../../../domain/craftingEngine';
import { isSkillTagged } from '../../../domain/d20Checks';
import { getPerkSelectionCount } from '../../../domain/perks';
import { getItemId } from '../../../domain/itemIdentity';
import { rollByType } from '../../../domain/diceRollsLogic';
import { selectSkillTotal, selectAttributeTotal } from '../../../src/store/selectors';
import { CRAFT_RULES } from './rules';
import { applyActivityMinutes } from '../survival/operations';

// Сколько в сумке стока с данным КАНОНИЧЕСКИМ id (та же цепочка, по которой
// addNewItem определяет «какой это предмет»). Надетое и запертое комплектом не
// считается — ровно как в списании (spendItemStacks): превью обязано совпадать
// с действием, иначе экран обещал бы то, что стор не отдаст.
const countInventoryByCatalogId = (items = {}) => {
  const counts = {};
  for (const item of Object.values(items)) {
    if (!item || item.equipped || item.locked) continue;
    const canonical = getItemId(item);
    if (!canonical) continue;
    counts[canonical] = (counts[canonical] || 0) + (Number(item.quantity) || 1);
  }
  return counts;
};

// Пачки и закрытие строк (263, реформа 269). Все материалы равны (решение
// владельца): material.json не делит записи на «именованные» и «пачки» —
// пачками считаются три id из CRAFT_RULES.packMaterialIds. Строку-пачку
// закрывает любой материал той же редкости (по цене, затем id); точные строки
// рецептов резервируют своё количество первыми.
const packIndex = () => {
  const materials = getScrapMaterials();
  const byId = new Map(materials.map((m) => [m.id, m]));
  const packRarity = new Map();
  for (const id of CRAFT_RULES.packMaterialIds ?? []) {
    packRarity.set(id, byId.get(id)?.rarity ?? 0);
  }
  const fillersByRarity = new Map();
  for (const m of materials) {
    const rarity = m.rarity ?? 0;
    if (!fillersByRarity.has(rarity)) fillersByRarity.set(rarity, []);
    fillersByRarity.get(rarity).push(m);
  }
  for (const list of fillersByRarity.values()) {
    list.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || (a.id < b.id ? -1 : 1));
  }
  return { packRarity, fillersByRarity };
};

const dualityEnabled = () => CRAFT_RULES.packSubstitutionByRarity === true;

// Цена провала — правило навыка (270): данные рецептов о сгорании молчат.
const burnsOnFail = (recipe) =>
  (CRAFT_RULES.failBurnsMaterialsSkills ?? []).includes(recipe?.requires?.skill);

// «Есть в наличии» для движка с учётом дуальности: к счётчику пачки прибавляется
// остаток именованных материалов той же редкости. Точные строки рецепта
// резервируют своё количество первыми (в печатных данных пересечений слотов
// нет — резерв страхует домашние рецепты от двойного расхода одного стального).
const countsForEngine = (recipe, counts) => {
  if (!dualityEnabled()) return counts;
  const { packRarity, fillersByRarity } = packIndex();
  if (!recipe.materials.some((m) => packRarity.has(m.itemId))) return counts;
  const exactNeed = new Map();
  for (const m of recipe.materials) {
    if (!packRarity.has(m.itemId)) exactNeed.set(m.itemId, (exactNeed.get(m.itemId) ?? 0) + m.count);
  }
  const next = { ...counts };
  for (const m of recipe.materials) {
    if (!packRarity.has(m.itemId)) continue;
    let free = 0;
    for (const f of fillersByRarity.get(packRarity.get(m.itemId)) ?? []) {
      if (f.id === m.itemId) continue; // пачка не закрывает сама себя — это её счётчик
      free += Math.max(0, (counts[f.id] ?? 0) - (exactNeed.get(f.id) ?? 0));
    }
    next[m.itemId] = (counts[m.itemId] ?? 0) + free;
  }
  return next;
};

// Разрезание плана списания: сначала пачки, затем закрытие по возрастанию цены.
// Строки точных ингредиентов потребляют своё до закрытия. Невзяточный остаток
// (в норме не случается: движок сверяет до списания) остаётся на строке пачки —
// стор атомарно откажет, ничего не сгорит.
const expandSpendPlan = (plan, counts) => {
  if (!dualityEnabled()) return plan.map(({ itemId, count }) => ({ itemId, count }));
  const { packRarity, fillersByRarity } = packIndex();
  const used = new Map();
  const out = [];
  const take = (id, want) => {
    const have = Math.max(0, (counts[id] ?? 0) - (used.get(id) ?? 0));
    const grab = Math.min(have, want);
    if (grab > 0) {
      used.set(id, (used.get(id) ?? 0) + grab);
      out.push({ itemId: id, count: grab });
    }
    return grab;
  };
  const rows = plan.map((r) => ({ id: r.itemId, left: r.count, pack: packRarity.has(r.itemId) }));
  for (const row of rows) if (!row.pack) row.left -= take(row.id, row.left);
  for (const row of rows) {
    if (!row.pack) continue;
    row.left -= take(row.id, row.left);
    for (const f of fillersByRarity.get(packRarity.get(row.id)) ?? []) {
      if (row.left <= 0) break;
      if (f.id === row.id) continue; // саму пачку take уже учёл
      row.left -= take(f.id, row.left);
    }
  }
  for (const row of rows) {
    if (row.left > 0) out.push({ itemId: row.id, count: row.left }); // путь отказа стора
  }
  return out;
};

const perkRanksFor = (recipe, selectedPerks) => {
  const ranks = {};
  for (const perk of recipe?.requires?.perks ?? []) {
    ranks[perk.perkId] = getPerkSelectionCount(selectedPerks ?? [], perk.perkId);
  }
  return ranks;
};

const heroView = (recipe) => {
  const store = useCharacterStore.getState();
  return {
    store,
    skillRank: selectSkillTotal(store, recipe.requires.skill),
    perkRanks: perkRanksFor(recipe, store.selectedPerks),
    inventoryCounts: countsForEngine(recipe, countInventoryByCatalogId(store.items)),
    attributeValue: selectAttributeTotal(store, CRAFT_RULES.testAttribute),
    isTagged: isSkillTagged({
      skillId: recipe.requires.skill,
      primaryTaggedSkillIds: store.selectedSkills ?? [],
      extraTaggedSkillIds: store.extraTaggedSkills ?? [],
    }),
  };
};

/**
 * Сверка рецепта с героем и сумкой без изменений состояния — для экранов
 * («можно ли скрафтить, чего не хватает, какая цена проверки»).
 */
export const craftingPreview = (recipeId) => {
  const recipe = getCraftingRecipeById(recipeId);
  if (!recipe) return null;
  const { skillRank, perkRanks, inventoryCounts } = heroView(recipe);
  return {
    recipe,
    evaluation: evaluateCraft({ recipe, skillRank, perkRanks, inventoryCounts }),
    // Цена проверки — свойство рецепта (реформа 269): право провала сжигать
    // материалы записано в самой строке (failBurnsMaterials), карт верстаков нет.
    rulesView: {
      failBurnsMaterials: burnsOnFail(recipe),
      complicationDurationMultiplier: CRAFT_RULES.complicationDurationMultiplier,
    },
  };
};

// Базовые минуты работы по ступеням CRAFT_RULES.craftTimeTiers (патч 262).
// Сложность берётся печатная (из рецепта), а не вычиточная: длительность в
// книге привязана к предмету, навык героя меняет проверку, не часы работы.
export const craftMinutesForRecipe = (recipe) => {
  const c = Number(recipe?.requires?.complexity ?? 0);
  const tiers = CRAFT_RULES.craftTimeTiers;
  const tier = tiers.find((t) => t.upToComplexity == null || c <= t.upToComplexity);
  return tier ? tier.minutes : tiers[tiers.length - 1].minutes;
};

/**
 * Совершить крафт. Возврат — контракт движка (см. domain/craftingEngine.js):
 * { done:true, spent, granted, check } либо отказ с причиной. Порты кубиков
 * переопределяемы (тесты; экраны зовут без портов — настоящие кости).
 */
export const craftRecipe = (recipeId, ports = {}) => {
  const recipe = getCraftingRecipeById(recipeId);
  if (!recipe) {
    return { done: false, stage: 'unknown', reason: 'recipe-not-found', spent: [], granted: null, check: null };
  }

  const { store, skillRank, perkRanks, inventoryCounts, attributeValue, isTagged } = heroView(recipe);

  // Фактическое списание (с закрытием пачек) — помечаем в замыкании, чтобы
  // вернуть в контракте spent/burned честными строками, а не планом движка.
  let expandedSpend = null;

  const result = runCraft({
    recipe,
    skillRank,
    attributeValue,
    isTagged,
    perkRanks,
    inventoryCounts,
    failBurnsMaterials: burnsOnFail(recipe),
    complicationDurationMultiplier: CRAFT_RULES.complicationDurationMultiplier,
    ...(ports.rollD20 ? { rollD20: ports.rollD20 } : {}),
    rollCD: ports.rollCD ?? ((diceCount) => rollByType('rollCD', diceCount)),
    spend: (plan) => {
      expandedSpend = expandSpendPlan(plan, countInventoryByCatalogId(useCharacterStore.getState().items));
      return store.spendItemStacks({ spend: expandedSpend });
    },
    grant: ({ itemId, quantity }) => ({
      instanceId: store.addNewItem({ itemId, quantity }),
    }),
  });

  // Время (патч 262): любая работа, дошедшая до проверки, идёт по часам —
  // и удачная, и сорванная (провал = зря потраченный час). Отказ гейта или
  // стора — бросок не делался, время не тратится. Осложнение домножает.
  let timed = null;
  if (result.done === true || result.stage === 'check') {
    const minutes = craftMinutesForRecipe(recipe);
    const durationMultiplier = result.durationMultiplier ?? 1;
    timed = applyActivityMinutes(minutes * durationMultiplier, `craft:${recipe.category ?? 'any'}`);
    result.time = { minutes, durationMultiplier };
  }
  if (timed) result.survival = timed;

  if (expandedSpend && Array.isArray(result.spent) && result.spent.length > 0) {
    result.spent = expandedSpend;
    if (Array.isArray(result.burned) && result.burned.length > 0) result.burned = expandedSpend;
  }

  debugLog('crafting.craft', {
    recipeId,
    done: result.done,
    stage: result.stage ?? null,
    granted: result.granted?.itemId ?? null,
    spentCount: result.spent?.length ?? 0,
    minutes: result.time ? result.time.minutes * result.time.durationMultiplier : null,
    timeApplied: timed?.applied ?? false,
  });

  return result;
};
