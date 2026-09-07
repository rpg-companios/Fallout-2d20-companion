#!/usr/bin/env node
/**
 * Миграция каталогов конечностей роботов (этап 1).
 *
 * Что делает — и всё это АДДИТИВНО, старые файлы не удаляются и не ломаются:
 *
 *   1. robotarms.json + robotheads.json + robotlegs.json + robotbody.json
 *      → limbs.json      (itemCategory: "limb")
 *      → weaponAsLimb.json (itemCategory: "weaponAsLimb")
 *      Разделение по правилу §3 docs/architecture/robots.md:
 *      «нет хватки (canHoldWeapons: false) и нет своей СУ» → оружие вместо
 *      конечности; иначе — конечность.
 *
 *   2. weapons.json (робо-оружие): добавляет флаг handheld.
 *      true  — можно вложить в weaponSlots руки;
 *      false — только встроенная атака / оружие вместо конечности.
 *
 *   3. armor.json / armor_plating.json / frames.json: добавляет limbType
 *      вместо опоры на robotLocation (Optics→head, Main Body→body,
 *      Arms→arm, Thruster→mover). Поле robotLocation остаётся до переезда
 *      кода на limbType.
 *
 * Решение владельца (А1): существующие id НЕ переименовываются.
 * Коллизию 13 задвоенных id снимает не имя, а маршрутизация по
 * itemCategory — см. scripts/validate-robot-data.mjs.
 *
 * Запуск:  node scripts/migrate-robot-limbs.mjs [--check]
 *          --check — не писать файлы, только проверить, что они актуальны
 *                    (для тестов и CI).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROBOT_DIR = path.join(ROOT, 'modules/fallout/data/equipment/robot');

const read = (file) => JSON.parse(fs.readFileSync(path.join(ROBOT_DIR, file), 'utf8'));
const write = (file, data) => {
  const p = path.join(ROBOT_DIR, file);
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

// ---------------------------------------------------------------------------
// Карты
// ---------------------------------------------------------------------------

const LOCATION_TO_LIMB_TYPE = {
  Optics: 'head',
  'Main Body': 'body',
  Arms: 'arm',
  Thruster: 'mover',
};

const DR_FIELDS = ['physicalDR', 'energyDR', 'radDR'];
// Поля, которые переносим как есть: они нужны UI и расчётам.
const PASSTHROUGH_FIELDS = [
  'compatibleBodyPlans',
  'defaultForBodyPlan',
  'robotBodyPlan',
  'replaceable',
  'unique',
  'melee',
  'guns',
  'mind',
  'other',
  'body',
  'carryWeight',
  'rarity',
  'name',
];

const pick = (source, keys) => {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
};

const hasDR = (entry) => DR_FIELDS.some((f) => entry[f] !== undefined);

// ---------------------------------------------------------------------------
// Конечности
// ---------------------------------------------------------------------------

const buildLimb = (entry, limbType) => ({
  id: entry.id,
  itemCategory: 'limb',
  limbType,
  ...(entry.canHoldWeapons !== undefined ? { canHoldWeapons: entry.canHoldWeapons } : {}),
  ...(entry.weaponSlots !== undefined ? { weaponSlots: entry.weaponSlots } : {}),
  ...(entry.builtinWeaponId ? { builtinWeaponId: entry.builtinWeaponId } : {}),
  ...pick(entry, DR_FIELDS),
  ...(entry.complexity !== undefined ? { installComplexity: entry.complexity } : {}),
  ...(entry.perksRequired !== undefined
    ? { installPerksRequired: entry.perksRequired }
    : {}),
  ...(entry.skill !== undefined
    ? { installSkill: String(entry.skill).toUpperCase() }
    : {}),
  ...pick(entry, PASSTHROUGH_FIELDS),
});

/**
 * Оружие вместо конечности: своей защиты нет, хватки нет, вместо
 * builtinWeaponId — attackId. Требования установки живут в weapons.json
 * (исторически), поэтому переносим их оттуда.
 */
const buildWeaponAsLimb = (entry, weaponById) => {
  const weapon = weaponById.get(entry.id);
  return {
    id: entry.id,
    itemCategory: 'weaponAsLimb',
    limbType: 'arm',
    attackId: entry.builtinWeaponId || entry.id,
    ...(weapon?.installComplexity != null
      ? { installComplexity: weapon.installComplexity }
      : (entry.complexity !== undefined ? { installComplexity: entry.complexity } : {})),
    ...(weapon?.installPerksRequired != null
      ? { installPerksRequired: weapon.installPerksRequired }
      : (entry.perksRequired !== undefined
        ? { installPerksRequired: entry.perksRequired }
        : {})),
    ...(weapon?.installSkill != null
      ? { installSkill: String(weapon.installSkill).toUpperCase() }
      : (entry.skill !== undefined ? { installSkill: String(entry.skill).toUpperCase() } : {})),
    ...pick(entry, PASSTHROUGH_FIELDS),
  };
};

const LIMB_TYPE_ORDER = ['head', 'body', 'arm', 'mover'];

export function migrate() {
  const arms = read('robotarms.json');
  const heads = read('robotheads.json');
  const movers = read('robotlegs.json');
  const bodies = read('robotbody.json');
  const weapons = read('weapons.json');
  const weaponById = new Map(weapons.map((w) => [w.id, w]));

  const limbs = [
    ...heads.map((e) => buildLimb(e, 'head')),
    ...bodies.map((e) => buildLimb(e, 'body')),
    ...arms.filter((e) => e.canHoldWeapons === true || hasDR(e)).map((e) => buildLimb(e, 'arm')),
    ...movers.map((e) => buildLimb(e, 'mover')),
  ].sort((a, b) => {
    const byType = LIMB_TYPE_ORDER.indexOf(a.limbType) - LIMB_TYPE_ORDER.indexOf(b.limbType);
    return byType !== 0 ? byType : a.id.localeCompare(b.id);
  });

  const weaponAsLimb = arms
    .filter((e) => e.canHoldWeapons === false && !hasDR(e))
    .map((e) => buildWeaponAsLimb(e, weaponById))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Робо-оружие: можно ли держать в ладони.
  // Критерий: запись есть в limbs.json, это манипулятор (canHoldWeapons) и
  // её встроенная атака — само это оружие.
  const limbById = new Map(limbs.map((l) => [l.id, l]));
  const handheldIds = new Set(
    [...limbById.values()]
      .filter((l) => l.canHoldWeapons === true && l.builtinWeaponId === l.id)
      .map((l) => l.id),
  );

  const nextWeapons = weapons.map((w) => ({
    ...w,
    handheld: handheldIds.has(w.id),
  }));

  const armorFiles = [
    { file: 'armor.json', key: 'armor' },
    { file: 'armor_plating.json', key: 'plating' },
    { file: 'frames.json', key: 'frames' },
  ];

  const nextArmor = armorFiles.map(({ file, key }) => {
    const data = read(file);
    return {
      file,
      data: {
        ...data,
        [key]: (data[key] || []).map((entry) => ({
          ...entry,
          limbType: LOCATION_TO_LIMB_TYPE[entry.robotLocation] ?? null,
        })),
      },
    };
  });

  return { limbs, weaponAsLimb, weapons: nextWeapons, armor: nextArmor };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const checkOnly = process.argv.includes('--check');
  const result = migrate();

  const target = (name, data) => {
    if (checkOnly) {
      const p = path.join(ROBOT_DIR, name);
      if (!fs.existsSync(p)) return false;
      const current = JSON.stringify(JSON.parse(fs.readFileSync(p, 'utf8')));
      return current === JSON.stringify(JSON.parse(JSON.stringify(data)));
    }
    write(name, data);
    return true;
  };

  const results = [
    ['limbs.json', target('limbs.json', result.limbs)],
    ['weaponAsLimb.json', target('weaponAsLimb.json', result.weaponAsLimb)],
    ['weapons.json', target('weapons.json', result.weapons)],
    ...result.armor.map(({ file, data }) => [file, target(file, data)]),
  ];

  if (checkOnly) {
    const stale = results.filter(([, ok]) => !ok).map(([name]) => name);
    if (stale.length > 0) {
      console.error('Устарели (нужен запуск миграции):', stale.join(', '));
      process.exit(1);
    }
    console.log('Каталоги актуальны.');
  } else {
    console.log('Записано:');
    console.log(`  limbs.json        — ${result.limbs.length} записей`);
    console.log(`  weaponAsLimb.json — ${result.weaponAsLimb.length} записей`);
    console.log(`  weapons.json      — handheld: ${result.weapons.filter((w) => w.handheld).length}`);
    for (const { file, data } of result.armor) {
      const key = file === 'armor.json' ? 'armor' : file === 'frames.json' ? 'frames' : 'plating';
      console.log(`  ${file.padEnd(18)}— limbType у ${data[key].length} записей`);
    }
  }
}
