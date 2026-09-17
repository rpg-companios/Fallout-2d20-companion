// Модель окна крафта (патч 265): список по верстакам, пакетный прогон, отчёт.
// Реакта здесь нет — модалка только рисует то, что посчитано тут.
//
// Слои честные: рецепт знает только, ЧТО он просит («обычный материал ×2»).
// Замену пачки именованным материалом (263) считает инвентарь — в списке
// «есть» уже включает покрытие, но окно ничего не объясняет про замены:
// это знание сумки, а не рецепта. (Решение владельца 2026-09-17.)
//
// Пакетный крафт (265): count попыток подряд, каждая — полный цикл движка
// со своей проверкой, своим временем и своим списанием. Провал на третьей из
// пяти сжигает материалы только третьей (решение владельца); при нехватке
// сумки попытки останавливаются, остальные не начинаются.

import useCharacterStore from '../../../src/store/characterStore';
import { getCraftingCategories, getCraftingRecipeById, getCraftingRecipes } from '../../../domain/registry';
import { findCatalogEntry } from '../../../domain/resolveItem';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { getCurrentModuleLocale } from '../../../i18n/locale';
import { selectSkillTotal, selectAttributeTotal } from '../../../src/store/selectors';
import { getSkillDisplayName } from '../screens/CharacterScreen/logic/characterScreenI18n';
import ruPerks from '../i18n/ru-RU/data/perks/perks.json';
import enPerks from '../i18n/en-EN/data/perks/perks.json';
import ruDict from '../i18n/ru-RU/screens/inventory/craftingModal.json';
import enDict from '../i18n/en-EN/screens/inventory/craftingModal.json';
import { craftMinutesForRecipe, craftRecipe, craftingPreview } from './operations';
import { CRAFT_RULES } from './rules';

// Порядок вкладок = категории манифеста рецептов (реформа 269): верстаков в
// данных нет, файл-раздел и есть категория. Движок категорий не знает.

const dict = () => (getCurrentModuleLocale() === 'en-EN' ? enDict : ruDict);
const fmt = (template, params = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => String(params?.[key] ?? `{${key}}`));

const perkName = (id) => {
  const perks = getCurrentModuleLocale() === 'en-EN' ? enPerks : ruPerks;
  return perks.find((p) => p.id === id)?.name || id;
};

const hintByPrefix = (id) => {
  const s = String(id || '');
  if (s.startsWith('weapon_')) return 'weapon';
  if (s.startsWith('ammo_')) return 'ammo';
  if (s.startsWith('chem_')) return 'chem';
  if (s.startsWith('food_')) return 'food';
  if (s.startsWith('drink_')) return 'drinks';
  if (s.startsWith('armor_')) return 'armor';
  return null;
};

const itemName = (catalog, id, typeHint) => {
  const hint = typeHint ?? hintByPrefix(id);
  const entry = (hint ? findCatalogEntry(catalog, id, hint) : null)
    ?? findCatalogEntry(catalog, id, 'misc');
  return entry?.name ?? id;
};

export const formatCraftMinutes = (minutes) => {
  const d = dict().ui;
  if (minutes % 1440 === 0) return fmt(d.timeDays, { n: minutes / 1440 });
  if (minutes % 60 === 0) return fmt(d.timeHours, { n: minutes / 60 });
  return fmt(d.timeMinutes, { n: minutes });
};

/**
 * Строк на вкладку верстака: что получится, чем, сколько это времени,
 * статус и (если нельзя) причина. Максимальный пакет — floor по самому
 * дефицитному материалу; для «можно» строк он ≥ 1.
 */
export const buildCraftModel = () => {
  const catalog = getEquipmentCatalog(getCurrentModuleLocale());
  const d = dict().ui;
  const labels = dict();
  const groups = getCraftingCategories()
    .map((category) => ({
      category,
      label: labels.categoryNames?.[category] ?? category,
      rows: [],
    }));
  const byCategory = new Map(groups.map((g) => [g.category, g]));
  for (const recipe of getCraftingRecipes()) {
    const group = byCategory.get(recipe.category);
    if (!group) continue; // категория вне манифеста — не выдумываем
    const { evaluation } = craftingPreview(recipe.id);
    const missingPerk = evaluation.blocked.find((b) => b.code === 'missing-perk');
    const status = evaluation.ready ? 'ready' : missingPerk ? 'missing-perk' : 'missing-material';
    const minutes = craftMinutesForRecipe(recipe);
    const maxCraft = evaluation.ready
      ? evaluation.materials.reduce((acc, row) => Math.min(acc, Math.floor(row.have / row.need)), Infinity)
      : 0;
    group.rows.push({
      recipeId: recipe.id,
      category: recipe.category,
      // id рецепта = id предмета результата (269): «output» в данных нет.
      outputId: recipe.id,
      outputName: itemName(catalog, recipe.id),
      complexity: Number(recipe.requires.complexity) || 0,
      skill: recipe.requires.skill,
      skillLabel: getSkillDisplayName(recipe.requires.skill),
      minutes,
      timeLabel: formatCraftMinutes(minutes),
      metaLine: fmt(d.complexity, { n: Number(recipe.requires.complexity) || 0 })
        + ' · ' + getSkillDisplayName(recipe.requires.skill) + ' · ' + formatCraftMinutes(minutes),
      status,
      canCraft: evaluation.ready,
      maxCraft: Number.isFinite(maxCraft) ? Math.max(0, maxCraft) : 0,
      reason: missingPerk
        ? fmt(d.needPerk, { perk: perkName(missingPerk.perkId), rank: missingPerk.need })
        : status === 'missing-material' ? d.shortMaterials : null,
      materials: evaluation.materials.map((row) => ({
        itemId: row.itemId,
        name: itemName(catalog, row.itemId, null),
        need: row.need,
        have: row.have,
        enough: row.enough,
        haveLine: fmt(d.haveNeed, { have: row.have, need: row.need }),
      })),
      labels: {
        materialsTitle: d.materialsTitle,
        craft: d.craft,
        notAvailable: d.notAvailable,
        title: d.title,
        done: d.done,
      },
    });
  }
  return groups.filter((g) => g.rows.length > 0);
};

/**
 * count попыток подряд. Провал проверки — не стоп (следующая попытка
 * обычная); нехватка материалов/стора — стоп, сколько успели, столько есть.
 */
export const craftBatch = (recipeId, count = 1) => {
  const attempts = [];
  const total = Math.max(1, Math.floor(count) || 1);
  let stoppedEarly = 0;
  for (let i = 0; i < total; i += 1) {
    const result = craftRecipe(recipeId);
    if (result.stage === 'gate' || result.stage === 'store') {
      if (attempts.length === 0) return { attempts: [result], stoppedEarly: 0, refusedFirst: true };
      stoppedEarly = total - attempts.length;
      break;
    }
    attempts.push(result);
  }
  return { attempts, stoppedEarly, refusedFirst: false };
};

/**
 * Отчёт владельца (265): строка 1 — арифметика проверки, строка 2 — что
 * выпало и исход (на пакете — по строке на попытку), строка 3 — получено +
 * потрачено + время. Осложнение помечает своё место честно.
 */
export const buildCraftReport = (recipeId, run) => {
  const d = dict().ui;
  const catalog = getEquipmentCatalog(getCurrentModuleLocale());
  const recipe = getCraftingRecipeById(recipeId);
  const attrLabel = dict().attributes?.[CRAFT_RULES.testAttribute] ?? CRAFT_RULES.testAttribute;
  const skillLabel = getSkillDisplayName(recipe?.requires?.skill);
  const store = useCharacterStore.getState();
  const firstCheck = run.attempts.map((a) => a.check).find(Boolean) ?? null;
  const target = firstCheck?.targetNumber
    ?? ((Number(selectAttributeTotal(store, CRAFT_RULES.testAttribute)) || 0)
      + (Number(selectSkillTotal(store, recipe?.requires?.skill)) || 0));

  const lines = [fmt(d.checkLine, { attribute: attrLabel, skill: skillLabel, target })];
  const multi = run.attempts.length > 1;
  const granted = new Map();
  const spent = new Map();
  let minutes = 0;
  run.attempts.forEach((attempt, index) => {
    let line;
    if (attempt.auto) {
      line = d.autoNote;
    } else if (attempt.check) {
      const rolls = (attempt.check.rolls ?? []).join(', ');
      line = attempt.check.passed
        ? fmt(d.rollsSuccess, { rolls, n: attempt.check.successes })
        : fmt(d.rollsFail, { rolls });
      if ((attempt.check.complicationCount ?? 0) > 0) line += `. ${d.complicationNote}`;
    } else {
      line = d.autoNote;
    }
    if (!attempt.done) line += `. ${attempt.burned?.length ? d.burnNote : d.intactNote}`;
    lines.push(multi ? `#${index + 1}: ${line}` : line);
    if (attempt.done && attempt.granted) {
      granted.set(attempt.granted.itemId,
        (granted.get(attempt.granted.itemId) ?? 0) + (Number(attempt.granted.quantity) || 1));
    }
    for (const row of attempt.spent ?? []) {
      spent.set(row.itemId, (spent.get(row.itemId) ?? 0) + (Number(row.count) || 0));
    }
    if (attempt.time) minutes += attempt.time.minutes * attempt.time.durationMultiplier;
  });
  const items = new Map([...granted, ...spent]); // имена общие для сумки
  const render = (map) => [...map.entries()]
    .map(([id, count]) => `${itemName(catalog, id, null)} ×${count}`).join(', ');
  const tail = [
    granted.size ? fmt(d.granted, { items: render(granted) }) : d.nothing,
    spent.size ? fmt(d.spent, { items: render(spent) }) : null,
    minutes > 0 ? fmt(d.timeSpent, { time: formatCraftMinutes(minutes) }) : null,
  ].filter(Boolean).join('. ');
  lines.push(tail);
  if (run.stoppedEarly > 0) lines.push(fmt(d.stopped, { n: run.stoppedEarly }));
  return { title: d.resultTitle, lines };
};
