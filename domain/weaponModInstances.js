// domain/weaponModInstances.js
//
// 399: сверка «записи модов ↔ слоты оружия» при загрузке сейва
// (модель владельца: мод — осязаемая запись; установленный мод — та же
// запись со статусом «вставлен в оружие X, слот Y»).
//
// Контракт (слово владельца, «бутылки»):
//   • свободные одинаковые моды — одна пачка в сумке, безличны («та, что
//     под руку попалась»);
//   • установка = штука из пачки получает пару «хост + мод» (хост — ключ
//     предмета оружия или синтетический robotSlot:...; мод — каталожный id
//     в appliedMods/modIds самого оружия: «оружие получает id от мода»);
//   • снятие = пара стирается, штука возвращается в пачку без памяти;
//   • продали/удалили оружие — моды уходят вместе (344, уже в сторе);
//   • при загрузке сверка ПО НЕДОСТАТКУ: добавляется ровно недостающее,
//     лишние связанные записи возвращаются в пачку → повторная загрузка
//     никогда ничего не добавляет (анти-двоение, требование владельца);
//   • моды из комплекта = обычные моды («пульт с батарейками со старта
//     внутри — тот же пульт, в который батарейки вставили позже»).
//
// 400 (владелец: «поведение модов универсально»): закон ОДИН для всех
// семей модов. Роли «хост|мод» дают: оружие (appliedMods), слоты роботов
// (heldWeapon/builtinWeapons: modIds+appliedMods), броня/одежда (три
// именных поля appliedArmorModId / appliedUniqueArmorModId /
// appliedClothingModId). Моды «своей атаки» лапы (limb.ownWeaponMods)
// не перечисляются здесь: их записи ведёт экран (359), а освобождение
// при замене конечности делает releaseRobotSlotMods — связки robotSlot:
// сверкой не трогаются, чтобы не судить о синтетическом хосте ошибочно.

import { generateStackKey } from './itemIdentity';

// 400: три именных слота брони/одежды (по одному моду каждого вида).
const ARMOR_MOD_FIELDS = [
  ['appliedArmorModId', 'armor'],
  ['appliedUniqueArmorModId', 'uniqueArmor'],
  ['appliedClothingModId', 'clothing'],
];

// Синтетический ключ-носитель оружия в слоте робота. Формат владельца —
// robotWeaponHostKey в src/engine/items/weaponMods.ts; заслон 399
// фиксирует совпадение формата (domain не импортирует engine).
export const robotWeaponHostKeyOf = (slotKey, weaponId) =>
  `robotSlot:${slotKey}:${weaponId ?? 'unknown'}`;

// Все каталожные id модов на оружии-карточке: список modIds + карта appliedMods.
const modIdsOf = (weapon) => {
  const ids = [];
  if (Array.isArray(weapon?.modIds)) {
    ids.push(...weapon.modIds.filter((id) => typeof id === 'string'));
  }
  if (weapon?.appliedMods && typeof weapon.appliedMods === 'object') {
    ids.push(...Object.values(weapon.appliedMods).filter((id) => typeof id === 'string'));
  }
  return ids;
};

/**
 * Приводит записи модов оружия к слотам оружия по недостатку.
 * Идемпотентно: второй прогон на согласованных данных — no-op.
 *
 * @param {object} state — состояние персонажа (мутируется items при ремонте)
 * @param {Set<string>} weaponModIds — id оружейных модов каталога
 * @returns {object} то же состояние
 */
export function syncWeaponModInstances(state, weaponModIds) {
  if (!state || typeof state !== 'object') return state;
  const isTrackedMod = (id) => typeof id === 'string' && weaponModIds instanceof Set && weaponModIds.has(id);
  const items = state.items && typeof state.items === 'object' ? state.items : {};

  // 1) Роли «хост|мод»: слоты оружия в инвентаре + робо-слоты.
  const roles = new Map();
  const addRole = (hostKey, modId, slot) => {
    if (!isTrackedMod(modId)) return;
    const pair = `${hostKey}|${modId}`;
    if (!roles.has(pair)) roles.set(pair, { hostKey, modId, slot: slot || null });
  };
  for (const [key, item] of Object.entries(items)) {
    if (!item || typeof item !== 'object') continue;
    // 400: броня/одежда — три именных слота на предмете.
    for (const [field, label] of ARMOR_MOD_FIELDS) {
      if (typeof item[field] === 'string' && item[field]) addRole(key, item[field], label);
    }
    const hostId = String(item.weaponId || '');
    if (!hostId.startsWith('weapon_') || isTrackedMod(hostId)) continue;
    const applied = item.appliedMods;
    if (applied && typeof applied === 'object') {
      for (const [slot, modId] of Object.entries(applied)) addRole(key, modId, slot);
    }
  }
  const slots = state.robot?.slots || state.robots?.slots || {};
  for (const [slotKey, slotData] of Object.entries(slots)) {
    const weapons = [
      ...(Array.isArray(slotData?.limb?.builtinWeapons) ? slotData.limb.builtinWeapons : []),
      ...(slotData?.heldWeapon ? [slotData.heldWeapon] : []),
    ];
    for (const weapon of weapons) {
      if (!weapon || typeof weapon !== 'object') continue;
      for (const modId of modIdsOf(weapon)) {
        addRole(robotWeaponHostKeyOf(slotKey, weapon.weaponId || weapon.id || null), modId, null);
      }
    }
  }

  // 2) Текущие записи: связанные (installedOn) и свободные (пачка).
  const boundByPair = new Map();
  const boundKeys = new Set();
  const freeByMod = new Map();
  for (const [key, item] of Object.entries(items)) {
    if (!item || typeof item !== 'object' || !isTrackedMod(item.weaponId)) continue;
    if (item.installedOn) {
      boundKeys.add(key);
      const pair = `${item.installedOn}|${item.weaponId}`;
      if (!boundByPair.has(pair)) boundByPair.set(pair, []);
      boundByPair.get(pair).push(key);
    } else if (!item.equipped) {
      if (!freeByMod.has(item.weaponId)) freeByMod.set(item.weaponId, []);
      freeByMod.get(item.weaponId).push(key);
    }
  }

  const next = { ...items };
  let changed = false;
  const unbind = (key) => {
    next[key] = { ...next[key], equipped: false };
    delete next[key].installedOn;
    delete next[key].installedSlot;
    changed = true;
  };

  // 3) Каждой роли — ровно одна связанная запись (по недостатку).
  let counter = 1;
  for (const role of roles.values()) {
    const pair = `${role.hostKey}|${role.modId}`;
    let bound = boundByPair.get(pair) || [];
    if (bound.length > 1) {
      // Задвоение из старых сейвов/повторных прогонов: первая остаётся, прочие — в пачку.
      for (const key of bound.slice(1)) {
        unbind(key);
        boundKeys.delete(key);
      }
      bound = [bound[0]];
      boundByPair.set(pair, bound);
    }
    if (bound.length === 1) {
      // Пара есть: восстановить слот на записи, если известен и не записан.
      const [key] = bound;
      if (role.slot && !next[key].installedSlot) {
        next[key] = { ...next[key], installedSlot: role.slot };
        changed = true;
      }
      continue;
    }
    // Недостаток: взять свободную штуку из пачки…
    const free = (freeByMod.get(role.modId) || [])
      .filter((key) => next[key] && !next[key].installedOn && !next[key].equipped);
    if (free.length > 0) {
      const key = free[0];
      freeByMod.set(role.modId, free.slice(1));
      next[key] = {
        ...next[key],
        equipped: true,
        installedOn: role.hostKey,
        ...(role.slot ? { installedSlot: role.slot } : {}),
      };
      changed = true;
      continue;
    }
    // …или создать запись (кит, старый сейв): «пульт с батарейками» —
    // самый обычный мод. stackKey без модов = стек обычной штуки в пачке.
    let key = `inst-${role.modId}-sync${counter}`;
    while (next[key]) {
      counter += 1;
      key = `inst-${role.modId}-sync${counter}`;
    }
    counter += 1;
    next[key] = {
      id: key,
      instanceId: key,
      weaponId: role.modId,
      itemType: 'weaponMod',
      quantity: 1,
      equipped: true,
      installedOn: role.hostKey,
      ...(role.slot ? { installedSlot: role.slot } : {}),
      stackKey: generateStackKey(role.modId),
    };
    changed = true;
  }

  // 4) Осиротевшие связанные записи (хост пропал или мод со слота снят) —
  // обратно в пачку, без памяти о прошлом («сольёл воду — пустая бутылка»).
  // Связки robotSlot: не судятся здесь: их хост синтетический, освобождение
  // при замене конечности делает releaseRobotSlotMods (закон 359).
  for (const key of boundKeys) {
    const item = next[key];
    if (!item || !item.installedOn) continue;
    if (String(item.installedOn).startsWith('robotSlot:')) continue;
    const pair = `${item.installedOn}|${item.weaponId}`;
    if (!roles.has(pair)) unbind(key);
  }

  if (changed) state.items = next;
  return state;
}
