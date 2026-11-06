// ПРИЁМОЧНЫЙ (патч 550): удалить при конверсии/приживании.
//
// Слово владельца: «при нехватке заколок — стоп. Одна заколка = одна заколка».
//
// До 550 при нехватке списывался остаток: стор отказывал честно
// (`not-enough-items`), но легаси-резерв `consumeBobbyPins` затем расходовал что
// было — при 1 заколке и запросе на 3 исчезала одна. Теперь правило общее для
// обеих дорог и для сервера, и для клиента: списываем всё запрошенное или ничего.
// Это правило 5 устава: отказ не трогает баланс.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/saves/characterSaves', () => ({
  saveCharacter: vi.fn(async () => 'ch1'),
}));
vi.mock('../../src/room/roomCharacterSync', () => ({
  pushSavedCharacterToBoundRoomIfAny: vi.fn(async () => true),
}));

import { createRequire } from 'node:module';
import { spendBobbyPins, BOBBY_PIN_ITEM_ID } from '../../components/lootTrade/spendBobbyPins';
import { applyCharacterCommand, CHAR_COMMAND_KIND } from '../../components/gm/charCommands';
import { saveCharacter } from '../../src/saves/characterSaves';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import useCharacterStore from '../../src/store/characterStore';

// Серверный канон — CommonJS.
const require = createRequire(import.meta.url);
const engine = require('../../server/lockPicking.js');

const state = () => useCharacterStore.getState();
const pinsLeft = () => engine.countBobbyPins({
  items: state().items || {},
  equipment: state().equipment || {},
  inventory: state().inventory || [],
  bag: state().bag || [],
});

/** Каноническая запись каталога — путь стора. */
const seedCanonical = (quantity) => {
  useCharacterStore.setState({
    currentCharacterId: 'ch1',
    characterName: 'Сталкер',
    items: {
      p1: { id: 'p1', weaponId: BOBBY_PIN_ITEM_ID, name: 'Заколка', quantity, condition: 90 },
      gun: { id: 'gun', weaponId: 'weapon_10mm', name: 'Пистолет', quantity: 1 },
    },
    equipment: {}, inventory: [], bag: [],
  });
};

/** Легаси-форма: стор её не узнаёт, работает резервный канон сервера. */
const seedLegacy = (count) => {
  useCharacterStore.setState({
    currentCharacterId: 'ch1',
    characterName: 'Сталкер',
    items: { p1: { id: 'p1', catalogId: BOBBY_PIN_ITEM_ID, count: String(count), name: 'Заколка' } },
    equipment: {}, inventory: [], bag: [],
  });
};

const gmSpend = (count) => applyCharacterCommand({
  commandId: 'c1', characterId: 'ch1',
  kind: CHAR_COMMAND_KIND.ITEM_SPEND,
  payload: { itemId: BOBBY_PIN_ITEM_ID, count },
});

beforeEach(() => {
  vi.clearAllMocks();
  state().resetCharacterStore();
});

describe('550: канон сервера — всё или ничего', () => {
  it('запрос больше запаса не списывает НИЧЕГО и возвращает нетронутый снимок', () => {
    const snapshot = { items: { p: { weaponId: BOBBY_PIN_ITEM_ID, quantity: 1 } } };
    const result = engine.consumeBobbyPins(snapshot, 3);
    expect(result.consumed).toBe(0);
    expect(result.refused).toBe('not-enough-pins');
    expect(engine.countBobbyPins(result.snapshot)).toBe(1);
    // Исходник не мутирован.
    expect(snapshot.items.p.quantity).toBe(1);
  });

  it('ровно по запасу — списывается полностью (одна заколка = одна заколка)', () => {
    const snapshot = { items: { p: { weaponId: BOBBY_PIN_ITEM_ID, quantity: 3 } } };
    const result = engine.consumeBobbyPins(snapshot, 3);
    expect(result.consumed).toBe(3);
    expect(result.refused).toBeUndefined();
    expect(engine.countBobbyPins(result.snapshot)).toBe(0);
  });

  it('запас из нескольких стопок считается целиком, нехватка в сумме — стоп', () => {
    const spread = {
      items: { a: { weaponId: BOBBY_PIN_ITEM_ID, quantity: 1 } },
      inventory: [{ snapshot: { catalogId: BOBBY_PIN_ITEM_ID, count: '2' } }],
    };
    expect(engine.countBobbyPins(spread)).toBe(3);
    expect(engine.consumeBobbyPins(spread, 4).consumed).toBe(0);
    expect(engine.countBobbyPins(engine.consumeBobbyPins(spread, 4).snapshot)).toBe(3);
    expect(engine.consumeBobbyPins(spread, 3).consumed).toBe(3);
  });

  it('нулевой запрос остаётся пустым вызовом без отказа', () => {
    const snapshot = { items: { p: { weaponId: BOBBY_PIN_ITEM_ID, quantity: 1 } } };
    const result = engine.consumeBobbyPins(snapshot, 0);
    expect(result.consumed).toBe(0);
    expect(result.refused).toBeUndefined();
    expect(engine.countBobbyPins(result.snapshot)).toBe(1);
  });

  it('совсем без заколок — отказ, а не частичный успех', () => {
    const result = engine.consumeBobbyPins({ items: { cap: { itemId: 'caps', quantity: 12 } } }, 1);
    expect(result.consumed).toBe(0);
    expect(result.refused).toBe('not-enough-pins');
    expect(result.snapshot.items.cap.quantity).toBe(12);
  });
});

describe('550: клиент — стоп до мутации, лист не сохраняется и не публикуется', () => {
  it('канонический сейв: 1 заколка и запрос 3 — заколка цела', async () => {
    seedCanonical(1);
    expect(await spendBobbyPins(3, { characterId: 'ch1' })).toBe(0);
    expect(pinsLeft()).toBe(1);
    expect(state().items.p1).toMatchObject({ quantity: 1, name: 'Заколка', condition: 90 });
    expect(state().items.gun).toMatchObject({ name: 'Пистолет', quantity: 1 });
    expect(saveCharacter).not.toHaveBeenCalled();
    expect(pushSavedCharacterToBoundRoomIfAny).not.toHaveBeenCalled();
  });

  it('легаси-сейв: тот же стоп, остаток не доедается', async () => {
    seedLegacy(2);
    expect(await spendBobbyPins(3, { characterId: 'ch1' })).toBe(0);
    expect(pinsLeft()).toBe(2);
    expect(state().items.p1).toMatchObject({ catalogId: BOBBY_PIN_ITEM_ID, count: '2', name: 'Заколка' });
    expect(saveCharacter).not.toHaveBeenCalled();
    expect(pushSavedCharacterToBoundRoomIfAny).not.toHaveBeenCalled();
  });

  it('хватает — списание обычное, лист сохраняется и публикуется', async () => {
    seedCanonical(5);
    expect(await spendBobbyPins(2, { characterId: 'ch1' })).toBe(2);
    expect(pinsLeft()).toBe(3);
    expect(saveCharacter).toHaveBeenCalledWith('Сталкер');
    expect(pushSavedCharacterToBoundRoomIfAny).toHaveBeenCalledWith('ch1');
  });

  it('последняя заколка ровно по запросу исчезает полностью', async () => {
    seedCanonical(1);
    expect(await spendBobbyPins(1, { characterId: 'ch1' })).toBe(1);
    expect(pinsLeft()).toBe(0);
    expect(state().items.p1).toBeUndefined();
    expect(saveCharacter).toHaveBeenCalledTimes(1);
  });

  it('легаси-сейв по запасу списывается резервным каноном', async () => {
    seedLegacy(2);
    expect(await spendBobbyPins(2, { characterId: 'ch1' })).toBe(2);
    expect(pinsLeft()).toBe(0);
    expect(saveCharacter).toHaveBeenCalledTimes(1);
  });

  it('повторный отказ ничего не портит: сколько бы раз ни просили', async () => {
    seedCanonical(1);
    for (let i = 0; i < 3; i += 1) {
      expect(await spendBobbyPins(5, { characterId: 'ch1' })).toBe(0);
    }
    expect(pinsLeft()).toBe(1);
    expect(saveCharacter).not.toHaveBeenCalled();
  });
});

describe('550: равенство Мастера и игрока сохранено (закон 549)', () => {
  it('команда Мастера при нехватке тоже стоп — лист совпадает с рукой игрока', async () => {
    seedCanonical(1);
    const byPlayerSpent = await spendBobbyPins(3, { characterId: 'ch1', publish: false });
    const byPlayer = { pins: pinsLeft(), items: JSON.stringify(state().items) };

    state().resetCharacterStore();
    seedCanonical(1);
    const result = await gmSpend(3);
    expect(result.ok).toBe(true);
    expect(result.spent).toBe(byPlayerSpent);
    expect({ pins: pinsLeft(), items: JSON.stringify(state().items) }).toEqual(byPlayer);
    expect(byPlayerSpent).toBe(0);
    expect(byPlayer.pins).toBe(1);
  });

  it('команда Мастера по запасу списывает ровно столько же, сколько игрок', async () => {
    seedCanonical(4);
    await spendBobbyPins(2, { characterId: 'ch1', publish: false });
    const byPlayer = pinsLeft();

    state().resetCharacterStore();
    seedCanonical(4);
    const result = await gmSpend(2);
    expect(result.spent).toBe(2);
    expect(pinsLeft()).toBe(byPlayer);
    expect(byPlayer).toBe(2);
  });
});

describe('550: доска тоже останавливается — заколок нет, нажатий нет', () => {
  const snapshotWithPins = (quantity) => ({
    attributes: { PER: 5, LCK: 5 },
    skills: { Lockpick: 0 },
    items: quantity > 0 ? { p: { weaponId: BOBBY_PIN_ITEM_ID, quantity } } : {},
  });

  it('без заколок доска не играет: OUT OF PINS и нажатие отвергнуто', () => {
    const game = engine.createLockGame({
      config: { difficulty: 1 },
      characterSnapshot: snapshotWithPins(0),
      rng: () => 0.5,
    });
    expect(game.status).toBe('awaitingRetry');
    expect(game.result).toBe('OUT OF PINS');
    expect(game.pinActive).toBe(false);
    const press = engine.applyLockAction({ game, action: 'press', value: 'left', clientId: null });
    expect(press.error).toBeTruthy();
    expect(press.game).toBeUndefined();
  });

  it('с заколками доска играет — стоп не мешает обычной попытке', () => {
    const game = engine.createLockGame({
      config: { difficulty: 1 },
      characterSnapshot: snapshotWithPins(2),
      rng: () => 0.5,
    });
    expect(game.status).toBe('playing');
    expect(game.pinActive).toBe(true);
  });
});
