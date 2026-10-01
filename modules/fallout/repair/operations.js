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
import { getScrapMaterials } from '../../../domain/registry';
import { countActivePerkSelections } from '../../../domain/perks';
import perksCatalog from '../data/perks/perks.json';
import { getCurrentModuleLocale } from '../../../i18n/locale';
import ruCraft from '../i18n/ru-RU/screens/inventory/craftingModal.json';
import enCraft from '../i18n/en-EN/screens/inventory/craftingModal.json';

// ── Редкость по каноническому id ─────────────────────────────────────────

let rarityIndexCache = null;

const repairDict = () => (getCurrentModuleLocale() === 'en-EN' ? enCraft : ruCraft);

const materialNames = () => {
  const names = {};
  for (const material of getScrapMaterials() ?? []) {
    if (material?.id) names[material.id] = material.name ?? material.id;
  }
  return names;
};

/**
 * Отчёт о ремонте — ПО ОБРАЗЦУ крафта (слово владельца 414: «окно отчёта
 * с тратой ОД уже есть в окне Крафта, его берём за основу; тут почти всё
 * то же самое, только прочность предмета повышается вместо предмета»).
 * Те же строки словаря крафта (проверка, кубики, осложнения, вопрос про
 * 2 ОД), отрисовка — общий CraftReportView. Отличия: вместо «получено:
 * предмет» — «прочность восстановлена»; свои строки потери материалов,
 * донора и провала (словарь craftingModal.json → repair).
 */
export const buildRepairReport = (run, { attributeName, skillName } = {}) => {
  const d = repairDict();
  const ru = d.ui ?? {};
  const rep = d.repair ?? {};
  const check = run?.check ?? null;
  const target = check?.targetNumber
    ?? ((Number(attributeName) >= 0 ? '' : '') || '');
  const names = materialNames();
  const lines = [];
  if (check?.targetNumber != null) {
    lines.push(`${attributeName ?? REPAIR_RULES.testAttribute} + ${skillName ?? REPAIR_RULES.testSkill}`
      + ` = ${check.targetNumber}`);
  }
  if (run?.auto) {
    lines.push(ru.autoNote);
  } else if (check) {
    const rolls = (check.rolls ?? []).join(', ');
    lines.push(check.passed
      ? `${ru.rollsSuccess ? ru.rollsSuccess.replace('{rolls}', rolls).replace('{n}', check.successes ?? 0) : ''}`
      : `${ru.rollsFail ? ru.rollsFail.replace('{rolls}', rolls) : ''}`);
    const complications = check.complicationCount ?? 0;
    if (complications > 0) {
      lines.push(`${ru.complicationNote ? ru.complicationNote.replace('{n}', complications * REPAIR_RULES.complicationExtraMinutes) : ''} `
        + `${rep.complicationResolve ?? ''}`.trim());
    }
  }
  if (run?.resolution?.kind === 'lost-materials') {
    lines.push((rep.lostMaterials ?? '').replace('{face}', run.resolution.face));
  }
  if (run?.donorSpent) lines.push(rep.donorUsed ?? '');
  if (run?.done) {
    lines.push(rep.success ?? '');
    // 417: бесплатный режим «Очумелых ручек» — ремонт временный.
    if (run.temporary) lines.push(rep.temporary ?? '');
  } else {
    lines.push(rep.failed ?? '');
  }
  const spentRows = run?.spent ?? [];
  if (spentRows.length > 0) {
    const items = spentRows
      .map((row) => `${names[row.itemId] ?? row.itemId} ×${row.count}`)
      .join(', ');
    if (ru.spent) lines.push(ru.spent.replace('{items}', items));
  }
  return {
    title: rep.title ?? '',
    lines: lines.filter(Boolean),
    // pendingTime: CraftReportView спросит про 2 ОД (успех можно вдвое).
    pendingTime: { hasSuccess: run?.done === true },
  };
};

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
 * Слово владельца 415: «Ремонт и его затраты даны на 1 шт, а не карточку,
 * пачку, стопку или как ты называешь количество >1». Отделяет ОДНУ штуку
 * от пачки (quantity > 1) и возвращает её id (для quantity = 1 — сам id).
 * Починенная штука сольётся с целыми общим законом стеков (СБ — сразу,
 * оружие останется отдельной целой записью).
 */
export const splitOnePieceFromStack = (storeItemId) => {
  const item = useCharacterStore.getState().items?.[storeItemId];
  if (!item || (Number(item.quantity) || 1) <= 1) return storeItemId;
  const singleKey = `${storeItemId}_single_${Math.random().toString(36).slice(2, 7)}`;
  // Флаг временного ремонта «Очумелых ручек» не наследуется: отделённая
  // штука либо чинится честно (флаг снят), либо получает свой (ниже).
  useCharacterStore.setState((prev) => ({
    items: {
      ...prev.items,
      [singleKey]: { ...item, quantity: 1, temporaryRepair: undefined },
      [storeItemId]: { ...item, quantity: (Number(item.quantity) || 1) - 1, temporaryRepair: undefined },
    },
  }));
  return singleKey;
};

/**
 * Патч 416 «Очумелые ручки» (juryRigging): починить предмет бесплатно,
 * БЕЗ компонентов — но временно: предмет снова сломается при следующем
 * осложнении при использовании; диапазон осложнений при проверках на
 * умение пользоваться предметом — 19–20 (книжный текст перка).
 * countActivePerkSelections гасит погасшие выборы (закон 412).
 */
export const juryRiggingRanksFor = (store = useCharacterStore.getState()) =>
  countActivePerkSelections(store, 'juryRigging', perksCatalog);

/** Паспорт 416: флаг «временно починено» на экземпляре инвентаря. */
export const markTemporaryRepairOnItem = (storeItemId, value) => {
  useCharacterStore.setState((prev) => {
    const item = prev.items?.[storeItemId];
    if (!item) return prev;
    return {
      items: {
        ...prev.items,
        [storeItemId]: { ...item, temporaryRepair: value ? true : undefined },
      },
    };
  });
};

/** Паспорт 416: тот же флаг на НАДЕТОЙ части СБ (живёт вне items). */
export const markTemporaryRepairOnEquippedPiece = (slot, value) => {
  useCharacterStore.setState((prev) => {
    const piece = prev.equippedPowerArmor?.pieces?.[slot];
    if (!piece) return prev;
    return {
      equippedPowerArmor: {
        ...prev.equippedPowerArmor,
        pieces: { ...prev.equippedPowerArmor.pieces, [slot]: { ...piece, temporaryRepair: value ? true : undefined } },
      },
    };
  });
};

/**
 * Слово владельца 414: «если материалов нет, кнопка ремонта не активна».
 * Хватает материалов ИЛИ есть валидный донор — кнопка активна.
 */
export const repairAffordableFor = (storeItemId, { donorStoreItemId = null } = {}) => {
  const preview = repairPreview(storeItemId, { donorStoreItemId });
  if (!preview?.canRepair) return false;
  return preview.evaluation.ready;
};

/** То же для НАДЕТОЙ части СБ (по catalogId — цели нет в items). */
export const repairAffordableForPiece = (catalogId) => {
  if (!catalogId) return false;
  const plan = repairMaterialsPlan(itemRarityFor(catalogId));
  const counts = countInventoryByCatalogId(useCharacterStore.getState().items);
  if (plan.every((entry) => (counts[entry.itemId] || 0) >= entry.count)) return true;
  return donorCandidatesFor({ id: catalogId, weaponId: catalogId }, null).length > 0;
};

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
export const performEquippedPieceRepair = (slot, { donorStoreItemId = null, ports = {}, mode = 'materials' } = {}) => {
  // Бесплатный режим: без донора и без материалов (сложность полная).
  if (mode === 'free') donorStoreItemId = null;
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
  const materialsPlan = (mode === 'free' || donorUsed) ? [] : repairMaterialsPlan(rarity);
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
      // «Очумелые ручки» (417): перк покрывает затраты без донора.
      if (mode === 'free') return { ok: true };
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
  if (result.done) {
    useCharacterStore.getState().repairPowerArmorPieceAt(slot);
    // Честный ремонт перезачитывает временный; бесплатный ставит флаг.
    markTemporaryRepairOnEquippedPiece(slot, mode === 'free');
    result.temporary = mode === 'free';
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

/**
 * Режимы ремонта (слово владельца 417 — три кнопки в окне):
 *  'materials' — за счёт материалов (обычный книжный ремонт);
 *  'donor'     — за счёт донора (ускоренный: сложность −1, материалы из донора);
 *  'free'      — «Очумелые ручки»: без затрат, но временный (книжный эффект
 *                перка: снова сломается при следующем осложнении 19–20).
 * Тест и время одинаковы во всех режимах — бесплатный путь не отменяет
 * работу, только затраты.
 */
export const REPAIR_MODES = ['materials', 'donor', 'free'];

export const performRepair = (storeItemId, { donorStoreItemId = null, ports = {}, zeroDifficulty, mode = 'materials' } = {}) => {
  // Бесплатный режим: без донора и без материалов (сложность полная).
  if (mode === 'free') donorStoreItemId = null;
  const preview = repairPreview(storeItemId, { donorStoreItemId });
  if (!preview.canRepair) {
    return { done: false, stage: 'gate', reasons: [{ code: preview.reason }] };
  }
  if (donorStoreItemId != null && !preview.donorUsed) {
    return { done: false, stage: 'gate', reasons: [{ code: 'bad-donor' }] };
  }
  const materialsPlan = mode === 'free' ? [] : preview.materialsPlan;

  const { attributeValue, skillValue, isTagged } = preview.hero;
  const result = runRepair({
    complexity: preview.complexity,
    materialsPlan,
    inventoryCounts: countInventoryByCatalogId(useCharacterStore.getState().items),
    attributeValue,
    skillValue,
    isTagged,
    ...(zeroDifficulty ? { zeroDifficulty } : {}),
    ...(ports.rollD20 ? { rollD20: ports.rollD20 } : {}),
    ...(ports.complicationRoll ? { complicationRoll: ports.complicationRoll } : {}),
    spend: (plan) => useCharacterStore.getState().spendItemStacks({ spend: plan }),
    spendDonor: () => {
      // «Очумелые ручки» (417): донора нет и не нужно — перк покрывает
      // затраты, движку не от чего отказывать.
      if (mode === 'free') return { ok: true };
      const state = useCharacterStore.getState();
      if (!state.items?.[donorStoreItemId]) return { ok: false, reason: 'donor-missing' };
      state.adjustItemQuantity(donorStoreItemId, -1);
      return { ok: true };
    },
  });

  // Потеря дополнительных материалов (осложнение 19–20): сверх потраченных
  // списывается ещё один такой же комплект (если есть).
  if (result.done && result.resolution?.kind === 'lost-materials' && materialsPlan.length > 0) {
    const freeCounts = countInventoryByCatalogId(useCharacterStore.getState().items);
    const lossPlan = materialsPlan
      .filter((entry) => (freeCounts[entry.itemId] || 0) >= entry.count);
    if (lossPlan.length > 0) {
      useCharacterStore.getState().spendItemStacks({ spend: lossPlan });
      result.lostMaterials = lossPlan;
    } else {
      // Материалов на второй комплект нет — осложнение вырождается во время.
      result.resolution = { kind: 'extra-minutes', degenerate: true };
    }
  }

  // Слово владельца 414/415: ремонт и его затраты — на ОДНУ штуку, не на
  // пачку: при успехе штука отделяется от пачки и чинится сама.
  let repairTargetId = storeItemId;
  if (result.done) {
    repairTargetId = splitOnePieceFromStack(storeItemId);
  }

  // Успех чинит предмет существующими экшнами стора (цена — в движке выше).
  if (result.done) {
    const state = useCharacterStore.getState();
    if (preview.target.kind === 'weapon') {
      state.repairWeapon(repairTargetId);
    } else if (preview.target.kind === 'powerArmor') {
      // Надетая (в контейнере) часть чинится по слоту, пачка/штука — по записи.
      const item = state.items?.[repairTargetId];
      if (item?.paSlot) state.repairPowerArmorPieceAt(item.paSlot);
      else state.repairPowerArmorStack(repairTargetId);
    }
  }
  // Честный (книжный) ремонт перезачитывает временный «Очумелые ручки»;
  // бесплатный режим «Очумелых ручек» наоборот ставит флаг (книга:
  // ремонт временный — при осложнении 19–20 предмет снова сломается).
  if (result.done) {
    markTemporaryRepairOnItem(repairTargetId, mode === 'free');
    result.temporary = mode === 'free';
  }
  result.repairedStoreItemId = repairTargetId;

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
