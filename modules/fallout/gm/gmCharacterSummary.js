// modules/fallout/gm/gmCharacterSummary.js
// Чистый readonly-ридер сетевого снапшота персонажа для карточек со спойлерами
// в комнате Мастера. НЕ трогает useCharacterStore и локальную БД — работает
// исключительно по данным snapshotPayload из roomStore.

import { migrateCharacterState } from '../../../src/store/migrations';
import { restoreSaveData } from '../../../domain/saveSlimming';
import { resolveItem } from '../../../domain/resolveItem';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { getCurrentLocale, getCurrentModuleLocale } from '../../../i18n/locale';
import { findEnrichedOrigin, isRobotCharacter } from '../../../domain/origins';
import { findTraitById, tTrait } from '../../../domain/traits';
import {
  ALL_SKILL_KEYS,
  CANONICAL_ATTRIBUTE_KEYS,
  createInitialAttributes,
  getAttributeValue,
  getCanonicalAttributeKey,
} from '../../../domain/characterCreation';
import { migrateSkillsToCanonical } from '../../../domain/skillCanonical';
import { resolveBodyPlan } from '../../../domain/bodyplan';
import { getRobotSlotKeys, getBuiltinWeaponsFromSlots } from '../../../domain/robotEquip';
import { getRobotSlotDamageResistance } from '../../../domain/robotDamageResistance';
import { getSlotHitRange } from '../../../domain/robotSlots';
import { hasPoisonImmunity, hasRadiationImmunity } from '../../../domain/immunities';
import {
  getTimedAttributeModifiers,
  getTimedDamageResistanceBonus,
  getTimedDefenseBonus,
  getTimedMaxHpBonus,
} from '../../../domain/effects';
import {
  applyFrameAttributeModifiers,
  hasFrame,
  suppressesLayerAt,
} from '../../../domain/powerArmor';
import {
  PA_FRAME_CATALOG,
  calculateCarryWeight,
  calculateDefense,
  calculateInitiative,
  calculateMaxHealth,
  calculateMeleeBonus,
  calculateRobotCarryWeight,
} from '../logic/derivedStats';
import dataPowerArmor from '../data/equipment/powerArmor.json';
import ruPerksData from '../i18n/ru-RU/data/perks/perks.json';
import enPerksData from '../i18n/en-EN/data/perks/perks.json';
import { CHARACTER_DICTIONARIES } from '../screens/CharacterScreen/logic/characterScreenI18n';
import { tWeaponsAndArmorScreen } from '../screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';
import { tGm } from './gmI18n';

const PA_CATALOG_BY_ID = Object.fromEntries(
  Object.values(dataPowerArmor || {})
    .flatMap((set) => set?.pieces || [])
    .map((piece) => [piece.id, piece]),
);

const PERKS_BY_LOCALE = {
  'ru-RU': new Map((ruPerksData || []).map((p) => [p.id, p])),
  'en-EN': new Map((enPerksData || []).map((p) => [p.id, p])),
};

// Канонический атрибут по умолчанию для каждого навыка Fallout 2d20
export const SKILL_DEFAULT_ATTRIBUTE = Object.freeze({
  ATHLETICS: 'STR',
  BARTER: 'CHA',
  BIG_GUNS: 'END',
  ENERGY_WEAPONS: 'PER',
  EXPLOSIVES: 'PER',
  LOCKPICK: 'PER',
  MEDICINE: 'INT',
  MELEE_WEAPONS: 'STR',
  PILOT: 'PER',
  REPAIR: 'INT',
  SCIENCE: 'INT',
  SMALL_GUNS: 'AGI',
  SNEAK: 'AGI',
  SPEECH: 'CHA',
  SURVIVAL: 'END',
  THROWING: 'AGI',
  UNARMED: 'STR',
});

const HUMANOID_ZONE_KEYS = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

const safeResolveItem = (item, catalog) => {
  if (!item || !catalog) return item;
  try {
    return resolveItem(item, catalog) || item;
  } catch {
    return item;
  }
};

const hydrateSnapshotDataReadonly = (rawData, moduleLocale) => {
  if (!rawData || typeof rawData !== 'object') return {};
  let migrated = rawData;
  try {
    migrated = migrateCharacterState(rawData);
  } catch {
    migrated = rawData;
  }
  let catalog = null;
  try {
    catalog = getEquipmentCatalog(moduleLocale);
  } catch {
    catalog = null;
  }
  if (!catalog) return { data: migrated, catalog: null };
  try {
    const restored = restoreSaveData(migrated, {
      resolve: (item) => safeResolveItem(item, catalog),
    });
    return { data: restored, catalog };
  } catch {
    return { data: migrated, catalog };
  }
};

const buildAttributesList = (rawAttributes, equippedPowerArmor, timedEffects) => {
  const baseMap = {};
  for (const entry of createInitialAttributes()) {
    baseMap[entry.name] = entry.value;
  }
  if (Array.isArray(rawAttributes)) {
    for (const attr of rawAttributes) {
      const key = getCanonicalAttributeKey(attr?.name);
      if (key && Number.isFinite(Number(attr?.value))) {
        baseMap[key] = Number(attr.value);
      }
    }
  } else if (rawAttributes && typeof rawAttributes === 'object') {
    for (const [k, v] of Object.entries(rawAttributes)) {
      const key = getCanonicalAttributeKey(k);
      const num = typeof v === 'object' ? Number(v?.total ?? v?.base ?? v?.value) : Number(v);
      if (key && Number.isFinite(num)) {
        baseMap[key] = num;
      }
    }
  }

  let list = CANONICAL_ATTRIBUTE_KEYS.map((key) => ({
    name: key,
    value: baseMap[key] ?? 4,
  }));

  try {
    if (hasFrame(equippedPowerArmor) && PA_FRAME_CATALOG) {
      list = applyFrameAttributeModifiers(list, equippedPowerArmor, PA_FRAME_CATALOG);
    }
  } catch {
    // ignore malformed PA frame
  }

  try {
    const timedMods = getTimedAttributeModifiers(timedEffects || []);
    if (timedMods && typeof timedMods === 'object') {
      list = list.map((attr) => ({
        ...attr,
        value: Math.max(1, attr.value + (Number(timedMods[attr.name]) || 0)),
      }));
    }
  } catch {
    // ignore malformed timed effects
  }

  return list;
};

const normalizeTaggedSkillSet = (data) => {
  const rawTagged = [
    ...(Array.isArray(data?.selectedSkills) ? data.selectedSkills : []),
    ...(Array.isArray(data?.extraTaggedSkills) ? data.extraTaggedSkills : []),
    ...(Array.isArray(data?.forcedSelectedSkills) ? data.forcedSelectedSkills : []),
  ];
  const migrated = migrateSkillsToCanonical({
    skills: [],
    selectedSkills: rawTagged,
  });
  return new Set(migrated?.selectedSkills || rawTagged);
};

const buildSkillsRows = (data, effectiveAttributes, locale) => {
  const rankByKey = {};
  for (const key of ALL_SKILL_KEYS) rankByKey[key] = 0;

  let normalizedSkills = Array.isArray(data?.skills) ? data.skills : [];
  try {
    const res = migrateSkillsToCanonical({ skills: normalizedSkills });
    if (Array.isArray(res?.skills)) normalizedSkills = res.skills;
  } catch {
    // keep raw array
  }

  for (const entry of normalizedSkills) {
    const key = entry?.name;
    if (key && Object.hasOwn(rankByKey, key)) {
      rankByKey[key] = Math.max(0, Number(entry?.value ?? entry?.total ?? entry?.base) || 0);
    }
  }

  const taggedSet = normalizeTaggedSkillSet(data);
  const skillDict = CHARACTER_DICTIONARIES[locale]?.skillsCatalog || CHARACTER_DICTIONARIES['ru-RU']?.skillsCatalog || {};

  return ALL_SKILL_KEYS.map((key) => {
    const attrKey = SKILL_DEFAULT_ATTRIBUTE[key] || 'INT';
    const attrVal = getAttributeValue(effectiveAttributes, attrKey);
    const rank = rankByKey[key] ?? 0;
    const tagged = taggedSet.has(key);
    return {
      key,
      label: skillDict[key] || key,
      attrKey,
      attrLabel: tGm(`card.attributes.${attrKey}`, locale),
      rank,
      tagged,
      tn: attrVal + rank,
    };
  });
};

const computeTotalInventoryWeight = (items = []) => {
  let sum = 0;
  for (const item of items) {
    if (!item) continue;
    const w = Number(item.weight);
    if (!Number.isFinite(w) || w <= 0) continue;
    const qty = Math.max(1, Number(item.quantity ?? item.count) || 1);
    sum += w * qty;
  }
  return Math.round(sum * 10) / 10;
};

export const extractGmCharacterSummary = (
  snapshotPayload,
  {
    locale = getCurrentLocale(),
    moduleLocale = getCurrentModuleLocale(),
  } = {},
) => {
  const rawPayload = snapshotPayload || {};
  const { data, catalog } = hydrateSnapshotDataReadonly(rawPayload.data || {}, moduleLocale);

  const level = Math.max(1, Number(data?.level ?? rawPayload.level) || 1);
  const name = String(data?.characterName || rawPayload.name || '—');

  const originId = typeof data?.origin === 'string'
    ? data.origin
    : (data?.origin?.id || rawPayload.originName || null);
  let resolvedOrigin = null;
  if (originId) {
    try {
      resolvedOrigin = findEnrichedOrigin(originId);
    } catch {
      resolvedOrigin = null;
    }
  }
  const originLabel = resolvedOrigin?.name || rawPayload.originName || (originId ? String(originId) : '—');
  const originImage = resolvedOrigin?.image || null;

  const traitId = (typeof data?.trait === 'string' ? data.trait : data?.trait?.id)
    || (Array.isArray(resolvedOrigin?.traitIds) && resolvedOrigin.traitIds.length === 1 ? resolvedOrigin.traitIds[0] : null);
  let resolvedTrait = data?.trait && typeof data.trait === 'object' ? data.trait : null;
  if (traitId) {
    try {
      resolvedTrait = findTraitById(traitId) || resolvedTrait;
    } catch {
      // keep raw
    }
  }
  let traitLabel = null;
  if (resolvedTrait?.id) {
    try {
      traitLabel = tTrait(resolvedTrait.id, 'name') || resolvedTrait.name || resolvedTrait.id;
    } catch {
      traitLabel = resolvedTrait.name || resolvedTrait.id;
    }
  } else if (resolvedTrait?.name) {
    traitLabel = resolvedTrait.name;
  }

  const timedEffects = Array.isArray(data?.activeTimedEffects) ? data.activeTimedEffects : [];
  const effectiveAttributes = buildAttributesList(data?.attributes, data?.equippedPowerArmor, timedEffects);

  const isRobot = Boolean(
    isRobotCharacter({ origin: resolvedOrigin || (originId ? { id: originId } : null), trait: resolvedTrait })
    || (data?.equippedRobotSlots && Object.keys(data.equippedRobotSlots).length > 0),
  );

  const maxHealth = calculateMaxHealth(effectiveAttributes, level) + (Number(getTimedMaxHpBonus(timedEffects)) || 0);
  const radiation = Math.max(0, Number(data?.radiation) || 0);
  const effectiveMaxHealth = Math.max(0, maxHealth - radiation);
  const currentHealth = data?.currentHealth != null
    ? Math.max(0, Number(data.currentHealth) || 0)
    : effectiveMaxHealth;

  const initiative = calculateInitiative(effectiveAttributes);
  const defense = calculateDefense(effectiveAttributes) + (Number(getTimedDefenseBonus(timedEffects)) || 0);
  const meleeBonus = calculateMeleeBonus(effectiveAttributes, resolvedTrait);
  const maxLuckPoints = getAttributeValue(effectiveAttributes, 'LCK');
  const luckPoints = data?.luckPoints != null
    ? Math.max(0, Number(data.luckPoints) || 0)
    : maxLuckPoints;

  const allItems = Array.isArray(data?.equipment?.items) ? data.equipment.items : [];
  const totalWeight = computeTotalInventoryWeight(allItems);
  const maxCarryWeight = isRobot
    ? calculateRobotCarryWeight(data?.equippedRobotSlots || {}, resolvedTrait)
    : calculateCarryWeight(effectiveAttributes, resolvedTrait, data || {});
  const isOverencumbered = totalWeight > maxCarryWeight;

  const caps = Math.max(0, Math.floor(Number(data?.caps ?? data?.currency) || 0));

  const attributes = effectiveAttributes.map((attr) => ({
    key: attr.name,
    label: tGm(`card.attributes.${attr.name}`, locale),
    value: attr.value,
  }));

  const skills = buildSkillsRows(data, effectiveAttributes, locale);

  // Иммунитеты
  const charImmunityCtx = {
    origin: resolvedOrigin || (originId ? { id: originId } : null),
    trait: resolvedTrait,
  };
  const radImmune = Boolean(isRobot || hasRadiationImmunity(charImmunityCtx));
  const poisonImmune = Boolean(isRobot || hasPoisonImmunity(charImmunityCtx));
  const immunities = [];
  if (radImmune) immunities.push(tGm('card.status.radImmunity', locale));
  if (poisonImmune) immunities.push(tGm('card.status.poisonImmunity', locale));

  // Защита по зонам
  const timedDR = getTimedDamageResistanceBonus(timedEffects) || {};
  const armorZones = [];
  if (isRobot && data?.equippedRobotSlots) {
    const bodyPlan = resolveBodyPlan({ origin: resolvedOrigin || { id: originId } });
    const slotKeys = getRobotSlotKeys(bodyPlan);
    for (const slotKey of slotKeys) {
      const slotData = data.equippedRobotSlots[slotKey] || {};
      const dr = getRobotSlotDamageResistance(slotData);
      const hitRange = bodyPlan ? getSlotHitRange(bodyPlan, slotKey) : null;
      const zoneTitle = tWeaponsAndArmorScreen(`robotSlot.slotNames.${slotKey}`) || slotKey;
      armorZones.push({
        key: slotKey,
        zone: zoneTitle !== `robotSlot.slotNames.${slotKey}` ? zoneTitle : slotKey,
        hitRoll: hitRange ? `${hitRange.from}–${hitRange.to}` : '—',
        phys: dr.physical || 0,
        energy: dr.energy || 0,
        rad: radImmune ? '∞' : (dr.radiation || 0),
        paHp: null,
        itemName: safeResolveItem(slotData?.limb, catalog)?.name || null,
      });
    }
  } else {
    const equippedArmor = data?.equippedArmor || {};
    const equippedPA = data?.equippedPowerArmor || null;
    for (const zoneKey of HUMANOID_ZONE_KEYS) {
      if (equippedPA && suppressesLayerAt(equippedPA, zoneKey)) {
        const paPiece = equippedPA.pieces?.[zoneKey];
        const paCat = paPiece ? PA_CATALOG_BY_ID[paPiece.catalogId] : null;
        const paLocalized = paPiece
          ? (catalog?.powerArmorList || []).find((p) => p.id === paPiece.catalogId)
          : null;
        armorZones.push({
          key: zoneKey,
          zone: tGm(`card.armorTable.zones.${zoneKey}`, locale),
          hitRoll: tGm(`card.armorTable.hitRolls.${zoneKey}`, locale),
          phys: Number(paCat?.physicalDamageRating || 0) + (Number(timedDR.physical) || 0),
          energy: Number(paCat?.energyDamageRating || 0) + (Number(timedDR.energy) || 0),
          rad: radImmune ? '∞' : (Number(paCat?.radiationDamageRating || 0) + (Number(timedDR.radiation) || 0)),
          paHp: paPiece && paCat?.hp ? `${paPiece.hpCurrent ?? paCat.hp}/${paCat.hp}` : null,
          itemName: paLocalized?.name || paPiece?.catalogId || null,
        });
      } else {
        const slot = equippedArmor[zoneKey] || {};
        const modArmor = safeResolveItem(slot.armor, catalog);
        const modCloth = safeResolveItem(slot.clothing, catalog);
        const phys = Math.max(Number(modArmor?.physicalDamageRating || 0), Number(modCloth?.physicalDamageRating || 0))
          + (Number(timedDR.physical) || 0);
        const energy = Math.max(Number(modArmor?.energyDamageRating || 0), Number(modCloth?.energyDamageRating || 0))
          + (Number(timedDR.energy) || 0);
        const rad = Math.max(Number(modArmor?.radiationDamageRating || 0), Number(modCloth?.radiationDamageRating || 0))
          + (Number(timedDR.radiation) || 0);
        armorZones.push({
          key: zoneKey,
          zone: tGm(`card.armorTable.zones.${zoneKey}`, locale),
          hitRoll: tGm(`card.armorTable.hitRolls.${zoneKey}`, locale),
          phys,
          energy,
          rad: radImmune ? '∞' : rad,
          paHp: null,
          itemName: modArmor?.name || modCloth?.name || null,
        });
      }
    }
  }

  // Состояния и выживание
  const conditionLabels = [];
  for (const cond of Array.isArray(data?.conditions) ? data.conditions : []) {
    if (!cond) continue;
    const label = typeof cond === 'string' ? cond : (cond.name || cond.label || cond.id);
    if (label) conditionLabels.push(String(label));
  }
  for (const eff of timedEffects) {
    const label = eff?.name || eff?.sourceName || eff?.label || eff?.id;
    if (label) conditionLabels.push(String(label));
  }

  let survivalSummary = null;
  if (!isRobot && data?.survival && typeof data.survival === 'object') {
    const s = data.survival;
    const foodTxt = s.food != null ? tWeaponsAndArmorScreen(`survival.food.${s.food}`) : null;
    const waterTxt = s.water != null ? tWeaponsAndArmorScreen(`survival.water.${s.water}`) : null;
    const sleepTxt = s.sleep != null ? tWeaponsAndArmorScreen(`survival.sleep.${s.sleep}`) : null;
    if (foodTxt || waterTxt || sleepTxt) {
      survivalSummary = {
        food: foodTxt && !foodTxt.startsWith('survival.') ? foodTxt : String(s.food ?? 0),
        water: waterTxt && !waterTxt.startsWith('survival.') ? waterTxt : String(s.water ?? 0),
        sleep: sleepTxt && !sleepTxt.startsWith('survival.') ? sleepTxt : String(s.sleep ?? 0),
      };
    }
  }

  // Боезапас по id/имени патрона
  const ammoQtyByKey = new Map();
  for (const item of allItems) {
    if (!item) continue;
    const isAmmo = item.type === 'ammo' || item.itemType === 'ammo' || String(item.id || '').startsWith('ammo_');
    if (!isAmmo) continue;
    const qty = Math.max(0, Number(item.quantity ?? item.count) || 0);
    const idKey = item.id || item.itemId || item.code;
    if (idKey) ammoQtyByKey.set(String(idKey), (ammoQtyByKey.get(String(idKey)) || 0) + qty);
    if (item.name) ammoQtyByKey.set(String(item.name), (ammoQtyByKey.get(String(item.name)) || 0) + qty);
  }

  // Экипированное оружие
  const rawWeapons = [];
  if (Array.isArray(data?.equippedWeapons) && data.equippedWeapons.length > 0) {
    rawWeapons.push(...data.equippedWeapons.filter(Boolean));
  } else {
    rawWeapons.push(...allItems.filter((it) => it?.equipped && (it?.damage !== undefined || it?.weaponId)));
  }
  if (isRobot && data?.equippedRobotSlots) {
    try {
      const robotWeapons = getBuiltinWeaponsFromSlots(data.equippedRobotSlots) || [];
      for (const rw of robotWeapons) {
        if (rw && !rawWeapons.some((w) => (w.id || w.weaponId) === (rw.id || rw.weaponId))) {
          rawWeapons.push(rw);
        }
      }
    } catch {
      // ignore
    }
  }

  const weapons = rawWeapons.map((w, idx) => {
    const resolved = safeResolveItem(w, catalog) || w;
    const dmgRaw = typeof resolved?.damage === 'object'
      ? (resolved.damage?.total ?? resolved.damage?.base ?? 0)
      : (resolved?.damage ?? resolved?.damageRating ?? 0);
    const fireRateRaw = typeof resolved?.fireRate === 'object'
      ? (resolved.fireRate?.total ?? resolved.fireRate?.base ?? null)
      : (resolved?.fireRate ?? null);
    const ammoKey = resolved?.ammoId || resolved?.ammo || null;
    let ammoCount = null;
    if (ammoKey && ammoKey !== 'none' && ammoKey !== '—') {
      const ammoCatalogEntry = (catalog?.ammo || []).find((a) => a.id === ammoKey || a.name === ammoKey);
      const countById = ammoQtyByKey.get(String(ammoKey));
      const countByName = ammoCatalogEntry?.name ? ammoQtyByKey.get(ammoCatalogEntry.name) : undefined;
      ammoCount = countById ?? countByName ?? 0;
    }
    return {
      key: `${resolved?.id || resolved?.weaponId || 'w'}_${idx}`,
      name: resolved?.name || w?.name || '—',
      damage: `${Number(dmgRaw) || 0} {CD}`,
      fireRate: fireRateRaw != null && fireRateRaw !== '' ? String(fireRateRaw) : '—',
      range: resolved?.range ? String(resolved.range) : '—',
      ammoCount,
      ammoLabel: ammoKey && ammoKey !== 'none'
        ? ((catalog?.ammo || []).find((a) => a.id === ammoKey)?.name || String(ammoKey))
        : null,
    };
  });

  // Перки и группированный инвентарь
  const perksMap = PERKS_BY_LOCALE[moduleLocale] || PERKS_BY_LOCALE['ru-RU'];
  const perksAgg = new Map();
  for (const entry of Array.isArray(data?.selectedPerks) ? data.selectedPerks : []) {
    if (!entry) continue;
    const id = typeof entry === 'string' ? entry : (entry.id || entry.perkId);
    const rankVal = typeof entry === 'object'
      ? (Number(entry.rank ?? entry.ranks ?? entry.count ?? entry.currentRank) || 1)
      : 1;
    const mapKey = id || String(entry?.name || Math.random());
    const localized = id ? perksMap.get(id) : null;
    const prev = perksAgg.get(mapKey);
    if (prev) {
      prev.rank += rankVal;
    } else {
      perksAgg.set(mapKey, {
        key: `${id || 'perk'}_${perksAgg.size}`,
        id: id || '',
        name: localized?.name || entry?.name || id || '—',
        rank: rankVal,
      });
    }
  }
  const perks = [...perksAgg.values()];

  const groupedInvMap = new Map();
  for (const item of allItems) {
    if (!item) continue;
    const resolved = safeResolveItem(item, catalog) || item;
    const itemName = String(resolved?.name || item?.name || item?.id || '').trim();
    if (!itemName) continue;
    const qty = Math.max(1, Number(item.quantity ?? item.count) || 1);
    const prev = groupedInvMap.get(itemName) || { name: itemName, quantity: 0, equipped: false };
    prev.quantity += qty;
    if (item.equipped) prev.equipped = true;
    groupedInvMap.set(itemName, prev);
  }
  const inventory = [...groupedInvMap.values()].sort((a, b) => (
    Number(b.equipped) - Number(a.equipped) || a.name.localeCompare(b.name)
  ));

  return {
    id: String(rawPayload.characterId || ''),
    name,
    level,
    originLabel,
    originImage,
    avatarDataUrl: rawPayload.avatarDataUrl || null,
    isRobot,
    vitals: {
      currentHealth,
      effectiveMaxHealth,
      maxHealth,
      radiation,
      defense,
      initiative,
      meleeBonus,
      luckPoints,
      maxLuckPoints,
      totalWeight,
      maxCarryWeight,
      isOverencumbered,
      caps,
    },
    attributes,
    skills,
    armorZones,
    immunities,
    conditions: conditionLabels,
    survival: survivalSummary,
    weapons,
    traitLabel,
    perks,
    inventory,
  };
};
