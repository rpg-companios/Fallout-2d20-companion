// item-forge/src/catalogs.ts
// Справочники Кузницы — из ЛОКАЛЬНОГО слепка src/data/forge-refs.json
// (GENERATED: npm run sync читает сеттинг основного репозитория
// Fallout-2d20-companion — «данные для кастомного арсенала храним у себя»,
// решение владельца 2026-10-19). Кузница самодостаточна: рантайм и сборка
// внешних файлов не читают; руками слепок не править — refresh = npm run sync.
//
// Подписи UI — ru-RU (основная локаль проекта); имена пакета в пак идут
// из формы предмета отдельно.

import refsData from './data/forge-refs.json';
import { AUDIENCES, MOD_OPS, QUALITY_CHANGE_OPS, MOD_RARITIES } from './itempack/contract.js';

export { AUDIENCES, MOD_OPS, QUALITY_CHANGE_OPS, MOD_RARITIES };

export interface Option { id: string; label: string; }

interface RefEntry { id: string; name: string; nameEn?: string; slot?: string; weaponType?: string; }

// Снимок справочников в форме refs валидатора (см. itempack/validate.js).
// Все множества — Set; моды — также Map для проверки слота.
export const refs = {
  weaponIds: new Set((refsData.weapons as RefEntry[]).map((w) => w.id)),
  modIds: new Set((refsData.mods as RefEntry[]).map((m) => m.id)),
  ammoIds: new Set((refsData.ammo as RefEntry[]).map((a) => a.id)),
  qualityIds: new Set((refsData.qualities as RefEntry[]).map((q) => q.id)),
  effectIds: new Set((refsData.effects as RefEntry[]).map((e) => e.id)),
  modById: new Map((refsData.mods as RefEntry[]).map((m) => [m.id, m])),
  weaponTypes: new Set(refsData.weaponTypes),
  damageTypes: new Set(refsData.damageTypes),
  skills: new Set(refsData.skills),
  attrs: new Set(refsData.attrs),
  ranges: new Set(refsData.ranges),
  slots: new Set(refsData.slots),
};

const toOption = (e: RefEntry): Option => ({ id: e.id, label: e.name ?? e.id });

export const QUALITY_OPTIONS: Option[] = (refsData.qualities as RefEntry[]).map(toOption);
export const EFFECT_OPTIONS: Option[] = (refsData.effects as RefEntry[]).map(toOption);
export const AMMO_OPTIONS: Option[] = (refsData.ammo as RefEntry[]).map(toOption);
export const VANILLA_WEAPON_OPTIONS: Option[] = (refsData.weapons as RefEntry[]).map(toOption);

/** Ванильные моды по слотам (для редактора modSlots): slot → опции. */
export const MOD_OPTIONS_BY_SLOT: Record<string, Option[]> = (() => {
  const out: Record<string, Option[]> = {};
  for (const mod of refsData.mods as RefEntry[]) {
    if (!mod.slot) continue;
    (out[mod.slot] ??= []).push(toOption(mod));
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  return out;
})();

export const SLOT_OPTIONS: Option[] = refsData.slots.map((s) => ({ id: s, label: s }));
export const WEAPON_TYPE_OPTIONS: Option[] = refsData.weaponTypes.map((s) => ({ id: s, label: s }));
export const SKILL_OPTIONS: Option[] = refsData.skills.map((s) => ({ id: s, label: s }));
export const ATTR_OPTIONS: Option[] = refsData.attrs.map((s) => ({ id: s, label: s }));
export const RANGE_OPTIONS: Option[] = [{ id: 'C', label: 'C (ближняя)' }, { id: 'M', label: 'M (средняя)' }, { id: 'L', label: 'L (дальняя)' }];
export const DAMAGE_TYPE_OPTIONS: Option[] = refsData.damageTypes.map((s) => ({ id: s, label: s }));

export const AUDIENCE_OPTIONS: Option[] = [
  { id: 'human', label: 'Люди (человек, гуль, синт)' },
  { id: 'mutant', label: 'Мутанты' },
  { id: 'robot', label: 'Роботы' },
];
