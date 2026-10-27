#!/usr/bin/env node
// sync-from-main.mjs — синхронизация Кузницы с основным репозиторием.
//
// Кузница — САМОДОСТАТОЧНЫЙ проект (репозиторий rpg-companios/fallout2d20forge,
// решение владельца 2026-10-19): в рантайме и сборке она НЕ читает файлы
// основного приложения. Но данные для арсенала рождаются в основном репо
// (modules/fallout — единственный источник истины). Эта команда переносит
// сюда РОВНО нужное, явно и аудируемо:
//
//   1) src/data/forge-refs.json — слепок справочников (оружие/моды/патроны/
//      качества/эффекты + производные перечни) из data+ i18n JSON сеттинга;
//   2) src/itempack/contract.js, validate.js — копии контракта/валидатора
//      паков из основного репо (правила одни на двоих; правятся там).
//
// Файлы со штампом GENERATED руками не редактировать — правка в источнике
// основного репозитория, потом повторный sync.
//
// Использование:
//   npm run sync                       # ../Fallout-2d20-companion
//   npm run sync -- --from /path/to/Fallout-2d20-companion
//   FORGE_MAIN_REPO=/path/to/repo npm run sync

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const forgeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv, env) {
  const out = { from: undefined };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--from') { out.from = argv[++i]; continue; }
  }
  out.from = path.resolve(forgeRoot, out.from ?? env.FORGE_MAIN_REPO ?? '../Fallout-2d20-companion');
  return out;
}

const { from } = parseArgs(process.argv, process.env);

const readJson = (rel) => JSON.parse(readFileSync(path.join(from, rel), 'utf8'));
const flat = (v) => (Array.isArray(v) ? v : Object.values(v ?? {}));
const nameMap = (entries) =>
  new Map(flat(entries).filter((e) => e?.id && e?.name).map((e) => [e.id, e.name]));

// ── Источник: данные сеттинга (зеркало modules/fallout/index.js) ───────────
const weapons = readJson('modules/fallout/data/equipment/weapons.json');
const weaponMods = readJson('modules/fallout/data/equipment/weapon_mods.json');
const weaponModSlots = readJson('modules/fallout/data/equipment/weapon_mod_slots.json');
const ammo = readJson('modules/fallout/data/equipment/ammo.json');

// Дополнения к множествам, выводимым из данных: перечни атрибутов и шкал
// в данных не записаны — они часть движка (зеркало refsFallout.js DERIVED_EXTRAS
// в основном репо; меняются вместе с контрактом/валидацией, sync перетащит).
const ENGINE_CONSTANTS = {
  attrs: ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK'],
  ranges: ['C', 'M', 'L'],
  damageTypes: ['physical', 'energy', 'radiation', 'poison', 'explosive', 'special'],
};

// ── Имена (обе локали проекта — UI Кузницы ru, вторая пригодится позже) ────
const locales = {
  ru: {
    qualities: readJson('modules/fallout/i18n/ru-RU/data/system/qualities.json'),
    effects: readJson('modules/fallout/i18n/ru-RU/data/system/damageEffects.json'),
    weapons: readJson('modules/fallout/i18n/ru-RU/data/equipment/weapons/weapons.json'),
    weaponMods: readJson('modules/fallout/i18n/ru-RU/data/equipment/weapon_mods.json'),
    ammo: readJson('modules/fallout/i18n/ru-RU/data/equipment/ammo/ammo_types.json'),
  },
  en: {
    qualities: readJson('modules/fallout/i18n/en-EN/data/system/qualities.json'),
    effects: readJson('modules/fallout/i18n/en-EN/data/system/damageEffects.json'),
    weapons: readJson('modules/fallout/i18n/en-EN/data/equipment/weapons/weapons.json'),
    weaponMods: readJson('modules/fallout/i18n/en-EN/data/equipment/weapon_mods.json'),
    ammo: readJson('modules/fallout/i18n/en-EN/data/equipment/ammo/ammo_types.json'),
  },
};
const ru = Object.fromEntries(Object.entries(locales.ru).map(([k, v]) => [k, nameMap(v)]));
const en = Object.fromEntries(Object.entries(locales.en).map(([k, v]) => [k, nameMap(v)]));

// ── Производные перечни (логика refsFallout.buildFalloutRefs) ──────────────
const weaponList = flat(weapons);
const weaponTypes = new Set();
const skills = new Set();
const damageTypes = new Set(ENGINE_CONSTANTS.damageTypes);
for (const w of weaponList) {
  if (w?.weaponType) weaponTypes.add(w.weaponType);
  if (w?.mainSkill) skills.add(w.mainSkill);
  const dts = Array.isArray(w?.damageType) ? w.damageType : [w?.damageType];
  for (const d of dts) if (d) damageTypes.add(d);
}
const slots = new Set();
for (const slotMap of Object.values(weaponModSlots ?? {})) {
  for (const s of Object.keys(slotMap || {})) slots.add(s);
}
for (const m of flat(weaponMods)) if (m?.slot) slots.add(m.slot);

// ── Слепок ─────────────────────────────────────────────────────────────────
const pick = (list, namesRu, namesEn, extra = {}) =>
  flat(list)
    .filter((e) => e?.id)
    .map((e) => {
      const out = {
        id: e.id,
        name: namesRu?.get(e.id) ?? e.id,
        nameEn: namesEn?.get(e.id),
        ...extra,
      };
      if (out.nameEn === out.name) delete out.nameEn;
      return out;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

let commit = null;
try {
  commit = execFileSync('git', ['-C', from, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() || null;
} catch { commit = null; }

const snapshot = {
  forgeRefsFormat: 1,
  generator: 'tools/sync-from-main.mjs',
  source: { repo: 'rpg-companios/Fallout-2d20-companion', commit },
  exportedAt: new Date().toISOString(),
  weapons: pick(weapons, ru.weapons, en.weapons, {}).map((w) => {
    const src = weaponList.find((x) => x?.id === w.id);
    return src?.weaponType ? { ...w, weaponType: src.weaponType } : w;
  }),
  mods: flat(weaponMods).filter((m) => m?.id).map((m) => ({
    id: m.id,
    name: ru.weaponMods.get(m.id) ?? m.id,
    ...(en.weaponMods.get(m.id) && en.weaponMods.get(m.id) !== ru.weaponMods.get(m.id)
      ? { nameEn: en.weaponMods.get(m.id) } : {}),
    ...(m.slot ? { slot: m.slot } : {}),
  })),
  ammo: pick(ammo, ru.ammo, en.ammo),
  qualities: flat(locales.ru.qualities).filter((q) => q?.id).map((q) => ({
    id: q.id, name: q.name ?? q.id,
  })),
  effects: flat(locales.ru.effects).filter((e) => e?.id).map((e) => ({
    id: e.id, name: e.name ?? e.id,
  })),
  weaponTypes: Array.from(weaponTypes).sort(),
  damageTypes: Array.from(damageTypes).sort(),
  skills: Array.from(skills).sort(),
  attrs: ENGINE_CONSTANTS.attrs,
  ranges: ENGINE_CONSTANTS.ranges,
  slots: Array.from(slots).sort(),
};

const HEADER =
  '// GENERATED from rpg-companios/Fallout-2d20-companion by tools/sync-from-main.mjs.\n' +
  '// НЕ редактировать: правка — в источнике (src/itempack/ там), потом npm run sync.\n';

for (const file of ['contract.js', 'validate.js']) {
  const body = readFileSync(path.join(from, 'src/itempack', file), 'utf8');
  writeFileSync(path.join(forgeRoot, 'src/itempack', file), HEADER + body, 'utf8');
  console.log(`synced src/itempack/${file}`);
}

mkdirSync(path.join(forgeRoot, 'src/data'), { recursive: true });
writeFileSync(
  path.join(forgeRoot, 'src/data/forge-refs.json'),
  JSON.stringify(snapshot, null, 2) + '\n',
  'utf8',
);
console.log(
  `synced src/data/forge-refs.json: ` +
  `${snapshot.weapons.length} weapons, ${snapshot.mods.length} mods, ${snapshot.ammo.length} ammo, ` +
  `${snapshot.qualities.length} qualities, ${snapshot.effects.length} effects ` +
  `(commit ${commit ?? 'unknown'})`,
);
