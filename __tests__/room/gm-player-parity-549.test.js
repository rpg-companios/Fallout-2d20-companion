// ПРИЁМОЧНЫЙ (патч 549): удалить при конверсии/приживании.
//
// ЗАКОН РАВЕНСТВА МАСТЕРА И ИГРОКА (слово владельца, патч 549):
//   «Мастерский раздел должен максимально соответствовать механизмам юзера.
//    А команды посылаемые мастером юзеру — это команды, которые мог бы сделать
//    сам юзер или получить их в результате своих действий».
//
// Проверяется ПОВЕДЕНИЕМ на настоящем characterStore: одно и то же изменение,
// сделанное рукой игрока и командой Мастера, обязано дать одинаковый лист.
// Строковый guard здесь бесполезен: он видел бы вызов, но не заметил бы, что
// команда Мастера идёт своей дорогой и даёт другой результат.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Побочные эффекты (запись сейва и публикация в комнату) глушим: сравниваем
// состояние листа, а не ввод-вывод. Сам стор — настоящий.
vi.mock('../../src/saves/characterSaves', () => ({
  saveCharacter: vi.fn(async () => true),
}));
vi.mock('../../src/room/roomCharacterSync', () => ({
  pushSavedCharacterToBoundRoomIfAny: vi.fn(async () => true),
}));

import useCharacterStore from '../../src/store/characterStore';
import { spendBobbyPins, BOBBY_PIN_ITEM_ID } from '../../components/lootTrade/spendBobbyPins';
import { applyCharacterCommand, CHAR_COMMAND_KIND } from '../../components/gm/charCommands';

const state = () => useCharacterStore.getState();

/** Заколки в инвентаре — канонической записью каталога. */
const seedPins = (quantity) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, pins: { weaponId: BOBBY_PIN_ITEM_ID, quantity } },
  }));
};

/** Сколько заколок осталось в листе (по всем записям каталога). */
const pinsLeft = () => Object.values(state().items || {})
  .filter((item) => item && item.weaponId === BOBBY_PIN_ITEM_ID)
  .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

/** Снимок состояния, значимого для сравнения двух путей. */
const sheetOf = () => ({
  pins: pinsLeft(),
  usedMagazineEffects: [...(state().usedMagazineEffects || [])],
});

const gmCommand = (kind, payload) => ({ commandId: 'c1', characterId: 'ch1', kind, payload });

beforeEach(() => {
  state().resetCharacterStore();
  useCharacterStore.setState({ characterName: 'Тест', currentCharacterId: 'ch1' });
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('549: команда Мастера = действие, доступное самому игроку', () => {
  it('списание заколок: рука игрока и команда Мастера дают одинаковый лист', async () => {
    // Путь игрока: он ломает заколку в мини-игре, клиент списывает её сам.
    seedPins(5);
    const playerSpent = await spendBobbyPins(2, { characterId: 'ch1', publish: false });
    const byPlayer = sheetOf();

    // Путь Мастера: то же изменение приходит командой и исполняется клиентом.
    state().resetCharacterStore();
    useCharacterStore.setState({ characterName: 'Тест', currentCharacterId: 'ch1' });
    seedPins(5);
    const result = await applyCharacterCommand(
      gmCommand(CHAR_COMMAND_KIND.ITEM_SPEND, { itemId: BOBBY_PIN_ITEM_ID, count: 2 }),
    );
    const byMaster = sheetOf();

    expect(result.ok).toBe(true);
    expect(result.spent).toBe(playerSpent);
    expect(byMaster, 'Мастер не имеет своей отдельной механики списания').toEqual(byPlayer);
    expect(byPlayer.pins).toBe(3);
  });

  it('журнал: команда Мастера и кнопка игрока дают одинаковый лист', async () => {
    // Игрок читает журнал сам — штатное действие стора.
    state().markMagazineEffectUsed('mag_guns');
    const byPlayer = sheetOf();

    state().resetCharacterStore();
    useCharacterStore.setState({ characterName: 'Тест', currentCharacterId: 'ch1' });
    const result = await applyCharacterCommand(
      gmCommand(CHAR_COMMAND_KIND.MAGAZINE_USE, { magazineId: 'mag_guns' }),
    );
    expect(result.ok).toBe(true);
    expect(sheetOf()).toEqual(byPlayer);
    expect(byPlayer.usedMagazineEffects).toEqual(['mag_guns']);
  });

  it('нехватка ведёт себя одинаково: Мастер не списывает больше, чем есть у игрока', async () => {
    seedPins(1);
    const playerSpent = await spendBobbyPins(3, { characterId: 'ch1', publish: false });
    const byPlayer = sheetOf();

    state().resetCharacterStore();
    useCharacterStore.setState({ characterName: 'Тест', currentCharacterId: 'ch1' });
    seedPins(1);
    const result = await applyCharacterCommand(
      gmCommand(CHAR_COMMAND_KIND.ITEM_SPEND, { itemId: BOBBY_PIN_ITEM_ID, count: 3 }),
    );
    // Закон равенства: результат команды совпадает с рукой игрока до единицы.
    expect(sheetOf()).toEqual(byPlayer);
    expect(result.spent).toBe(playerSpent);
    // Списано не больше, чем лежало; баланс не ушёл в минус.
    expect(playerSpent).toBeLessThanOrEqual(1);
    expect(byPlayer.pins).toBeGreaterThanOrEqual(0);
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (вопрос владельцу вынесен в отчёте 549): при нехватке
    // списывается остаток — стор отказывает, но легаси-резерв расходует что есть.
    // Оба пути делают это одинаково, поэтому закон равенства не нарушен.
    expect(byPlayer.pins).toBe(0);
  });

  it('повтор команды журнала не даёт второго эффекта — как повторное нажатие игрока', async () => {
    const payload = gmCommand(CHAR_COMMAND_KIND.MAGAZINE_USE, { magazineId: 'mag_guns' });
    await applyCharacterCommand(payload);
    await applyCharacterCommand(payload);
    expect(state().usedMagazineEffects).toEqual(['mag_guns']);
  });
});

describe('549: у Мастера нет власти вне механизмов игрока', () => {
  it('неизвестная команда отвергается, лист не меняется', async () => {
    seedPins(5);
    const before = sheetOf();
    const result = await applyCharacterCommand(gmCommand('inventory.wipe', {}));
    expect(result).toEqual({ ok: false, reason: 'unknown-kind' });
    expect(sheetOf()).toEqual(before);
  });

  it('чужой предмет не списывается: белый список один для обоих путей', async () => {
    seedPins(5);
    const before = sheetOf();
    const result = await applyCharacterCommand(
      gmCommand(CHAR_COMMAND_KIND.ITEM_SPEND, { itemId: 'caps', count: 100 }),
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported-item' });
    expect(sheetOf()).toEqual(before);
  });

  it('каталог команд — белый список, а не свободный ввод', () => {
    expect(Object.values(CHAR_COMMAND_KIND)).toEqual(['item.spend', 'magazine.use']);
  });
});
