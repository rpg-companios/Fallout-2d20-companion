// src/itempack/runtime.js
// Мост «список установленных паков» → «оверлей каталога».
// Каталог приложения (i18n/equipmentCatalog.getEquipmentCatalog) читает
// оверлей здесь и смешивает с данными сеттинга; лавка/лут/инвентарь/окно
// модов получают пакеты автоматически (все идут через catalogSource →
// getEquipmentCatalog — единая точка).
//
// НЕ импортирует ничего из приложения (разрыв циклов: equipmentCatalog →
// runtime → contract). Синхронизацию реестра держит contentPackStore.

import { normalizeAudience } from './contract';

let installedPacks = [];

/** Установить полный список установленных паков (заместительно). */
export const setInstalledContentPacks = (packs) => {
  installedPacks = Array.isArray(packs) ? packs : [];
};

export const getInstalledContentPacks = () => installedPacks;

/** Имя/описание id в текущей локали; нет перевода — по закону показываем id. */
const localizedEntry = (pack, locale, id) => {
  const entry = pack?.names?.[locale]?.[id];
  if (entry && typeof entry.name === 'string' && entry.name !== '') {
    return { name: entry.name, description: entry.description ?? '' };
  }
  return { name: id, description: '' };
};

const audienceList = (audience) => {
  const norm = normalizeAudience(audience);
  if (norm === 'all' || norm === 'invalid') return ['human', 'mutant', 'robot'];
  return norm;
};

/**
 * Оверлей каталога из установленных паков под локаль.
 * → { weapons, robotWeapons, weaponMods, ammoTypes, modsOverrides }
 *
 * Каждая паковая запись несёт метки { isPackItem: true, packId } — по ним
 * обзорные списки (446: модал добавления) не смешивают самодельное с
 * общим каталогом, а собирают в своей категории «Самодельное снаряжение»;
 * механические потребители (лавка/лут/окно модов) на метки смотреть
 * не обязаны — их контракт не менялся.
 */
export const buildPackCatalogOverlay = (locale) => {
  const weapons = [];
  const robotWeapons = [];
  const weaponMods = [];
  const ammoTypes = [];
  const modsOverrides = {};

  for (const pack of installedPacks) {
    const items = pack?.items || {};
    const packId = pack?.manifest?.packId;
    const tag = { isPackItem: true, packId };

    for (const w of items.weapons ?? []) {
      const loc = localizedEntry(pack, locale, w.id);
      const record = { ...w, ...loc, ...tag, itemType: 'weapon' };
      const aud = audienceList(w.audience);
      const isRobot = aud.includes('robot');
      const isHumanSide = aud.includes('human') || aud.includes('mutant');
      if (isRobot) robotWeapons.push({ ...record, isRobotWeapon: true });
      if (isHumanSide) weapons.push(record);
      if (w.modSlots && typeof w.modSlots === 'object') {
        // Пер-оружейная карта слотов (модель human-оружия). Робо-слоты
        // дополнительно выводятся из applies_to_ids модов на стороне
        // catalogSource — туда же попадают и наши моды.
        modsOverrides[w.id] = w.modSlots;
      }
    }

    for (const m of items.weaponMods ?? []) {
      const loc = localizedEntry(pack, locale, m.id);
      weaponMods.push({ ...m, ...loc, ...tag, modType: 'weapon' });
    }

    for (const a of items.ammo ?? []) {
      const loc = localizedEntry(pack, locale, a.id);
      ammoTypes.push({ ...a, ...loc, ...tag, itemType: 'ammo', type: 'ammo' });
    }
  }

  return { weapons, robotWeapons, weaponMods, ammoTypes, modsOverrides };
};
