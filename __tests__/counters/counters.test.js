import { describe, expect, it } from 'vitest';
import {
  createCounter,
  consume,
  restore,
  set,
  canConsume,
  availableToConsume,
  isFull,
  isEmpty,
  resolveMax,
  resolveMin,
  withMax,
  isOverMax,
} from '../../domain/counters';

// Каунтер — движковая форма любого числового ресурса. Тесты намеренно
// проверяют её на ресурсах РАЗНЫХ сеттингов (крышки/здоровье/радиация Fallout
// и мана гипотетического следующего мира): если форма верна, код один и тот же.

describe('каунтер: крышки (без потолка)', () => {
  const caps = createCounter({ id: 'caps', current: 350, max: null });

  it('хранит текущее значение', () => {
    expect(caps.current).toBe(350);
  });

  it('списывает по событию сеттинга (покупка)', () => {
    expect(consume(caps, 100).current).toBe(250);
  });

  it('не уходит ниже нуля, сколько ни списывай', () => {
    expect(consume(caps, 999).current).toBe(0);
  });

  it('без потолка растёт неограниченно', () => {
    expect(restore(caps, 1_000_000).current).toBe(1_000_350);
  });

  it('отвечает, хватает ли на покупку', () => {
    expect(canConsume(caps, 350)).toBe(true);
    expect(canConsume(caps, 351)).toBe(false);
    expect(availableToConsume(caps)).toBe(350);
  });
});

describe('каунтер: здоровье (потолок — формула сеттинга)', () => {
  // Движок не знает формулы: вызывает её как чёрный ящик.
  const healthMaxFormula = (ctx) => ctx.endurance + ctx.level;
  const ctx = { endurance: 8, level: 2 };
  const hp = createCounter({ id: 'health', current: 24, max: healthMaxFormula }, ctx);

  it('зажимает стартовое значение по формуле', () => {
    expect(hp.current).toBe(10);
  });

  it('урон списывает', () => {
    expect(consume(hp, 3, ctx).current).toBe(7);
  });

  it('лечение не поднимает выше потолка', () => {
    expect(restore(hp, 50, ctx).current).toBe(10);
  });

  it('set до полного зажат потолком', () => {
    expect(set(hp, 999, ctx).current).toBe(10);
  });

  it('видит, что лечить нечего', () => {
    expect(isFull(hp, ctx)).toBe(true);
  });

  it('пересчитывает потолок при смене контекста', () => {
    expect(resolveMax(hp, { endurance: 10, level: 5 })).toBe(15);
    expect(restore(hp, 50, { endurance: 10, level: 5 }).current).toBe(15);
  });
});

describe('каунтер: радиация (потолок числом)', () => {
  const rad = createCounter({ id: 'radiation', current: 0, max: 20 });

  it('не превышает потолок', () => {
    expect(restore(rad, 100).current).toBe(20);
  });

  it('не уходит в минус', () => {
    expect(consume(rad, 5).current).toBe(0);
    expect(isEmpty(rad)).toBe(true);
  });
});

describe('каунтер: мана (тот же движок, другой сеттинг)', () => {
  const manaMaxFormula = (attrs) => attrs.intelligence * 2;
  const attrs = { intelligence: 5 };
  const mana = createCounter({ id: 'mana', current: 8, max: manaMaxFormula }, attrs);

  it('заклинание списывает ману', () => {
    expect(consume(mana, 3, attrs).current).toBe(5);
  });

  it('отдых восполняет не выше потолка', () => {
    expect(restore(mana, 100, attrs).current).toBe(10);
  });
});

describe('каунтер: current выше max — законное состояние (правило 2)', () => {
  it('падение потолка не трогает текущее значение', () => {
    // Радиация снижает максимум ОЗ, но не наносит урона.
    const hp = createCounter({ id: 'health', current: 24, max: 24 });
    const irradiated = withMax(hp, 20);
    expect(irradiated.current).toBe(24);
    expect(isOverMax(irradiated)).toBe(true);
  });

  it('restore не поднимает выше потолка даже при превышении', () => {
    // Лечение сверх максимума невозможно, хотя текущее уже выше него.
    const hp = withMax(createCounter({ id: 'health', current: 24, max: 24 }), 20);
    expect(restore(hp, 10).current).toBe(24);
  });

  it('consume работает от фактического значения', () => {
    const hp = withMax(createCounter({ id: 'health', current: 24, max: 24 }), 20);
    expect(consume(hp, 4).current).toBe(20);
  });

  it('set с allowOverMax выдаёт сверх потолка (перк «Ядерный физик», 23/20)', () => {
    const core = createCounter({ id: 'fusion_core', current: 20, max: 20 });
    expect(set(core, 23).current).toBe(20);
    expect(set(core, 23, undefined, { allowOverMax: true }).current).toBe(23);
  });

  it('нижняя граница действует и при allowOverMax', () => {
    const core = createCounter({ id: 'fusion_core', current: 5, max: 20 });
    expect(set(core, -10, undefined, { allowOverMax: true }).current).toBe(0);
  });
});

describe('каунтер: ресурс внутри предмета (правило 4)', () => {
  it('потолок берётся из каталога, current — из предмета', () => {
    // Заряд блока живёт в предмете (charges), maxCharges — в данных каталога.
    const catalog = { ammo_fusion_core: { maxCharges: 20 } };
    const item = { id: 'ammo_fusion_core', charges: 12 };
    const core = createCounter({
      id: 'fusion_core',
      current: item.charges,
      max: catalog[item.id].maxCharges,
    });
    expect(core.current).toBe(12);
    expect(consume(core, 5).current).toBe(7);
    // Обратно в предмет уходит только число.
    expect({ ...item, charges: consume(core, 5).current }.charges).toBe(7);
  });
});

describe('каунтер: устойчивость формы', () => {
  const caps = createCounter({ id: 'caps', current: 350 });

  it('игнорирует отрицательные и нечисловые суммы', () => {
    // «списать минус пять» — ошибка вызывающего, а не скрытое восполнение.
    expect(consume(caps, -50).current).toBe(350);
    expect(restore(caps, -50).current).toBe(350);
    expect(consume(caps, NaN).current).toBe(350);
    expect(restore(caps, undefined).current).toBe(350);
  });

  it('null-потолок остаётся отсутствием потолка, а не нулём', () => {
    // Number(null) === 0: без явной проверки ресурс молча обнулялся бы.
    expect(resolveMax({ max: null })).toBeNull();
    expect(resolveMax({ max: undefined })).toBeNull();
    expect(restore(createCounter({ id: 'caps', current: 10 }), 5).current).toBe(15);
  });

  it('формула, вернувшая не число, трактуется как «нет потолка»', () => {
    expect(resolveMax({ max: () => undefined })).toBeNull();
  });

  it('нижняя граница по умолчанию 0, но может быть задана', () => {
    expect(resolveMin({})).toBe(0);
    const debt = createCounter({ id: 'debt', current: -5, min: -10 });
    expect(debt.current).toBe(-5);
    expect(consume(debt, 100).current).toBe(-10);
  });

  it('не мутирует исходный каунтер', () => {
    const before = JSON.stringify(caps);
    consume(caps, 10);
    restore(caps, 10);
    set(caps, 1);
    expect(JSON.stringify(caps)).toBe(before);
  });

  it('сериализуем — переживает сохранение в сейв', () => {
    const counter = createCounter({ id: 'caps', current: 5 });
    expect(JSON.parse(JSON.stringify(counter))).toEqual({
      id: 'caps',
      max: null,
      min: 0,
      current: 5,
    });
  });

  it('требует id ресурса', () => {
    expect(() => createCounter({ current: 1 })).toThrow();
  });
});
