// ПРИЁМОЧНЫЙ (патч 324): общий пул ОД.
//   • пул = 6, переполнение срезается, старт сессии — полный;
//   • успешная проверка: +1 ОД за каждый успех СВЕРХ сложности (сложность 1,
//     успехов 2 → +1; 3 успеха → +2 — пример владельца);
//   • крит-кубик (1 или ≤ ранга отмеченного навыка) даёт 2 успеха — его
//     прибавка попадает в «успехи сверх сложности» (владелец 324);
//   • автоуспех (сложность 0, броска не было) и провал ОД не приносят;
//   • трата «2 ОД: время крафта вдвое» требует пула; меньше 2 — отказ,
//     время полное. Пул живёт в движке (domain/actionPoints), UI позже;
//     пул ГРУППОВОЙ — к будущему экрану мастера подключится как есть.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import useCharacterStore from '../../src/store/characterStore';
import {
  AP_POOL_MAX,
  getActionPoints,
  earnActionPoints,
  spendActionPoints,
  resetActionPoints,
} from '../../domain/actionPoints';
import { craftRecipe, settleCraftTime } from '../../modules/fallout/crafting/operations';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
  resetActionPoints();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const seedStack = (itemId, quantity) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`seed_${itemId}_${Math.random().toString(36).slice(2, 7)}`]: {
      weaponId: itemId, quantity,
    } },
  }));
};

const takeAmmo = (rolls) => {
  seedStack('item_common_materials', 2);
  useCharacterStore.setState({ selectedPerks: [{ perkId: 'ammosmith', index: 0 }] });
  let i = 0;
  return craftRecipe('ammo_38', { rollD20: () => rolls[Math.min(i++, rolls.length - 1)] }, { deferTime: true });
};

describe('Общий пул ОД (324): 6, пополнение проверками, трата', () => {
  it('пул: старт полный, earn срезает по 6, spend отказывает при нехватке', () => {
    expect(AP_POOL_MAX).toBe(6);
    expect(getActionPoints()).toBe(6);
    expect(earnActionPoints(3)).toBe(6); // переполнение срезано
    expect(spendActionPoints(4)).toEqual({ ok: true, pool: 2 });
    expect(spendActionPoints(3)).toEqual({ ok: false, pool: 2 }); // «больше не потратить»
    expect(earnActionPoints(1)).toBe(3); // проверки вернули ОД в пул
    expect(resetActionPoints()).toBe(6); // новая сессия — полный
  });

  it('успех со сложностью 1 и 2 успехами даёт +1 ОД (пример владельца)', () => {
    // ИНТ 4 + навык 0 = цель 4: броски 3, 4 — два успеха; сложность 1−0 = 1.
    const result = takeAmmo([3, 4]);
    expect(result.done).toBe(true);
    expect(result.check.difficulty).toBe(1);
    expect(result.check.successes).toBe(2);
    expect(result.apEarned).toEqual({ gained: 1, pool: 6 });
  });

  it('3 успеха при сложности 1 → +2 ОД; в пул сверх капа не лезет', () => {
    spendActionPoints(5); // пул 1
    // крит: натуральная 1 даёт 2 успеха + обычный успех = 3 успеха
    const result = takeAmmo([1, 4]);
    expect(result.check.successes).toBe(3);
    expect(result.apEarned.gained).toBe(2);
    expect(result.apEarned.pool).toBe(3); // 1 + 2
  });

  it('провал ОД не приносит', () => {
    // цель 4: броски 19, 18 — ноль успехов, провал
    const result = takeAmmo([19, 18]);
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(result.apEarned).toBeUndefined();
    expect(getActionPoints()).toBe(6);
  });

  it('автоуспех (сложность 0) — броска не было, ОД нет', () => {
    seedStack('item_common_materials', 2);
    useCharacterStore.setState({
      selectedPerks: [{ perkId: 'ammosmith', index: 0 }],
      skills: { ...state().skills, REPAIR: { base: 2, total: 2 } }, // сложность 1−2 → 0
    });
    const result = craftRecipe('ammo_38', {}, { deferTime: true });
    expect(result.done).toBe(true);
    expect(result.auto).toBe(true);
    expect(result.check).toBeNull();
    expect(result.apEarned).toBeUndefined();
  });

  it('трата 2 ОД требует пула: хватило — время вдвое, не хватило — полное', () => {
    spendActionPoints(4); // пул 2
    seedStack('item_common_materials', 2);
    useCharacterStore.setState({ selectedPerks: [{ perkId: 'ammosmith', index: 0 }] });

    // проверка: 2 успеха при сложности 1 → сама приносит +1 (пул 3)
    const result = takeAmmo([3, 3]);
    expect(result.done).toBe(true);
    expect(result.apEarned.pool).toBe(3);
    expect(result.time.baseMinutes).toBe(60);

    const settled = settleCraftTime('ammo_38', { attempts: [result] }, { spendActionPoints: true });
    expect(settled.spendActionPoints).toBe(true);
    expect(settled.pool).toBe(1); // 3 − 2
    expect(settled.minutes).toBe(30); // вдвое

    // пул 1 < 2: проверка без прибыли (1 успех = сложности) не пополняет —
    // трата невозможна, время полное
    const lean = takeAmmo([4, 5]);
    expect(lean.done).toBe(true);
    expect(lean.apEarned.gained).toBe(0);
    expect(lean.apEarned.pool).toBe(1);
    const full = settleCraftTime('ammo_38', { attempts: [lean] }, { spendActionPoints: true });
    expect(full.spendActionPoints).toBe(false);
    expect(full.pool).toBe(1);
    expect(full.minutes).toBe(60);
  });
});
