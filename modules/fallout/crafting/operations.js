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
import { getCraftingCategoryRules, getCraftingRecipeById, getScrapMaterials } from '../../../domain/registry';
import { evaluateCraft, runCraft } from '../../../domain/craftingEngine';
import { isSkillTagged } from '../../../domain/d20Checks';
import { getPerkSelectionCount } from '../../../domain/perks';
import { getItemId } from '../../../domain/itemIdentity';
import { rollByType } from '../../../domain/diceRollsLogic';
import { selectSkillTotal, selectAttributeTotal } from '../../../src/store/selectors';
import { CRAFT_RULES } from './rules';
import { applyActivityMinutes } from '../survival/operations';
import useAppSettingsStore from '../../../src/store/appSettingsStore';
import { earnActionPoints, getActionPoints, spendActionPoints } from '../../../domain/actionPoints';

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

// Цена провала (патч 323, слово владельца): решение о потере материалов —
// настройка раздела «Крафт», две группы категорий (consumables/gear).
// Ранее — навыковое правило failBurnsMaterialsSkills из реестра категорий.
const lossGroupOf = (recipe) => {
  const cat = recipe?.category;
  if (CRAFT_RULES.lossGroups.consumables.includes(cat)) return 'consumables';
  if (CRAFT_RULES.lossGroups.gear.includes(cat)) return 'gear';
  return null;
};

const burnsOnFail = (recipe) => {
  const group = lossGroupOf(recipe);
  if (!group) return false;
  const settingId = group === 'consumables' ? 'craftFailLossConsumables' : 'craftFailLossGear';
  return useAppSettingsStore.getState().getValue(settingId) === true;
};

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
      // 323: осложнение аддитивно (+30/+10 мин), не множителем.
      complicationDurationMultiplier: 1,
    },
  };
};

// Базовые минуты работы по книге (патч 323): час для всех категорий,
// 20 минут — станция приготовления пищи (еда и напитки).
export const craftMinutesForRecipe = (recipe) =>
  CRAFT_RULES.stationCategories.includes(recipe?.category)
    ? CRAFT_RULES.stationMinutes
    : CRAFT_RULES.craftBaseMinutes;

// Надбавка за КАЖДОЕ осложнение (книга, 323): +30 минут, на станции +10.
export const complicationExtraMinutesFor = (recipe) =>
  CRAFT_RULES.stationCategories.includes(recipe?.category)
    ? CRAFT_RULES.stationComplicationExtraMinutes
    : CRAFT_RULES.complicationExtraMinutes;

/**
 * Списать отложенное время крафта (патч 323). Окно крафта спрашивает
 * после успеха: потратить 2 ОД и сократить время вдвое? Успешные попытки
 * при «да» идут за половину базы (осложнения добавляются поверх), неудачные
 * — всегда полное время (ОД на провал не тратятся).
 */
const earned = (gained) => (gained > 0 ? earnActionPoints(gained) : getActionPoints());

export const settleCraftTime = (recipeId, run, { spendActionPoints: halveForAp = false } = {}) => {
  const recipe = getCraftingRecipeById(recipeId);
  // Решение о 2 ОД подтверждается ПУЛОМ: меньше 2 — трата невозможна,
  // время идёт полное («больше 6 потратить не выйдет…», 324).
  const apSpend = halveForAp ? spendActionPoints(2) : { ok: false, pool: getActionPoints() };
  const halved = halveForAp && apSpend.ok;
  // 352: обе формы прогона — пачка (attempts[]) и одиночный craftRecipe
  // (time.pending на верхнем уровне); поведение для пачки прежнее.
  const attempts = run?.attempts ?? (run?.time?.pending
    ? [{ done: run.done === true, time: run.time }]
    : []);
  let total = 0;
  for (const attempt of attempts) {
    const t = attempt?.time;
    if (!t?.pending) continue;
    let minutes = t.baseMinutes;
    if (halved && attempt.done) minutes /= 2;
    total += minutes + (t.complicationMinutes ?? 0);
  }
  if (total > 0) {
    applyActivityMinutes(total, `craft:${recipe?.category ?? 'any'}`);
  }
  return { minutes: total, spendActionPoints: halved, pool: apSpend.pool };
};


/**
 * Совершить крафт. Возврат — контракт движка (см. domain/craftingEngine.js):
 * { done:true, spent, granted, check } либо отказ с причиной. Порты кубиков
 * переопределяемы (тесты; экраны зовут без портов — настоящие кости).
 */
export const craftRecipe = (recipeId, ports = {}, { deferTime = false, zeroDifficulty } = {}) => {
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
    ...(zeroDifficulty ? { zeroDifficulty } : {}),
    // 323: множитель выключен — надбавка за осложнения аддитивная (ниже).
    complicationDurationMultiplier: 1,
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

  // Время (патч 262; книга — 323): любая работа, дошедшая до проверки, идёт
  // по часам — и удачная, и сорванная (провал = зря потраченное время). Отказ
  // гейта или стора — бросок не делался, время не тратится. Осложнение —
  // аддитивно: база + (число осложнений × надбавка: +30 мин, станция +10).
  // deferTime (323): время НЕ списывается сразу — окно спросит про 2 ОД
  // (успех можно сократить вдвое) и спишет через settleCraftTime.
  let timed = null;
  if (result.done === true || result.stage === 'check') {
    const baseMinutes = craftMinutesForRecipe(recipe);
    const complicationMinutes = (result.check?.complicationCount ?? 0)
      * complicationExtraMinutesFor(recipe);
    const minutes = baseMinutes + complicationMinutes;
    if (deferTime) {
      result.time = {
        minutes,
        baseMinutes,
        complicationMinutes,
        durationMultiplier: 1,
        pending: true,
      };
    } else {
      timed = applyActivityMinutes(minutes, `craft:${recipe.category ?? 'any'}`);
      result.time = { minutes, durationMultiplier: 1 };
    }
  }
  if (timed) result.survival = timed;

  // ОД (патч 324, слово владельца): успешная проверка пополняет ГРУППОВОЙ пул —
  // +1 ОД за каждый успех сверх сложности (крит-кубик даёт 2 успеха — его
  // прибавка уже внутри successes, d20Checks). Автоуспех (сложность 0,
  // броска не было) и провал ОД не приносят. Пул живёт в domain/actionPoints
  // (кап 6), UI-хранилище будет позже.
  if (result.done === true && result.check) {
    const gained = Math.max(0, (result.check.successes ?? 0) - (result.check.difficulty ?? 0));
    const poolAfter = earned(gained);
    result.apEarned = { gained, pool: poolAfter };
  }

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
