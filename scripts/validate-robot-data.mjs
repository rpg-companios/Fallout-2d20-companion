#!/usr/bin/env node
/**
 * Валидатор новых каталогов данных роботов (этап 1).
 *
 * Проверяет целостность ДАННЫХ, а не поведение кода:
 *   - уникальность id внутри каждого каталога и отсутствие пересечений
 *     между limbs.json и weaponAsLimb.json (коллизия 13 id снимается
 *     itemCategory, а не переименованием — решение А1);
 *   - обязательные поля и допустимые значения limbType;
 *   - оружие вместо конечности не несёт ни защиты, ни хватки (10.5);
 *   - ссылки (builtinWeaponId / attackId) разрешаются в weapons.json;
 *   - броня адресуется типом конечности, а не именем слота;
 *   - hitTable непрерывно покрывает 1..20 без дыр и наложений;
 *   - defaults плана тела существуют и подходят по типу.
 *
 * Одна реализация на два входа: CLI и тест (__tests__/robot/robot-data-catalogs.test.js).
 *
 * Запуск:  node scripts/validate-robot-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIMB_TYPES = ['head', 'body', 'arm', 'mover'];
export const LAYERS = ['frame', 'plating', 'armor'];

const ROBOT_REL = 'modules/fallout/data/equipment/robot';
const BODYPLANS_REL = 'modules/fallout/data/bodyplans/bodyplans.json';

const LOCATION_TO_LIMB_TYPE = {
  Optics: 'head',
  'Main Body': 'body',
  Arms: 'arm',
  Thruster: 'mover',
};

const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const collectDuplicates = (ids) => {
  const seen = new Set();
  const dups = new Set();
  for (const id of ids) {
    if (seen.has(id)) dups.add(id);
    seen.add(id);
  }
  return [...dups];
};

/**
 * @param {string} root — корень репозитория
 * @returns {{ errors: string[], warnings: string[], stats: object }}
 */
export function validateAll(root) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);

  const robotDir = path.join(root, ROBOT_REL);
  const limbs = readJson(root, `${ROBOT_REL}/limbs.json`);
  const weaponAsLimb = readJson(root, `${ROBOT_REL}/weaponAsLimb.json`);
  const weapons = readJson(root, `${ROBOT_REL}/weapons.json`);
  const armorFiles = [
    { file: 'armor.json', key: 'armor' },
    { file: 'armor_plating.json', key: 'plating' },
    { file: 'frames.json', key: 'frames' },
  ].map((entry) => ({ ...entry, data: readJson(root, `${ROBOT_REL}/${entry.file}`) }));

  const bodyplans = readJson(root, BODYPLANS_REL);
  const weaponIds = new Set(weapons.map((w) => w.id));

  // --- limbs.json -----------------------------------------------------------
  const limbIds = limbs.map((l) => l.id);
  for (const dup of collectDuplicates(limbIds)) {
    err(`limbs.json: id "${dup}" встречается более одного раза`);
  }
  for (const limb of limbs) {
    const where = `limbs.json:${limb.id}`;
    if (limb.itemCategory !== 'limb') err(`${where}: itemCategory должна быть "limb"`);
    if (!LIMB_TYPES.includes(limb.limbType)) {
      err(`${where}: limbType "${limb.limbType}" не из списка ${LIMB_TYPES.join('/')}`);
    }
    if (limb.canHoldWeapons === true && limb.weaponSlots === undefined) {
      warn(`${where}: canHoldWeapons без weaponSlots — считаем вместимость 1`);
    }
    if (limb.builtinWeaponId && !weaponIds.has(limb.builtinWeaponId)) {
      err(`${where}: builtinWeaponId "${limb.builtinWeaponId}" не найден в weapons.json`);
    }
  }

  // --- weaponAsLimb.json ----------------------------------------------------
  const weaponLimbIds = weaponAsLimb.map((l) => l.id);
  for (const dup of collectDuplicates(weaponLimbIds)) {
    err(`weaponAsLimb.json: id "${dup}" встречается более одного раза`);
  }
  const FORBIDDEN_IN_WEAPON_LIMB = [
    'physicalDR',
    'energyDR',
    'radDR',
    'canHoldWeapons',
    'weaponSlots',
  ];
  for (const entry of weaponAsLimb) {
    const where = `weaponAsLimb.json:${entry.id}`;
    if (entry.itemCategory !== 'weaponAsLimb') {
      err(`${where}: itemCategory должна быть "weaponAsLimb"`);
    }
    if (!LIMB_TYPES.includes(entry.limbType)) {
      err(`${where}: limbType "${entry.limbType}" не из списка ${LIMB_TYPES.join('/')}`);
    }
    for (const field of FORBIDDEN_IN_WEAPON_LIMB) {
      if (field in entry) {
        err(`${where}: поле ${field} должно ОТСУТСТВОВАТЬ, а не быть 0/false`);
      }
    }
    if (!entry.attackId) err(`${where}: нет attackId`);
    else if (!weaponIds.has(entry.attackId)) {
      err(`${where}: attackId "${entry.attackId}" не найден в weapons.json`);
    }
  }

  // --- пересечения ----------------------------------------------------------
  const limbIdSet = new Set(limbIds);
  for (const id of weaponLimbIds) {
    if (limbIdSet.has(id)) err(`id "${id}" есть и в limbs.json, и в weaponAsLimb.json`);
  }

  // --- weapons.json ---------------------------------------------------------
  for (const dup of collectDuplicates(weapons.map((w) => w.id))) {
    err(`weapons.json: id "${dup}" встречается более одного раза`);
  }
  for (const weapon of weapons) {
    if (typeof weapon.handheld !== 'boolean') {
      err(`weapons.json:${weapon.id}: нет булева поля handheld`);
    }
  }

  // --- броня: limbType вместо локации --------------------------------------
  for (const { file, key, data } of armorFiles) {
    const entries = data[key] || [];
    for (const entry of entries) {
      const where = `${file}:${entry.id}`;
      if (!LAYERS.includes(entry.layer)) err(`${where}: слой "${entry.layer}" неизвестен`);
      if (!LIMB_TYPES.includes(entry.limbType)) {
        err(`${where}: limbType "${entry.limbType}" не из списка ${LIMB_TYPES.join('/')}`);
      }
      const expected = LOCATION_TO_LIMB_TYPE[entry.robotLocation];
      if (expected && entry.limbType !== expected) {
        err(`${where}: robotLocation "${entry.robotLocation}" → ожидался limbType "${expected}"`);
      }
    }
  }

  // --- планы тел ------------------------------------------------------------
  for (const [planId, plan] of Object.entries(bodyplans)) {
    const where = `bodyplans.json:${planId}`;
    const slots = plan.slots || [];
    const slotDefs = slots.map((s) => (typeof s === 'string' ? { id: s } : s));
    const slotIds = slotDefs.map((s) => s.id);

    for (const dup of collectDuplicates(slotIds)) {
      err(`${where}: слот "${dup}" описан более одного раза`);
    }

    for (const slot of slotDefs) {
      if (!slot.accepts || slot.accepts.length === 0) {
        err(`${where}.${slot.id}: не указано accepts`);
      } else {
        for (const type of slot.accepts) {
          if (!LIMB_TYPES.includes(type)) {
            err(`${where}.${slot.id}: accepts содержит неизвестный тип "${type}"`);
          }
        }
      }
      if (typeof slot.swappable !== 'boolean') {
        err(`${where}.${slot.id}: swappable должен быть булевым`);
      }
      if (slot.accepts?.includes('head') && slot.swappable !== false) {
        err(`${where}.${slot.id}: слот головы должен быть swappable: false`);
      }
    }

    // hitTable: непрерывное покрытие 1..20, без дыр и наложений.
    if (plan.hitTable) {
      const covered = [];
      for (const row of plan.hitTable) {
        const [from, to] = row.range || [];
        if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
          err(`${where}: кривой диапазон ${JSON.stringify(row.range)}`);
          continue;
        }
        if (!slotIds.includes(row.slotId)) {
          err(`${where}: hitTable ссылается на несуществующий слот "${row.slotId}"`);
        }
        for (let n = from; n <= to; n += 1) covered.push(n);
      }
      const unique = new Set(covered);
      if (unique.size !== covered.length) err(`${where}: в hitTable есть наложения`);
      for (let n = 1; n <= 20; n += 1) {
        if (!unique.has(n)) {
          err(`${where}: hitTable не покрывает значение ${n}`);
          break;
        }
      }
    }

    // defaults: существуют и подходят по типу.
    const limbByType = new Map();
    for (const l of limbs) limbByType.set(l.id, l);
    for (const l of weaponAsLimb) limbByType.set(l.id, l);

    for (const [slotId, defaultId] of Object.entries(plan.defaults || {})) {
      if (defaultId === null) continue;
      if (!slotIds.includes(slotId)) {
        err(`${where}: defaults ссылается на несуществующий слот "${slotId}"`);
        continue;
      }
      const entry = limbByType.get(defaultId);
      if (!entry) {
        err(`${where}.${slotId}: конечность "${defaultId}" не найдена в новых каталогах`);
        continue;
      }
      const accepts = slotDefs.find((s) => s.id === slotId)?.accepts || [];
      if (!accepts.includes(entry.limbType)) {
        err(
          `${where}.${slotId}: конечность "${defaultId}" типа "${entry.limbType}" `
          + `не подходит в слот, принимающий ${accepts.join('/')}`,
        );
      }
    }
  }

  return {
    errors,
    warnings,
    stats: {
      limbs: limbs.length,
      weaponAsLimb: weaponAsLimb.length,
      weapons: weapons.length,
      armorEntries: armorFiles.reduce((sum, f) => sum + (f.data[f.key] || []).length, 0),
      plans: Object.keys(bodyplans).length,
      slots: Object.values(bodyplans).reduce((sum, p) => sum + (p.slots?.length || 0), 0),
      sharedIds: weapons.filter((w) => limbIdSet.has(w.id) || weaponLimbIds.includes(w.id)).length,
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, warnings, stats } = validateAll(root);
  console.log('Проверка каталогов данных роботов:');
  for (const [key, value] of Object.entries(stats)) console.log(`  ${key}: ${value}`);
  if (warnings.length > 0) {
    console.log(`\nПредупреждения (${warnings.length}):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  if (errors.length > 0) {
    console.log(`\nОшибки (${errors.length}):`);
    for (const e of errors) console.log(`  x ${e}`);
    process.exit(1);
  }
  console.log('\nОшибок нет.');
}
