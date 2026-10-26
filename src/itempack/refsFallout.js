// src/itempack/refsFallout.js
// Снимок справочников активного сеттинга для валидатора паков.
// Идём ТОЛЬКО через дверь сеттинга (modules/fallout/index.js → SETTING) —
// закон «одна дверь» (патч 292): тест границы settings-boundary следит,
// чтобы вне modules/** внутренности сеттинга не импортировались.
// Генератор item-forge читает справочники через ту же дверь: приложение и
// генератор сверяются с идентичным снимком каталогов.

import { SETTING } from '../../modules/fallout/index.js';

// Дополнения к множествам, выводимым из данных: перечень атрибутов и шкал
// в данных не записан — он часть движка.
const DERIVED_EXTRAS = {
  attrs: ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK'],
  ranges: ['C', 'M', 'L'],
  damageTypes: ['physical', 'energy', 'radiation', 'poison', 'explosive', 'special'],
};

const flat = (arr) => (Array.isArray(arr) ? arr : Object.values(arr ?? {}));

export function buildFalloutRefs() {
  const equipment = SETTING.data?.equipment ?? {};
  const weaponList = flat(equipment.weapons);
  const modList = flat(equipment.weaponMods);
  const ammoList = flat(equipment.ammo);
  const slotMaps = equipment.weaponModSlots ?? {};
  const qualities = flat(SETTING.names?.['ru-RU']?.system?.qualities);
  const damageEffects = flat(SETTING.names?.['ru-RU']?.system?.damageEffects);

  const weaponTypes = new Set();
  const skills = new Set();
  const damageTypes = new Set(DERIVED_EXTRAS.damageTypes);
  for (const w of weaponList) {
    if (w?.weaponType) weaponTypes.add(w.weaponType);
    if (w?.mainSkill) skills.add(w.mainSkill);
    const dts = Array.isArray(w?.damageType) ? w.damageType : [w?.damageType];
    for (const d of dts) if (d) damageTypes.add(d);
  }

  const slots = new Set();
  for (const slotMap of Object.values(slotMaps)) {
    for (const slot of Object.keys(slotMap || {})) slots.add(slot);
  }
  for (const m of modList) if (m?.slot) slots.add(m.slot);

  return {
    weaponIds: new Set(weaponList.map((w) => w?.id).filter(Boolean)),
    modIds: new Set(modList.map((m) => m?.id).filter(Boolean)),
    ammoIds: new Set(ammoList.map((a) => a?.id).filter(Boolean)),
    qualityIds: new Set(qualities.map((q) => q?.id).filter(Boolean)),
    effectIds: new Set(damageEffects.map((e) => e?.id).filter(Boolean)),
    modById: new Map(modList.map((m) => [m?.id, m])),
    weaponTypes,
    damageTypes,
    skills,
    attrs: new Set(DERIVED_EXTRAS.attrs),
    ranges: new Set(DERIVED_EXTRAS.ranges),
    slots,
  };
}
