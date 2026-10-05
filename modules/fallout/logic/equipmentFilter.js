// Фильтры снаряжения для окон добычи/покупки (патч 425, слово владельца:
// «фильтры в окнах добычи/покупки по параметрам снаряжения (кроме веса)»;
// диапазоны «от–до» с серыми подсказками; качества — ВСЕ из словаря, даже
// те, что не встречаются на предметах). Чистые функции: варианты собираются
// из каталогов (каталог JSON = истина), предикат — без побочных эффектов.
import ruQualities from '../i18n/ru-RU/data/system/qualities.json';
import enQualities from '../i18n/en-EN/data/system/qualities.json';
import ruEffects from '../i18n/ru-RU/data/system/damageEffects.json';
import enEffects from '../i18n/en-EN/data/system/damageEffects.json';
import weaponsCatalog from '../data/equipment/weapons.json';
import armorCatalog from '../data/equipment/armor.json';
import powerArmorCatalog from '../data/equipment/powerArmor.json';
import clothesCatalog from '../data/equipment/clothes.json';
import weaponModsCatalog from '../data/equipment/weapon_mods.json';
import ruModNames from '../i18n/ru-RU/data/equipment/weapon_mods.json';
import enModNames from '../i18n/en-EN/data/equipment/weapon_mods.json';

export const GEAR_KINDS = ['weapon', 'armor', 'powerArmor', 'clothing'];

const isGear = (item) => GEAR_KINDS.includes(item?.itemType);

/** Универсальное чтение «итога» параметра: {total} | число | строка | список. */
export const readRatingTotal = (value) => {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.reduce((sum, part) => sum + readRatingTotal(part), 0);
  if (typeof value === 'object') return Number(value.total) || 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

/** Урон оружия: damage — число, строка или список частей. */
export const readDamageTotal = (item) => readRatingTotal(item?.damage);

const armorPieces = () => {
  const sink = [];
  for (const group of Object.values(armorCatalog ?? {})) {
    for (const tier of Object.values(group?.tiers ?? {})) {
      for (const piece of tier?.pieces ?? []) sink.push(piece);
    }
  }
  return sink;
};

const powerArmorPieces = () => {
  const sink = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.id === 'string' && Number.isFinite(Number(node.hp))) sink.push(node);
    Object.values(node).forEach(walk);
  };
  walk(powerArmorCatalog);
  return sink;
};

const clothingItems = () => {
  const raw = clothesCatalog?.clothes ?? [];
  const sink = [];
  for (const entry of raw) {
    if (Array.isArray(entry?.items)) sink.push(...entry.items);
    else if (entry?.id) sink.push(entry);
  }
  return sink;
};

const numBounds = (values) => ({
  min: Math.min(...values),
  max: Math.max(...values),
});

/**
 * Варианты для панели фильтра. Диапазоны — фактические границы каталога
 * (аудит 424: редкость 0–6, урон 0–21, скорострельность 0–7, СУ физ 1–4,
 * эн 0–5, рад 0–2). Качества — ВСЕ из словаря (слово владельца), эффекты —
 * все из словаря. Патроны — уникальные из каталога оружия.
 */
export const buildEquipmentFilterOptions = (locale, labels) => {
  const qualitiesDict = locale === 'en-EN' ? enQualities : ruQualities;
  const effectsDict = locale === 'en-EN' ? enEffects : ruEffects;
  const weapons = (weaponsCatalog ?? []).filter((w) => !w.isBuiltin);
  const armor = armorPieces();
  const pa = powerArmorPieces();
  const clothes = clothingItems();

  const ammoSeen = [];
  for (const weapon of weapons) {
    for (const id of String(weapon.ammoId ?? '').split(',').map((part) => part.trim())) {
      if (id && !ammoSeen.includes(id)) ammoSeen.push(id);
    }
  }
  const ammoNames = new Map((labels.ammoNames ?? []).map((row) => [row.id, row.name]));
  const ammoOptions = ammoSeen.map((id) => ({ id, name: ammoNames.get(id) ?? id }));

  return {
    // 427: чекбоксы категорий (подписи — тот же словарь категорий окна).
    kinds: GEAR_KINDS.map((id) => ({ id, name: labels.kinds?.[id] ?? id })),
    rarity: numBounds(
      [...weapons, ...armor, ...pa, ...clothes]
        .map((item) => Number(item.rarity))
        .filter((num) => Number.isFinite(num)),
    ),
    damage: numBounds(weapons.map((w) => readDamageTotal(w))),
    fireRate: numBounds(weapons.map((w) => Number(w.fireRate)).filter((num) => Number.isFinite(num))),
    physical: numBounds([...armor, ...pa, ...clothes].map((item) => readRatingTotal(item.physicalDamageRating))),
    energy: numBounds([...armor, ...pa, ...clothes].map((item) => readRatingTotal(item.energyDamageRating))),
    radiation: numBounds([...armor, ...pa, ...clothes].map((item) => readRatingTotal(item.radiationDamageRating))),
    damageTypes: [
      { id: 'physical', name: labels.damageTypes.physical },
      { id: 'energy', name: labels.damageTypes.energy },
      { id: 'radiation', name: labels.damageTypes.radiation },
      { id: 'special', name: labels.damageTypes.special },
      { id: 'poison', name: labels.damageTypes.poison },
    ],
    weaponTypes: [
      { id: 'Light', name: labels.weaponTypes.Light },
      { id: 'Melee', name: labels.weaponTypes.Melee },
      { id: 'Energy', name: labels.weaponTypes.Energy },
      { id: 'Explosive', name: labels.weaponTypes.Explosive },
      { id: 'Heavy', name: labels.weaponTypes.Heavy },
      { id: 'Unarmed', name: labels.weaponTypes.Unarmed },
      { id: 'Thrown', name: labels.weaponTypes.Thrown },
    ],
    distances: [
      { id: 'C', name: labels.distances.C },
      { id: 'M', name: labels.distances.M },
      { id: 'L', name: labels.distances.L },
    ],
    bodyParts: [
      { id: 'Head', name: labels.bodyParts.Head },
      { id: 'Body', name: labels.bodyParts.Body },
      { id: 'Hand', name: labels.bodyParts.Hand },
      { id: 'Leg', name: labels.bodyParts.Leg },
    ],
    ammoOptions,
    qualities: qualitiesDict.map((row) => ({ id: row.id, name: row.name })),
    effects: effectsDict.map((row) => ({ id: row.id, name: row.name })),
  };
};

export const emptyEquipmentFilter = () => ({
  // 427 (слово владельца): чекбоксы категорий — Оружие/Броня/Силовая броня/
  // Одежда. Пусто = без ограничения (показывается всё, как и раньше).
  kinds: [],
  rarity: { from: '', to: '' },
  damage: { from: '', to: '' },
  fireRate: { from: '', to: '' },
  distance: [],
  damageTypes: [],
  weaponTypes: [],
  ammo: [],
  qualities: [],
  effects: [],
  physical: { from: '', to: '' },
  energy: { from: '', to: '' },
  radiation: { from: '', to: '' },
  bodyParts: [],
});

export const isEquipmentFilterEmpty = (filter) => {
  const empty = emptyEquipmentFilter();
  return JSON.stringify(filter ?? empty) === JSON.stringify(empty);
};

/**
 * 427: сколько условий сейчас активно — для счётчика на кнопке «Фильтр».
 * Считаются отмеченные категории, заполненные диапазоны (один на пару
 * «от–до») и выбранные пункты списков/чипсов.
 */
export const activeEquipmentFilterCount = (filter) => {
  if (!filter) return 0;
  let count = 0;
  count += (filter.kinds ?? []).length;
  for (const key of ['rarity', 'damage', 'fireRate', 'physical', 'energy', 'radiation']) {
    const range = filter[key];
    if (range && (Number.isFinite(parseFloat(range.from)) || Number.isFinite(parseFloat(range.to)))) count += 1;
  }
  for (const key of ['distance', 'damageTypes', 'weaponTypes', 'ammo', 'qualities', 'effects', 'bodyParts']) {
    count += (filter[key] ?? []).length;
  }
  return count;
};

const inRange = (value, range) => {
  if (range == null) return true;
  const from = parseFloat(range.from);
  const to = parseFloat(range.to);
  const num = Number(value);
  if (!Number.isFinite(num)) return true; // нет параметра — не прячем предмет
  if (Number.isFinite(from) && num < from) return false;
  if (Number.isFinite(to) && num > to) return false;
  return true;
};

const hasAll = (values, selected) => selected.every((id) => values.includes(id));
const hasAny = (values, selected) => selected.some((id) => values.includes(id));

const weaponAmmoIds = (item) => String(item?.ammoId ?? '')
  .split(',')
  .map((part) => part.trim())
  .filter(Boolean);

/**
 * Предикат фильтра. Фильтр применяется ТОЛЬКО к снаряжению
 * (оружие/броня/СБ/одежда); остальные предметы проходят всегда.
 * Одно-значные категории (тип урона, тип, дистанция, патрон) — «любое из
 * выбранных»; многозначные (качества, эффекты, части тела) — «все выбранные».
 */
export const applyEquipmentFilter = (item, filter) => {
  if (!isGear(item)) return true;
  const f = filter ?? emptyEquipmentFilter();

  // 427: чекбоксы категорий. Отмечена хоть одна — показываются только эти
  // виды снаряжения (моды проходят всегда: они про «что даёт мод»).
  if (f.kinds?.length && !f.kinds.includes(item.itemType)) return false;

  if (!inRange(item.rarity, f.rarity)) return false;

  if (item.itemType === 'weapon') {
    if (!inRange(readDamageTotal(item), f.damage)) return false;
    if (!inRange(item.fireRate, f.fireRate)) return false;
    if (f.distance?.length && !f.distance.includes(item.range)) return false;
    const types = Array.isArray(item.damageType) ? item.damageType : [item.damageType].filter(Boolean);
    if (f.damageTypes?.length && !hasAny(types, f.damageTypes)) return false;
    if (f.weaponTypes?.length && !f.weaponTypes.includes(item.weaponType)) return false;
    if (f.ammo?.length && !hasAny(weaponAmmoIds(item), f.ammo)) return false;
    if (f.qualities?.length
      && !hasAll((item.qualities ?? []).map((q) => q?.qualityId ?? q), f.qualities)) return false;
    if (f.effects?.length
      && !hasAll((item.effects ?? []).map((e) => e?.effectId ?? e), f.effects)) return false;
  }

  if (item.itemType !== 'weapon') {
    if (!inRange(readRatingTotal(item.physicalDamageRating), f.physical)) return false;
    if (!inRange(readRatingTotal(item.energyDamageRating), f.energy)) return false;
    if (!inRange(readRatingTotal(item.radiationDamageRating), f.radiation)) return false;
    if (f.bodyParts?.length && !hasAll(item.protectedAreas ?? [], f.bodyParts)) return false;
  }

  return true;
};

/**
 * Слово владельца 425: «моды это моды. Только когда их поставят, тогда и
 * будут эффекты» — оружие фильтруется ТОЛЬКО по своим (врождённым)
 * качествам/эффектам; ни «может получить от мода», ни установленные моды
 * экземпляров здесь не учитываются. Но «поскольку моды теперь предметы
 * и они есть в инвентаре, при выборе эффектов, которые не на оружие,
 * покажут модули»: моды, дающие хоть одно из выбранного, показываются
 * отдельной секцией окна (addFlow принимает mod_* как weaponMod).
 */
export const weaponModsProviding = (filter, locale) => {
  const wanted = [...(filter?.qualities ?? []), ...(filter?.effects ?? [])];
  if (wanted.length === 0) return [];
  const names = new Map((locale === 'en-EN' ? enModNames : ruModNames).map((row) => [row.id, row.name]));
  return (weaponModsCatalog ?? [])
    .filter((mod) => (mod.qualityChanges ?? []).some((t) => wanted.includes(t?.id))
      || (mod.effectChanges ?? []).some((t) => wanted.includes(t?.id)))
    .map((mod) => ({
      id: mod.id,
      name: names.get(mod.id) ?? mod.id,
      itemType: 'weaponMod',
      modSlot: mod.slot,
      rarity: mod.rarity,
      cost: mod.cost,
      weight: mod.weight,
    }));
};

/**
 * Обрезка дерева категорий по фильтру (как потолок редкости): пустые ветки
 * после отсева не показываются. Предметы вне снаряжения проходят всегда.
 */
export const pruneTreeByEquipmentFilter = (node, filter) => {
  if (Array.isArray(node)) return node.filter((item) => applyEquipmentFilter(item, filter));
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    const pruned = pruneTreeByEquipmentFilter(value, filter);
    const isEmpty = Array.isArray(pruned) ? pruned.length === 0
      : pruned && typeof pruned === 'object' && Object.keys(pruned).length === 0;
    if (!isEmpty) out[key] = pruned;
  }
  return out;
};
