// domain/robotSlots.js
//
// Чистая модель слота робота.
//
// Единственная модель: robotEquip.js и robotDamageResistance.js работают
// только через эти функции. Исторические ветки и фича-флаг сняты (этап 4).
//
// Правила, которыми живут эти функции:
//   1. Слот описывается ТИПОМ, а не именем: { id, accepts, capacity,
//      swappable }. Имена (arm1, wheel, chassis) — только ключи сейва и
//      подписи в UI.
//   2. Способности принадлежат содержимому слота (конечности), а не слоту.
//      Хватка, своя атака и своя защита — три независимых свойства.
//   3. Оружие вместо конечности (itemCategory: "weaponAsLimb") защиты не
//      принимает: ни броню, ни обшивку, ни раму (§10.5).
//   4. Встроенная атака и оружие в ладони НЕ конкурируют: сбор атак со
//      слота возвращает СПИСОК, а не первое совпадение.
//   5. Дедупликации в домене НЕТ ни по id, ни по экземпляру: две одинаковые
//      руки дают две карточки, «стрельба по-македонски» (одно оружие в обеих
//      ладонях) — тоже две. Именно глобальный дедуп по id и был багом «arm3
//      теряет атаку». Сводить одинаковые карточки в одну — правило экрана.
//
// Состояние слота понимается в двух видах (старый и новый) — см.
// normalizeSlot(). Это позволяет использовать функции до миграции сейва.

import { getBodyPlan } from './bodyplan';
import { getRobotLimbCatalog } from './registry';
import { applyWeaponMods } from './enrichItem';

/** Слои защиты в порядке приоритета (armor и frame совместимы, plating — нет). */
export const LAYER_KEYS = ['armor', 'frame', 'plating'];

/** Типы конечностей — закрытый список двигателя. */
export const LIMB_TYPES = ['head', 'body', 'arm', 'mover'];

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const allow = () => ({ allowed: true, reason: null });
const deny = (reason) => ({ allowed: false, reason });

// ---------------------------------------------------------------------------
// Состояние слота: старый вид → новый
// ---------------------------------------------------------------------------

const EMPTY_ARMOR_LAYERS = () => ({ frame: null, plating: null, armor: null });

/**
 * id установленных модов из любого вида записи:
 *   { modIds: [...] }  — новый вид;
 *   { appliedMods: { слот: id } } — вид предмета инвентаря.
 * @param {object} source
 * @returns {string[]}
 */
export const toModIds = (source) => {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source.modIds)) return source.modIds.filter(Boolean);
  const map = source.appliedMods;
  if (map && typeof map === 'object') return Object.values(map).filter(Boolean);
  return [];
};

/** Приводит список установленного оружия к виду [{ id, modIds }]. */
const normalizeInstalled = (list) => (Array.isArray(list) ? list : [])
  .map((entry) => {
    if (typeof entry === 'string') return { id: entry, modIds: [] };
    const id = entry?.id ?? entry?.weaponId ?? null;
    if (!id) return null;
    return { id, modIds: toModIds(entry) };
  })
  .filter(Boolean);

/**
 * Приводит состояние слота к новому виду:
 *   новый:  { content, armorLayers: { frame, plating, armor }, heldWeaponId,
 *             heldWeaponMods, installedWeapons: [{ id, modIds }] }
 *   старый: { limb, armor, plating, frame, heldWeapon }
 *
 * Оружие в слоте хранится id + список id установленных модов: характеристики
 * восстанавливаются из каталога, моды накладываются поверх базы. Установленное
 * в конечность оружие (апгрейд) отличается от её собственной встроенной атаки:
 * собственная задана каталогом, всё сверх неё — установленное.
 *
 * @param {object} slot
 * @param {object} options — { catalog? }
 */
export function normalizeSlot(slot, options = {}) {
  const { catalog = getRobotLimbCatalog() } = options;
  if (!slot || typeof slot !== 'object') {
    return {
      content: null,
      armorLayers: EMPTY_ARMOR_LAYERS(),
      heldWeaponId: null,
      heldWeaponMods: [],
      installedWeapons: [],
    };
  }
  const isNewShape = 'content' in slot || 'armorLayers' in slot
    || 'heldWeaponId' in slot || 'installedWeapons' in slot;
  if (isNewShape) {
    return {
      content: slot.content ?? null,
      armorLayers: { ...EMPTY_ARMOR_LAYERS(), ...(slot.armorLayers || {}) },
      heldWeaponId: slot.heldWeaponId ?? null,
      heldWeaponMods: toModIds({ modIds: slot.heldWeaponMods, appliedMods: slot.heldWeapon?.appliedMods }),
      installedWeapons: normalizeInstalled(slot.installedWeapons),
    };
  }
  // Старый вид: установленное оружие живёт внутри экземпляра конечности.
  // Делить нужно по КАТАЛОГУ: в сохранённом экземпляре нет ни builtinWeaponId,
  // ни attackId — эти поля живут только в данных, и без наложения каталога
  // собственная атака конечности уедет в установки.
  const limb = slot.limb ?? null;
  const { installed } = splitLimbWeapons(resolveLimb(catalog, limb), { catalog });
  return {
    content: limb,
    armorLayers: {
      frame: slot.frame ?? null,
      plating: slot.plating ?? null,
      armor: slot.armor ?? null,
    },
    heldWeaponId: slot.heldWeapon?.weaponId ?? slot.heldWeapon?.id ?? null,
    heldWeaponMods: toModIds(slot.heldWeapon),
    installedWeapons: installed.map((entry) => ({
      id: typeof entry === 'string' ? entry : entry.id,
      modIds: toModIds(entry),
    })),
  };
}

/**
 * Делит встроенные атаки конечности на две кучи:
 *   own       — собственная атака конечности (её объявляет каталог);
 *   installed — установленное в конечность оружие (апгрейд игрока).
 *
 * Каталог важнее экземпляра: что не названо собственной атакой, то установка.
 * Для нового вида сейва массив берётся уже разделённым (installedWeapons).
 *
 * @param {object} limb — запись каталога или экземпляр конечности
 * @param {object} options — { catalog? }
 * @returns {{ own: any[], installed: any[] }}
 */
export function splitLimbWeapons(limb, options = {}) {
  const { catalog = getRobotLimbCatalog() } = options;
  const own = [];
  const installed = [];
  if (!limb) return { own, installed };

  const ownId = limb.itemCategory === 'weaponAsLimb'
    ? (limb.attackId ?? null)
    : (limb.builtinWeaponId ?? (limb.builtinManipulator ? limb.id : null));

  const list = Array.isArray(limb.builtinWeapons) ? limb.builtinWeapons : [];
  for (const entry of list) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (!id) continue;
    // Первое совпадение с собственной атакой — она; повторы — установка.
    if (ownId && id === ownId && own.length === 0) own.push(entry);
    else installed.push(entry);
  }
  return { own, installed };
}

/**
 * Содержимое слота → запись каталога (limb или weaponAsLimb).
 *
 * content бывает:
 *   id (строка)            — новый формат сейва;
 *   объект из каталога     — новый формат;
 *   объект старого формата — из robotarms/robotheads/... с itemType robot*.
 * В последнем случае находим запись в новом каталоге по id и накладываем
 * поля экземпляра поверх (моды, имя, состояние).
 */
export function resolveLimb(catalog, content) {
  if (!content) return null;
  const id = typeof content === 'string' ? content : content.id;
  if (!id) return null;
  const entry = (catalog?.limbs || []).find((l) => l.id === id)
    || (catalog?.weaponAsLimb || []).find((l) => l.id === id)
    || null;
  if (typeof content === 'string') return entry;
  if (!entry) return content;
  // Категория и тип — из каталога (истина), наложенные поля — из экземпляра.
  const merged = {
    ...entry,
    ...content,
    itemCategory: entry.itemCategory,
    limbType: entry.limbType,
  };
  // Поля СУ и хвата экземпляра НЕ стираются: если в данных проставлены
  // physicalDR/energyDR/radDR, их поставили руками и не просто так.
  // Конечность-оружие — штука уникальная: свою защиту иметь может,
  // а вот слон защиты (броня/обшивка/рама) — нет (правило владельца).
  return merged;
}

/**
 * Может ли конечность держать оружие в ладони — с точки зрения ЗАПИСИ слота.
 * Конечность вне каталога (неизвестная) оружие «держит»: мы не понимаем её
 * устройство и не имеем права гасить уже записанные данные.
 *
 * Для атак правило строже (см. attacksFromSlot): неизвестная конечность
 * атаку из ладони не даёт.
 *
 * @param {object} limb
 * @returns {boolean}
 */
const limbKeepsHeldWeapon = (limb) => {
  if (!limb || !limb.itemCategory) return true;
  return limb.itemCategory === 'limb'
    && limb.canHoldWeapons === true
    && (limb.weaponSlots ?? 1) > 0;
};

const resolveWeapon = (catalog, id) => {
  if (!id) return null;
  return (catalog?.weapons || []).find((w) => w.id === id)
    // Человеческое оружие в ладони робота (рельсотрон, дробовик, ПП) лежит в
    // общем каталоге сеттинга — характеристики берутся оттуда же.
    || (catalog?.generalWeapons || []).find((w) => w.id === id)
    || null;
};

const resolveMods = (catalog, ids = []) => (ids || [])
  .map((id) => (catalog?.weaponMods || []).find((m) => m.id === id))
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Навесы (arm attachments): оружие, крепящееся К руке, а не вместо неё.
// ---------------------------------------------------------------------------

/**
 * Навес ли предмет: запись каталога weaponAsLimb или предмет с id такого
 * навеса (в том числе «худой» вид из сейва — { id } / { weaponId }).
 *
 * @param {object|null} item
 * @param {object} catalog — каталог конечностей (по умолчанию реестр).
 * @returns {boolean}
 */
export function isArmAttachment(item, catalog = getRobotLimbCatalog()) {
  const id = item?.itemCategory === 'weaponAsLimb'
    ? item.id
    : (item?.weaponId ?? item?.id);
  if (!id) return false;
  return (catalog?.weaponAsLimb || []).some((entry) => entry.id === id);
}

/**
 * Можно ли заменить предмет в ладони руки.
 *
 * Строгий режим (настройка «прикрепляемые части рук — только на аналогичные»):
 * навес меняется только на другой навес, обычное оружие — только на оружие.
 * Свободный режим разрешает любую замену. Первая установка в пустую ладонь
 * ограничением не является — правило про ЗАМЕНУ.
 *
 * @param {object|null} existingItem — предмет в ладони (или его id-запись)
 * @param {object|null} incomingItem — кандидат
 * @param {object} options — { strict?: boolean, catalog? }
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function canReplaceArmWeapon(existingItem, incomingItem, options = {}) {
  const { strict = true, catalog = getRobotLimbCatalog() } = options;
  if (!strict) return allow();
  const existingIsAttachment = isArmAttachment(existingItem, catalog);
  const incomingIsAttachment = isArmAttachment(incomingItem, catalog);
  return existingIsAttachment === incomingIsAttachment
    ? allow()
    : deny('equip.error.armPartReplaceStrict');
}


/**
 * Карта применённых модов { слот: id } — вид, который ждут экраны и отпечаток
 * карточки. Восстанавливается из списка id: каждый мод знает свой слот.
 */
const modMap = (catalog, ids = []) => Object.fromEntries(
  resolveMods(catalog, ids).map((mod) => [mod.slot ?? mod.id, mod.id]),
);

/**
 * Числовые статы оружия в старых сейвах записаны объектом v9
 * `{ base, modifiers, total }`. Карточке нужно готовое число.
 */
const STAT_KEYS = ['damage', 'fireRate'];
const flattenStats = (weapon) => {
  const out = { ...weapon };
  for (const key of STAT_KEYS) {
    const value = out[key];
    if (value && typeof value === 'object' && 'total' in value) {
      out[key] = Number(value.total);
    }
  }
  return out;
};

/**
 * Оружие из id + список id модов: база из каталога, поверх — моды.
 * Экземпляр (если он есть) важнее каталога: в нём могут быть имя и состояние,
 * но характеристики всё равно берутся из каталога.
 *
 * @returns {object}
 */
const materializeWeapon = (catalog, entry, modIds = []) => {
  const id = typeof entry === 'string' ? entry : entry?.id ?? entry?.weaponId;
  if (!id) return null;
  const base = resolveWeapon(catalog, id);
  const instance = typeof entry === 'object' && entry ? entry : null;
  const merged = base
    ? { ...base, ...(instance || {}) }
    : (instance ? { ...instance } : { id });
  const ids = modIds.length > 0 ? modIds : toModIds(instance);
  const mods = resolveMods(catalog, ids);
  const plain = flattenStats(merged);
  return mods.length > 0 ? applyWeaponMods(plain, mods) : plain;
};

// ---------------------------------------------------------------------------
// Хранимая (худая) форма слота: id + моды
// ---------------------------------------------------------------------------

/**
 * Признак худого слота: в нём оружие записано идентификаторами.
 * @param {object} slot
 * @returns {boolean}
 */
export const isSlimSlot = (slot) => Boolean(slot && typeof slot === 'object'
  && ('content' in slot || 'armorLayers' in slot || 'heldWeaponId' in slot
    || 'installedWeapons' in slot));

/**
 * Слот → худая форма: только id да список id модов.
 *
 * Правила, зашитые здесь:
 *   - слой защиты хранится id; конфликтующие слои отбрасываются (обшивка не
 *    совместима с бронёй и рамой — правило владельца);
 *   - слот без настоящей конечности (или с оружием вместо руки) защиты не
 *     хранит вовсе;
 *   - оружие в ладони хранится только там, где конечность его держит.
 *
 * @param {object} slot
 * @param {object} options — { catalog? }
 * @returns {{ content: string|null, armorLayers: object, heldWeaponId: string|null,
 *             heldWeaponMods: string[], installedWeapons: object[] }}
 */
export function serializeSlot(slot, options = {}) {
  const { catalog = getRobotLimbCatalog() } = options;
  const state = normalizeSlot(slot, { catalog });
  const content = typeof state.content === 'string'
    ? state.content
    : (state.content?.id ?? null);
  const limb = resolveLimb(catalog, state.content);

  const armorLayers = { frame: null, plating: null, armor: null };
  if (limb && slotAcceptsArmor(slot, { catalog }).allowed) {
    for (const { key } of activeArmorLayers(slot, { catalog })) {
      const layer = state.armorLayers[key];
      armorLayers[key] = typeof layer === 'string' ? layer : (layer?.id ?? null);
    }
  }

  const canHold = limbKeepsHeldWeapon(limb);

  return {
    content,
    armorLayers,
    heldWeaponId: canHold ? state.heldWeaponId : null,
    heldWeaponMods: canHold ? state.heldWeaponMods : [],
    installedWeapons: state.installedWeapons.filter((entry) => entry?.id),
  };
}

const ITEM_TYPE_BY_LIMB_TYPE = {
  arm: 'robotArm',
  head: 'robotHead',
  body: 'robotBody',
  mover: 'robotLegs',
};

/**
 * Худая форма → слот в виде объектов (то, что ждёт остальной код приложения).
 *
 * Записи каталога кладутся целиком (статы, СУ, совместимость слоёв); локали-
 * зованные имена дообогащает restoreSaveData на импорте. Установленное оружие
 * возвращается в массив builtinWeapons конечности — ровно откуда оно пришло.
 *
 * @param {object} slot — худая (или любая) форма слота
 * @param {object} options — { catalog? }
 * @returns {{ limb: object|null, armor: object|null, plating: object|null,
 *             frame: object|null, heldWeapon: object|null }}
 */
export function deserializeSlot(slot, options = {}) {
  const { catalog = getRobotLimbCatalog() } = options;
  const state = normalizeSlot(slot, { catalog });
  const limbId = typeof state.content === 'string'
    ? state.content
    : (state.content?.id ?? null);

  let limb = null;
  if (limbId) {
    const entry = resolveLimb(catalog, limbId);
    const itemType = entry?.itemType
      ?? ITEM_TYPE_BY_LIMB_TYPE[entry?.limbType]
      ?? 'robotPart';
    const builtinWeapons = [];
    const ownId = entry?.itemCategory === 'weaponAsLimb'
      ? entry.attackId
      : (entry?.builtinWeaponId ?? (entry?.builtinManipulator ? entry.id : null));
    if (ownId) {
      builtinWeapons.push({ ...(resolveWeapon(catalog, ownId) || {}), id: ownId, weaponId: ownId, itemType: 'weapon', isBuiltin: true });
    }
    for (const installed of state.installedWeapons) {
      builtinWeapons.push({
        ...(resolveWeapon(catalog, installed.id) || {}),
        id: installed.id,
        weaponId: installed.id,
        itemType: 'weapon',
        appliedMods: modMap(catalog, installed.modIds),
        modIds: installed.modIds,
        isBuiltin: true,
      });
    }
    limb = {
      ...(entry || {}),
      id: limbId,
      itemType,
      ...(builtinWeapons.length > 0 ? { builtinWeapons } : {}),
    };
  }

  const canHold = limbKeepsHeldWeapon(limb);

  const layerObject = (key) => {
    const raw = state.armorLayers[key];
    const id = typeof raw === 'string' ? raw : (raw?.id ?? null);
    if (!id) return null;
    const entry = (catalog?.armorLayers || []).find((l) => l.id === id);
    // itemType: 'armor' — ключ, по которому restoreSaveData найдёт запись в
    // общем каталоге (armorIndex объединяет броню, обшивку и рамы).
    return { ...(entry || {}), id, itemType: 'armor', ...(typeof raw === 'object' && raw ? raw : {}) };
  };

  return {
    limb,
    armor: layerObject('armor'),
    plating: layerObject('plating'),
    frame: layerObject('frame'),
    heldWeapon: canHold && state.heldWeaponId
      ? {
        id: state.heldWeaponId,
        weaponId: state.heldWeaponId,
        itemType: 'weapon',
        appliedMods: modMap(catalog, state.heldWeaponMods),
        modIds: state.heldWeaponMods,
      }
      : null,
  };
}

// ---------------------------------------------------------------------------
// План тела
// ---------------------------------------------------------------------------

/**
 * Описание слота плана тела: { id, accepts, capacity, swappable }.
 * @param {string|object} bodyPlan — id плана или сам план
 * @param {string} slotId
 */
export function getSlotDef(bodyPlan, slotId) {
  const plan = typeof bodyPlan === 'string' ? getBodyPlan(bodyPlan) : bodyPlan;
  const slots = plan?.slots || [];
  for (const slot of slots) {
    if (typeof slot === 'string') {
      if (slot === slotId) return { id: slot, accepts: [], capacity: 1, swappable: true };
      continue;
    }
    if (slot?.id === slotId) {
      return {
        id: slot.id,
        accepts: slot.accepts || [],
        capacity: slot.capacity ?? 1,
        swappable: slot.swappable !== false,
      };
    }
  }
  return null;
}

/**
 * Слот для стороны комплекта: left / right / center → N-й слот нужного типа
 * в порядке плана тела (для Хэнди: arm1 / arm2 / arm3, для протектрона:
 * leftArm / rightArm). Сторона — это порядок, а не имя слота.
 *
 * @param {string|object} bodyPlan
 * @param {'left'|'right'|'center'} direction
 * @param {'head'|'body'|'arm'|'mover'} limbType
 * @returns {string | null}
 */
export function slotForDirection(bodyPlan, direction, limbType = 'arm') {
  const ids = slotsForLimbType(bodyPlan, limbType);
  if (direction === 'left') return ids[0] ?? null;
  if (direction === 'right') return ids[1] ?? null;
  if (direction === 'center') return ids[2] ?? null;
  return null;
}

/** Все слоты плана, принимающие данный тип конечности. */
export function slotsForLimbType(bodyPlan, limbType) {
  const plan = typeof bodyPlan === 'string' ? getBodyPlan(bodyPlan) : bodyPlan;
  return (plan?.slots || [])
    .map((slot) => (typeof slot === 'string' ? { id: slot, accepts: [] } : slot))
    .filter((slot) => (slot.accepts || []).includes(limbType))
    .map((slot) => slot.id);
}

// ---------------------------------------------------------------------------
// Классификация предметов
// ---------------------------------------------------------------------------

const LEGACY_LIMB_TYPES = ['robotArm', 'robotHead', 'robotBody', 'robotLeg', 'robotLegs'];
const LEGACY_ARMOR_TYPES = ['plating', 'armor', 'frame', 'robotArmor', 'robotFrame'];

/**
 * Что за предмет нам пытаются установить.
 * @returns {'limb'|'weapon'|'armorLayer'|null}
 */
export function classifyItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.itemCategory === 'limb' || item.itemCategory === 'weaponAsLimb') return 'limb';
  if (item.itemCategory === 'weapon') return 'weapon';
  if (item.layer && LAYER_KEYS.includes(item.layer)) return 'armorLayer';
  if (LEGACY_ARMOR_TYPES.includes(item.itemType)) return 'armorLayer';
  if (LEGACY_LIMB_TYPES.includes(item.itemType) || item.limbType) return 'limb';
  if (item.itemType === 'weapon' || item.weaponId || item.damage !== undefined) return 'weapon';
  return null;
}

// ---------------------------------------------------------------------------
// Защита слота
// ---------------------------------------------------------------------------

/**
 * Активные слои защиты: набор строится в порядке LAYER_KEYS, слой
 * пропускается, если его incompatibleLayers пересекается с уже принятыми.
 */
/**
 * Записать слой защиты в слот, сохранив форму самого слота.
 *
 * Сейв хранит два вида слота: старый «толстый» ({ limb, plating, frame, … })
 * и новый ({ content, armorLayers }). Экраны писали слой на верхний уровень —
 * у нового вида он там ни на что не влияет: движок читает armorLayers, и выбор
 * обшивки в модалке просто пропадал.
 *
 * @param {object} slot — состояние слота
 * @param {'frame'|'plating'|'armor'} layer
 * @param {object|null} item — запись каталога слоёв (null — снять слой)
 * @returns {object} новый слот той же формы
 */
export function withArmorLayer(slot, layer, item = null) {
  if (!slot || typeof slot !== 'object') return slot;
  const layers = { ...normalizeSlot(slot).armorLayers, [layer]: item ?? null };

  const isNewShape = 'content' in slot || 'armorLayers' in slot
    || 'heldWeaponId' in slot || 'installedWeapons' in slot;
  if (isNewShape) return { ...slot, armorLayers: layers };

  // Старый вид: слои лежали на верхнем уровне. Примешивать armorLayers нельзя —
  // слот станет «новым» без content, и конечность потеряется.
  return { ...slot, [layer]: item ?? null };
}

export function activeArmorLayers(slot, options = {}) {
  const { catalog = getRobotLimbCatalog() } = options;
  const { armorLayers } = normalizeSlot(slot);
  const active = [];
  for (const key of LAYER_KEYS) {
    const raw = armorLayers[key];
    if (!raw) continue;
    // В новом формате сейва слой хранится id, в старом — объектом.
    const layer = typeof raw === 'string'
      ? (catalog?.armorLayers || []).find((entry) => entry.id === raw) || null
      : raw;
    if (!layer || typeof layer !== 'object') continue;
    const incompatible = Array.isArray(layer.incompatibleLayers) ? layer.incompatibleLayers : [];
    const conflicts = incompatible.some((blocked) => active.some((a) => a.key === blocked));
    if (conflicts) continue;
    active.push({ key, layer });
  }
  return active;
}

/**
 * Итоговая СУ слота: защита конечности + вклад совместимых слоёв.
 * Радиационная СУ — только от конечности, слои её не несут.
 *
 * @returns {{ physical: number, energy: number, rad: number }}
 */
export function totalDR(slot, options = {}) {
  const { catalog = getRobotLimbCatalog() } = options;
  const state = normalizeSlot(slot);
  const limb = resolveLimb(catalog, state.content);
  const result = {
    physical: toNumber(limb?.physicalDR),
    energy: toNumber(limb?.energyDR),
    rad: toNumber(limb?.radDR),
  };
  // Защита — свойство конечности. Нет конечности (пустой слот) или в слоте
  // оружие вместо руки — надетые слои защиты не считаются: это битое
  // состояние старого сейва, а не источник СУ.
  if (!slotAcceptsArmor(state, { catalog }).allowed) return result;

  for (const { layer } of activeArmorLayers(state, { catalog })) {
    const dr = layer.damageResistance || {};
    result.physical += toNumber(dr.physical);
    result.energy += toNumber(dr.energy);
  }
  return result;
}

// ---------------------------------------------------------------------------
// canEquip / slotAcceptsArmor
// ---------------------------------------------------------------------------

/**
 * Принимает ли слот защитный слой (броня / обшивка / рама).
 *
 * Пустой слот броню не принимает — нечего защищать.
 * Слот, занятый оружием вместо конечности, броню не принимает (§10.5).
 *
 * @param {object} slot  — состояние слота
 * @param {object} options — { item?, bodyPlan?, slotId?, catalog? }
 */
export function slotAcceptsArmor(slot, options = {}) {
  const { item, bodyPlan, slotId, catalog = getRobotLimbCatalog() } = options;
  const state = normalizeSlot(slot);
  const limb = resolveLimb(catalog, state.content);

  if (!limb) return deny('equip.error.noLimb');
  if (limb.itemCategory === 'weaponAsLimb') return deny('equip.error.slotRejectsArmor');

  if (item) {
    const def = getSlotDef(bodyPlan, slotId);
    if (def && item.limbType && !def.accepts.includes(item.limbType)) {
      return deny('equip.error.limbTypeMismatch');
    }
    for (const blocked of item.incompatibleLayers || []) {
      if (state.armorLayers[blocked]) return deny('equip.error.armorLayerIncompatible');
    }
  }
  return allow();
}

/**
 * Можно ли поместить предмет в слот.
 *
 * @param {object} slot — состояние слота
 * @param {object} item — конечность, оружие или защитный слой
 * @param {object} options — { bodyPlan, slotId, catalog? }
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function canEquip(slot, item, options = {}) {
  const { bodyPlan, slotId, catalog = getRobotLimbCatalog(), armPartsStrict = true } = options;
  const state = normalizeSlot(slot);
  const def = getSlotDef(bodyPlan, slotId);
  const kind = classifyItem(item);

  if (!kind) return deny('equip.error.unknownItem');
  if (!def) return deny('equip.error.invalidSlot');

  // --- Конечность или оружие вместо конечности ---
  if (kind === 'limb') {
    const entry = resolveLimb(catalog, item);
    // Навес — не конечность: он крепится К руке и живёт в её ладони
    // (ветка «оружие или навес в ладонь» ниже).
    if (item?.itemCategory === 'weaponAsLimb' || entry?.itemCategory === 'weaponAsLimb') {
      return deny('equip.error.attachmentNotALimb');
    }
    const limbType = item.limbType || entry?.limbType;
    if (!limbType) return deny('equip.error.limbTypeMismatch');
    if (!def.accepts.includes(limbType)) return deny('equip.error.limbTypeMismatch');
    // Снятие запрещено — значит и замена запрещена: замена это снять+поставить.
    if (state.content && def.swappable === false) return deny('equip.error.slotNotSwappable');
    return allow();
  }

  // --- Защитный слой ---
  if (kind === 'armorLayer') {
    return slotAcceptsArmor(slot, { ...options, item });
  }

  // --- Оружие или навес в ладонь ---
  // Навес (arm attachment) — оружие, которое крепится К руке: без руки его
  // получить нельзя (ветка limb выше это гарантирует), занимает ладонь наравне
  // с обычным оружием и меняется по правилу «аналогичное на аналогичное»
  // (строгий режим, настройка «прикрепляемые части рук»).
  const limb = resolveLimb(catalog, state.content);
  if (!limb || limb.itemCategory !== 'limb' || limb.canHoldWeapons !== true) {
    return deny('equip.error.limbCannotHoldWeapons');
  }
  const weaponSlots = limb.weaponSlots ?? 1;
  if (weaponSlots <= 0) return deny('equip.error.limbCannotHoldWeapons');

  const incomingIsAttachment = isArmAttachment(item, catalog);

  if (state.heldWeaponId) {
    // В ладони уже что-то есть — это замена, а не первая установка.
    const replaceCheck = canReplaceArmWeapon(slot?.heldWeapon ?? { id: state.heldWeaponId }, item, {
      strict: armPartsStrict,
      catalog,
    });
    if (!replaceCheck.allowed) return replaceCheck;
  }

  const weapon = resolveWeapon(catalog, item?.weaponId || item?.id);
  if (weapon && weapon.handheld === false && !incomingIsAttachment) {
    return deny('equip.error.weaponNotHandheld');
  }

  // Вес и двуручность — как в старой модели, поля те же. Навес весит как
  // рука, которой он крепится, — отдельных ограничений по весу у него нет.
  const maxWeight = limb.maxHandelWeaponWeight;
  if (!incomingIsAttachment && maxWeight != null && (item?.weight ?? 0) > maxWeight) {
    return deny('equip.error.weaponTooHeavyForLimb');
  }
  if (!incomingIsAttachment && limb.excludeTwoHanded && item?.twoHanded) {
    return deny('equip.error.limbExcludesTwoHandedWeapons');
  }
  return allow();
}

// ---------------------------------------------------------------------------
// Атаки слота
// ---------------------------------------------------------------------------

/**
 * Атаки, которые даёт слот: встроенная атака конечности И оружие в ладони.
 *
 * Возвращает СПИСОК, а не первое совпадение (§10.6). Порядок: сначала
 * оружие в ладони (то, что игрок положил), затем встроенное.
 *
 * Каждая запись помечена instanceKey = `${slotId}:${source}:${id}` — две
 * одинаковые руки дают две разные карточки, дедуп по id здесь запрещён.
 *
 * @param {object} slot
 * @param {object} options — { slotId?, catalog? }
 * @returns {object[]}
 */
export function attacksFromSlot(slot, options = {}) {
  const { slotId, catalog = getRobotLimbCatalog() } = options;
  const state = normalizeSlot(slot);
  const limb = resolveLimb(catalog, state.content);
  const result = [];
  if (!limb) return result;

  // Дедупликации здесь НЕТ: домен отдаёт каждую атаку как есть. Две руки с
  // одинаковыми манипуляторами — две атаки; оружие в ладони с тем же id, что
  // и установка, — тоже две сути. Склеивать одинаковые карточки — правило
  // экрана (dedupeWeaponCards), а не модели.
  const push = (weapon, source, modIds = []) => {
    if (!weapon) return;
    const id = typeof weapon === 'string' ? weapon : (weapon.id || weapon.weaponId);
    if (!id) return;
    const instanceKey = `${slotId ?? '?'}:${source}:${id}`;
    const resolved = materializeWeapon(catalog, weapon, modIds);
    result.push({
      ...resolved,
      id,
      source,
      slotId: slotId ?? null,
      instanceKey,
      modIds,
      appliedMods: modMap(catalog, modIds),
    });
  };

  // Оружие в ладони: только если конечность вообще умеет держать.
  // Оружие вместо руки (weaponAsLimb) ладони не имеет — вложенное оружие
  // ему не положено, как бы ни выглядело состояние старого сейва.
  const canHold = limb.itemCategory === 'limb'
    && limb.canHoldWeapons === true
    && (limb.weaponSlots ?? 1) > 0;

  if (state.heldWeaponId && canHold) {
    const held = resolveWeapon(catalog, state.heldWeaponId);
    // Навес в ладони законен даже при handheld === false: это не ручное
    // оружие человека, а оружие, крепящееся к руке (arm attachment).
    const heldIsAttachment = isArmAttachment({ id: state.heldWeaponId }, catalog);
    if (!held || held.handheld !== false || heldIsAttachment) {
      push(held || { id: state.heldWeaponId }, 'held', state.heldWeaponMods);
    }
  }

  // Собственная атака конечности. Экземпляр важнее каталога (в нём могут
  // быть моды и имя), каталог — источник характеристик.
  const { own } = splitLimbWeapons(limb, { catalog });
  const ownEntry = own[0] ?? null;
  if (ownEntry) {
    push(ownEntry, 'builtin');
  } else if (limb.itemCategory === 'weaponAsLimb' && limb.attackId) {
    push(limb.attackId, 'builtin');
  } else if (limb.builtinWeaponId) {
    push(limb.builtinWeaponId, 'builtin');
  } else if (limb.builtinManipulator) {
    // Наследие: рука-манипулятор без ссылки на оружие бьёт сама собой.
    result.push({
      ...limb,
      id: limb.id,
      source: 'builtin',
      slotId: slotId ?? null,
      instanceKey: `${slotId ?? '?'}:builtin:${limb.id}`,
      modIds: [],
      appliedMods: {},
      isManipulator: true,
    });
  }

  // Установленное в конечность оружие (апгрейд): своя карточка на каждый id.
  for (const installed of state.installedWeapons) {
    push(installed.id, 'installed', installed.modIds);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Сбор атак со всех слотов
// ---------------------------------------------------------------------------

/**
 * Атаки со всех слотов персонажа — единая точка вместо покомпонентного
 * обхода в вызывающем коде.
 *
 * Формат записи совпадает со старым getBuiltinWeaponsFromSlots
 * (id, weaponId, sourceSlot, sourceLimb, isBuiltin[, isManipulator]),
 * чтобы экраны и сейвы не менялись. Отличие одно и главное: дедупликация
 * идёт по ЭКЗЕМПЛЯРУ (слот + источник + id), а не по id оружия — две
 * одинаковые руки дают две карточки (их склейка — дело экрана).
 * Запись дополнительно несёт modIds и appliedMods: оружие в слоте хранится
 * id базы плюс список id установленных модов.
 *
 * @param {object} slots — состояние слотов персонажа
 * @param {object} options — { bodyPlan?, catalog? }
 * @returns {object[]}
 */
export function collectAttacks(slots, options = {}) {
  const { catalog = getRobotLimbCatalog() } = options;
  if (!slots || typeof slots !== 'object') return [];

  const result = [];
  const seenInstances = new Set();

  for (const [slotKey, slotData] of Object.entries(slots)) {
    if (!slotData) continue;
    const state = normalizeSlot(slotData);
    const limbId = typeof state.content === 'string' ? state.content : state.content?.id;
    const attacks = attacksFromSlot(slotData, { slotId: slotKey, catalog });

    for (const attack of attacks) {
      const instanceKey = attack.instanceKey || `${slotKey}:${attack.source}:${attack.id}`;
      if (seenInstances.has(instanceKey)) continue;
      seenInstances.add(instanceKey);

      // Экземпляр важнее каталога: в ладони лежит конкретный предмет
      // (моды, имя, состояние), а не абстрактная запись каталога.
      const stored = attack.source === 'held'
        ? (typeof slotData.heldWeapon === 'object' ? slotData.heldWeapon : null)
        : null;

      result.push({
        ...attack,
        ...(stored || {}),
        id: attack.id,
        weaponId: attack.weaponId || attack.id,
        sourceSlot: slotKey,
        sourceLimb: limbId ?? null,
        // Служебные поля нового домена в сейв и экраны не уходят.
        source: undefined,
        slotId: undefined,
        instanceKey: undefined,
        // Встроенная атака конечности и установленное в неё оружие — одно и то
        // же по смыслу: оружие, которым робот владеет сам, без инвентаря.
        ...(attack.source === 'builtin' || attack.source === 'installed'
          ? { isBuiltin: true }
          : {}),
        ...(attack.isManipulator ? { isManipulator: true } : {}),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Таблица попаданий
// ---------------------------------------------------------------------------

/**
 * Слот, в который попал бросок d20.
 *
 * @param {string|object} bodyPlan
 * @param {number} roll — 1..20
 * @returns {string|null} — id слота или null, если броска нет в таблице
 *                          (у плана может не быть hitTable — см. validateHitTable)
 */
export function resolveHit(bodyPlan, roll) {
  const plan = typeof bodyPlan === 'string' ? getBodyPlan(bodyPlan) : bodyPlan;
  const table = plan?.hitTable;
  if (!Array.isArray(table) || table.length === 0) return null;
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) return null;
  for (const row of table) {
    const [from, to] = row?.range || [];
    if (Number.isInteger(from) && Number.isInteger(to) && roll >= from && roll <= to) {
      return row.slotId ?? null;
    }
  }
  return null;
}

/**
 * Конечности, которые можно поставить в слот: тип берётся из плана тела
 * (`accepts`), а не из имени слота (`leftArm`, `startsWith('arm')`).
 *
 * Каталог передаётся тот, которым живёт экран (с локализованными именами);
 * тип конечности для каждой записи достаём из нового каталога по id.
 *
 * @param {object} runtimeCatalog — { robotArms?, robotHeads?, robotBody?, robotLegs? }
 * @param {string|object} bodyPlan
 * @param {string} slotId
 * @returns {object[]}
 */
export function limbOptionsForSlot(runtimeCatalog, bodyPlan, slotId) {
  const def = getSlotDef(bodyPlan, slotId);
  const accepts = def?.accepts ?? [];
  if (accepts.length === 0) return [];

  const catalog = getRobotLimbCatalog();
  const pool = [
    ...(runtimeCatalog?.robotArms || []),
    ...(runtimeCatalog?.robotHeads || []),
    ...(runtimeCatalog?.robotBody || []),
    ...(runtimeCatalog?.robotLegs || []),
  ];
  return pool.filter((limb) => {
    const entry = resolveLimb(catalog, limb);
    // Навес — не конечность: в пикер замены руки он не попадает,
    // крепится к руке и меняется из инвентаря (правило «arm attachment»).
    if (entry?.itemCategory === 'weaponAsLimb') return false;
    return accepts.includes(entry?.limbType);
  });
}

/**
 * Диапазон d20, который ведёт в этот слот, — обратная сторона resolveHit.
 * Нужна экранам: таблица попаданий показывает «слот → числа», а бросок
 * разбирается resolveHit.
 *
 * @param {string|object} bodyPlan
 * @param {string} slotId
 * @returns {{ from: number, to: number } | null} — null, если у плана нет
 *          hitTable (такие планы пока есть; см. validateHitTable)
 */
export function getSlotHitRange(bodyPlan, slotId) {
  const plan = typeof bodyPlan === 'string' ? getBodyPlan(bodyPlan) : bodyPlan;
  const table = plan?.hitTable;
  if (!Array.isArray(table) || !slotId) return null;
  const row = table.find((entry) => entry?.slotId === slotId);
  const [from, to] = row?.range || [];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  return { from, to };
}

/**
 * Проверка целостности таблицы попаданий плана тела.
 *
 * Отсутствие таблицы — не ошибка (диапазоны известны не для всех планов),
 * но предупреждение: пока её нет, resolveHit() вернёт null.
 *
 * @returns {{ ok: boolean, errors: string[], warnings: string[], covered: number[] }}
 */
export function validateHitTable(bodyPlan) {
  const plan = typeof bodyPlan === 'string' ? getBodyPlan(bodyPlan) : bodyPlan;
  const planId = plan?.id ?? String(bodyPlan);
  const errors = [];
  const warnings = [];
  const table = plan?.hitTable;

  if (!Array.isArray(table) || table.length === 0) {
    warnings.push(`${planId}: нет hitTable — resolveHit() вернёт null`);
    return { ok: true, errors, warnings, covered: [] };
  }

  const slotIds = (plan?.slots || []).map((s) => (typeof s === 'string' ? s : s?.id));
  const covered = [];
  for (const row of table) {
    const [from, to] = row?.range || [];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
      errors.push(`${planId}: кривой диапазон ${JSON.stringify(row?.range)}`);
      continue;
    }
    if (!slotIds.includes(row.slotId)) {
      errors.push(`${planId}: hitTable ссылается на несуществующий слот "${row.slotId}"`);
    }
    for (let n = from; n <= to; n += 1) covered.push(n);
  }

  const unique = new Set(covered);
  if (unique.size !== covered.length) {
    errors.push(`${planId}: в hitTable есть наложения диапазонов`);
  }
  for (let n = 1; n <= 20; n += 1) {
    if (!unique.has(n)) {
      errors.push(`${planId}: hitTable не покрывает значение ${n}`);
      break;
    }
  }

  return { ok: errors.length === 0, errors, warnings, covered: [...unique].sort((a, b) => a - b) };
}
