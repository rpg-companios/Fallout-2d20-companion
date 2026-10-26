// src/itempack/validate.js
// Валидатор паков контента v1. Один проход собирает ВСЕ ошибки с путями
// (`items.weapons[2].qualities[0]: неизвестный id …`) — закон контракта
// сеттинга: битое отклоняем явно, чужое не «подчищаем».
//
// refs — снимок справочников активного сеттинга (см. refsFallout.js):
//   { weaponIds, modIds, ammoIds, qualityIds, effectIds, weaponTypes,
//     damageTypes, skills, attrs, ranges, slots } — все Set.

import {
  ITEM_PACK_FORMAT,
  PACK_LOCALES,
  AUDIENCES,
  RESERVED_KEYS,
  ITEM_COLLECTIONS,
  MOD_OPS,
  QUALITY_CHANGE_OPS,
  MOD_RARITIES,
  PACK_ID_PATTERN,
  itemIdPrefix,
} from './contract';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';
const numLike = (v) => isNum(v) || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));

export function validateContentPack(pack, refs) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });

  if (!isObj(pack)) {
    return { ok: false, errors: [{ path: '(корень)', message: 'не объект JSON' }], pack: null };
  }

  if (pack.itemPackFormat !== ITEM_PACK_FORMAT) {
    err('itemPackFormat', `ожидается ${ITEM_PACK_FORMAT}, получено ${JSON.stringify(pack.itemPackFormat)}`);
  }

  // Резервы будущих версий — явный отказ, не молчание.
  for (const key of RESERVED_KEYS) {
    if (key in pack) {
      err(key, 'зарезервировано под будущую версию формата (интерпретатор влияний — отдельный этап)');
    }
  }

  // ── manifest ────────────────────────────────────────────────────────────
  const manifest = isObj(pack.manifest) ? pack.manifest : null;
  if (!manifest) {
    err('manifest', 'нет объекта manifest');
  } else {
    if (!PACK_ID_PATTERN.test(manifest.packId || '')) {
      err('manifest.packId', 'латиница: строчные буквы/цифры/подчёркивание, начинается с буквы');
    }
    if (!isNonEmptyStr(manifest.name)) err('manifest.name', 'обязательно (непустая строка)');
    if (!PACK_LOCALES.includes(manifest.locale)) {
      err('manifest.locale', `должно быть одной из: ${PACK_LOCALES.join(', ')}`);
    }
  }
  const packId = manifest?.packId || '';
  const prefix = itemIdPrefix(packId);

  // ── names ────────────────────────────────────────────────────────────────
  const names = isObj(pack.names) ? pack.names : null;
  if (!names) err('names', 'нет объекта names');

  // ── items ────────────────────────────────────────────────────────────────
  const items = isObj(pack.items) ? pack.items : null;
  if (!items) {
    err('items', 'нет объекта items');
  } else {
    for (const key of Object.keys(items)) {
      if (!ITEM_COLLECTIONS.includes(key)) {
        err(`items.${key}`, `неизвестная коллекция (в прототипе: ${ITEM_COLLECTIONS.join(', ')})`);
      }
    }
  }

  const packWeaponIds = new Set();
  const packModIds = new Set();
  const packAmmoIds = new Set();
  const allItemIds = new Set();
  const collectId = (set, id, path) => {
    if (!isNonEmptyStr(id)) { err(`${path}.id`, 'обязателен'); return; }
    if (!id.startsWith(prefix)) err(`${path}.id`, `должен начинаться с "${prefix}" (свои id — только свои)`);
    if (allItemIds.has(id)) err(`${path}.id`, `дубль id "${id}" внутри пака`);
    allItemIds.add(id);
    set.add(id);
  };

  const checkNamesForId = (id, path) => {
    if (!manifest?.locale || !names) return;
    const entry = names[manifest.locale]?.[id];
    if (!isObj(entry) || !isNonEmptyStr(entry.name)) {
      err(`names.${manifest.locale}.${id}`, `нет имени на основной локали "${manifest.locale}" (другие локали необязательны — без перевода показывается id)`);
    }
  };

  const checkModifiers = (obj, fields, path) => {
    for (const field of fields) {
      const mod = obj[field];
      if (mod === undefined) continue;
      if (!isObj(mod)) { err(`${path}.${field}`, 'ожидается {op, value}'); continue; }
      if (!MOD_OPS.includes(mod.op)) err(`${path}.${field}.op`, `допустимо: ${MOD_OPS.join(', ')} (× и ÷ — с интерпретатором влияний позже)`);
      if (!numLike(mod.value)) err(`${path}.${field}.value`, 'ожидается число');
    }
  };

  const checkChangeList = (list, idsRef, path, label) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) { err(path, 'ожидается массив'); return; }
    list.forEach((c, i) => {
      const p = `${path}[${i}]`;
      if (!isObj(c)) { err(p, 'ожидается объект'); return; }
      if (!QUALITY_CHANGE_OPS.includes(c.op)) err(`${p}.op`, `допустимо: ${QUALITY_CHANGE_OPS.join('/')}`);
      if (!idsRef.has(c.id)) err(`${p}.id`, `неизвестный ${label} "${c.id}"`);
    });
  };

  // weapons
  const weapons = items?.weapons ?? [];
  if (items && weapons !== undefined && !Array.isArray(weapons)) err('items.weapons', 'ожидается массив');
  (Array.isArray(weapons) ? weapons : []).forEach((w, i) => {
    const p = `items.weapons[${i}]`;
    if (!isObj(w)) { err(p, 'ожидается объект'); return; }
    collectId(packWeaponIds, w.id, p);
    checkNamesForId(w.id, p);

    if (!refs.weaponTypes.has(w.weaponType)) {
      if (isNonEmptyStr(w.weaponType)) {
        err(`${p}.weaponType`, `"${w.weaponType}" не из каталога сеттинга — свои категории пока не поддержаны (этап за P)`);
      } else {
        err(`${p}.weaponType`, `обязателен (${Array.from(refs.weaponTypes).join('/')})`);
      }
    }
    const dt = Array.isArray(w.damageType) ? w.damageType : [w.damageType];
    if (dt.length === 0 || dt.some((d) => !refs.damageTypes.has(d))) {
      err(`${p}.damageType`, `допустимо (${Array.from(refs.damageTypes).join('/')}); свои типы урона запрещены`);
    }
    if (!isNum(w.damage)) err(`${p}.damage`, 'обязателен (число кубов)');
    if (!isNum(w.fireRate)) err(`${p}.fireRate`, 'обязателен (число)');
    if (!refs.ranges.has(w.range)) err(`${p}.range`, `допустимо: ${Array.from(refs.ranges).join('/')}`);
    if (w.ammoId !== undefined && w.ammoId !== null && w.ammoId !== '') {
      if (!refs.ammoIds.has(w.ammoId) && !packAmmoIds.has(w.ammoId) && !((items?.ammo ?? []).some?.((a) => a?.id === w.ammoId))) {
        err(`${p}.ammoId`, `неизвестный боеприпас "${w.ammoId}" (свои патроны — в items.ammo этого же пака)`);
      }
    }
    if (!refs.attrs.has(w.mainAttr)) err(`${p}.mainAttr`, `допустимо: ${Array.from(refs.attrs).join('/')}`);
    if (!refs.skills.has(w.mainSkill)) err(`${p}.mainSkill`, `допустимы навыки каталога (набор из данных сеттинга)`);
    if (!numLike(w.weight)) err(`${p}.weight`, 'обязателен (число)');
    if (!isNum(w.cost)) err(`${p}.cost`, 'обязателен (число)');
    if (!isNum(w.rarity)) err(`${p}.rarity`, 'обязателен (число 0–3)');

    (w.qualities ?? []).forEach((q, j) => {
      const qq = q?.qualityId ?? q;
      if (!refs.qualityIds.has(qq)) err(`${p}.qualities[${j}]`, `неизвестное качество "${qq}"`);
    });
    (w.effects ?? []).forEach((e, j) => {
      const ee = e?.effectId ?? e;
      if (!refs.effectIds.has(ee)) err(`${p}.effects[${j}]`, `неизвестный эффект урона "${ee}"`);
    });

    // Аудитория: 'all' или массив/строка из AUDIENCES.
    if (w.audience !== undefined && w.audience !== 'all') {
      const list = Array.isArray(w.audience) ? w.audience : [w.audience];
      if (list.length === 0 || list.some((a) => !AUDIENCES.includes(a))) {
        err(`${p}.audience`, `допустимо: "all" или подмножество [${AUDIENCES.join(', ')}]`);
      }
    }

    // Слоты модов: только для СВОИХ оружий пака; ссылки — ванильные
    // моды (с проверкой совпадения слота) или свои моды из этого пака.
    if (w.modSlots !== undefined) {
      if (!isObj(w.modSlots) || Object.keys(w.modSlots).length === 0) {
        err(`${p}.modSlots`, 'ожидается непустой объект {Слот: [id мода, …]}');
      } else {
        for (const [slot, modIds] of Object.entries(w.modSlots)) {
          if (!refs.slots.has(slot)) err(`${p}.modSlots.${slot}`, `неизвестный слот (каталог: ${Array.from(refs.slots).join(', ')})`);
          if (!Array.isArray(modIds) || modIds.length === 0) {
            err(`${p}.modSlots.${slot}`, 'ожидается непустой массив id модов');
            continue;
          }
          modIds.forEach((mid, j) => {
            const own = items?.weaponMods?.some?.((m) => m?.id === mid);
            if (!own && !refs.modIds.has(mid)) {
              err(`${p}.modSlots.${slot}[${j}]`, `неизвестный мод "${mid}"`);
              return;
            }
            if (!own) {
              const mod = refs.modById?.get(mid);
              if (mod && mod.slot !== slot) {
                err(`${p}.modSlots.${slot}[${j}]`, `мод "${mid}" принадлежит слоту "${mod.slot}"`);
              }
            }
          });
        }
      }
    }
  });

  // weaponMods
  const mods = items?.weaponMods ?? [];
  if (items && mods !== undefined && !Array.isArray(mods)) err('items.weaponMods', 'ожидается массив');
  (Array.isArray(mods) ? mods : []).forEach((m, i) => {
    const p = `items.weaponMods[${i}]`;
    if (!isObj(m)) { err(p, 'ожидается объект'); return; }
    collectId(packModIds, m.id, p);
    checkNamesForId(m.id, p);

    if (!refs.slots.has(m.slot)) {
      err(`${p}.slot`, `обязателен из каталога (${Array.from(refs.slots).join(', ')})`);
    }
    if (!Array.isArray(m.applies_to_ids) || m.applies_to_ids.length === 0) {
      err(`${p}.applies_to_ids`, 'непустой массив id оружия (своего из пака и/или ванильного)');
    } else {
      m.applies_to_ids.forEach((wid, j) => {
        if (!refs.weaponIds.has(wid) && !(items?.weapons ?? []).some?.((w) => w?.id === wid)) {
          err(`${p}.applies_to_ids[${j}]`, `неизвестное оружие "${wid}"`);
        }
      });
    }
    if (!isNum(m.cost)) err(`${p}.cost`, 'обязателен (число)');
    if (!numLike(m.weight)) err(`${p}.weight`, 'обязателен (число)');
    if (m.complexity !== undefined && !isNum(m.complexity)) err(`${p}.complexity`, 'число');
    if (m.rarity !== undefined && m.rarity !== '' && !MOD_RARITIES.includes(m.rarity)) {
      err(`${p}.rarity`, `допустимо: ${MOD_RARITIES.join('/')}`);
    }
    checkModifiers(m, ['damageModifier', 'fireRateModifier', 'rangeModifier'], p);
    if (m.ammoOverride !== undefined && m.ammoOverride !== null && m.ammoOverride !== '') {
      if (!refs.ammoIds.has(m.ammoOverride) && !(items?.ammo ?? []).some?.((a) => a?.id === m.ammoOverride)) {
        err(`${p}.ammoOverride`, `неизвестный боеприпас "${m.ammoOverride}"`);
      }
    }
    const dto = m.damageTypeOverride;
    if (dto !== undefined && dto !== null && dto !== '') {
      const list = Array.isArray(dto) ? dto : [dto];
      if (list.some((d) => !refs.damageTypes.has(d))) {
        err(`${p}.damageTypeOverride`, `допустимо (${Array.from(refs.damageTypes).join('/')})`);
      }
    }
    checkChangeList(m.qualityChanges, refs.qualityIds, `${p}.qualityChanges`, 'качество');
    checkChangeList(m.effectChanges, refs.effectIds, `${p}.effectChanges`, 'эффект урона');
  });

  // ammo
  const ammo = items?.ammo ?? [];
  if (items && ammo !== undefined && !Array.isArray(ammo)) err('items.ammo', 'ожидается массив');
  (Array.isArray(ammo) ? ammo : []).forEach((a, i) => {
    const p = `items.ammo[${i}]`;
    if (!isObj(a)) { err(p, 'ожидается объект'); return; }
    collectId(packAmmoIds, a.id, p);
    checkNamesForId(a.id, p);
    if (!isNum(a.rarity)) err(`${p}.rarity`, 'обязателен (число 0–3)');
    if (!isNum(a.cost)) err(`${p}.cost`, 'обязателен (число)');
    if (!numLike(a.weight)) err(`${p}.weight`, 'обязателен (число)');
  });

  // Перекрёстная сверка: собственный мод в modSlots оружия пака должен
  // заявлять это оружие в applies_to_ids (двусторонняя согласованность —
  // людские слоты едут по карте, робо-слоты — выводом из applies_to_ids).
  (Array.isArray(weapons) ? weapons : []).forEach((w, i) => {
    if (!isObj(w) || !isObj(w.modSlots)) return;
    for (const [slot, modIds] of Object.entries(w.modSlots)) {
      for (const mid of modIds ?? []) {
        if (!packModIds.has(mid)) continue;
        const mod = (items?.weaponMods ?? []).find((m) => m?.id === mid);
        if (!mod) continue;
        if (mod.slot !== slot) {
          err(`items.weapons[${i}].modSlots.${slot}`, `свой мод "${mid}" заявил слот "${mod.slot}" — не совпадает`);
        }
        if (!(mod.applies_to_ids ?? []).includes(w.id)) {
          err(`items.weaponMods.applies_to_ids`, `мод "${mid}" назначен оружию "${w.id}" в modSlots, но не заявляет его в applies_to_ids`);
        }
      }
    }
  });

  if (!(Array.isArray(weapons) ? weapons : []).length
      && !(Array.isArray(mods) ? mods : []).length
      && !(Array.isArray(ammo) ? ammo : []).length) {
    err('items', 'пак пуст: ни одного предмета (weapons/weaponMods/ammo)');
  }

  return { ok: errors.length === 0, errors, pack };
}
