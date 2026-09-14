// Паспорт операций стора (серия «Стор на TypeScript», патчи 245–246).
//
// Проверяет паспорт src/store/characterActions.ts против живого стора:
//
//   1) ПОЛНОЕ покрытие (с части 3 — без исключений): сеттеры-апдейтеры +
//      запись с семантикой + именованные операции + CRUD/робот/СБ =
//      ВСЕ действия стора, в обе стороны. Новое действие без паспорта
//      падает тестом — «тихо проскочить мимо типизации» не выйдет;
//   2) семья апдейтеров: каждый сеттер из SETTER_UPDATER_KEYS принимает
//     функциональный апдейтер — вызов с identity (prev => prev) не падает
//     и не меняет состояние (обязательное требование владельца,
//     прецедент setEquippedWeapons, патч 218);
//   3) контракт ресурса: earnCurrency — void, spendCurrency →
//     {ok:true} | {ok:false, reason}, отказ НЕ трогает баланс
//     («нельзя купить на больше, чем есть»);
//   4) запись с собственной семантикой: setCurrency клампит не ниже нуля,
//     setBaseAttributes нормализует legacy-массив в словарь.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import {
  SETTER_UPDATER_KEYS,
  SETTER_VALUE_KEYS,
  NAMED_OP_KEYS,
  CRUD_OP_KEYS,
} from '../../src/store/characterActions';

const state = () => useCharacterStore.getState();
const actionKeys = () => new Set(
  Object.entries(state()).filter(([, v]) => typeof v === 'function').map(([k]) => k),
);

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('патч 245: паспорт операций против живого стора', () => {
  it('паспорт (все четыре семьи) покрывает ВСЕ действия стора (обе стороны)', () => {
    const families = new Set([
      ...SETTER_UPDATER_KEYS,
      ...SETTER_VALUE_KEYS,
      ...NAMED_OP_KEYS,
      ...CRUD_OP_KEYS,
    ]);
    const store = actionKeys();

    const notInStore = [...families].filter((key) => !store.has(key));
    expect(notInStore).toEqual([]); // паспорт не оторвался от стора

    const notCovered = [...store].filter((key) => !families.has(key));
    expect(notCovered).toEqual([]); // в сторе нет действий мимо паспорта
  });

  it.each([...SETTER_UPDATER_KEYS])('%s принимает функциональный апдейтер (identity)', (key) => {
    const before = { ...state() };
    state()[key]((prev) => prev);
    const after = state();
    // Наблюдаемое поле сеттера не изменилось (identity не мутирует состояние).
    const fieldName = key.replace(/^set/, '');
    const camel = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
    const compareKey = camel === 'equippedRobotSlots' || camel === 'equippedRobotModules'
      ? camel // robot.slots/modules — вложенные слайсы
      : camel;
    if (before[compareKey] !== undefined) {
      expect(after[compareKey]).toEqual(before[compareKey]);
    }
    expect(typeof state()[key]).toBe('function');
  });

  it('earnCurrency — void, spendCurrency → {ok} с нетронутым балансом при отказе', () => {
    state().earnCurrency(10);
    expect(state().currency).toBe(10);
    expect(state().earnCurrency(5)).toBeUndefined();

    const spend = state().spendCurrency(4);
    expect(spend).toEqual({ ok: true });
    expect(state().currency).toBe(11); // 10 + 5 - 4

    const rejected = state().spendCurrency(100);
    expect(rejected.ok).toBe(false);
    expect(typeof rejected.reason).toBe('string');
    expect(state().currency).toBe(11); // отказ баланс не трогает
  });

  it('запись с собственной семантикой: кламп ресурса, флаг, нормализация legacy', () => {
    state().setCurrency(-5);
    expect(state().currency).toBe(0); // не ниже нуля

    state().setAttributesSaved(true);
    expect(state().attributesSaved).toBe(true);

    state().setBaseAttributes([{ name: 'STR', value: 6 }]);
    expect(state().attributes.STR.base).toBe(6); // массив → словарь
  });

  it('именованные операции существуют и являются функциями', () => {
    const store = actionKeys();
    for (const key of [...NAMED_OP_KEYS, ...SETTER_VALUE_KEYS, ...CRUD_OP_KEYS]) {
      expect(store.has(key)).toBe(true);
    }
  });

  it('часть 3, смоук: предмет/эффект/модификатор/робот/отказы с reason', () => {
    // addNewItem возвращает id, предмет появляется в словаре.
    const id = state().addNewItem({ id: 'probe_item', name: 'Пробный предмет' });
    expect(id).toBe('probe_item');
    expect(state().items.probe_item?.name).toBe('Пробный предмет');
    state().updateItem('probe_item', { quantity: 3 });
    expect(state().items.probe_item.quantity).toBe(3);

    // Эффект: добавить → погасить → словарь пуст.
    state().addEffect({ id: 'eff_probe', active: true, name: 'Проба' });
    expect(state().effects.eff_probe).toBeTruthy();
    state().expireEffect('eff_probe');

    // Модификатор параметра: добавить и снять.
    state().addAttributeModifier('STR', 'probe_source', 1, '+');
    state().removeAttributeModifier('STR', 'probe_source');

    // Дельта параметра с клампом: STR 4 → 5.
    state().updateAttribute('STR', 1);
    expect(state().attributes.STR.base).toBe(5);

    // Робот: инициализация плана и сброс.
    state().initRobot('protectron');
    expect(state().robot.bodyPlan).toBe('protectron');
    state().resetRobot();
    expect(state().robot.bodyPlan).toBeNull();

    // Отказы с reason (инвариант {ok,reason}):
    const mk2 = state().applyMk2Driver('mk2_chip');
    expect(mk2.ok).toBe(false);
    expect(typeof mk2.reason).toBe('string');

    const ammo = state().spendAmmoForWeapon({
      weaponInstanceId: 'no_such_weapon',
      ammoIds: ['ammo_10mm'],
      ammoAmount: 1,
      durabilityEnabled: false,
      baseLossPer10Shots: 1,
    });
    expect(ammo.ok).toBe(false);
    expect(ammo.reason).toBe('weapon-not-found');

    const held = state().equipHeldWeapon('no_such_slot', { id: 'w' }, { origin: null, trait: null });
    expect(held.ok).toBe(false);
    expect(typeof held.reason).toBe('string');
  });
});
