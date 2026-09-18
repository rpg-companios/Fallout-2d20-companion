// КОНТРАКТ ВЫВОДИМОСТИ — приёмочный тест МК-1 (патч 281).
//
// КРИТЕРИЙ УСПЕХА (карта каскада §8, слово владельца): мини-сеттинг
// описывается ДЕКЛАРАЦИЕЙ без правок движка — 5 атрибутов, 7 навыков,
// 5 производных (здоровье, манна, сила магии, защита, нападение),
// 5 заклинаний с требованием ранга 4, бонусы +5/10/15%, потолок ранга
// навыка — от атрибута, манна = атрибут + навык.
//
// Реестр пока никуда не подключён (изоляция МК-1→МК-3): этот тест —
// единственный потребитель. При подключении (патч 283+) тест остаётся
// эквивалентностью контракта.

import { describe, expect, it } from 'vitest';
import {
  applyModifiers,
  applyPercent,
  ceilingFor,
  changedParams,
  checkRequirements,
  validateSettingExtension,
} from '../../src/engine/contracts/index';
import { createDerivationRegistry } from '../../src/engine/derivations/registry';

// --- декларация мини-сеттинга по спеке владельца (§8) ------------------------

const ATTRIBUTES = ['strength', 'agility', 'intellect', 'spirit', 'luck'];
const SKILLS = ['blade', 'bladeDefense', 'sorcery', 'magicDefense', 'aim', 'stealth', 'survival'];
const attr = (name) => `test.attr.${name}`;
const skill = (name) => `test.skill.${name}`;

/** Потолок ранга навыка — от атрибута (спека: «потолок рангов навыка — от атрибута»). */
const RANK_BANDS = [
  { threshold: 1, ceiling: 1 },
  { threshold: 4, ceiling: 2 },
  { threshold: 7, ceiling: 3 },
  { threshold: 10, ceiling: 4 },
];

const miniSetting = () => ({
  id: 'test',
  parameters: [
    ...ATTRIBUTES.map((name) => ({ id: attr(name), kind: 'number', label: name })),
    ...SKILLS.map((name) => ({ id: skill(name), kind: 'number', label: name })),
  ],
  derived: [
    {
      id: 'test.derived.maxHealth',
      kind: 'max',
      deps: [attr('strength')],
      compute: (ctx) => 10 + ctx.values[attr('strength')] * 2,
      description: 'здоровье = 10 + СИЛ×2',
    },
    {
      id: 'test.derived.maxMana',
      kind: 'max',
      // манна = атрибут + навык (спека)
      deps: [attr('intellect'), skill('sorcery')],
      compute: (ctx) => ctx.values[attr('intellect')] + ctx.values[skill('sorcery')],
      description: 'манна = Интеллект + Колдовство',
    },
    {
      id: 'test.derived.magicPower',
      kind: 'derived',
      deps: [attr('spirit'), skill('sorcery')],
      compute: (ctx) => ctx.values[attr('spirit')] + Math.floor(ctx.values[skill('sorcery')] / 2),
      description: 'сила магии = Дух + Колдовство/2',
    },
    {
      id: 'test.derived.defense',
      kind: 'derived',
      deps: [attr('agility'), skill('bladeDefense'), skill('magicDefense')],
      compute: (ctx) =>
        ctx.values[attr('agility')] +
        Math.floor((ctx.values[skill('bladeDefense')] + ctx.values[skill('magicDefense')]) / 2),
      description: 'защита = Ловкость + (Защита клинком + Магическая защита)/2',
    },
    {
      id: 'test.derived.attack',
      kind: 'derived',
      deps: [attr('strength'), skill('blade'), skill('aim')],
      compute: (ctx) =>
        ctx.values[attr('strength')] +
        Math.floor((ctx.values[skill('blade')] + ctx.values[skill('aim')]) / 2),
      description: 'нападение = Сила + (Клинки + Прицеливание)/2',
    },
    {
      id: 'test.derived.sorceryRankCeiling',
      kind: 'rankCeiling',
      deps: [attr('intellect')],
      compute: (ctx) => ceilingFor(RANK_BANDS, ctx.values[attr('intellect')]),
      description: 'потолок ранга Колдовства — от Интеллекта',
    },
  ],
  counters: [
    { id: 'test.counter.health', max: 'test.derived.maxHealth', label: 'здоровье' },
    { id: 'test.counter.mana', max: 'test.derived.maxMana', label: 'манна' },
  ],
  requirements: [
    { paramId: skill('sorcery'), minRank: 4 },
    { paramId: attr('spirit'), minValue: 5 },
  ],
  reactions: [
    {
      id: 'test.reaction.clampMana',
      watch: ['test.derived.maxMana'],
      on: () => {},
      description: 'подрезка текущей манны при падении потолка',
    },
  ],
});

// --- модификаторы: договорный порядок ---------------------------------------

describe('МК-1: контракт выводимости — модификаторы', () => {
  it('параметры: set заменяет базу, аддитивы складываются; проценты в цепочке запрещены', () => {
    // СИЛ в силовой броне = 11 (set), +2 перк, −2 рана
    const mods = [
      { source: 'perk.bruiser', operation: '+', value: 2 },
      { source: 'armor.pa', operation: 'set', value: 11 },
      { source: 'wound.arm', operation: '-', value: 2 },
    ];
    // set 11 → +2 −2 = 11
    expect(applyModifiers(5, mods)).toBe(11);
  });

  it('без модификаторов значение возвращается как есть', () => {
    expect(applyModifiers(7, [])).toBe(7);
  });

  it('несколько set: берётся последний (переопределение сильнее дополнения)', () => {
    const mods = [
      { source: 'armor.pa', operation: 'set', value: 11 },
      { source: 'armor.advanced', operation: 'set', value: 13 },
    ];
    expect(applyModifiers(5, mods)).toBe(13);
  });
});

// --- проценты: всегда от объявленной базы (слово владельца, 2026-09-18) ------

describe('МК-1: проценты — от объявленной базы', () => {
  it('слово владельца: +15% жизней = база ОЗ × 1.15, округлённая математически', () => {
    // applyPercent(база, проценты): чистая функция и для производных, и для
    // будущих каналов урона
    expect(applyPercent(26, [15])).toBe(30); // 26 × 1.15 = 29.9 → 30
  });

  it('слово владельца: +15% защиты от магии огня = −15% входящего урона огня', () => {
    expect(applyPercent(100, [-15])).toBe(85);
  });

  it('несколько процентов суммируются и применяются одним множителем', () => {
    expect(applyPercent(40, [10, 5])).toBe(46); // 40 × 1.15 = 46
  });

  it('реестр: процент на id производного применяется к его базе при каскаде', () => {
    const registry = createDerivationRegistry();
    registry.register(miniSetting());
    const baseState = { [attr('strength')]: 8, [attr('intellect')]: 9, [skill('sorcery')]: 2 };
    // ОЗ = 10 + СИЛ×2 = 26; +15% → 29.9 → 30
    const { values } = registry.evaluate(baseState, {
      'test.derived.maxHealth': [{ source: 'spell.vigor', operation: '%', value: 15 }],
    });
    expect(values['test.derived.maxHealth']).toBe(30);
    // потолок счётчика тянет производное с процентом
    expect(registry.evaluate(baseState, {
      'test.derived.maxHealth': [{ source: 'spell.vigor', operation: '%', value: 15 }],
    }).ceilings['test.counter.health']).toBe(30);
  });

  it('процент в аддитивной цепочке параметра отклоняется', () => {
    expect(() => applyModifiers(8, [{ source: 'x', operation: '%', value: 15 }])).toThrow(/процент всегда привязан к базе/);
  });

  it('аддитив на id производного отклоняется: смешивание запрещено', () => {
    const registry = createDerivationRegistry();
    registry.register(miniSetting());
    const baseState = { [attr('strength')]: 8, [attr('intellect')]: 9, [skill('sorcery')]: 2 };
    expect(() =>
      registry.evaluate(baseState, {
        'test.derived.maxHealth': [{ source: 'x', operation: '+', value: 5 }],
      }),
    ).toThrow(/только проценты/);
  });
});

// --- реестр: валидация -------------------------------------------------------

describe('МК-1: реестр — валидация деклараций', () => {
  it('id без префикса сеттинга отклоняется', () => {
    const registry = createDerivationRegistry();
    expect(() =>
      registry.register({
        id: 'test',
        derived: [
          {
            id: 'maxHealth',
            kind: 'derived',
            deps: ['test.attr.strength'],
            compute: () => 1,
            description: '',
          },
        ],
      }),
    ).toThrow(/префикса сеттинга/);
  });

  it('повторная регистрация того же id отклоняется', () => {
    const registry = createDerivationRegistry();
    registry.register(miniSetting());
    // префиксы исключают коллизии МЕЖДУ сеттингами; дубль возможен только
    // при повторной регистрации того же сеттинга — её и ловим
    expect(() => registry.register(miniSetting())).toThrow(/уже зарегистрирован/);
  });

  it('ссылка на неизвестный вход отклоняется', () => {
    const registry = createDerivationRegistry();
    expect(() =>
      registry.register({
        id: 'test',
        derived: [
          {
            id: 'test.derived.ghost',
            kind: 'derived',
            deps: ['test.attr.nowhere'],
            compute: () => 1,
            description: '',
          },
        ],
      }),
    ).toThrow(/неизвестные входы/);
  });

  it('цикл зависимостей отклоняется с перечислением участников', () => {
    const registry = createDerivationRegistry();
    expect(() =>
      registry.register({
        id: 'test',
        parameters: [{ id: 'test.attr.a', kind: 'number', label: 'a' }],
        derived: [
          {
            id: 'test.derived.x',
            kind: 'derived',
            deps: ['test.derived.y'],
            compute: () => 1,
            description: '',
          },
          {
            id: 'test.derived.y',
            kind: 'derived',
            deps: ['test.derived.x'],
            compute: () => 1,
            description: '',
          },
        ],
      }),
    ).toThrow(/цикл/);
  });

  it('форма SettingExtension проверяется отдельно (дверь JS→TS)', () => {
    expect(validateSettingExtension(miniSetting())).toEqual([]);
    expect(validateSettingExtension({ id: '' }).length).toBeGreaterThan(0);
  });
});

// --- реестр: каскад ----------------------------------------------------------

describe('МК-1: реестр — каскад по мини-сеттингу (спека §8)', () => {
  const registry = createDerivationRegistry();
  registry.register(miniSetting());

  const baseState = {
    [attr('strength')]: 8,
    [attr('agility')]: 6,
    [attr('intellect')]: 9,
    [attr('spirit')]: 7,
    [attr('luck')]: 5,
    [skill('blade')]: 3,
    [skill('bladeDefense')]: 2,
    [skill('sorcery')]: 2,
    [skill('magicDefense')]: 2,
    [skill('aim')]: 1,
    [skill('stealth')]: 0,
    [skill('survival')]: 0,
  };

  it('производные вычисляются из параметров без ручных вызовов', () => {
    const { values } = registry.evaluate(baseState);
    expect(values['test.derived.maxHealth']).toBe(10 + 8 * 2);
    // манна = атрибут + навык
    expect(values['test.derived.maxMana']).toBe(9 + 2);
    expect(values['test.derived.magicPower']).toBe(7 + 1);
    expect(values['test.derived.defense']).toBe(6 + 2);
    expect(values['test.derived.attack']).toBe(8 + 2);
  });

  it('потолок ранга навыка — от атрибута (ступени)', () => {
    const { values } = registry.evaluate(baseState);
    // Интеллект 9 → потолок 3
    expect(values['test.derived.sorceryRankCeiling']).toBe(3);
    const lower = { ...baseState, [attr('intellect')]: 3 };
    expect(registry.evaluate(lower).values['test.derived.sorceryRankCeiling']).toBe(1);
  });

  it('потолки счётчиков разрешаются в производные', () => {
    const { ceilings } = registry.evaluate(baseState);
    expect(ceilings['test.counter.health']).toBe(26);
    expect(ceilings['test.counter.mana']).toBe(11);
  });

  it('модификаторы каскадируются: аддитив на атрибуте, процент на производном', () => {
    const modifiers = {
      [attr('strength')]: [
        { source: 'spell.might', operation: '+', value: 2 },
        { source: 'wound.arm', operation: '-', value: 1 },
      ],
      'test.derived.maxHealth': [{ source: 'spell.vigor', operation: '%', value: 15 }],
    };
    const { values } = registry.evaluate(baseState, modifiers);
    // СИЛ: 8 + 2 − 1 = 9; ОЗ = (10 + 9×2) × 1.15 = 32.2 → 32
    expect(values[attr('strength')]).toBe(9);
    expect(values['test.derived.maxHealth']).toBe(32);
  });

  it('топологический порядок: все производные входят в порядок', () => {
    const order = registry.order();
    expect(order).toContain('test.derived.maxHealth');
    expect(order).toContain('test.derived.maxMana');
    expect(order).toContain('test.derived.magicPower');
    expect(order).toContain('test.derived.defense');
    expect(order).toContain('test.derived.attack');
    expect(order).toContain('test.derived.sorceryRankCeiling');
  });

  it('evaluate чистая: вход не мутируется', () => {
    const snapshot = { ...baseState };
    registry.evaluate(baseState);
    expect(baseState).toEqual(snapshot);
  });
});

// --- требования и реакции ----------------------------------------------------

describe('МК-1: требования и реакции', () => {
  const registry = createDerivationRegistry();
  registry.register(miniSetting());

  it('гейт заклинаний: требование ранга 4 и атрибута 5', () => {
    const requirements = [
      { paramId: skill('sorcery'), minRank: 4 },
      { paramId: attr('spirit'), minValue: 5 },
    ];
    const weak = { [skill('sorcery')]: 2, [attr('spirit')]: 3 };
    const gate = checkRequirements(requirements, weak);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.unmet).toHaveLength(2);

    const strong = { [skill('sorcery')]: 4, [attr('spirit')]: 5 };
    expect(checkRequirements(requirements, strong).ok).toBe(true);
  });

  it('changedParams находит изменения; reactionsFor отбирает слушателей', () => {
    const before = { 'test.derived.maxMana': 11, 'test.derived.maxHealth': 26 };
    const after = { 'test.derived.maxMana': 9, 'test.derived.maxHealth': 26 };
    const changed = changedParams(['test.derived.maxMana', 'test.derived.maxHealth'], before, after);
    expect(changed).toEqual(['test.derived.maxMana']);
    expect(registry.reactionsFor(changed).map((r) => r.id)).toEqual(['test.reaction.clampMana']);
    expect(registry.reactionsFor(['test.derived.maxHealth'])).toEqual([]);
  });
});
