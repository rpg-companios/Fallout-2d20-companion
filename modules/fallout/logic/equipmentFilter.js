// Фильтры снаряжения для окон добычи/покупки (патч 425, слово владельца:
// «фильтры в окнах добычи/покупки по параметрам снаряжения (кроме веса)»;
// диапазоны «от–до» с серыми подсказками). 438: качества в фильтре —
// ТОЛЬКО те, что встречаются на оружии («нельзя отметить, поскольку
// такого качества на оружие нет»); моды в результатах НИКОГДА («1 мод
// может подходить 9 из 11 оружий, а если 11-го оружия нет, то от мода
// смысла нет»). Чистые функции: варианты собираются из каталогов
// (каталог JSON = истина), предикат — без побочных эффектов.
import ruQualities from '../i18n/ru-RU/data/system/qualities.json';
import enQualities from '../i18n/en-EN/data/system/qualities.json';
import ruEffects from '../i18n/ru-RU/data/system/damageEffects.json';
import enEffects from '../i18n/en-EN/data/system/damageEffects.json';
import weaponsCatalog from '../data/equipment/weapons.json';
import armorCatalog from '../data/equipment/armor.json';
import powerArmorCatalog from '../data/equipment/powerArmor.json';
import clothesCatalog from '../data/equipment/clothes.json';

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

const qualitiesDict = (locale) => (locale === 'en-EN' ? enQualities : ruQualities);

/**
 * Варианты для панели фильтра. Диапазоны — фактические границы каталога
 * (аудит 424: редкость 0–6, урон 0–21, скорострельность 0–7, СУ физ 1–4,
 * эн 0–5, рад 0–2). 438: качества — только встречающиеся на оружии,
 * по алфавиту; эффекты — все из словаря (все 10 на оружии есть).
 * Патроны — уникальные из каталога оружия.
 */
export const buildEquipmentFilterOptions = (locale, labels) => {
  const effectsDict = locale === 'en-EN' ? enEffects : ruEffects;
  const weapons = (weaponsCatalog ?? []).filter((w) => !w.isBuiltin);
  const armor = armorPieces();
  const pa = powerArmorPieces();
  const clothes = clothingItems();

  // 438 (слово владельца): отмечать можно только то, что на оружии есть.
  const weaponQualityIds = [];
  for (const weapon of weapons) {
    for (const q of (weapon.qualities ?? [])) {
      const id = q?.qualityId ?? q;
      if (id && !weaponQualityIds.includes(id)) weaponQualityIds.push(id);
    }
  }

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
    qualities: weaponQualityIds
      .map((id) => ({ id, name: qualitiesDict(locale).find((row) => row.id === id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
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
 * 429/432/438: счётчик кнопки «Показать (N)» по дереву окна (после
 * фильтра и потолка редкости). labels.gear — локализованные подписи
 * категорий снаряжения ИЗ ТОГО ЖЕ словаря, которым построены ключи
 * дерева (урок 433: служебные ключи «weapon» мимо дерева — счёт всегда
 * ноль). Без активного фильтра считаем всё дерево; при активном —
 * только эти группы и только снаряжение (модов в результатах больше
 * нет — слово владельца 438).
 */
/**
 * 429: сколько предметов покажет список (после фильтра и потолка
 * редкости). Считаются только предметы (объекты с именем); заголовки
 * групп — нет. gearOnly — только снаряжение (в результатах фильтра,
 * по слову 438, модов больше нет, расходники не участвуют).
 */
export const countFilteredItems = (node, gearOnly = false) => {
  const counts = (item) => {
    if (!item || typeof item !== 'object' || !item.name) return false;
    if (!gearOnly) return true;
    return GEAR_KINDS.includes(item.itemType);
  };
  if (Array.isArray(node)) {
    return node.reduce((sum, item) => sum + (counts(item) ? 1 : 0), 0);
  }
  if (!node || typeof node !== 'object') return 0;
  return Object.values(node).reduce((sum, value) => sum + countFilteredItems(value, gearOnly), 0);
};

export const countFoundItems = (filteredTree, labels, filterActive) => {
  if (!filterActive) return countFilteredItems(filteredTree);
  const part = {};
  for (const label of (labels?.gear ?? [])) {
    if (filteredTree && filteredTree[label] !== undefined) part[label] = filteredTree[label];
  }
  return countFilteredItems(part, true);
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
