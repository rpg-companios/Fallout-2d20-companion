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
import { getCraftingRecipeById } from '../../../domain/registry';
import { evaluateCraft, runCraft } from '../../../domain/craftingEngine';
import { isSkillTagged } from '../../../domain/d20Checks';
import { getPerkSelectionCount } from '../../../domain/perks';
import { getItemId } from '../../../domain/itemIdentity';
import { rollByType } from '../../../domain/diceRollsLogic';
import { selectSkillTotal, selectAttributeTotal } from '../../../src/store/selectors';
import { CRAFT_RULES } from './rules';

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
    inventoryCounts: countInventoryByCatalogId(store.items),
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
  };
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
  const burnByBench = CRAFT_RULES.failBurnsMaterialsByBench;

  const result = runCraft({
    recipe,
    skillRank,
    attributeValue,
    isTagged,
    perkRanks,
    inventoryCounts,
    failBurnsMaterials: burnByBench[recipe.bench] ?? burnByBench.default,
    ...(ports.rollD20 ? { rollD20: ports.rollD20 } : {}),
    rollCD: ports.rollCD ?? ((diceCount) => rollByType('rollCD', diceCount)),
    spend: (plan) => store.spendItemStacks({
      spend: plan.map(({ itemId, count }) => ({ itemId, count })),
    }),
    grant: ({ itemId, itemType, quantity }) => ({
      instanceId: store.addNewItem({
        itemId,
        ...(itemType ? { itemType } : {}),
        quantity,
      }),
    }),
  });

  debugLog('crafting.craft', {
    recipeId,
    done: result.done,
    stage: result.stage ?? null,
    granted: result.granted?.itemId ?? null,
    spentCount: result.spent?.length ?? 0,
  });

  return result;
};
