// Fallout-owned robot save migrations. The catalog and body-plan rules are
// setting data; the engine only reserves the corresponding schema transitions.
import { getFalloutRobotLimbCatalog as getRobotLimbCatalog } from '../logic/robotCatalog.js';
import { getDefaultLimbs } from '../logic/bodyplan.js';

/**
 * v8 -> v9 package extension: normalize robot limbs, builtin weapons and slot
 * weapons with the same historical numeric-stat conversion as engine items.
 */
export const migrateRobotSlotStatsV8V9 = (state) => {
  if (!state || typeof state !== 'object') return state;

  const toParam = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return { base: value, modifiers: [], total: value };
    if (typeof value === 'object') return value;
    const number = Number(value);
    return Number.isNaN(number) ? value : { base: number, modifiers: [], total: number };
  };
  const migrateItem = (item) => {
    if (!item || typeof item !== 'object') return item;
    const out = { ...item };
    if ('damage' in out) out.damage = toParam(out.damage);
    if ('fireRate' in out) out.fireRate = toParam(out.fireRate);
    if ('physicalDamageRating' in out) out.physicalDamageRating = toParam(out.physicalDamageRating);
    if ('energyDamageRating' in out) out.energyDamageRating = toParam(out.energyDamageRating);
    if ('radiationDamageRating' in out) out.radiationDamageRating = toParam(out.radiationDamageRating);
    return out;
  };
  const migrateRobotWeapon = (weapon) => {
    if (!weapon) return weapon;
    const out = migrateItem(weapon);
    if (Array.isArray(out.builtinWeapons)) {
      out.builtinWeapons = out.builtinWeapons.map(migrateRobotWeapon);
    }
    return out;
  };
  const migrateSlot = (slot) => {
    if (!slot || typeof slot !== 'object') return slot;
    return {
      ...slot,
      limb: migrateRobotWeapon(slot.limb),
      heldWeapon: migrateRobotWeapon(slot.heldWeapon),
    };
  };

  let changed = false;
  const next = { ...state };
  if (next.equippedRobotSlots && typeof next.equippedRobotSlots === 'object') {
    const slots = {};
    for (const [key, slot] of Object.entries(next.equippedRobotSlots)) {
      slots[key] = migrateSlot(slot);
    }
    next.equippedRobotSlots = slots;
    changed = true;
  }
  if (Array.isArray(next.equippedWeapons)) {
    let nestedWeaponsChanged = false;
    const equippedWeapons = next.equippedWeapons.map((weapon) => {
      if (!weapon || typeof weapon !== 'object' || !Array.isArray(weapon.builtinWeapons)) return weapon;
      nestedWeaponsChanged = true;
      return migrateRobotWeapon(weapon);
    });
    if (nestedWeaponsChanged) {
      next.equippedWeapons = equippedWeapons;
      changed = true;
    }
  }
  return changed ? next : state;
};

/**
 * v20 -> v21: «Заводская обшивка» удалена из каталога — в книге её нет, есть
 * только стандартная обшивка. Старые сейвы (и комплект защитрона) ссылались на
 * robot_plating_factory_*; без переименования слой не разрешится каталогом, и
 * персонаж молча потеряет защиту при загрузке.
 *
 * Правит и «толстый» вид слота (слои объектами на верхнем уровне), и новый
 * (armorLayers с id), и инвентарь. Идемпотентна: после подмены id больше не
 * начинается с robot_plating_factory_.
 */
export const migrateRobotPlatingIds = (state) => {
  if (!state || typeof state !== 'object') return state;

  const remapId = (id) => (typeof id === 'string' && id.startsWith('robot_plating_factory_')
    ? id.replace('robot_plating_factory_', 'robot_plating_standard_')
    : id);

  const remapLayer = (layer) => {
    if (typeof layer === 'string') return remapId(layer);
    if (layer && typeof layer === 'object' && typeof layer.id === 'string') {
      const id = remapId(layer.id);
      return id === layer.id ? layer : { ...layer, id };
    }
    return layer;
  };

  const LAYER_KEYS = ['plating', 'armor', 'frame'];
  let changed = false;
  const next = { ...state };

  if (next.equippedRobotSlots && typeof next.equippedRobotSlots === 'object') {
    const slots = {};
    let slotsChanged = false;
    for (const [key, slot] of Object.entries(next.equippedRobotSlots)) {
      if (!slot || typeof slot !== 'object') { slots[key] = slot; continue; }
      const patched = { ...slot };
      for (const layerKey of LAYER_KEYS) {
        if (patched[layerKey] === undefined || patched[layerKey] === null) continue;
        const mapped = remapLayer(patched[layerKey]);
        if (mapped !== patched[layerKey]) { patched[layerKey] = mapped; slotsChanged = true; }
      }
      if (patched.armorLayers && typeof patched.armorLayers === 'object') {
        const layers = { ...patched.armorLayers };
        for (const layerKey of LAYER_KEYS) {
          if (layers[layerKey] === undefined || layers[layerKey] === null) continue;
          const mapped = remapLayer(layers[layerKey]);
          if (mapped !== layers[layerKey]) { layers[layerKey] = mapped; slotsChanged = true; }
        }
        patched.armorLayers = layers;
      }
      slots[key] = patched;
    }
    if (slotsChanged) { next.equippedRobotSlots = slots; changed = true; }
  }

  if (Array.isArray(next.equipment?.items)) {
    let itemsChanged = false;
    const items = next.equipment.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const id = remapId(item.id);
      if (id === item.id) return item;
      itemsChanged = true;
      return { ...item, id };
    });
    if (itemsChanged) { next.equipment = { ...next.equipment, items }; changed = true; }
  }

  return changed ? next : state;
};

/**
 * v21 -> v22: навесы (arm attachments) перестали быть конечностями.
 *
 * Новая модель: навес — оружие, которое крепится К руке и живёт в её ладони
 * (heldWeapon). Слот, где навес стоял ВМЕСТО руки, получает стандартную руку
 * плана тела (у каждого робота своя: мистер-помощник, секьюритрон, штурмотрон,
 * протектрон…), а сам навес пересаживается в ладонь. Если у плана нет
 * стандартной руки для слота, слот освобождается — навес сохраняется в
 * ладони и ждёт установки руки.
 *
 * Понимает и «толстый» вид (объект конечности), и «худой» (id из v20+).
 * Идемпотентна: после пересадки в limb не остаётся навесов.
 */
export const migrateRobotArmAttachments = (state) => {
  if (!state || typeof state !== 'object') return state;
  if (!state.equippedRobotSlots || typeof state.equippedRobotSlots !== 'object') return state;

  const robotCatalog = getRobotLimbCatalog();
  const attachmentIds = new Set(
    (Array.isArray(robotCatalog.weaponAsLimb) ? robotCatalog.weaponAsLimb : []).map((entry) => entry.id),
  );
  const limbsById = new Map(
    (Array.isArray(robotCatalog.limbs) ? robotCatalog.limbs : []).map((entry) => [entry.id, entry]),
  );
  const planDefaults = getDefaultLimbs(state?.origin?.bodyPlan) || {};

  let changed = false;
  const slots = {};
  for (const [key, slot] of Object.entries(state.equippedRobotSlots)) {
    if (!slot || typeof slot !== 'object') { slots[key] = slot; continue; }
    const limb = slot.limb;
    const limbId = typeof limb === 'string' ? limb : limb?.id;
    if (!limbId) { slots[key] = slot; continue; }
    const isAttachment = attachmentIds.has(limbId)
      || (limb?.itemType === 'robotArm' && limb?.canHoldWeapons === false);
    if (!isAttachment) { slots[key] = slot; continue; }

    const defaultArmId = planDefaults[key];
    const defaultArm = defaultArmId ? limbsById.get(defaultArmId) : null;
    slots[key] = {
      ...slot,
      limb: defaultArm ? { id: defaultArm.id } : null,
      heldWeapon: { ...(slot.heldWeapon || {}), id: limbId, weaponId: limbId, itemType: 'weapon' },
    };
    changed = true;
  }

  return changed ? { ...state, equippedRobotSlots: slots } : state;
};
