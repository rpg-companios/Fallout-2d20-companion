#!/usr/bin/env node
/**
 * Миграция планов тел (этап 1): слоты из строк становятся объектами.
 *
 *   было: "slots": ["head", "arm1", ...]
 *   стало: "slots": [{ "id": "head", "accepts": ["head"], "capacity": 1,
 *                      "swappable": false }, ...]
 *
 * Что ещё добавляется:
 *   hitTable — диапазоны d20 по слотам. Есть ТОЛЬКО там, где диапазоны
 *              известны из книги. Выдумывать их миграция не умеет и не будет:
 *              у планов без hitTable поле просто отсутствует (валидатор это
 *              допускает, см. scripts/validate-robot-data.mjs).
 *
 * Что НЕ трогается (снимается на этапе 6, когда код переедет):
 *   slotCapabilities — дублирует canHoldWeapons конечности;
 *   hitLocations     — строковая копия hitTable для подписи в UI;
 *   defaultPlating   — живая механика (IRON RULE: возможность задать должна
 *                      остаться);
 *   layout           — раскладка экрана.
 *
 * Запуск:  node scripts/migrate-bodyplans.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BODYPLANS = path.join(ROOT, 'modules/fallout/data/bodyplans/bodyplans.json');

// Диапазоны попаданий d20. Источник: книга/владелец. Ничего не выдумано:
// чего в этом списке нет — того в данных нет.
const HIT_TABLES = {
  protectron: [
    ['head', 1, 3],
    ['leftArm', 4, 7],
    ['rightArm', 8, 11],
    ['body', 12, 15],
    ['leftLeg', 16, 18],
    ['rightLeg', 19, 20],
  ],
  securitron: [
    ['head', 1, 2],
    ['body', 3, 11],
    ['leftArm', 12, 14],
    ['rightArm', 15, 17],
    ['wheel', 18, 20],
  ],
};

/** Имя слота → тип конечностей, которые он принимает. */
const acceptsForSlot = (slotId) => {
  if (slotId === 'head') return ['head'];
  if (slotId === 'body' || slotId === 'torso') return ['body'];
  if (/arm/i.test(slotId)) return ['arm'];
  // Движитель: ноги, гусеницы, реактивная тяга, колесо — один тип mover.
  if (/leg/i.test(slotId) || ['chassis', 'thruster', 'wheel'].includes(slotId)) {
    return ['mover'];
  }
  return [];
};

/**
 * Снимается ли конечность со слота.
 * Голова — никогда (решение владельца: «головы чаще всего не снимаются»).
 * Для корпуса берём признак `replaceable` из каталога корпусов.
 */
const makeSwappable = (slotId, planId, bodiesById, bodyPlanDefaults) => {
  if (slotId === 'head' || acceptsForSlot(slotId).includes('head')) return false;
  if (acceptsForSlot(slotId).includes('body')) {
    const defaultId = bodyPlanDefaults?.[slotId];
    const body = defaultId ? bodiesById.get(defaultId) : null;
    if (body && body.replaceable !== undefined) return body.replaceable === true;
  }
  return true;
};

export function migrate() {
  const plans = JSON.parse(fs.readFileSync(BODYPLANS, 'utf8'));
  const bodies = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'modules/fallout/data/equipment/robot/robotbody.json'),
      'utf8',
    ),
  );
  const bodiesById = new Map(bodies.map((b) => [b.id, b]));

  const out = {};
  for (const [planId, plan] of Object.entries(plans)) {
    const defaults = plan.defaults || {};
    const slots = (plan.slots || []).map((slot) => {
      const slotId = typeof slot === 'string' ? slot : slot.id;
      if (typeof slot === 'object' && slot !== null) return slot; // уже мигрировано
      return {
        id: slotId,
        accepts: acceptsForSlot(slotId),
        capacity: 1,
        swappable: makeSwappable(slotId, planId, bodiesById, defaults),
      };
    });

    const hitTable = (HIT_TABLES[planId] || []).map(([slotId, from, to]) => ({
      range: [from, to],
      slotId,
    }));

    out[planId] = {
      ...plan,
      slots,
      ...(hitTable.length > 0 ? { hitTable } : {}),
    };
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const checkOnly = process.argv.includes('--check');
  const result = migrate();
  if (checkOnly) {
    const current = JSON.parse(fs.readFileSync(BODYPLANS, 'utf8'));
    const same = JSON.stringify(current) === JSON.stringify(JSON.parse(JSON.stringify(result)));
    if (!same) {
      console.error('bodyplans.json устарел — нужен запуск миграции.');
      process.exit(1);
    }
    console.log('bodyplans.json актуален.');
  } else {
    fs.writeFileSync(BODYPLANS, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    for (const [planId, plan] of Object.entries(result)) {
      const slots = plan.slots.map((s) => (typeof s === 'string' ? s : s.id)).join(', ');
      console.log(`${planId.padEnd(12)} слотов: ${plan.slots.length} (${slots})`);
      if (plan.hitTable) {
        console.log(`${''.padEnd(12)} hitTable: ${plan.hitTable.length} диапазонов`);
      }
    }
  }
}
