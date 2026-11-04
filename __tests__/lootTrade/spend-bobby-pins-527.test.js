// Патч 527: клиентское списание заколки из ЖИВОГО инвентаря персонажа.
// Проверяем, что spendBobbyPins реально меняет стор (а не только ledger
// мини-игры), сохраняет лист и переопубликовывает его в комнату Мастера.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/saves/characterSaves', () => ({
  saveCharacter: vi.fn(async () => 'ch1'),
}));
vi.mock('../../src/room/roomCharacterSync', () => ({
  pushSavedCharacterToBoundRoomIfAny: vi.fn(async () => true),
}));

import { spendBobbyPins, BOBBY_PIN_ITEM_ID } from '../../components/lootTrade/spendBobbyPins';
import { saveCharacter } from '../../src/saves/characterSaves';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import useCharacterStore from '../../src/store/characterStore';

const base = () => ({
  currentCharacterId: 'ch1',
  characterName: 'Сталкер',
  items: {
    p1: { id: 'p1', weaponId: 'item_bobby_pin', name: 'Заколка', quantity: 5, condition: 90 },
    gun: { id: 'gun', weaponId: 'weapon_10mm', name: 'Пистолет', quantity: 1 },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  useCharacterStore.setState(base());
});

describe('527: spendBobbyPins', () => {
  it('уменьшает quantity, сохраняет имя/прочие поля и не трогает соседний предмет', async () => {
    const spent = await spendBobbyPins(1, { characterId: 'ch1' });
    expect(spent).toBe(1);
    const items = useCharacterStore.getState().items;
    expect(items.p1).toMatchObject({
      id: 'p1', weaponId: BOBBY_PIN_ITEM_ID, name: 'Заколка', quantity: 4, condition: 90,
    });
    expect(items.gun).toMatchObject({ name: 'Пистолет', quantity: 1 });
    expect(saveCharacter).toHaveBeenCalledWith('Сталкер');
    expect(pushSavedCharacterToBoundRoomIfAny).toHaveBeenCalledWith('ch1');
  });

  it('последняя заколка исчезает из инвентаря полностью', async () => {
    useCharacterStore.setState({
      ...base(),
      items: { p1: { id: 'p1', weaponId: BOBBY_PIN_ITEM_ID, quantity: 1 } },
    });
    const spent = await spendBobbyPins(1);
    expect(spent).toBe(1);
    expect(useCharacterStore.getState().items.p1).toBeUndefined();
    expect(saveCharacter).toHaveBeenCalledTimes(1);
  });

  it('легаси-форма catalogId/count списывается резервным каноном сервера', async () => {
    useCharacterStore.setState({
      ...base(),
      items: { p1: { id: 'p1', catalogId: BOBBY_PIN_ITEM_ID, count: '2', name: 'Заколка' } },
    });
    const spent = await spendBobbyPins(1);
    expect(spent).toBe(1);
    expect(useCharacterStore.getState().items.p1).toMatchObject({
      catalogId: BOBBY_PIN_ITEM_ID, count: 1, name: 'Заколка',
    });
    expect(saveCharacter).toHaveBeenCalledTimes(1);
  });

  it('нет заколок — ничего не сохраняем и не публикуем', async () => {
    useCharacterStore.setState({ ...base(), items: {} });
    expect(await spendBobbyPins(1)).toBe(0);
    expect(saveCharacter).not.toHaveBeenCalled();
    expect(pushSavedCharacterToBoundRoomIfAny).not.toHaveBeenCalled();
  });

  it('нулевое/отрицательное число — пустой вызов', async () => {
    expect(await spendBobbyPins(0)).toBe(0);
    expect(await spendBobbyPins(-3)).toBe(0);
    expect(useCharacterStore.getState().items.p1.quantity).toBe(5);
  });
});
