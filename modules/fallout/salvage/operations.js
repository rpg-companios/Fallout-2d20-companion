// Операции разбора — адаптер сеттинга над универсальным движком (патч 260).
//
// Движок знает ФОРМУ состава и умеет «проверка → выход → обмен». Здесь — откуда
// что брать: состав из реестра (печатная строка карточки предмета — 269), пул
// материалов для общего разбора из справочника материалов (все равны, пачки тут же), редкости потолка «Мусорщика» из перков
// героя, списание/выдача — действия стора (та же атомарная цепочка, что у
// крафта: spendItemStacks + addNewItem), кубики — движковая dice-логика.
//
// Как и операции крафта: читают СВЕЖЕЕ состояние прямо из стора, пишут —
// действиями того же стора; React-контекста модуль не знает.

import useCharacterStore from '../../../src/store/characterStore';
import { debugLog } from '../../../src/debug/falloutDebug';
import { getSalvageComposition, getScrapMaterials } from '../../../domain/registry';
import { runSalvage } from '../../../domain/salvageEngine';
import { isSkillTagged } from '../../../domain/d20Checks';
import { getPerkSelectionCount } from '../../../domain/perks';
import { getCanonicalItemId } from '../../../domain/itemIdentity';
import { findCatalogEntry, inferItemType } from '../../../domain/resolveItem';
import { rollCombatDiceEffects, facesToCombatUnits } from '../../../domain/diceRollsLogic';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { getCurrentModuleLocale } from '../../../i18n/locale';
import { selectSkillTotal, selectAttributeTotal } from '../../../src/store/selectors';
import { SALVAGE_RULES } from './rules';
import { applyActivityMinutes } from '../survival/operations';

const fail = (stage, reason, extra = {}) => ({
  done: false, stage, reason, spent: [], granted: [], check: null,
  time: null, ...extra,
});

const effectiveItemType = (entry, stack) => entry?.itemType ?? inferItemType(stack);

const entryOf = (stack) => {
  const canonical = getCanonicalItemId(stack);
  if (!canonical) return null;
  const catalog = getEquipmentCatalog(getCurrentModuleLocale());
  return { canonical, entry: findCatalogEntry(catalog, canonical, inferItemType(stack)) ?? null };
};

const dicePort = (ports) => ports.rollDice
  ?? ((count) => {
    const { faces } = rollCombatDiceEffects(count);
    return { units: facesToCombatUnits(faces), effects: faces.filter((f) => f === 5 || f === 6).length };
  });

// Материал — конечная часть (аксиома владельца 2026-09-17, п.5): материалы не
// разбираются НИКОГДА, независимо от того, куда их занесут будущие данные.
// Гард стоит до проверки типа и состава — ни «хлам-запись», ни печатный
// состав материалу кнопку/разбор не откроют.
let materialIdCache = null;
export const isScrapMaterial = (canonical) => {
  if (!canonical) return false;
  if (!materialIdCache) {
    materialIdCache = new Set(getScrapMaterials().map((m) => m.id));
  }
  return materialIdCache.has(canonical);
};

// Потолок редкости по «Мусорщику» (общий для обеих веток, патч 263):
// без перка — только common, ранг 1 — и unusual, ранг 2 — и rare.
export const scrapperCeilingByRank = (rank) => (rank >= SALVAGE_RULES.scrapperRareRank ? 2
  : rank >= SALVAGE_RULES.scrapperUncommonRank ? 1 : 0);

export const scrapperCeiling = (store) => {
  const rank = getPerkSelectionCount(store.selectedPerks ?? [], SALVAGE_RULES.scrapperPerkId);
  return scrapperCeilingByRank(rank);
};

/**
 * Минимальный ранг «Мусорщика», при котором из печатного состава можно вынуть
 * хоть одну строку (тот же критерий, по которому гейт 'no-materials' отказывает
 * в разборе). Позволяет подстроке честно написать, ЧЕГО именно не хватает, когда
 * состав целиком срезан потолком: «Требуется перк … ранг N» вместо туманного
 * «недоступно без Мусорщика, +N недоступно». null — если какой-то материал
 * достижим уже сейчас.
 */
export const scrapperRankToSalvage = (composition, ceiling) => {
  const index = materialRarityIndex();
  const obtainableAt = (id) => {
    if (id == null || !index.has(id)) return 0; // без редкости — достижимо без перка
    return index.get(id);
  };
  let required = null;
  for (const option of composition?.options ?? []) {
    for (const row of option) {
      // Строка достижима, если достижим её основной материал или хоть один
      // материал любого костного эффекта. Эффект без основного материала
      // держит строку живой (грани кости бросаются теми же костями).
      const candidates = [row.material];
      if (row.effect) {
        if (Array.isArray(row.effect.options)) {
          candidates.push(...row.effect.options.map((t) => t?.material));
        } else {
          candidates.push(row.effect.material);
        }
      }
      const minRank = Math.min(...candidates.filter((id) => id != null).map(obtainableAt));
      if (minRank <= ceiling) return null; // уже доступно — требования нет
      if (minRank > ceiling && (required == null || minRank < required)) {
        required = minRank;
      }
    }
  }
  return required;
};

const materialRarityIndex = () => {
  const index = new Map();
  for (const m of getScrapMaterials()) index.set(m.id, m.rarity ?? 0);
  return index;
};

/**
 * Потолок «Мусорщика» применяется и к печатному составу (патч 262 → 263,
 * решение владельца): строки с материалом выше потолка не бросаются и не
 * выдаются — сверх состава ничего не надбавляется (в хламе нет unusual —
 * и при ранге 2 оно не появится). Строка без основного материала, но с
 * достижимым эффектом остаётся (кости эффекта бросаются); альтернативы
 * эффекта режутся по той же мере. Все строки варианта отсечены — вариант
 * исчезает; не осталось ни одного — состав считается недостижимым.
 */
export const filterCompositionByCeiling = (composition, ceiling) => {
  const index = materialRarityIndex();
  const obtainable = (id) => id == null || !index.has(id) || index.get(id) <= ceiling;
  let dropped = 0;
  const options = [];
  for (const option of composition?.options ?? []) {
    const rows = [];
    for (const row of option) {
      let effect = row.effect ?? null;
      if (effect) {
        if (Array.isArray(effect.options)) {
          const kept = effect.options.filter((t) => obtainable(t?.material));
          effect = kept.length ? { ...effect, options: kept } : null;
        } else if (!obtainable(effect.material)) {
          effect = null;
        }
      }
      const keepMain = row.material ? obtainable(row.material) : false;
      if (!keepMain && !effect) {
        if (row.material) dropped += 1;
        continue;
      }
      const next = { ...row, ...(effect ? { effect } : {}) };
      if (!keepMain) {
        // Основа срезана, но dc остаётся: грани эффекта бросаются теми же
        // костями строки (sumComponent в движке).
        delete next.material;
        delete next.count;
        delete next.base;
      }
      rows.push(next);
    }
    if (rows.length) options.push(rows);
  }
  return { composition: options.length ? { ...composition, options } : null, dropped };
};

/**
 * Пул материалов-кандидатов для общего правила. Клей и Масло исключены
 * всегда; редкость материала вне потолка — тоже.
 */
const nonJunkPool = (store, ceiling) => {
  const excluded = new Set(SALVAGE_RULES.nonJunkExcludedMaterials);
  return getScrapMaterials()
    .filter((m) => (m.rarity ?? 0) <= ceiling && !excluded.has(m.id))
    .map((m) => ({ id: m.id, rarity: m.rarity ?? 0 }));
};

const heroCheckView = (store) => ({
  attributeValue: selectAttributeTotal(store, SALVAGE_RULES.checkAttribute),
  skillValue: selectSkillTotal(store, SALVAGE_RULES.checkSkill),
  isTagged: isSkillTagged({
    skillId: SALVAGE_RULES.checkSkill,
    primaryTaggedSkillIds: store.selectedSkills ?? [],
    extraTaggedSkillIds: store.extraTaggedSkills ?? [],
  }),
});

/**
 * Сверка стека с правилами без изменений состояния: разберётся ли, чем
 * (печатный состав или общий режим), что может выйти. Для экранов.
 */
export const salvagePreview = (instanceId) => {
  const store = useCharacterStore.getState();
  const stack = store.items?.[instanceId];
  if (!stack) return { salvageable: false, reason: 'item-not-found' };
  if (stack.equipped || stack.locked) return { salvageable: false, reason: 'in-use' };
  const resolved = entryOf(stack);
  if (!resolved) return { salvageable: false, reason: 'item-not-found' };
  const { canonical, entry } = resolved;
  if (isScrapMaterial(canonical)) return { salvageable: false, reason: 'material' };
  if (!entry) return { salvageable: false, reason: 'unknown-item' };
  const printed = getSalvageComposition(canonical);
  // Разбирается только хлам, если не указано иного (решение владельца).
  if (effectiveItemType(entry, stack) !== SALVAGE_RULES.salvageableItemType && !printed) {
    return { salvageable: false, reason: 'not-salvageable' };
  }
  const ceiling = scrapperCeiling(store);
  const filtered = printed ? filterCompositionByCeiling(printed, ceiling) : null;
  // Весь состав выше потолка — ловить нечего (263), как и пустой пул в общем режиме.
  if (filtered && !filtered.composition) {
    return { salvageable: false, reason: 'no-materials', rarityCeiling: ceiling };
  }
  const weight = Number(entry?.weight ?? stack.weight ?? 0);
  return {
    salvageable: true,
    itemId: canonical,
    mode: filtered ? 'table' : 'generic',
    composition: filtered?.composition ?? null,
    pool: filtered ? null : nonJunkPool(store, ceiling),
    // Для экрана (263): потолок «Мусорщика» и сколько строк состава он срезал —
    // модалка позже подсветит серым недостижимое.
    rarityCeiling: ceiling,
    gatedRows: filtered?.dropped ?? 0,
    weight,
    // Для экрана: сл.0 — проверка почти всегда проходима, пасть может только на
    // осложнения (правила d20). Бросок делает сам salvageItem.
    difficulty: SALVAGE_RULES.difficulty,
    minutes: SALVAGE_RULES.minutesPerItem,
    complicationDurationMultiplier: SALVAGE_RULES.complicationDurationMultiplier,
  };
};

/**
 * Разобрать один предмет из стека. Возврат — контракт движка (см.
 * domain/salvageEngine.js): { done:true, spent, granted, check, time } либо
 * отказ с причиной (гейты и провал проверки ничего не меняют в балансе).
 * Порты кубиков/выбора переопределяемы (тесты; экраны зовут без портов).
 */
export const salvageItem = (instanceId, ports = {}) => {
  const store = useCharacterStore.getState();
  const stack = store.items?.[instanceId];
  if (!stack) return fail('gate', 'item-not-found');
  if (stack.equipped || stack.locked) return fail('gate', 'in-use');
  const resolved = entryOf(stack);
  if (!resolved) return fail('gate', 'item-not-found');
  const { canonical, entry } = resolved;
  if (isScrapMaterial(canonical)) return fail('gate', 'material');
  if (!entry) return fail('gate', 'unknown-item');
  const printed = getSalvageComposition(canonical);
  if (effectiveItemType(entry, stack) !== SALVAGE_RULES.salvageableItemType && !printed) {
    return fail('gate', 'not-salvageable');
  }
  // Потолок «Мусорщика» режет и печатный состав (263): недостижимые строки
  // не бросаются; если достижимых не осталось — отказ, предмет цел.
  const ceiling = scrapperCeiling(store);
  const filtered = printed ? filterCompositionByCeiling(printed, ceiling) : null;
  if (filtered && !filtered.composition) {
    return fail('gate', 'no-materials', { rarityCeiling: ceiling });
  }
  const composition = filtered?.composition ?? null;
  const pool = composition ? null : nonJunkPool(store, ceiling);
  if (!composition && !pool.length) {
    return fail('gate', 'no-materials'); // герой без «Мусорщика» и пустой пул — нечего брать
  }

  const result = runSalvage({
    item: { itemId: canonical, weight: Number(entry?.weight ?? stack.weight ?? 0) },
    composition,
    pool,
    apBonus: SALVAGE_RULES.apBonusPerItem,
    ...heroCheckView(store),
    difficulty: SALVAGE_RULES.difficulty,
    complicationDurationMultiplier: SALVAGE_RULES.complicationDurationMultiplier,
    minutes: SALVAGE_RULES.minutesPerItem,
    rollDice: dicePort(ports),
    choose: ports.choose ?? ((count) => Math.floor(Math.random() * count)),
    ...(ports.rollD20 ? { rollD20: ports.rollD20 } : {}),
    spend: (plan) => store.spendItemStacks({
      spend: plan.map(({ itemId, count }) => ({ itemId, count })),
    }),
    grant: ({ itemId, quantity }) => ({
      instanceId: store.addNewItem({ itemId, quantity }),
    }),
  });

  // Время (патч 262): разбор идёт по часам выживания — 10 минут на предмет,
  // осложнение домножает. Тратится и при провале проверки (попытка состоялась,
  // предмет цел, а вечер уже нет); гейт-отказ кубиков не видел — не тратится.
  let timed = null;
  if (result.time && result.time.minutes > 0) {
    timed = applyActivityMinutes(result.time.minutes * result.time.durationMultiplier, 'salvage');
    result.survival = timed;
  }

  debugLog('salvage.salvage', {
    instanceId,
    itemId: canonical,
    mode: composition ? 'table' : 'generic',
    done: result.done,
    stage: result.stage ?? null,
    grantedCount: result.granted?.length ?? 0,
    minutes: result.time ? result.time.minutes * result.time.durationMultiplier : null,
    timeApplied: timed?.applied ?? false,
  });

  return result;
};
