// modules/fallout/repair/operations.js
//
// Сеттинг-адаптер ремонта (патч 413): соединяет книжный движок
// (domain/repairEngine) с каталогами и стором. Движок не знает, что такое
// предметы и редкость; здесь решается:
//   - редкость предмета по каноническому id (оружие / части брони / части СБ);
//   - +1 сложности за каждую установленную модификацию (записи installedOn);
//   - донор — второй предмет того же канонического id (не надет, не мод,
//     не заперт комплектом): материалы берутся из него, сложность −1 (мин 0);
//   - успех чинит предмет существующими экшнами стора (repairWeapon /
//     repairPowerArmorStack / repairPowerArmorPieceAt) — меняется только
//     ЦЕНА ремонта, охват прежний;
//   - время: 30 минут (успех + 2 ОД → 15; осложнение +15 каждое; провал —
//     время зря, материалы остаются — закон верстака, 323).

import useCharacterStore from '../../../src/store/characterStore';
import { selectAttributeTotal, selectSkillTotal } from '../../../src/store/selectors';
import { evaluateRepair, runRepair } from '../../../domain/repairEngine';
import { isSkillTagged } from '../../../domain/d20Checks';
import { applyActivityMinutes } from '../survival/operations';
import { getActionPoints, spendActionPoints } from '../../../domain/actionPoints';
import { REPAIR_RULES, repairMaterialsPlan } from './rules';
import weaponsCatalog from '../data/equipment/weapons.json';
import armorCatalog from '../data/equipment/armor.json';
import powerArmorCatalog from '../data/equipment/powerArmor.json';

// ── Редкость по каноническому id ─────────────────────────────────────────

let rarityIndexCache = null;

const collectPairs = (node, sink) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) collectPairs(entry, sink);
    return;
  }
  if (typeof node.id === 'string' && Number.isFinite(Number(node.rarity))) {
    sink.set(node.id, Math.max(0, Math.floor(Number(node.rarity))));
  }
  for (const value of Object.values(node)) collectPairs(value, sink);
};

/** Карта «канонический id → редкость» из всех каталогов снаряжения. */
export const itemRarityIndex = () => {
  if (rarityIndexCache) return rarityIndexCache;
  const sink = new Map();
  collectPairs(weaponsCatalog, sink);
  collectPairs(armorCatalog, sink);
  collectPairs(powerArmorCatalog, sink);
  rarityIndexCache = sink;
  return sink;
};

export const itemRarityFor = (canonicalId) => itemRarityIndex().get(canonicalId) ?? 0;

// ── Цель ремонта ─────────────────────────────────────────────────────────

/**
 * Что чинится у записи инвентаря: оружие (durability 0–100) или часть СБ
 * (hpCurrent/maxHp, в пачке или надета). null — предмет не изнашивается.
 */
export const repairTargetFor = (item) => {
  if (!item) return null;
  if (item.itemType === 'weapon' && item.durabilityTracked) {
    return {
      kind: 'weapon',
      canonicalId: item.weaponId || item.id,
      current: Number(item.durability) || 0,
      max: 100,
    };
  }
  if (item.itemType === 'powerArmor' && !item.paFrameContent && !item.paFrame
    && Number.isFinite(Number(item.maxHp))) {
    return {
      kind: 'powerArmor',
      canonicalId: item.weaponId || item.id,
      current: Number(item.hpCurrent) || 0,
      max: Number(item.maxHp),
    };
  }
  return null;
};

/** +1 сложности за каждую установленную модификацию (записи installedOn). */
export const repairModsCountFor = (storeItemId) => Object.values(
  useCharacterStore.getState().items || {},
).filter((entry) => entry?.installedOn && entry.installedOn === storeItemId).length;

/**
 * Валидный донор: другой экземпляр ТОГО ЖЕ канонического id — не сам
 * предмет, не надетый, не установленный мод, не запертый комплектом.
 */
export const donorCandidatesFor = (storeItem, exceptStoreItemId) => {
  const canonical = storeItem?.weaponId || storeItem?.id;
  if (!canonical) return [];
  return Object.entries(useCharacterStore.getState().items || {})
    .filter(([key, entry]) => key !== exceptStoreItemId
      && !entry?.installedOn
      && !entry?.equipped
      && !entry?.locked
      && (entry.weaponId || entry.id) === canonical)
    .map(([key]) => key);
};

// ── Сводка для окна ──────────────────────────────────────────────────────

/**
 * Всё, что нужно окну ремонта, без изменения состояния.
 * Пересчёт по кнопке донора — просто ещё один вызов с другим donorStoreItemId.
 */
export const repairPreview = (storeItemId, { donorStoreItemId = null } = {}) => {
  const store = useCharacterStore.getState();
  const item = store.items?.[storeItemId];
  const target = repairTargetFor(item);
  if (!target) return { canRepair: false, reason: 'not-repairable' };
  if (target.current >= target.max) return { canRepair: false, reason: 'not-damaged', target };

  const rarity = itemRarityFor(target.canonicalId);
  const modsCount = repairModsCountFor(storeItemId);
  const donors = donorCandidatesFor(item, storeItemId);
  const donorUsed = donorStoreItemId != null && donors.includes(donorStoreItemId);
  const complexity = Math.max(0, rarity + modsCount - (donorUsed ? 1 : 0));
  // Донор вместо материалов: план пуст — движок списывает донора портом.
  const materialsPlan = donorUsed ? [] : repairMaterialsPlan(rarity);
  const inventoryCounts = countInventoryByCatalogId(store.items);
  const evaluation = evaluateRepair({ complexity, materialsPlan, inventoryCounts });

  const attributeValue = selectAttributeTotal(store, REPAIR_RULES.testAttribute);
  const skillValue = selectSkillTotal(store, REPAIR_RULES.testSkill);
  const isTagged = isSkillTagged({
    skillId: REPAIR_RULES.testSkill,
    primaryTaggedSkillIds: store.selectedSkills ?? [],
    extraTaggedSkillIds: store.extraTaggedSkills ?? [],
  });

  return {
    canRepair: true,
    target,
    rarity,
    modsCount,
    complexity,
    donors,
    donorUsed,
    materialsPlan,
    evaluation,
    hero: { attributeValue, skillValue, isTagged },
  };
};

// Счётчики материалов по каноническим id (тот же закон, что в крафте).
const countInventoryByCatalogId = (items) => {
  const counts = {};
  for (const item of Object.values(items || {})) {
    if (!item || item.installedOn || item.equipped) continue;
    const id = item.weaponId || item.id;
    if (!id) continue;
    counts[id] = (counts[id] || 0) + (Number(item.quantity) || 1);
  }
  return counts;
};

// ── Прогон ремонта ───────────────────────────────────────────────────────

/**
 * Совершить ремонт. Порты кубиков переопределяемы (тесты); экран зовёт
 * без портов — настоящие кости. Отсрочка времени — как в крафте (323):
 * ответ несёт time.pending, окно спрашивает про 2 ОД и зовёт settleRepairTime.
 */
/**
 * Ремонт НАДЕТОЙ части СБ (строка внутри контейнера инвентаря — цели нет
 * в items). Донор — пачка того же catalogId в инвентаре; успех чинит слот.
 */
export const performEquippedPieceRepair = (slot, { donorStoreItemId = null, ports = {} } = {}) => {
  const state = useCharacterStore.getState();
  const piece = state.equippedPowerArmor?.pieces?.[slot];
  if (!piece) return { done: false, stage: 'gate', reasons: [{ code: 'not-repairable' }] };
  const maxHp = pieceCatalogMaxHp(piece.catalogId);
  if (!Number.isFinite(maxHp) || piece.hpCurrent >= maxHp) {
    return { done: false, stage: 'gate', reasons: [{ code: 'not-damaged' }] };
  }
  const rarity = itemRarityFor(piece.catalogId);
  const donorUsed = donorStoreItemId != null
    && donorCandidatesFor({ id: piece.catalogId, weaponId: piece.catalogId }, null).includes(donorStoreItemId);
  if (donorStoreItemId != null && !donorUsed) {
    return { done: false, stage: 'gate', reasons: [{ code: 'bad-donor' }] };
  }
  const complexity = Math.max(0, rarity - (donorUsed ? 1 : 0));
  const materialsPlan = donorUsed ? [] : repairMaterialsPlan(rarity);
  const store2 = useCharacterStore.getState();
  const attributeValue = selectAttributeTotal(store2, REPAIR_RULES.testAttribute);
  const skillValue = selectSkillTotal(store2, REPAIR_RULES.testSkill);
  const result = runRepair({
    complexity,
    materialsPlan,
    inventoryCounts: countInventoryByCatalogId(store2.items),
    attributeValue,
    skillValue,
    isTagged: false,
    ...(ports.rollD20 ? { rollD20: ports.rollD20 } : {}),
    ...(ports.complicationRoll ? { complicationRoll: ports.complicationRoll } : {}),
    spend: (plan) => useCharacterStore.getState().spendItemStacks({ spend: plan }),
    spendDonor: () => {
      const s = useCharacterStore.getState();
      if (!s.items?.[donorStoreItemId]) return { ok: false, reason: 'donor-missing' };
      s.adjustItemQuantity(donorStoreItemId, -1);
      return { ok: true };
    },
  });
  if (result.done && result.resolution?.kind === 'lost-materials' && materialsPlan.length > 0) {
    const freeCounts = countInventoryByCatalogId(useCharacterStore.getState().items);
    const lossPlan = materialsPlan.filter((entry) => (freeCounts[entry.itemId] || 0) >= entry.count);
    if (lossPlan.length > 0) {
      useCharacterStore.getState().spendItemStacks({ spend: lossPlan });
      result.lostMaterials = lossPlan;
    } else {
      result.resolution = { kind: 'extra-minutes', degenerate: true };
    }
  }
  if (result.done) useCharacterStore.getState().repairPowerArmorPieceAt(slot);
  const complicationMinutes = (result.complications ?? 0) * REPAIR_RULES.complicationExtraMinutes;
  result.repairTime = {
    baseMinutes: REPAIR_RULES.baseMinutes,
    complicationMinutes,
    minutes: REPAIR_RULES.baseMinutes + complicationMinutes,
    pending: true,
    halvedOnAp: result.done === true,
  };
  return result;
};

export const pieceCatalogMaxHp = (catalogId) => {
  const sink = [];
  collectPairsDeep(powerArmorCatalog, (node) => {
    if (node?.id === catalogId && Number.isFinite(Number(node.hp))) sink.push(Number(node.hp));
  });
  return sink[0];
};

const collectPairsDeep = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) collectPairsDeep(value, visit);
};

export const performRepair = (storeItemId, { donorStoreItemId = null, ports = {}, zeroDifficulty } = {}) => {
  const preview = repairPreview(storeItemId, { donorStoreItemId });
  if (!preview.canRepair) {
    return { done: false, stage: 'gate', reasons: [{ code: preview.reason }] };
  }
  if (donorStoreItemId != null && !preview.donorUsed) {
    return { done: false, stage: 'gate', reasons: [{ code: 'bad-donor' }] };
  }

  const { attributeValue, skillValue, isTagged } = preview.hero;
  const result = runRepair({
    complexity: preview.complexity,
    materialsPlan: preview.materialsPlan,
    inventoryCounts: countInventoryByCatalogId(useCharacterStore.getState().items),
    attributeValue,
    skillValue,
    isTagged,
    ...(zeroDifficulty ? { zeroDifficulty } : {}),
    ...(ports.rollD20 ? { rollD20: ports.rollD20 } : {}),
    ...(ports.complicationRoll ? { complicationRoll: ports.complicationRoll } : {}),
    spend: (plan) => useCharacterStore.getState().spendItemStacks({ spend: plan }),
    spendDonor: () => {
      const state = useCharacterStore.getState();
      if (!state.items?.[donorStoreItemId]) return { ok: false, reason: 'donor-missing' };
      state.adjustItemQuantity(donorStoreItemId, -1);
      return { ok: true };
    },
  });

  // Потеря дополнительных материалов (осложнение 19–20): сверх потраченных
  // списывается ещё один такой же комплект (если есть).
  if (result.done && result.resolution?.kind === 'lost-materials' && preview.materialsPlan.length > 0) {
    const freeCounts = countInventoryByCatalogId(useCharacterStore.getState().items);
    const lossPlan = preview.materialsPlan
      .filter((entry) => (freeCounts[entry.itemId] || 0) >= entry.count);
    if (lossPlan.length > 0) {
      useCharacterStore.getState().spendItemStacks({ spend: lossPlan });
      result.lostMaterials = lossPlan;
    } else {
      // Материалов на второй комплект нет — осложнение вырождается во время.
      result.resolution = { kind: 'extra-minutes', degenerate: true };
    }
  }

  // Успех чинит предмет существующими экшнами стора (цена — в движке выше).
  if (result.done) {
    const state = useCharacterStore.getState();
    if (preview.target.kind === 'weapon') {
      state.repairWeapon(storeItemId);
    } else if (preview.target.kind === 'powerArmor') {
      // Надетая (в контейнере) часть чинится по слоту, пачка — по записи.
      const item = state.items?.[storeItemId];
      if (item?.paSlot) state.repairPowerArmorPieceAt(item.paSlot);
      else state.repairPowerArmorStack(storeItemId);
    }
  }

  const complicationMinutes = (result.complications ?? 0) * REPAIR_RULES.complicationExtraMinutes;
  result.repairTime = {
    baseMinutes: REPAIR_RULES.baseMinutes,
    complicationMinutes,
    minutes: REPAIR_RULES.baseMinutes + complicationMinutes,
    pending: true,
    halvedOnAp: result.done === true,
  };
  return result;
};

/**
 * Списать отложенное время ремонта. Окно спрашивает после успеха: потратить
 * 2 ОД и сократить вдвое (30 → 15 минут)? Провал — всегда полное время
 * (ОД на провал не тратятся; пул не даст — закон 324).
 */
export const settleRepairTime = (run, { spendActionPoints: halveForAp = false } = {}) => {
  const success = run?.done === true;
  const apSpend = halveForAp && success
    ? spendActionPoints(REPAIR_RULES.apCostToHalve)
    : { ok: false, pool: getActionPoints() };
  const halved = Boolean(halveForAp && success && apSpend.ok);
  const time = run?.repairTime ?? { baseMinutes: REPAIR_RULES.baseMinutes, complicationMinutes: 0 };
  let minutes = time.baseMinutes;
  if (halved) minutes /= 2;
  minutes += time.complicationMinutes ?? 0;
  if (minutes > 0) applyActivityMinutes(minutes, 'repair');
  return { minutes, spendActionPoints: halved, pool: apSpend.pool };
};
