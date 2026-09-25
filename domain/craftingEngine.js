// domain/craftingEngine.js
//
// Универсальный движок механики «крафт» (патч 251).
//
// Что он знает: ТОЛЬКО форму рецепта — { requires: { skill, complexity, perks[] },
// materials: [{ itemId, count }], outputQuantity: number | {base,cd};
// id рецепта = id предмета результата. Сгорание при провале — настройка
// модуля (CRAFT_RULES), не поле данных (270).
// Идентификаторы предметов, перков, верстаков для него непрозрачны: движок не
// заглядывает в каталоги, не читает стор и не знает, что такое Fallout.
//
// Что он делает: гейтит рецепт по рангам особенностей, считает доступность
// материалов, вычисляет сложность проверки по печатному правилу книги
// «сложность = Complexity − ранг навыка, 0 = автоуспех» (Core Rulebook, с. 210),
// бросает проверку движковым d20-резолвером, считает количество результата
// ({base, cd} — боевые кубики через порт rollCD) и проводит сам обмен:
// «списать материалы — выдать предмет» — через порты вызывающего.
//
// Чего он НЕ делает: не решает, ГДЕ лежат рецепты и ЧТО такое предметы, — это
// даёт сеттинг (реестр данных + адаптер операций). Не пишет в стор напрямую:
// списание и выдача — порты spend/grant, их реализует адаптер (атомарность
// транзакции — его ответственность). Движок формулирует решение: «сделано /
// отказ с причиной».
//
// Формы результата (контракт для экранов и тестов):
//   { done: true,  spent: [{itemId, count}], granted: {itemId, quantity, instanceId?},
//     check|null, auto }
//   { done: false, stage: 'gate',  reasons: [{code, ...}], spent: [], granted: null }
//   { done: false, stage: 'store', reason: 'spend-refused', ... }   // адаптер отказал
//   { done: false, stage: 'check', reason: 'check-failed', burned: [...], ... }
// Все ответы с проверкой несут durationMultiplier: множитель времени работы
// (или негативного эффекта), который вызывающий применяет, когда время
// где-то учтено. Осложнение успех не отменяет — при любом осложнении
// множитель берётся из правила вызывающего (1 = удвоения нет).

import { resolveD20Check } from './d20Checks';

const assertRecipeShape = (recipe) => {
  if (!recipe || typeof recipe !== 'object') {
    throw new Error('[craftingEngine] recipe is required');
  }
  const { requires, materials } = recipe;
  if (!requires || typeof requires.skill !== 'string' || !requires.skill) {
    throw new Error('[craftingEngine] recipe.requires.skill is required');
  }
  if (!Number.isInteger(requires.complexity) || requires.complexity < 1) {
    throw new Error('[craftingEngine] recipe.requires.complexity must be an integer >= 1');
  }
  if (!Array.isArray(materials) || materials.length === 0) {
    throw new Error('[craftingEngine] recipe.materials must be a non-empty list');
  }
  for (const entry of materials) {
    if (typeof entry?.itemId !== 'string' || !entry.itemId
      || !Number.isInteger(entry.count) || entry.count <= 0) {
      throw new Error('[craftingEngine] recipe.materials entries must be { itemId, count > 0 }');
    }
  }
  // Результат рецепта — это предмет с его id (реформа 2026-09-17): отдельного
  // «output.itemId» в данных нет, количество — outputQuantity (целое или {base,cd}).
  if (typeof recipe.id !== 'string' || !recipe.id) {
    throw new Error('[craftingEngine] recipe.id (он же id предмета результата) is required');
  }
  if (recipe.outputQuantity !== undefined) {
    assertQuantityShape(recipe.outputQuantity); // форма проверяется без броска
  }
  if (recipe.failBurnsMaterials !== undefined) {
    throw new Error('[craftingEngine] failBurnsMaterials is a module rule (270), not recipe data');
  }
};

/**
 * Печатное правило (с. 210): проверки не требуется, если ранг навыка накрывает
 * сложность рецепта. Неотрицательный результат — сам факт «0» значит автоуспех.
 */
export const craftDifficulty = ({ complexity, skillRank = 0 }) =>
  Math.max(0, complexity - Math.max(0, Number(skillRank) || 0));

/**
 * Количество результата: число или { base, cd } — база плюс боевые кубики.
 * Кубики кидает порт rollCD (движок не знает, чьи это кубики и зачем).
 */
// Форма количества результата: целое ≥1 или {base ≥1, cd ≥0}. Отдельно от
// резолвера: сверка данных не имеет права бросать кубики (269).
const assertQuantityShape = (quantity) => {
  if (Number.isInteger(quantity)) {
    if (quantity < 1) throw new Error('[craftingEngine] recipe.outputQuantity must be >= 1');
    return;
  }
  if (!quantity || typeof quantity !== 'object' || Array.isArray(quantity)) {
    throw new Error('[craftingEngine] recipe.outputQuantity must be an integer or { base, cd }');
  }
  const base = Number(quantity.base);
  const cd = Number(quantity.cd ?? 0);
  if (!Number.isInteger(base) || base < 1) {
    throw new Error('[craftingEngine] outputQuantity.base must be an integer >= 1');
  }
  if (!Number.isInteger(cd) || cd < 0) {
    throw new Error('[craftingEngine] outputQuantity.cd must be an integer >= 0');
  }
};

export const resolveOutputQuantity = (quantity, rollCD) => {
  assertQuantityShape(quantity);
  if (Number.isInteger(quantity)) return quantity;
  const base = Number(quantity.base);
  const cd = Number(quantity.cd ?? 0);
  if (cd === 0) return base;
  if (typeof rollCD !== 'function') {
    throw new Error('[craftingEngine] rollCD port is required for CD quantities');
  }
  const rolled = Number(rollCD(cd));
  if (!Number.isInteger(rolled) || rolled < 0) {
    throw new Error('[craftingEngine] rollCD must return a non-negative integer');
  }
  return base + rolled;
};

/**
 * Сверка рецепта с героем и сумкой — БЕЗ изменений состояния. Экран может
 * звать это хоть каждый рендер: «можно ли», «чего не хватает», «какая цена».
 * blocked[] — причины отказа с деталями (что и сколько нужно/есть).
 */
export const evaluateCraft = ({
  recipe,
  skillRank = 0,
  perkRanks = {},
  inventoryCounts = {},
}) => {
  assertRecipeShape(recipe);
  const blocked = [];

  for (const perk of recipe.requires.perks ?? []) {
    if (typeof perk?.perkId !== 'string' || !perk.perkId) {
      throw new Error('[craftingEngine] recipe.requires.perks entries must be { perkId, rank }');
    }
    const need = Number.isInteger(perk.rank) && perk.rank >= 1 ? perk.rank : 1;
    const have = Math.max(0, Number(perkRanks?.[perk.perkId]) || 0);
    if (have < need) blocked.push({ code: 'missing-perk', perkId: perk.perkId, need, have });
  }

  const materials = recipe.materials.map(({ itemId, count }) => {
    const have = Math.max(0, Number(inventoryCounts?.[itemId]) || 0);
    const enough = have >= count;
    if (!enough) blocked.push({ code: 'missing-material', itemId, need: count, have });
    return { itemId, need: count, have, enough };
  });

  const difficulty = craftDifficulty({ complexity: recipe.requires.complexity, skillRank });
  return {
    recipeId: typeof recipe.id === 'string' ? recipe.id : null,
    skill: recipe.requires.skill,
    difficulty,
    auto: difficulty === 0,
    blocked,
    materials,
    ready: blocked.length === 0,
  };
};

/**
 * Полный проход крафта: гейты → проверка результата → атомарный обмен через
 * порты. Отказ на любом гейте не зовёт порты (баланс не тронут). При провале
 * проверки поведение задаёт вызывающий: failBurnsMaterials=true — материалы
 * сгорают (списываются), false — остаются в сумке (книга: горят на кухне и в
 * химии, не горят за верстаком; список верстаков — число настройки сеттинга).
 * complicationDurationMultiplier=N: осложнение не отменяет успех, а
 * помножает время на N (правило владельца 2026-09-16; ответ несёт
 * durationMultiplier — куда его приложить, решает вызывающий).
 */
export const runCraft = ({
  recipe,
  skillRank = 0,
  attributeValue = 0,
  isTagged = false,
  perkRanks = {},
  inventoryCounts = {},
  failBurnsMaterials = false,
  complicationDurationMultiplier = 1,
  // 356 (слово владельца, механизм проверок в целом): сложность 0 —
  // 'auto' (прежнее поведение: автоуспех без броска) или 'roll' (кубики
  // брошены, действуют правила Успехов/Провалов — включая автоматический
  // провал на двух осложнениях). Выбор спрашивает UI; движок только исполняет.
  zeroDifficulty = 'auto',
  rollD20,
  rollCD,
  spend,
  grant,
}) => {
  if (typeof spend !== 'function' || typeof grant !== 'function') {
    throw new Error('[craftingEngine] ports { spend, grant } are required');
  }

  const evaluation = evaluateCraft({ recipe, skillRank, perkRanks, inventoryCounts });
  if (!evaluation.ready) {
    return { done: false, stage: 'gate', reasons: evaluation.blocked, spent: [], granted: null, check: null, auto: false };
  }

  // Количество считаем ДО списания: кривая форма output.quantity — дефект данных,
  // он не должен застирать сумку на полуслове.
  const quantity = resolveOutputQuantity(recipe.outputQuantity ?? 1, rollCD);

  let check = null;
  if (!evaluation.auto || zeroDifficulty === 'roll') {
    check = resolveD20Check({
      attributeValue,
      skillValue: Math.max(0, Number(skillRank) || 0),
      isTagged,
      difficulty: evaluation.difficulty,
      diceCount: 2,
      ...(rollD20 ? { rollD20 } : {}),
    });
  }
  const passed = (evaluation.auto && !check) || check.passed;
  const plan = evaluation.materials.map(({ itemId, need }) => ({ itemId, count: need }));

  // Осложнение не отменяет успех (корневая система 2d20): оно помножает
  // время — множитель едет в ответе, куда его приложить, решает вызывающий,
  // когда время учтено. Автоуспех без броска множителя не получает.
  const durationMultiplier = check && check.complicationCount > 0
    ? complicationDurationMultiplier
    : 1;

  if (passed) {
    const spendResult = spend(plan);
    if (!spendResult || spendResult.ok !== true) {
      return {
        done: false,
        stage: 'store',
        reason: 'spend-refused',
        storeReason: spendResult?.reason ?? null,
        spent: [],
        granted: null,
        check,
      };
    }
    const grantResult = grant({ itemId: recipe.id, quantity });
    return {
      done: true,
      // 356: auto = «броска не было» — отчёт печатает кубики, если бросили.
      auto: evaluation.auto && !check,
      durationMultiplier,
      spent: plan,
      granted: {
        itemId: recipe.id,
        quantity,
        ...(grantResult && typeof grantResult === 'object' && grantResult.instanceId
          ? { instanceId: grantResult.instanceId } : {}),
      },
      check,
    };
  }

  // Провал проверки. Книжное «материалы сгорают» — решение сеттинга (порт spend
  // тот же атомарный); без флага провал ничего не меняет — только сорванная
  // работа.
  if (failBurnsMaterials) {
    const spendResult = spend(plan);
    if (!spendResult || spendResult.ok !== true) {
      return {
        done: false,
        stage: 'store',
        reason: 'spend-refused',
        storeReason: spendResult?.reason ?? null,
        spent: [],
        burned: [],
        granted: null,
        check,
      };
    }
    return { done: false, stage: 'check', reason: 'check-failed', durationMultiplier, spent: plan, burned: plan, granted: null, check };
  }

  return { done: false, stage: 'check', reason: 'check-failed', durationMultiplier, spent: [], burned: [], granted: null, check };
};
