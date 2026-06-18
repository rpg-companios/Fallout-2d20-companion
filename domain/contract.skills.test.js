/**
 * Contract: skill identity is canonical UPPER_SNAKE_CASE everywhere.
 *
 * Source of truth: `ALL_SKILL_KEYS` (from `domain/characterCreation.js`),
 * which mirrors the keys of `i18n/ru-RU/screens/character/screen.json#skillsCatalog`.
 *
 * Rule: any field in `data/**\/*.json` that names a skill MUST be either:
 *   - empty string `""` (means "no skill required"), or
 *   - a member of `ALL_SKILL_KEYS`.
 *
 * Locale strings (`"Ремонт"`, `"Repair"`, `"Энергооружие"`) and lowercase
 * variants (`"repair"`, `"energy_weapons"`) are forbidden in data and code logic.
 * Display happens at the render boundary via `getSkillDisplayName(SKILL_KEY)`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ALL_SKILL_KEYS } from './characterCreation.js';

const ROOT = resolve(__dirname, '..');

const SKILL_STRING_FIELDS = new Set(['skill', 'requiredSkill', 'mainSkill']);
const SKILL_LIST_FIELDS = new Set(['forcedSkills', 'goodSoulSkills', 'selectedExtraSkills']);
const SKILL_MAP_FIELDS = new Set(['skillModifiers']);

/** Recursively collect all *.json files under a directory */
function collectJsonFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsonFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

/** Walk JSON and emit { path, field, value } for every skill-typed value. */
function* walkSkillRefs(node, path = '$') {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkSkillRefs(node[i], `${path}[${i}]`);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    const here = `${path}.${k}`;
    if (SKILL_STRING_FIELDS.has(k) && typeof v === 'string') {
      yield { path: here, field: k, value: v, kind: 'string' };
    } else if (SKILL_LIST_FIELDS.has(k) && Array.isArray(v)) {
      // NB: must use for-of, not v.forEach(...) — `yield` cannot cross an
      // arrow-function boundary inside the generator.
      for (let i = 0; i < v.length; i++) {
        const x = v[i];
        if (typeof x === 'string') {
          yield { path: `${here}[${i}]`, field: k, value: x, kind: 'list-item' };
        }
      }
    } else if (SKILL_MAP_FIELDS.has(k) && v && typeof v === 'object') {
      for (const kk of Object.keys(v)) {
        yield { path: `${here}.${kk}`, field: k, value: kk, kind: 'map-key' };
      }
    }
    yield* walkSkillRefs(v, here);
  }
}

describe('skills are canonical UPPER_SNAKE_CASE across all data/*.json', () => {
  const dataDir = join(ROOT, 'data');
  const files = collectJsonFiles(dataDir);

  it('every skill reference is in ALL_SKILL_KEYS (or empty string)', () => {
    const failures = [];
    for (const file of files) {
      let json;
      try { json = JSON.parse(readFileSync(file, 'utf-8')); }
      catch { continue; }
      for (const ref of walkSkillRefs(json)) {
        if (ref.value === '') continue; // empty allowed (= no requirement)
        if (!ALL_SKILL_KEYS.includes(ref.value)) {
          failures.push(`${file.replace(ROOT + '/', '')} ${ref.path} (${ref.field}): ${JSON.stringify(ref.value)}`);
        }
      }
    }
    if (failures.length) {
      throw new Error(
        `Non-canonical skill references found (must be UPPER_SNAKE_CASE from ALL_SKILL_KEYS):\n  - ` +
        failures.join('\n  - '),
      );
    }
  });
});

describe('no localized skill literals in code logic', () => {
  // We scan JS/TS files (excluding tests, node_modules, i18n catalog) for
  // forbidden Russian skill strings. The only allowed place for them is
  // i18n/*/screens/character/screen.json#skillsCatalog (the source of truth).
  const FORBIDDEN_RU = [
    'Атлетика', 'Бартер', 'Тяжелое оружие', 'Тяжёлое оружие', 'Энергооружие',
    'Взрывчатка', 'Отмычки', 'Медицина', 'Ближний бой', 'Управление ТС',
    'Ремонт', 'Наука', 'Стрелковое оружие', 'Скрытность', 'Красноречие',
    'Выживание', 'Метание', 'Рукопашная',
  ];

  function collectSourceFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // skip locale catalogs (source of truth lives there)
        if (full.includes('/i18n/')) continue;
        // skip test snapshots/fixtures
        if (full.includes('/__tests__/')) continue;
        out.push(...collectSourceFiles(full));
      } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
        out.push(full);
      }
    }
    return out;
  }

  it('no Russian skill display names appear as string literals in logic code', () => {
    const sourceFiles = collectSourceFiles(ROOT);
    const offences = [];
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf-8');
      for (const ru of FORBIDDEN_RU) {
        // match only quoted occurrences ("...", '...', `...`)
        const pattern = new RegExp(`['"\`]${ru}['"\`]`, 'g');
        const m = text.match(pattern);
        if (m) {
          offences.push(`${file.replace(ROOT + '/', '')}: ${m.length}× literal ${JSON.stringify(ru)}`);
        }
      }
    }
    if (offences.length) {
      throw new Error(
        `Forbidden localized skill literal(s) in code (use canonical SKILL keys + getSkillDisplayName):\n  - ` +
        offences.join('\n  - '),
      );
    }
  });
});
