// КОНТРАКТ ВЫВОДИМОСТИ — приёмочный тест МК-1 (патчи 281–284).
//
// КРИТЕРИЙ УСПЕХА (карта каскада §8, слово владельца): мини-сеттинг
// описывается ДЕКЛАРАЦИЕЙ без правок движка — 5 атрибутов, 7 навыков,
// 5 производных (здоровье, манна, сила магии, защита, нападение),
// 5 заклинаний с требованием ранга 4, бонусы +5/10/15%, потолок ранга
// навыка — от атрибута, манна = атрибут + навык.
//
// СЛОВО ВЛАДЕЛЬЦА (2026-09-18, патч 283): «как в правилах напишут, так %
// и будут рассчитываться. [...] Базовая скорострельность будет зависеть от
// установленных модов, % от черты будет влиять на неё, а перк уже после
// удваивать. Но может быть и случай, когда черта вместо базовой
// скорострельности будет увеличивать итоговую [...] А может вообще
// примениться, если скорострельность будет меньше или равна определённому
// значению. И это хрен угадаешь.» Движок исполняет объявленный порядок.
//
// Реестр пока никуда не подключён (изоляция МК-1→МК-3): этот тест —
// единственный потребитель. При подключении (патчи 285+) тест остаётся
// эквивалентностью контракта.

import { describe, expect, it } from 'vitest';
import {
  applyPercent,
  applyPipeline,
  ceilingFor,
  changedParams,
  checkRequirements,
  validateSettingExtension,
} from '../../src/engine/contracts/index';
import { createDerivationRegistry } from '../../src/engine/derivations/registry';

const emptyCtx = { values: {}, modifiers: {} };

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
    // Скорострельность — по примеру владельца: фазы объявляет правило.
    {
      id: 'test.attr.fireRate',
      kind: 'number',
      label: 'скорострельность',
      modifierPhases: ['mods', 'traitPercent', 'perkMult'],
    },
    {
      // Второй вариант из слова владельца: «черта вместо базовой скорострельности
      // увеличивает итоговую — уже после расчёта базы + влияния перка».
      id: 'test.attr.fireRateFinisher',
      kind: 'number',
      label: 'скорострельность (черта итоговой)',
      modifierPhases: ['mods', 'perkMult', 'traitPercent'],
    },
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
    {
      // Ярость ботаника — по примеру владельца: срабатывает, когда текущие ОЗ
      // меньше 30% от МАКСИМУМА, а максимум сам движется (химия +50%).
      id: 'test.reaction.nerdRage',
      watch: ['test.derived.maxHealth'],
      on: () => {},
      description: 'Ярость ботаника: текущие ОЗ < 30% макс. ОЗ',
    },
  ],
});

// --- модификаторы: конвейер по объявлению ------------------------------------

describe('МК-1: контракт выводимости — модификаторы', () => {
  it('дефолтный конвейер: set → аддитивы → суммарный процент → множители', () => {
    // СИЛ в силовой броне = 11 (set), +2 перк, −2 рана, +10% и +5%, ×2
    const mods = [
      { source: 'perk.bruiser', operation: '+', value: 2 },
      { source: 'armor.pa', operation: 'set', value: 11 },
      { source: 'wound.arm', operation: '-', value: 2 },
      { source: 'perk.tough', operation: '%', value: 10 },
      { source: 'spell.bless', operation: '%', value: 5 },
      { source: 'perk.double', operation: '×', value: 2 },
    ];
    // set 11 → +2 −2 = 11; ×1.15 = 12.65; ×2 = 25.3 → 25
    expect(applyPipeline(5, mods, ['add', 'percent', 'mult'], emptyCtx)).toBe(25);
  });

  it('без модификаторов значение возвращается как есть', () => {
    expect(applyPipeline(7, [], ['add', 'percent', 'mult'], emptyCtx)).toBe(7);
  });

  it('несколько set: берётся последний (переопределение сильнее дополнения)', () => {
    const mods = [
      { source: 'armor.pa', operation: 'set', value: 11 },
      { source: 'armor.advanced', operation: 'set', value: 13 },
    ];
    expect(applyPipeline(5, mods, ['add'], emptyCtx)).toBe(13);
  });

  it('модификатор в необъявленную фазу — ошибка с перечислением объявленных', () => {
    const mods = [{ source: 'trait.x', operation: '%', value: 10, phase: 'finalPercent' }];
    expect(() => applyPipeline(5, mods, ['add', 'percent'], emptyCtx)).toThrow(/finalPercent/);
  });
});

// --- проценты: всегда от объявленной базы ------------------------------------

describe('МК-1: проценты — от базы, которую объявило правило', () => {
  it('слово владельца: +15% жизней = база ОЗ × 1.15, округлённая математически', () => {
    expect(applyPercent(26, [15])).toBe(30); // 26 × 1.15 = 29.9 → 30
  });

  it('слово владельца: +15% защиты от магии огня = −15% входящего урона огня', () => {
    expect(applyPercent(100, [-15])).toBe(85);
  });

  it('несколько процентов суммируются и применяются одним множителем', () => {
    expect(applyPercent(40, [10, 5])).toBe(46); // 40 × 1.15 = 46
  });
});

// --- фазы-якоря: пример владельца «скорострельность» -------------------------

describe('МК-1: фазы — скорострельность (пример владельца)', () => {
  const registry = createDerivationRegistry();
  registry.register(miniSetting());
  // test.attr.fireRate объявлен с фазами: mods → traitPercent → perkMult

  const FIRE = 'test.attr.fireRate';

  it('база 5, моды +1/−2, черта +10% базы, перк ×2 → 9', () => {
    // «Базовая скорострельность будет зависеть от установленных модов,
    //  % от черты будет влиять на неё, а перк уже после удваивать»
    const { values } = registry.evaluate({ [FIRE]: 5 }, {
      [FIRE]: [
        { source: 'mod.trigger', operation: '+', value: 1, phase: 'mods' },
        { source: 'mod.heavy', operation: '-', value: 2, phase: 'mods' },
        { source: 'trait.gunner', operation: '%', value: 10, phase: 'traitPercent' },
        { source: 'perk.doubletap', operation: '×', value: 2, phase: 'perkMult' },
      ],
    });
    // 5 +1 −2 = 4; ×1.1 = 4.4; ×2 = 8.8 → 9
    expect(values[FIRE]).toBe(9);
  });

  it('черта даёт +10% ИТОГОВОЙ (после перка): порядок фаз объявлен правилом', () => {
    const FINISH = 'test.attr.fireRateFinisher';
    const mods = [
      { source: 'mod.trigger', operation: '+', value: 1, phase: 'mods' },
      { source: 'mod.heavy', operation: '-', value: 2, phase: 'mods' },
      { source: 'trait.finisher', operation: '%', value: 10, phase: 'traitPercent' },
      { source: 'perk.doubletap', operation: '×', value: 2, phase: 'perkMult' },
    ];
    const { values } = registry.evaluate({ [FINISH]: 5 }, { [FINISH]: mods });
    // fireRateFinisher объявлен mods → perkMult → traitPercent:
    // 4 → ×2 = 8 → ×1.1 = 8.8 → 9. Проценты и множители коммутируют,
    // поэтому без промежуточных округлений итог совпадает с первым вариантом;
    // наблюдаемая разница якорей — в следующем тесте (округление по фазам).
    expect(values[FINISH]).toBe(9);
  });

  it('якорь наблюдаем через пофазное округление: % базы против % итоговой', () => {
    // Одни и те же модификаторы, но порядок фаз (якорь %) разный — и правила
    // с промежуточным округлением дают РАЗНЫЕ числа: 8 против 9.
    const mods = [
      { source: 'mod.trigger', operation: '+', value: 1, phase: 'mods' },
      { source: 'mod.heavy', operation: '-', value: 2, phase: 'mods' },
      { source: 'trait', operation: '%', value: 10, phase: 'percentPhase' },
      { source: 'perk', operation: '×', value: 2, phase: 'perkPhase' },
    ];
    // % базы с модами, округлить, потом перк: 4 ×1.1 = 4.4 → 4 → ×2 = 8
    const baseAnchored = applyPipeline(5, mods, ['mods', { id: 'percentPhase', round: true }, 'perkPhase'], emptyCtx);
    // перк, округлить, потом % итоговой: 4 ×2 = 8 → 8 ×1.1 = 8.8 → 9
    const finalAnchored = applyPipeline(5, mods, ['mods', { id: 'perkPhase', round: true }, 'percentPhase'], emptyCtx);
    expect(baseAnchored).toBe(8);
    expect(finalAnchored).toBe(9);
  });

  it('якорь наблюдаем: % базы с модами против % сырой базы — разные числа', () => {
    // Порядок фаз решает: mods → percent (по умолчанию) даёт 4×1.1 = 4.4 → 4,
    // а percent → mods даёт 5×1.1 = 5.5 → +1 −2 = 4.5 → 5 (математически).
    const after = applyPipeline(
      5,
      [
        { source: 'mod.trigger', operation: '+', value: 1 },
        { source: 'mod.heavy', operation: '-', value: 2 },
        { source: 'trait.gunner', operation: '%', value: 10 },
      ],
      ['add', 'percent'],
      emptyCtx,
    );
    const before = applyPipeline(
      5,
      [
        { source: 'mod.trigger', operation: '+', value: 1 },
        { source: 'mod.heavy', operation: '-', value: 2 },
        { source: 'trait.gunner', operation: '%', value: 10 },
      ],
      ['percent', 'add'],
      emptyCtx,
    );
    expect(after).toBe(4); // (5+1−2) × 1.1 = 4.4 → 4
    expect(before).toBe(5); // (5×1.1) +1 −2 = 4.5 → 5
  });

  it('условный модификатор: перк ×2 действует, только если скорострельность ≤ 5', () => {
    // «А может вообще примениться, если скорострельность будет меньше
    //  или равна определённому значению» — условие видит вход фазы.
    const when = (value) => value <= 5;
    const heavy = registry.evaluate({ [FIRE]: 5 }, {
      [FIRE]: [
        { source: 'mod.heavy', operation: '-', value: 1, phase: 'mods' },
        { source: 'trait.gunner', operation: '%', value: 10, phase: 'traitPercent' },
        { source: 'perk.conditional', operation: '×', value: 2, phase: 'perkMult', when },
      ],
    });
    // 5−1 = 4; ×1.1 = 4.4 ≤ 5 → ×2 = 8.8 → 9
    expect(heavy.values[FIRE]).toBe(9);

    const fast = registry.evaluate({ [FIRE]: 8 }, {
      [FIRE]: [
        { source: 'mod.heavy', operation: '-', value: 1, phase: 'mods' },
        { source: 'trait.gunner', operation: '%', value: 10, phase: 'traitPercent' },
        { source: 'perk.conditional', operation: '×', value: 2, phase: 'perkMult', when },
      ],
    });
    // 8−1 = 7; ×1.1 = 7.7 > 5 → перк не действует → 7.7 → 8
    expect(fast.values[FIRE]).toBe(8);
  });

  it('промежуточное округление фазой: round:true на выходе фазы', () => {
    const phased = applyPipeline(
      5,
      [
        { source: 'mod.trigger', operation: '+', value: 1 },
        { source: 'trait.gunner', operation: '%', value: 10 },
        { source: 'perk.doubletap', operation: '×', value: 2 },
      ],
      [{ id: 'add' }, { id: 'percent', round: true }, { id: 'mult' }],
      emptyCtx,
    );
    // 6 × 1.1 = 6.6 → округлили в фазе → 7; ×2 = 14
    expect(phased).toBe(14);
    const unphased = applyPipeline(
      5,
      [
        { source: 'mod.trigger', operation: '+', value: 1 },
        { source: 'trait.gunner', operation: '%', value: 10 },
        { source: 'perk.doubletap', operation: '×', value: 2 },
      ],
      ['add', 'percent', 'mult'],
      emptyCtx,
    );
    // 6.6 × 2 = 13.2 → 13
    expect(unphased).toBe(13);
  });
});

// --- Ярость ботаника: порог от динамического максимума ------------------------

describe('МК-1: Ярость ботаника — порог смещается вместе с максимумом ОЗ', () => {
  const registry = createDerivationRegistry();
  registry.register(miniSetting());

  const state = { [attr('strength')]: 10 }; // ОЗ = 10 + 10×2 = 30

  /** Логика перка: текущие ОЗ < 30% максимальных. */
  const nerdRageActive = (values, currentHp) => currentHp < 0.3 * values['test.derived.maxHealth'];

  it('без химии: 12 из 30 = 40% — перк молчит', () => {
    const { values } = registry.evaluate(state);
    expect(values['test.derived.maxHealth']).toBe(30);
    expect(nerdRageActive(values, 12)).toBe(false);
  });

  it('химия +50% максимума: 12 из 45 = 27% — перк сработал, планка сместилась', () => {
    // «Временно макс ОЗ будет на 50% больше — и тогда планка менее 30%
    //  текущих ОЗ от максимума сместится»
    const { values, ceilings } = registry.evaluate(state, {
      'test.derived.maxHealth': [{ source: 'chem.superStimpak', operation: '%', value: 50 }],
    });
    expect(values['test.derived.maxHealth']).toBe(45);
    expect(ceilings['test.counter.health']).toBe(45);
    expect(nerdRageActive(values, 12)).toBe(true);
  });

  it('реакция слушает изменение максимума — каскад её находит', () => {
    const before = registry.evaluate(state).values;
    const after = registry.evaluate(state, {
      'test.derived.maxHealth': [{ source: 'chem.superStimpak', operation: '%', value: 50 }],
    }).values;
    const changed = changedParams(['test.derived.maxHealth'], before, after);
    expect(changed).toEqual(['test.derived.maxHealth']);
    const fired = registry.reactionsFor(changed).map((r) => r.id);
    expect(fired).toContain('test.reaction.nerdRage');
  });
});

// --- округление: направление диктует сеттинг (слово владельца, 284) ---------

describe('МК-1: округление — направление диктует сеттинг', () => {
  // «(10+18)×1.15 = 32.2 → 32 — тоже не обязательное состояние. Сеттинг может
  //  диктовать, в какую сторону должно быть округление. И может быть и 32
  //  и 33. И например при 32.01 правило будет заставлять округлить в большую
  //  или меньшую сторону до целого.»
  const roundSetting = () => ({
    id: 'round',
    parameters: [{ id: 'round.attr.str', kind: 'number', label: 'СИЛ' }],
    derived: [
      {
        id: 'round.derived.hpMath',
        kind: 'max',
        deps: ['round.attr.str'],
        compute: (ctx) => 10 + ctx.values['round.attr.str'] * 2,
        description: 'ОЗ, округление по умолчанию (математическое)',
      },
      {
        id: 'round.derived.hpDown',
        kind: 'max',
        deps: ['round.attr.str'],
        compute: (ctx) => 10 + ctx.values['round.attr.str'] * 2,
        description: 'ОЗ, округление в меньшую',
        rounding: 'down',
      },
      {
        id: 'round.derived.hpUp',
        kind: 'max',
        deps: ['round.attr.str'],
        compute: (ctx) => 10 + ctx.values['round.attr.str'] * 2,
        description: 'ОЗ, округление в большую',
        rounding: 'up',
      },
      {
        id: 'round.derived.hpExact',
        kind: 'max',
        deps: ['round.attr.str'],
        compute: (ctx) => 10 + ctx.values['round.attr.str'] * 2,
        description: 'ОЗ, без округления',
        rounding: 'none',
      },
      {
        id: 'round.derived.penny',
        kind: 'derived',
        deps: ['round.attr.str'],
        compute: () => 32.01,
        description: 'значение 32.01 — правило решает, куда округлить',
        rounding: 'up',
      },
      {
        id: 'round.derived.pennyDown',
        kind: 'derived',
        deps: ['round.attr.str'],
        compute: () => 32.01,
        description: 'значение 32.01 — вниз',
        rounding: 'down',
      },
    ],
  });

  const registry = createDerivationRegistry();
  registry.register(roundSetting());

  const modifiers = {
    'round.derived.hpMath': [{ source: 'spell', operation: '%', value: 15 }],
    'round.derived.hpDown': [{ source: 'spell', operation: '%', value: 15 }],
    'round.derived.hpUp': [{ source: 'spell', operation: '%', value: 15 }],
    'round.derived.hpExact': [{ source: 'spell', operation: '%', value: 15 }],
  };

  it('(10+18)×1.15 = 32.2: математическое → 32, в меньшую → 32, в большую → 33', () => {
    const { values } = registry.evaluate({ 'round.attr.str': 9 }, modifiers);
    expect(values['round.derived.hpMath']).toBe(32); // Math.round(32.2)
    expect(values['round.derived.hpDown']).toBe(32); // пол
    expect(values['round.derived.hpUp']).toBe(33); // потолок
    expect(values['round.derived.hpExact']).toBeCloseTo(32.2, 10); // не округляем
  });

  it('при 32.01 правило заставляет: в большую → 33, в меньшую → 32', () => {
    const { values } = registry.evaluate({ 'round.attr.str': 9 });
    expect(values['round.derived.penny']).toBe(33);
    expect(values['round.derived.pennyDown']).toBe(32);
  });

  it('applyPercent тоже подчиняется режиму: 26×1.15 = 29.9 → вниз 29, math 30', () => {
    expect(applyPercent(26, [15], 'down')).toBe(29);
    expect(applyPercent(26, [15])).toBe(30);
    expect(applyPercent(26, [15], 'up')).toBe(30);
  });

  it('фаза может округлять своим режимом, не как итог', () => {
    // конвейер: 4 ×1.1 = 4.4 — фаза округляет вверх → 5; итог не дробится
    const up = applyPipeline(
      4,
      [{ source: 'trait', operation: '%', value: 10 }],
      [{ id: 'percent', round: 'up' }],
      emptyCtx,
    );
    expect(up).toBe(5);
    // та же фаза вниз → 4
    const down = applyPipeline(
      4,
      [{ source: 'trait', operation: '%', value: 10 }],
      [{ id: 'percent', round: 'down' }],
      emptyCtx,
    );
    expect(down).toBe(4);
  });

  it('неизвестный режим округления отклоняется при регистрации', () => {
    const bad = createDerivationRegistry();
    expect(() =>
      bad.register({
        id: 'round',
        parameters: [{ id: 'round.attr.str', kind: 'number', label: 'СИЛ', rounding: 'кверх' }],
      }),
    ).toThrow(/режим округления/);
    expect(() =>
      bad.register({
        id: 'round',
        parameters: [
          { id: 'round.attr.str', kind: 'number', label: 'СИЛ', modifierPhases: [{ id: 'x', round: 'боком' }] },
        ],
      }),
    ).toThrow(/режим округления/);
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

  it('пустой или кривой список фаз отклоняется', () => {
    const registry = createDerivationRegistry();
    expect(() =>
      registry.register({
        id: 'test',
        parameters: [
          { id: 'test.attr.a', kind: 'number', label: 'a', modifierPhases: [] },
        ],
      }),
    ).toThrow(/modifierPhases/);
    expect(() =>
      registry.register({
        id: 'test',
        parameters: [
          { id: 'test.attr.a', kind: 'number', label: 'a', modifierPhases: [{ id: 'x' }, { id: 'x' }] },
        ],
      }),
    ).toThrow(/дважды/);
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

  it('процент на производном: база формулы × 1.15 (слово владельца про +15% жизней)', () => {
    const { values, ceilings } = registry.evaluate(baseState, {
      'test.derived.maxHealth': [{ source: 'spell.vigor', operation: '%', value: 15 }],
    });
    // ОЗ = 26 × 1.15 = 29.9 → 30
    expect(values['test.derived.maxHealth']).toBe(30);
    expect(ceilings['test.counter.health']).toBe(30);
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
    expect(registry.reactionsFor(['test.derived.maxHealth']).map((r) => r.id)).toEqual(['test.reaction.nerdRage']);
  });
});
