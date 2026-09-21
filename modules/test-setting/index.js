// ТЕСТОВЫЙ СЕТТИНГ — второй клиент контракта выводимости (МК-2, патч 285).
//
// Спека владельца (docs/architecture/cascade-map.md, §8 — дословно):
//   «5 атрибутов; 5 производных (здоровье, манна, сила магии, защита,
//    нападение); 7 навыков; 5 заклинаний. Атрибуты влияют на производные;
//    заклинания тратят манну (мана = атрибут + навык); +5/10/15% к силе
//    магии / защите от магии; заклинания с гейтом "навык ранга 4"; число
//    рангов навыка зависит от атрибута.»
//
// КРИТЕРИЙ УСПЕХА КОНТРАКТА: сеттинг описывается РЕГИСТРАЦИЕЙ без правок
// движка. Этот модуль — живой JavaScript (сеттинги не переписываются на TS),
// «дверь» — типы контракта + validateSettingExtension при регистрации.
// Модуль НЕ импортируется работающей программой: проводка (мини-экран,
// хранилище) — патч 286 и МК-3. Патч 285 не трогает src/ вообще — критерий
// виден в диффе патча.
//
// Скелет — общий стандарт сеттингов (патч 292): index.js — дверь и контракт,
// данные и имена — внутри модуля; правила контракта — в шапке
// modules/fallout/index.js (для всех сеттингов одни и те же).
//
// Числовые правила (здоровье = 10 + СИЛ×2 и т.п.) — выбор мини-сеттинга:
// контракту всё равно, какие формулы пишет сеттинг.

import { ceilingFor, validateSettingExtension } from '../../src/engine/contracts';
import { SPELLS } from './spells';

// --- словарь мини-мира --------------------------------------------------------

export const ATTRIBUTES = [
  { id: 'test.attr.strength', label: 'Сила' },
  { id: 'test.attr.agility', label: 'Ловкость' },
  { id: 'test.attr.intellect', label: 'Интеллект' },
  { id: 'test.attr.spirit', label: 'Дух' },
  { id: 'test.attr.luck', label: 'Удача' },
];

export const SKILLS = [
  { id: 'test.skill.blade', label: 'Клинки', governing: 'test.attr.strength' },
  { id: 'test.skill.bladeDefense', label: 'Защита клинком', governing: 'test.attr.agility' },
  { id: 'test.skill.sorcery', label: 'Колдовство', governing: 'test.attr.intellect' },
  { id: 'test.skill.magicDefense', label: 'Магическая защита', governing: 'test.attr.spirit' },
  { id: 'test.skill.aim', label: 'Прицеливание', governing: 'test.attr.agility' },
  { id: 'test.skill.stealth', label: 'Скрытность', governing: 'test.attr.luck' },
  { id: 'test.skill.survival', label: 'Выживание', governing: 'test.attr.strength' },
];

/** Ступени потолка ранга от атрибута-покровителя: атрибут ≥ порога → потолок. */
export const RANK_BANDS = [
  { threshold: 1, ceiling: 1 },
  { threshold: 4, ceiling: 2 },
  { threshold: 7, ceiling: 3 },
  { threshold: 10, ceiling: 4 },
];

export const rankCeilingId = (skillId) => `test.ceiling.${skillId.replace('test.skill.', '')}`;

// --- объявление сеттинга (SettingExtension, живой JS) ------------------------

export const TEST_SETTING = {
  id: 'test',
  parameters: [
    ...ATTRIBUTES.map((a) => ({ id: a.id, kind: 'number', label: a.label })),
    ...SKILLS.map((s) => ({ id: s.id, kind: 'number', label: s.label })),
  ],
  derived: [
    {
      id: 'test.derived.maxHealth',
      kind: 'max',
      deps: ['test.attr.strength'],
      compute: (ctx) => 10 + ctx.values['test.attr.strength'] * 2,
      description: 'здоровье = 10 + Сила×2',
    },
    {
      id: 'test.derived.maxMana',
      kind: 'max',
      deps: ['test.attr.intellect', 'test.skill.sorcery'],
      // спека дословно: «мана = атрибут + навык»
      compute: (ctx) => ctx.values['test.attr.intellect'] + ctx.values['test.skill.sorcery'],
      description: 'манна = Интеллект + Колдовство',
    },
    {
      id: 'test.derived.magicPower',
      kind: 'derived',
      deps: ['test.attr.spirit', 'test.skill.sorcery'],
      compute: (ctx) =>
        ctx.values['test.attr.spirit'] + Math.floor(ctx.values['test.skill.sorcery'] / 2),
      description: 'сила магии = Дух + Колдовство/2; бонусы +5/10/15% — модификаторами',
    },
    {
      id: 'test.derived.defense',
      kind: 'derived',
      deps: ['test.attr.agility', 'test.skill.bladeDefense', 'test.skill.magicDefense'],
      compute: (ctx) =>
        ctx.values['test.attr.agility'] +
        Math.floor(
          (ctx.values['test.skill.bladeDefense'] + ctx.values['test.skill.magicDefense']) / 2,
        ),
      description: 'защита (от магии) = Ловкость + (Защита клинком + Магическая защита)/2',
    },
    {
      id: 'test.derived.attack',
      kind: 'derived',
      deps: ['test.attr.strength', 'test.skill.blade', 'test.skill.aim'],
      compute: (ctx) =>
        ctx.values['test.attr.strength'] +
        Math.floor((ctx.values['test.skill.blade'] + ctx.values['test.skill.aim']) / 2),
      description: 'нападение = Сила + (Клинки + Прицеливание)/2',
    },
    // «число рангов навыка зависит от атрибута» — потолок ранга каждого
    // навыка от его атрибута-покровителя (ступени RANK_BANDS)
    ...SKILLS.map((s) => ({
      id: rankCeilingId(s.id),
      kind: 'rankCeiling',
      deps: [s.governing],
      compute: (ctx) => ceilingFor(RANK_BANDS, ctx.values[s.governing]),
      description: `потолок ранга «${s.label}» — от ${s.governing.replace('test.attr.', '')}`,
    })),
  ],
  counters: [
    { id: 'test.counter.health', max: 'test.derived.maxHealth', label: 'здоровье' },
    { id: 'test.counter.mana', max: 'test.derived.maxMana', label: 'манна' },
  ],
  requirements: SPELLS.map((spell) => spell.requirement),
  initialModifiers: [],
};

/** Зарегистрировать мини-сеттинг в реестр движка (пакет-регистрация).
 *  Форма проверяется ДО регистрации — дверь JS→TS. */
export const registerTestSetting = (registry) => {
  const errors = validateSettingExtension(TEST_SETTING);
  if (errors.length > 0) {
    throw new Error(`[test-setting] Декларация невалидна: ${errors.join('; ')}`);
  }
  registry.register(TEST_SETTING);
};

export { SPELLS };
