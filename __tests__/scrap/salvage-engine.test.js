// Универсальный движок разбора (патч 260): форма состава, кубики DC, эффекты,
// «или», запасной режим не-хлама, атомарность обмена. Чистые функции — без стора.

import { describe, expect, it } from 'vitest';

import {
  computeJunkYields,
  computeNonJunkYield,
  runSalvage,
} from '../../domain/salvageEngine';

const noDice = () => ({ units: 0, effects: 0 });

describe('computeJunkYields — разбор по печатному составу', () => {
  it('фиксированные количества складываются по материалу', () => {
    const yields = computeJunkYields({
      composition: { options: [[{ material: 'glass', count: 1 }, { material: 'copper', count: 1 }, { material: 'glass', count: 2 }]] },
      rollDice: noDice,
    });
    expect(yields).toEqual([{ material: 'copper', count: 1 }, { material: 'glass', count: 3 }]);
  });

  it('DC-компонента: сумма значений костей; нули законны', () => {
    const yields = computeJunkYields({
      composition: { options: [[{ material: 'bone', dc: 3 }]] },
      rollDice: (n) => ({ units: n === 3 ? 4 : 0, effects: 0 }),
    });
    expect(yields).toEqual([{ material: 'bone', count: 4 }]);
    const zero = computeJunkYields({
      composition: { options: [[{ material: 'bone', dc: 3 }]] },
      rollDice: () => ({ units: 0, effects: 0 }),
    });
    expect(zero).toEqual([]);
  });

  it('base+dc («1+1 DC Steel»): база плюс кости', () => {
    const yields = computeJunkYields({
      composition: { options: [[{ material: 'steel', base: 1, dc: 1 }]] },
      rollDice: () => ({ units: 2, effects: 0 }),
    });
    expect(yields).toEqual([{ material: 'steel', count: 3 }]);
  });

  it('эффект-добавка: за каждую эффект-грань; anyOnce — ровно один раз', () => {
    const perFace = computeJunkYields({
      composition: { options: [[{ material: 'acid', dc: 1, effect: { material: 'nuclear_material', count: 1 } }]] },
      rollDice: () => ({ units: 2, effects: 2 }),
    });
    expect(perFace).toEqual([{ material: 'acid', count: 2 }, { material: 'nuclear_material', count: 2 }]);

    const anyOnce = computeJunkYields({
      composition: { options: [[{ material: 'fiber_optics', dc: 2, effect: { material: 'nuclear_material', count: 1, anyOnce: true } }]] },
      rollDice: () => ({ units: 3, effects: 2 }),
    });
    expect(anyOnce).toEqual([{ material: 'fiber_optics', count: 3 }, { material: 'nuclear_material', count: 1 }]);
  });

  it('альтернативы «или»: выбор портом choose (и у состава, и у эффекта)', () => {
    const composition = {
      options: [
        [{ material: 'copper', count: 10 }],
        [{ material: 'gold', count: 10 }],
        [{ material: 'silver', count: 10 }],
      ],
    };
    expect(computeJunkYields({ composition, rollDice: noDice, choose: () => 1 }))
      .toEqual([{ material: 'gold', count: 10 }]);
    expect(computeJunkYields({ composition, rollDice: noDice, choose: () => 5 })).toEqual([{ material: 'silver', count: 10 }]); // 5 % 3 = 2

    const effectAlt = {
      options: [[{ material: 'steel', base: 1, dc: 1, effect: { options: [{ material: 'wood', count: 1 }, { material: 'gears', count: 1 }] } }]],
    };
    expect(computeJunkYields({
      composition: effectAlt,
      rollDice: () => ({ units: 1, effects: 1 }),
      choose: () => 1, // второй выбор — «gears»
    })).toEqual([{ material: 'gears', count: 1 }, { material: 'steel', count: 2 }]);
  });
});

describe('computeNonJunkYield — общий режим для НЕ-хлама', () => {
  const pool = [{ id: 'plastic' }, { id: 'wood' }, { id: 'steel' }];

  it('одна единица выбранного материала; кап по весу предмета', () => {
    expect(computeNonJunkYield({ pool, weight: 5, choose: () => 0 })).toEqual([{ material: 'plastic', count: 1 }]);
    expect(computeNonJunkYield({ pool, weight: 5, apBonus: 3, choose: () => 0 })).toEqual([{ material: 'plastic', count: 4 }]);
    expect(computeNonJunkYield({ pool, weight: 5, apBonus: 10, choose: () => 0 })).toEqual([{ material: 'plastic', count: 5 }]); // кап = floor(вес)
    expect(computeNonJunkYield({ pool, weight: 0.2, apBonus: 5 })).toEqual([{ material: 'plastic', count: 1 }]); // минимум 1
  });

  it('пустой пул — пустой выход', () => {
    expect(computeNonJunkYield({ pool: [], weight: 3 })).toEqual([]);
  });
});

describe('runSalvage — проверка, порядок, атомарность', () => {
  const ports = ({ passed = true, spendOk = true } = {}) => {
    const calls = { spend: 0, grant: 0, dice: 0 };
    let grantTotal = 0;
    return {
      calls,
      get granted() { return grantTotal; },
      cfg: {
        rollD20: () => (passed ? 3 : 20),
        rollDice: () => { calls.dice++; return { units: 1, effects: 0 }; },
        choose: () => 0,
        spend: () => { calls.spend++; return spendOk ? { ok: true } : { ok: false, reason: 'no-stack' }; },
        grant: ({ quantity }) => { calls.grant++; grantTotal += quantity; return { instanceId: `i${calls.grant}` }; },
      },
    };
  };

  it('успех: предмет списан, выход выдан, кубики брошены после успеха', () => {
    const p = ports();
    const result = runSalvage({
      item: { itemId: 'glass_bottle', weight: 1 },
      composition: { options: [[{ material: 'glass', dc: 3 }]] },
      ...p.cfg,
    });
    expect(result.done).toBe(true);
    expect(result.spent).toEqual([{ itemId: 'glass_bottle', count: 1 }]);
    expect(result.granted).toEqual([{ itemId: 'glass', quantity: 1, instanceId: 'i1' }]);
    expect(p.calls.dice).toBe(1);
  });

  it('провал: ничего не списывается и не выдаётся, состав не бросается', () => {
    const p = ports({ passed: false });
    const result = runSalvage({
      item: { itemId: 'glass_bottle', weight: 1 },
      composition: { options: [[{ material: 'glass', dc: 3 }]] },
      ...p.cfg,
    });
    expect(result.done).toBe(false);
    expect(result.reason).toBe('check-failed');
    expect(p.calls.spend).toBe(0);
    expect(p.calls.dice).toBe(0);
    expect(result.granted).toEqual([]);
  });

  it('отказ spend на успешной проверке: выдача не началась, баланс не тронут', () => {
    const p = ports({ spendOk: false });
    const result = runSalvage({
      item: { itemId: 'glass_bottle', weight: 1 },
      composition: { options: [[{ material: 'glass', dc: 3 }]] },
      ...p.cfg,
    });
    expect(result.stage).toBe('store');
    expect(result.reason).toBe('spend-refused');
    expect(p.calls.grant).toBe(0);
    expect(result.granted).toEqual([]);
  });

  it('сложность 0: нулевой выход кубиков — успех, предмет израсходован', () => {
    const p = ports();
    const result = runSalvage({
      item: { itemId: 'glass_bottle', weight: 1 },
      composition: { options: [[{ material: 'glass', dc: 3 }]] },
      difficulty: 0,
      ...p.cfg,
      rollDice: () => ({ units: 0, effects: 0 }),
    });
    expect(result.done).toBe(true);
    expect(result.granted).toEqual([]);
    expect(p.calls.spend).toBe(1);
  });

  it('осложнение не отменяет успех: время помножается, изделие выдаётся', () => {
    const p = ports();
    const result = runSalvage({
      item: { itemId: 'bucket', weight: 3 },
      composition: { options: [[{ material: 'steel', count: 2 }]] },
      attributeValue: 5,
      minutes: 10,
      complicationDurationMultiplier: 2,
      ...p.cfg,
      rollD20: (() => { const seq = [3, 20]; let i = 0; return () => seq[i++]; })(),
    });
    expect(result.done).toBe(true);
    expect(result.time).toEqual({ minutes: 10, durationMultiplier: 2 });
    expect(result.granted[0].itemId).toBe('steel');
  });

  it('движок не понимает предметных имён: только форма (throw на мусоре)', () => {
    expect(() => runSalvage({ item: {}, spend: () => ({ ok: true }), grant: () => {} })).toThrow(/item\.itemId/);
    expect(() => runSalvage({ item: { itemId: 'x' }, spend: () => ({ ok: true }), grant: () => {} })).toThrow(/composition or pool/);
  });
});
