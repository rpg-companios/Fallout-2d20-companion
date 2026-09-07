import {
  getBodyPlan,
  getBodyPlanSlotIds,
  createSlotsFromBodyPlan,
  getDefaultLimbs,
  getDefaultPlating,
} from './bodyplan';
import { applyWeaponMods as applyWeaponModsPipeline } from './enrichItem';
import {
  collectAttacks,
  slotsForLimbType,
  slotAcceptsArmor,
  canEquip,
  getSlotDef,
  slotForDirection,
} from './robotSlots';

// domain/robotEquip.js
// Pure functions for robot equipment logic — IRON RULES (see docs/robot-rules.md).
// No React, no UI dependencies. All reason strings are i18n keys.
//
// NOTE: `isRobotCharacter` moved to domain/origins.js (reads origin.characterType).
//
// IRON RULES summary:
// - Arms with canHoldWeapons=true can hold weapons from inventory via findFreeWeaponHand()
// - Arms without canHoldWeapons cannot hold weapons, only builtinWeapons
// - Weight and two-handed checked in canEquipWeaponToSlot()
// - Weapon equip flow: first free hand, occupiedSourceSlots tracks already held weapons
// - Kits: only equippable types (weapon/armor/etc) get equipped=true, consumables stay in inventory
// - BodyPlan defaults: defaultPlating may be empty {}, but ability to specify must remain

// ---------------------------------------------------------------------------
// Slot schemas
// ---------------------------------------------------------------------------
// NOTE: Slot lists are the single source of truth in data/bodyplans/bodyplans.json
// and are read via getRobotSlotKeys()/getBodyPlan(). Do not hardcode them here.


// ---------------------------------------------------------------------------
// Простые хелперы
// ---------------------------------------------------------------------------

// (isRobotCharacter is in domain/origins.js now.)

export function getRobotSlotKeys(bodyPlan) {
  const plan = getBodyPlan(bodyPlan) || getBodyPlan('humanoid');
  // Слоты в данных — объекты { id, accepts, capacity, swappable }; имена
  // достаём через getBodyPlanSlotIds, который понимает и старые строки.
  return getBodyPlanSlotIds(plan);
}

export function createEmptyRobotSlots(bodyPlan) {
  const rawSlots = createSlotsFromBodyPlan(bodyPlan);
  const ordered = {};
  for (const key of getRobotSlotKeys(bodyPlan)) {
    if (rawSlots[key]) ordered[key] = rawSlots[key];
  }
  return ordered;
}

function normalizeBuiltinWeapons(limb, weaponsCatalog = []) {
  if (!limb) return [];
  const normalized = [];
  const seen = new Set();
  const catalog = Array.isArray(weaponsCatalog) ? weaponsCatalog : [];

  const pushWeapon = (weapon) => {
    if (!weapon) return;
    const id = weapon.id || weapon.weaponId;
    if (!id || seen.has(id)) return;
    seen.add(id);
    normalized.push({ ...weapon, id, weaponId: weapon.weaponId || id, isBuiltin: true });
  };

  if (Array.isArray(limb.builtinWeapons)) {
    limb.builtinWeapons.forEach(pushWeapon);
  }

  if (limb.builtinWeaponId) {
    const byId = catalog.find((w) => w.id === limb.builtinWeaponId);
    pushWeapon(byId ? { ...byId } : { id: limb.builtinWeaponId });
  }

  if (normalized.length === 0 && limb.builtinManipulator) {
    pushWeapon({ ...limb, isManipulator: true });
  }

  return normalized;
}

export function getSlotForDirection(bodyPlan, direction) {
  // Сторона — это порядок слота нужного типа, а не его имя.
  return slotForDirection(bodyPlan, direction, 'arm');
}

// ---------------------------------------------------------------------------
// buildArmLimb — normalize a robotarms catalog entry into a slot-ready limb
// with builtinWeapons resolved from the weapons catalog.
// ---------------------------------------------------------------------------

/**
 * Resolve a robotarms catalog entry into a `limb` object suitable for placing
 * in a slot. Resolves `builtinWeaponId` against `weaponsCatalog` so that
 * `getBuiltinWeaponsFromSlots` can produce attack cards.
 *
 * @param {object} armEntry        - запись конечности из единого каталога
 *                                  (modules/fallout/data/equipment/robot/limbs.json,
 *                                  возможно объединённая с локализацией)
 * @param {object[]} weaponsCatalog - entries from modules/fallout/data/equipment/robot/weapons.json (optionally merged with i18n)
 * @returns {object} normalized limb object
 */
export function buildArmLimb(armEntry, weaponsCatalog = []) {
  if (!armEntry) return armEntry;
  const list = Array.isArray(weaponsCatalog) ? weaponsCatalog : [];
  const weaponStats = armEntry.builtinWeaponId
    ? list.find((w) => w.id === armEntry.builtinWeaponId) || null
    : null;
  const builtinWeapons = weaponStats
    ? [{ ...weaponStats, isBuiltin: true }]
    : (Array.isArray(armEntry.builtinWeapons) ? armEntry.builtinWeapons : []);
  return {
    ...armEntry,
    itemType: 'robotArm',
    builtinWeapons,
    canHoldWeapons: armEntry.canHoldWeapons ?? (armEntry.weaponSlots > 0),
    weaponSlots: armEntry.weaponSlots ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Weapon mods (для встроенного оружия конечностей)
// ---------------------------------------------------------------------------

/**
 * Применяет моды к статам оружия для слота робота — через ЕДИНЫЙ конвейер
 * (domain/enrichItem.js applyWeaponMods). Раньше здесь была локальная копия
 * механики модов (урезанная: без damageTypeOverride/ammoOverride/сложения
 * уровней качеств) — источник расхождений «в одном месте так, в другом
 * иначе». Конвейер возвращает range_index/range_name; для робо-оружия
 * сохраняем прежнее буквенное поле range (C/M/L/E).
 */
const RANGE_LETTERS = ['C', 'M', 'L', 'E'];

const applyWeaponMods = (weapon, mods = []) => {
  if (!weapon || !Array.isArray(mods) || mods.length === 0) return weapon;
  const result = applyWeaponModsPipeline(weapon, mods);
  if (result.range_index != null) {
    result.range = RANGE_LETTERS[result.range_index] || weapon.range;
  }
  return result;
};

// ---------------------------------------------------------------------------
// initRobotSlots
// ---------------------------------------------------------------------------

/**
 * Resolves a kit's already-resolved items into robot slot state.
 *
 * @param {string} bodyPlan - e.g. "protectron", "misterHandy", "robobrain"
 * @param {object[]} resolvedKitItems - items already resolved by kitResolver
 * @param {object} robotCatalog - { heads, bodies, arms, legs } arrays of limb catalog entries
 * @returns {{ slots: object, weapons: object[], modules: object[], inventoryItems: object[] }}
 */
/**
 * Слоты, куда можно положить защитный слой, — по НОВОЙ модели:
 * тип конечности берётся из данных (limbType), кандидаты — из плана тела,
 * а решение «принимает ли слой» отдаётся canEquip.
 *
 * @param {object} args — { slots, slotKeys, bodyPlan, armorData }
 * @returns {string[]} — ключи слотов в порядке плана тела
 */
function armorSlotsByLimbType({ slots, slotKeys, bodyPlan, armorData }) {
  const limbType = armorData?.limbType ?? null;
  if (!limbType) return [];

  return slotsForLimbType(bodyPlan, limbType)
    .filter((key) => slotKeys.includes(key) && slots[key])
    .filter((key) => {
      // На этапе раскладки комплекта конечности ещё не проставлены —
      // они заполняются автозаполнением ниже, после цикла по предметам.
      // Поэтому пустой слот подходящего типа защиту принимает.
      if (!slots[key].limb) return true;
      return canEquip(slots[key], armorData, { bodyPlan, slotId: key }).allowed;
    });
}

// Как комплекты называют конечности: kitResolver отдаёт запись кита, где тип
// назван по-старому. Единый каталог конечностей пишет limbType.
const LIMB_TYPE_BY_KIT_ITEM_TYPE = Object.freeze({
  robotArm: 'arm',
  robotHead: 'head',
  robotBody: 'body',
  robotLeg: 'mover',
  robotLegs: 'mover',
});

export function initRobotSlots(bodyPlan, resolvedKitItems = [], robotCatalog = {}) {
  const slots = createEmptyRobotSlots(bodyPlan);
  const slotKeys = getRobotSlotKeys(bodyPlan);
  const modules = [];
  const inventoryItems = [];
  const pendingHeadBuiltinWeapons = [];
  const pendingArmBuiltinWeapons = [];

  // Единый каталог конечностей: обычные конечности и конечности-оружие.
  // Старых robotarms/robotheads/robotlegs здесь больше нет — источник один.
  const limbsCatalog = [
    ...(Array.isArray(robotCatalog.limbs) ? robotCatalog.limbs : []),
    ...(Array.isArray(robotCatalog.weaponAsLimb) ? robotCatalog.weaponAsLimb : []),
  ];
  const weaponsCatalog = Array.isArray(robotCatalog.weapons) ? robotCatalog.weapons : [];

  // Resolve a weapon's stats from weapons catalog by id
  const resolveWeaponStats = (weaponId) => {
    if (!weaponId) return null;
    return weaponsCatalog.find((w) => w.id === weaponId) || null;
  };

  // Конечность из единого каталога по id
  const resolveLimbEntry = (id) => {
    if (!id) return null;
    return limbsCatalog.find((l) => l.id === id) || null;
  };

  // Свободный слот под конечность: их даёт план тела по типу конечности,
  // а не список совместимых слотов внутри самой конечности.
  const findFreeSlotForLimb = (limbEntry) => {
    const candidates = limbEntry?.limbType ? slotsForLimbType(bodyPlan, limbEntry.limbType) : [];
    return candidates.find((s) => slotKeys.includes(s) && slots[s]?.limb === null) || null;
  };

  // Build a limb object from a limb entry + its weapon stats
  const buildLimbFromArmEntry = (armEntry) => buildArmLimb(armEntry, weaponsCatalog);

  const buildBuiltinWeapons = (weaponData) => {
    if (Array.isArray(weaponData?.builtinWeapons) && weaponData.builtinWeapons.length > 0) {
      return weaponData.builtinWeapons;
    }

    const details = Object.entries(weaponData || {})
      .filter(([key, value]) => /^weaponDetails\d+$/i.test(key) && value && typeof value === 'object')
      .map(([, value]) => value);
    if (details.length > 0) return details;

    // Weapon-as-limb defaults to one attack card based on itself.
    return [{ ...weaponData }];
  };

  // Простая обработка предметов
  for (const item of resolvedKitItems) {
    const itype = item.itemType;

    // Конечности
    // Конечность узнаётся по категории из данных (itemCategory); тип конечности
    // — limbType. limbType один есть и у защиты (обшивка для рук), поэтому по
    // нему одному конечность не определить.
    // У предметов комплекта категории нет: kitResolver отдаёт запись кита, где
    // конечность названа по-старому (robotArm, robotHead, ...).
    const isLimb = item.itemCategory === 'limb' || item.itemCategory === 'weaponAsLimb';
    const limbType = isLimb || LIMB_TYPE_BY_KIT_ITEM_TYPE[itype]
      ? (item.limbType ?? LIMB_TYPE_BY_KIT_ITEM_TYPE[itype] ?? null)
      : null;

    if (limbType) {
      let targetKey = null;

      // Слот ищется по типу конечности из плана тела, а не по имени.
      if (limbType === 'arm') {
        // Сторона — порядок слота; без стороны — первый свободный.
        const armSlots = slotsForLimbType(bodyPlan, 'arm');
        if (item.slot === 'left') targetKey = armSlots[0] ?? null;
        else if (item.slot === 'right') targetKey = armSlots[1] ?? null;
        else targetKey = armSlots.find((k) => slots[k].limb === null) ?? null;
      } else {
        targetKey = slotsForLimbType(bodyPlan, limbType)[0] ?? null;
      }

      if (targetKey && slots[targetKey] !== undefined) {
        if (limbType === 'arm') {
          // Build the limb so that builtinWeaponId is resolved into builtinWeapons.
          // Preserve any kit-level overrides (e.g. slot, name) that came on `item`.
          const armEntry = resolveLimbEntry(item.id) || item;
          const limbFromArm = buildLimbFromArmEntry(armEntry);
          const normalizedBuiltin = normalizeBuiltinWeapons({ ...limbFromArm, ...item }, weaponsCatalog);
          slots[targetKey].limb = {
            ...limbFromArm,
            ...item,
            builtinWeapons: normalizedBuiltin,
            canHoldWeapons: limbFromArm.canHoldWeapons,
            weaponSlots: limbFromArm.weaponSlots,
            itemType: 'robotArm',
          };
        } else {
          const builtinWeapons = normalizeBuiltinWeapons(item, weaponsCatalog);
          const limbData = builtinWeapons.length > 0 ? { ...item, builtinWeapons } : item;
          slots[targetKey].limb = limbData;
        }
      }
      continue;
    }

    // Оружие
    if (itype === 'weapon') {
      const weaponData = item._weapon ?? item;
      const weaponId = weaponData.id || item.weaponId;
      const resolvedWeapon = weaponId ? resolveWeaponStats(weaponId) : null;
      // Куда оружие устанавливается — говорит комплект (kitResolver кладёт в
      // installTo). Без пометки оружие просто носят в ладони.
      const installTo = item.installTo ?? null;

      // Нерабочее встроенное оружие (например, ракетница и гранатомёт
      // Секьюритрона до установки ОС Mk II): не занимает слоты и руки,
      // остаётся в инвентаре инертным предметом до будущей механики Mk II.
      if (item.requiresMkII || weaponData.requiresMkII || resolvedWeapon?.requiresMkII) {
        inventoryItems.push({ ...item, requiresMkII: true });
        continue;
      }

      // Оружие, встроенное в руку (ладонные орудия Секьюритрона, лазер-ган Штурмотрона):
      // уходит ВНУТРЬ конечности (limb.builtinWeapons) — ладонь остаётся свободной.
      // item.slot задаёт сторону: left → leftArm, right → rightArm.
      // Если руки ещё нет (базовая модель ещё не заполнена из defaults), откладываем
      // в pendingArmBuiltinWeapons — после автозаполнения конечностей прикрепим.
      if (installTo === 'arm') {
        const direction = item.slot === 'right' ? 'right' : item.slot === 'left' ? 'left' : null;
        const targetKey = direction ? getSlotForDirection(bodyPlan, direction) : null;
        const base = applyWeaponMods(resolvedWeapon || weaponData, item._mods || []);
        const fireRate = Number(base.fireRate) || 0;
        const builtin = {
          ...base,
          fireRate,
          id: weaponId,
          weaponId,
          name: item.displayName || weaponData.name || weaponId,
          baseWeaponName: weaponData.name,
          isBuiltin: true,
          installTo: 'arm',
          locked: true,
          _sourceSlot: targetKey,
          _sourceItem: item,
        };
        if (targetKey && slots[targetKey]?.limb) {
          const limb = slots[targetKey].limb;
          slots[targetKey].limb = {
            ...limb,
            builtinWeapons: [...(Array.isArray(limb.builtinWeapons) ? limb.builtinWeapons : []), builtin],
          };
          continue;
        }
        // Руки пока нет — откладываем до автозаполнения из bodyPlan.defaults
        pendingArmBuiltinWeapons.push(builtin);
        continue;
      }

      // Встроенное оружие в голову
      if (installTo === 'head') {
        const weaponStats = resolvedWeapon || resolveWeaponStats(weaponId);
        if (weaponStats) pendingHeadBuiltinWeapons.push(weaponStats);
        continue; // Не добавлять в инвентарь и не экипировать как heldWeapon
      }
      // Навес (arm attachment): оружие крепится К руке, а не вместо неё.
      // Рука уже стоит — занимаем её ладонь. Руки нет — ставим стандартную
      // руку плана тела (у каждого робота своя), навес — уже в неё. Получить
      // навес без руки нельзя: если и стандартную руку поставить некуда —
      // предмет уходит в инвентарь.
      const attachmentEntry = (robotCatalog.weaponAsLimb || []).find(
        (entry) => entry.id === (weaponData.id ?? item.weaponId)
      );
      if (attachmentEntry) {
        const armKeys = slotKeys.filter((k) => k.toLowerCase().includes('arm'));
        let targetKey = armKeys.find(
          (k) => slots[k]?.limb?.canHoldWeapons === true && !slots[k]?.heldWeapon
        );
        if (!targetKey) {
          const emptyKey = armKeys.find((k) => slots[k]?.limb == null);
          const planDefaults = getDefaultLimbs(getBodyPlan(bodyPlan)?.id ?? bodyPlan);
          const defaultArmId = emptyKey ? planDefaults[emptyKey] : null;
          const defaultEntry = defaultArmId
            ? (robotCatalog.limbs || []).find((l) => l.id === defaultArmId)
            : null;
          if (emptyKey && defaultEntry) {
            slots[emptyKey] = {
              ...slots[emptyKey],
              limb: buildLimbFromArmEntry(defaultEntry),
            };
            targetKey = emptyKey;
          }
        }
        if (targetKey && slots[targetKey] !== undefined) {
          slots[targetKey].heldWeapon = {
            ...(resolveWeaponStats(attachmentEntry.id) ?? weaponData),
            itemType: 'weapon',
          };
        } else {
          inventoryItems.push(item);
        }
        continue;
      }

      const armEntry = resolveLimbEntry(weaponData.id ?? item.weaponId);
      if (armEntry && armEntry.itemCategory !== 'weaponAsLimb') {
        const targetKey = findFreeSlotForLimb(armEntry);
        if (targetKey && slots[targetKey] !== undefined) {
          const limbFromArm = buildLimbFromArmEntry(armEntry);
          slots[targetKey].limb = {
            ...limbFromArm,
            name: weaponData.name || limbFromArm.name || limbFromArm.id,
          };
          slots[targetKey].heldWeapon = null;
          continue;
        }
      }

      // Иначе как обычное оружие в руке. Ветку «робо-оружие вместо конечности»
      // сняли: навесы крепятся к руке выше, прочее робо-оружие (лазер, кувалда
      // робомозга) встаёт в ладонь как любое другое.
      const targetKey = slotKeys.find((k) =>
        k.toLowerCase().includes('arm') && slots[k].limb?.canHoldWeapons && slots[k].heldWeapon == null
      );
      if (targetKey && slots[targetKey] !== undefined) slots[targetKey].heldWeapon = weaponData;
      else inventoryItems.push(item);
      continue;
    }

    // Броня — 1 предмет = 1 слот (без фолбэков, строго по данным)
    // Рама/Обшивка/Броня применяются к конкретной конечности, не к обеим сразу.
    // Thruster — обобщённая локация «средство передвижения»: у Мистера Помощника это thruster,
    // у протектрона/штурмотрона — ноги, у секьюритрона — колесо. Это не фолбэк, а маппинг типов шасси.
    if (['plating', 'armor', 'frame', 'robotArmor', 'robotFrame'].includes(itype)) {
      const armorData = item._armor ?? item;
      const layer = armorData.layer ?? itype;

      // Слот ищется по ТИПУ конечности из данных плана тела, а не по
      // строковому совпадению имени слота с локацией. Оружие вместо руки
      // защиту не принимает, пустой слот — тоже.
      const matchingSlotKeys = armorSlotsByLimbType({ slots, slotKeys, bodyPlan, armorData });

      // 1 предмет = 1 слот: ищем первый подходящий слот, где слой свободен
      // Если указан конкретный слот в item.slot — используем его
      let targetSlot = null;
      if (item.slot && matchingSlotKeys.includes(item.slot)) {
        targetSlot = item.slot;
      } else {
        // Ищем первый свободный слот из подходящих. Свободного слота нет —
        // предмет уходит в инвентарь, а не стирает уже надетую защиту.
        targetSlot = matchingSlotKeys.find((k) => slots[k][layer] == null) || null;
      }

      if (targetSlot && slots[targetSlot] !== undefined) {
        slots[targetSlot][layer] = armorData;
      } else {
        // Слотов, принимающих эту защиту, нет (например, все руки — оружие
        // вместо конечностей). Предмет не пропадает: он уходит в инвентарь.
        inventoryItems.push(item);
      }
      continue;
    }

    // Модули
    if (itype === 'module') {
      modules.push(item);
      continue;
    }

    // Всё остальное → инвентарь
    if (itype !== 'robotPart') {
      inventoryItems.push(item);
    }
  }

  // Автозаполнение недостающих конечностей — строго из данных bodyPlan.defaults, без фолбэков
  // 1 предмет = 1 слот: каждый слот заполняется своей конечностью из defaults[slotKey]
  const planDefaults = getDefaultLimbs(bodyPlan);

  const limbById = (id) => (id ? limbsCatalog.find((l) => l.id === id) || null : null);

  // Конечность «по умолчанию для этого плана тела»: пометка в данных самой
  // конечности (defaultForBodyPlan / robotBodyPlan / compatibleBodyPlans).
  const limbDefaultForPlan = (limbType) => limbsCatalog.find((l) => l.limbType === limbType && (
    l.defaultForBodyPlan === bodyPlan
    || l.robotBodyPlan === bodyPlan
    || (Array.isArray(l.compatibleBodyPlans) && l.compatibleBodyPlans.includes(bodyPlan))
  )) || null;

  const defaultByType = {
    head: limbById(planDefaults.head) || limbDefaultForPlan('head'),
    body: limbById(planDefaults.body) || limbDefaultForPlan('body'),
    mover: limbById(planDefaults.legs || planDefaults.leg) || limbDefaultForPlan('mover'),
  };

  for (const k of slotKeys) {
    if (slots[k].limb !== null) continue;

    // Типы, которые принимает слот, — из плана тела: thruster, chassis и
    // колесо попадают сюда сами, без перечисления имён слотов в коде.
    const acceptedTypes = getSlotDef(bodyPlan, k)?.accepts ?? [];

    const placeLimb = (limbEntry) => {
      if (limbEntry.limbType === 'arm') {
        const limbFromArm = buildLimbFromArmEntry(limbEntry);
        const builtinWeapons = normalizeBuiltinWeapons(limbFromArm, weaponsCatalog);
        slots[k].limb = builtinWeapons.length > 0 ? { ...limbFromArm, builtinWeapons } : limbFromArm;
        return;
      }
      const builtinWeapons = normalizeBuiltinWeapons(limbEntry, weaponsCatalog);
      slots[k].limb = builtinWeapons.length > 0 ? { ...limbEntry, builtinWeapons } : limbEntry;
    };

    // Конкретный слот в defaults (например, leftArm, rightLeg) — по id
    const specificLimb = limbById(planDefaults[k]);
    if (specificLimb && acceptedTypes.includes(specificLimb.limbType)) {
      placeLimb(specificLimb);
      continue;
    }

    // Иначе — конечность по умолчанию для плана тела подходящего типа.
    // Для рук fallback не применяем: у разных роботов разное количество рук,
    // и defaults должны быть явными.
    const fallback = acceptedTypes
      .filter((type) => type !== 'arm')
      .map((type) => defaultByType[type])
      .find(Boolean) || null;
    if (fallback) placeLimb(fallback);
  }

  // Автозаполнение стандартной обшивки из bodyPlan.defaultPlating — на основании данных, без обогатителя
  // defaultPlating: { slotKey: platingId } — например, head: standard_optics, body: standard_body, leftArm: standard_arms
  // Ставится только если в слоте нет plating/frame/armor (конфликт слоёв)
  const defaultPlatingMap = getDefaultPlating(bodyPlan);
  const platingCatalog = Array.isArray(robotCatalog.plating) ? robotCatalog.plating : [];
  const framesCatalog = Array.isArray(robotCatalog.frames) ? robotCatalog.frames : [];
  const allArmorCatalog = [...platingCatalog, ...framesCatalog];

  const resolvePlatingById = (id) => {
    if (!id) return null;
    return allArmorCatalog.find((p) => p.id === id) || null;
  };

  for (const k of slotKeys) {
    if (slots[k].plating || slots[k].frame || slots[k].armor) continue;
    const defaultPlatingId = defaultPlatingMap[k];
    if (!defaultPlatingId) continue;
    const platingData = resolvePlatingById(defaultPlatingId);
    if (platingData) {
      const layer = platingData.layer || 'plating';
      slots[k][layer] = platingData;
    }
  }

  // Прикрепляем отложенные установки (installTo) после автозаполнения конечностей из defaults
  // (базовая модель даёт руки, а лазер-ган из кита должен встать в них)
  if (pendingArmBuiltinWeapons.length > 0) {
    for (const builtin of pendingArmBuiltinWeapons) {
      const targetKey = builtin._sourceSlot || getSlotForDirection(bodyPlan, 'left');
      const sourceItem = builtin._sourceItem;
      if (targetKey && slots[targetKey]?.limb) {
        const limb = slots[targetKey].limb;
        // Не дублируем если уже есть такое оружие
        if (!Array.isArray(limb.builtinWeapons) || !limb.builtinWeapons.some((w) => w.id === builtin.id)) {
          slots[targetKey].limb = {
            ...limb,
            builtinWeapons: [...(Array.isArray(limb.builtinWeapons) ? limb.builtinWeapons : []), builtin],
          };
        }
      } else {
        // Всё ещё нет руки — в инвентарь как fallback
        inventoryItems.push({ ...(sourceItem || {}), installTo: 'arm', _weapon: builtin });
      }
    }
  }

  if (pendingHeadBuiltinWeapons.length > 0 && slots.head?.limb) {
    const headLimb = slots.head.limb;
    const existingBuiltin = Array.isArray(headLimb.builtinWeapons) ? headLimb.builtinWeapons : [];
    const mergedBuiltin = [...existingBuiltin];
    for (const weaponStats of pendingHeadBuiltinWeapons) {
      if (!mergedBuiltin.some((w) => w.id === weaponStats.id)) {
        mergedBuiltin.push({ ...weaponStats, isBuiltin: true });
      }
    }
    slots.head.limb = { ...headLimb, builtinWeapons: mergedBuiltin };
  }

  // Защита живёт только на настоящей конечности. Проверяем инвариант после
  // автозаполнения — слот, где осталось оружие вместо руки или нет конечности
  // вовсе, защиту не держит.
  for (const key of slotKeys) {
    const slot = slots[key];
    if (!slot || slotAcceptsArmor(slot).allowed) continue;
    slot.plating = null;
    slot.armor = null;
    slot.frame = null;
  }

  // Собираем оружия
  const weapons = getBuiltinWeaponsFromSlots(slots);

  return { slots, weapons, modules, inventoryItems };
}

// ---------------------------------------------------------------------------
// getBuiltinWeaponsFromSlots
// ---------------------------------------------------------------------------

/**
 * Карточки атак персонажа-робота: встроенные атаки конечностей плюс оружие,
 * зажатое в ладонях. Единственный источник — состояние слотов; сам список
 * считает collectAttacks() (domain/robotSlots.js).
 *
 * Имя оставлено историческим: на него опираются экраны, стор и сейвы.
 *
 * @param {object} slots - RobotSlotsObject
 * @param {object} options - { catalog? }
 * @returns {object[]}
 */
export function getBuiltinWeaponsFromSlots(slots, options = {}) {
  return collectAttacks(slots, options);
}

// ---------------------------------------------------------------------------
// canEquipRobotArmor
// ---------------------------------------------------------------------------

/**
 * Checks whether an armor item can be equipped in the given layer of a slot.
 * Uses armorItem.incompatibleLayers to detect conflicts with existing layers.
 *
 * @param {object} armorItem - { incompatibleLayers?: string[], layer?: string }
 * @param {string} slotKey
 * @param {string} layer - 'plating' | 'armor' | 'frame'
 * @param {object} slots - RobotSlotsObject
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canEquipRobotArmor(armorItem, slotKey, layer, slots) {
  const slotData = slots?.[slotKey];
  if (!slotData) {
    return { allowed: false, reason: 'equip.error.invalidSlot' };
  }

  // Защиту принимает только слот с настоящей конечностью. Пустой слот и
  // оружие вместо руки защиты не принимают.
  return slotAcceptsArmor(slotData, { item: armorItem });
}

// ---------------------------------------------------------------------------
// canReplaceLimb
// ---------------------------------------------------------------------------

/**
 * Checks whether a new limb can be placed in the given slot.
 * Validates compatibleBodyPlans / defaultForBodyPlan against the character's body plan.
 *
 * @param {string} slotKey
 * @param {object} newLimb - { compatibleBodyPlans?: string[], defaultForBodyPlan?: string }
 * @param {object} character - { origin: { bodyPlan } }
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canReplaceLimb(slotKey, newLimb, character) {
  if (!newLimb) {
    return { allowed: false, reason: 'equip.error.noLimb' };
  }

  const bodyPlan = character?.origin?.bodyPlan;

  // Съёмность слота задана данными плана тела, а не именем.
  // Голова не снимается ни у одного плана (решение владельца).
  const def = getSlotDef(bodyPlan, slotKey);
  if (def && def.swappable === false) {
    return { allowed: false, reason: 'equip.error.slotNotSwappable' };
  }

  const compatiblePlans = newLimb.compatibleBodyPlans;
  const defaultPlan = newLimb.defaultForBodyPlan;

  // If the limb declares compatibility constraints, enforce them
  if (compatiblePlans && Array.isArray(compatiblePlans)) {
    if (!compatiblePlans.includes(bodyPlan)) {
      return { allowed: false, reason: 'equip.error.limbIncompatibleBodyPlan' };
    }
  } else if (defaultPlan && defaultPlan !== bodyPlan) {
    return { allowed: false, reason: 'equip.error.limbIncompatibleBodyPlan' };
  }

  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// applyLimbReplacement
// ---------------------------------------------------------------------------

/**
 * Replaces the limb in a slot and rebuilds the weapons array.
 * The old limb's built-in weapons are removed; held weapons are kept if compatible.
 *
 * @param {object} slots   - RobotSlotsObject
 * @param {string} slotKey
 * @param {object} newLimb
 * @returns {{ slots: object, weapons: object[] }}
 */
export function applyLimbReplacement(slots, slotKey, newLimb, weaponsCatalog = []) {
  const previousLimb = slots?.[slotKey]?.limb;
  // If the new limb has a builtinWeaponId that hasn't been resolved yet,
  // normalize it so that getBuiltinWeaponsFromSlots can produce attack cards.
  let normalizedLimb = newLimb;
  if (
    newLimb &&
    (!Array.isArray(newLimb.builtinWeapons) || newLimb.builtinWeapons.length === 0) &&
    newLimb.builtinWeaponId
  ) {
    if (newLimb.itemType === 'robotArm') {
      normalizedLimb = buildArmLimb(newLimb, weaponsCatalog);
    } else {
      const weaponStats = weaponsCatalog.find(w => w.id === newLimb.builtinWeaponId) || null;
      if (weaponStats) {
        normalizedLimb = { ...newLimb, builtinWeapons: [{ ...weaponStats, isBuiltin: true }] };
      }
    }
  }

  const updatedSlots = {
    ...slots,
    [slotKey]: {
      ...slots[slotKey],
      limb: normalizedLimb,
      heldWeapon:
        normalizedLimb?.canHoldWeapons ? (slots[slotKey]?.heldWeapon ?? null) : null,
    },
  };

  // Пар конечностей нет: замена меняет РОВНО ОДИН слот. Сбрасывать соседа
  // за компанию — значит отбирать у игрока конечность, которую он не трогал
  // (для Хэнди это была бы потеря arm3).

  // Инвариант: защита живёт только на настоящей конечности. Поставили вместо
  // руки огнемёт — броня, обшивка и рама снимаются.
  const target = updatedSlots[slotKey];
  if (target && !slotAcceptsArmor(target).allowed) {
    updatedSlots[slotKey] = { ...target, armor: null, plating: null, frame: null };
  }

  const weapons = getBuiltinWeaponsFromSlots(updatedSlots);
  return { slots: updatedSlots, weapons };
}

// ---------------------------------------------------------------------------
// canEquipWeaponToSlot
// ---------------------------------------------------------------------------

/**
 * Checks whether a weapon can be held by the given slot's limb.
 * Validates weight limit and two-handed restrictions.
 *
 * @param {object} weapon   - { weight?: number, twoHanded?: boolean }
 * @param {object} slotData - { limb: { canHoldWeapons, maxHandelWeaponWeight, excludeTwoHanded } }
 * @param {object} _character - reserved for future use
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canEquipWeaponToSlot(weapon, slotData, _character) {
  const limb = slotData?.limb;

  const hasFreeWeaponSlot = (limb?.weaponSlots ?? (limb?.canHoldWeapons ? 1 : 0)) > 0;
  if (!hasFreeWeaponSlot) {
    return { allowed: false, reason: 'equip.error.limbCannotHoldWeapons' };
  }

  const maxWeight = limb.maxHandelWeaponWeight;
  if (maxWeight != null && (weapon?.weight ?? 0) > maxWeight) {
    return { allowed: false, reason: 'equip.error.weaponTooHeavyForLimb' };
  }

  if (limb.excludeTwoHanded && weapon?.twoHanded) {
    return { allowed: false, reason: 'equip.error.limbExcludesTwoHandedWeapons' };
  }

  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// Выбор руки для экипировки оружия из инвентаря
// ---------------------------------------------------------------------------

/**
 * Возвращает первую СВОБОДНУЮ руку (может держать оружие), на которой ещё нет
 * оружия из инвентаря (sourceSlot в occupiedSourceSlots). Если все руки заняты
 * оружием — возвращает первую способную руку (поведение «как раньше», без
 * потери возможности экипировать). Возвращает [slotKey, slotData] или null.
 *
 * @param {object} slots - equippedRobotSlots
 * @param {string[]} occupiedSourceSlots - sourceSlot'ы оружия, экипированного из инвентаря
 * @returns {[string, object] | null}
 */
export function findFreeWeaponHand(slots = {}, occupiedSourceSlots = []) {
  const occupied = new Set(occupiedSourceSlots || []);
  const arms = Object.entries(slots).filter(([, slotData]) => slotData?.limb?.canHoldWeapons === true);
  if (arms.length === 0) return null;
  const free = arms.find(([key]) => !occupied.has(key));
  return free || arms[0];
}
