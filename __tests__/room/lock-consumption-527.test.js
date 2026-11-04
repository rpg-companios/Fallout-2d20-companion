// Приёмочный тест патча 527. Владелец: «item_bobby_pin по-русски ЗАКОЛКА,
// а не шпилька/отмычка/булавка; отмычка — это другой предмет. Сломанные /
// потраченные заколки должны исчезать из РЕАЛЬНОГО инвентаря, а не только из
// памяти комнаты. При ошибке ? красный; на телефоне стрелки пересекают линии,
// слишком близко и непонятно; под счётчиком — точная подсказка».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import {
  consumeBobbyPins,
  countBobbyPins,
  lockStats,
  createLockGame,
  applyLockAction,
  CELL_STATE,
} from '../../server/lockPicking.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const HINT_RU = 'Нажимайте на стрелки. Верный вариант будет выделен зелёным цветом, ошибочный красным. Если вы ошиблись, попробуйте другой вариант. Если сломалась заколка взлом необходимо начать сначала.';

const snapshot = (pins) => ({
  characterName: 'Сталкер',
  data: {
    attributes: [{ name: 'PER', value: 10 }, { name: 'LCK', value: 4 }],
    skills: [{ name: 'LOCKPICK', value: 0 }],
    equipment: { items: [{
      id: 'pin', weaponId: 'item_bobby_pin', name: 'Заколка', quantity: pins,
    }] },
  },
});

// rng(1000) = 990 → rng() = 0.99: секрет сплошь 'down', Удача (5%) НЕ спасает
// заколку, поэтому первое же неверное нажатие ломает её детерминированно.
const setup = (pins = 5) => {
  const registry = createRoomRegistry({ now: () => 1000, rng: () => 990 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол' });
  const code = room.code;
  registry.joinRoom({ code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code, clientId: 'p1', name: 'Игрок', role: 'player' });
  registry.putSnapshot({
    code, characterId: 'ch1', revision: 1, snapshot: snapshot(pins),
    fromClientId: 'p1', fromName: 'Игрок',
  });
  registry.issueTerminal({
    code, clientId: 'gm',
    config: {
      containerId: 'l1', name: 'Замок', description: '', difficulty: 2, kind: 'lock',
      requiredKeyItemId: '', keyRequirement: 'none', linkedCheckId: '', linkedCheckIds: [],
    },
  });
  const act = (action, value) => registry.terminalAction({
    code, clientId: 'p1', characterId: 'ch1', containerId: 'l1', action, value,
  });
  const state = () => registry.getState(code).terminalStates.l1;
  const published = () => registry._rooms.get(code).lastSnapshots.get('ch1');
  return { registry, code, act, state, published };
};

describe('527: заколки уходят из настоящего инвентаря', () => {
  it('consumeBobbyPins уменьшает quantity, сохраняет имя и не мутирует исходник', () => {
    const original = snapshot(5);
    const { snapshot: next, consumed } = consumeBobbyPins(original, 1);
    expect(consumed).toBe(1);
    expect(next.data.equipment.items[0]).toMatchObject({
      id: 'pin', weaponId: 'item_bobby_pin', name: 'Заколка', quantity: 4,
    });
    expect(original.data.equipment.items[0].quantity).toBe(5);
    expect(lockStats(next).pins).toBe(4); // обёртка data разворачивается как у доски
  });

  it('consumeBobbyPins удаляет опустевший стек и не трогает чужие предметы', () => {
    const mixed = {
      items: {
        pin: { itemId: 'item_bobby_pin', quantity: 1, condition: 80 },
        cap: { itemId: 'caps', quantity: 12 },
      },
      inventory: [{ snapshot: { catalogId: 'item_bobby_pin', count: '2' } }],
      bag: [{ item: { code: 'weapon_10mm', qty: 1 } }],
    };
    expect(countBobbyPins(mixed)).toBe(3);
    const { snapshot: next, consumed } = consumeBobbyPins(mixed, 3);
    expect(consumed).toBe(3);
    expect(countBobbyPins(next)).toBe(0);
    expect(next.items.pin).toBeUndefined();
    expect(next.items.cap).toMatchObject({ itemId: 'caps', quantity: 12 });
    expect(next.bag[0]).toMatchObject({ item: { code: 'weapon_10mm', qty: 1 } });
  });

  it('дубликат одного экземпляра в items и equipment.items списывается один раз', () => {
    const dup = {
      items: { p: { id: 'p', instanceId: 'pin-42', weaponId: 'item_bobby_pin', quantity: 5 } },
      equipment: { items: [{ id: 'p', instanceId: 'pin-42', weaponId: 'item_bobby_pin', quantity: 5 }] },
    };
    const { snapshot: next, consumed } = consumeBobbyPins(dup, 1);
    expect(consumed).toBe(1);
    expect(countBobbyPins(next)).toBe(4);
  });

  it('528: сервер НЕ правит снимок, а отдаёт команду на списание', () => {
    const { act, state, published, registry, code } = setup();
    expect(act('start').error).toBeUndefined();
    expect(state().game.pinsTotal).toBe(5);
    const press = act('press', 'left');
    expect(press.error).toBeUndefined();
    expect(state().game.brokenPins).toBe(1);
    expect(state().game.result).toBe('PIN BROKEN');
    // Владелец инвентаря — клиент: сервер только сообщает «спиши 1».
    expect(press.pinsToSpend).toBe(1);
    expect(press.characterId).toBe('ch1');
    expect(published().snapshot.data.equipment.items[0]).toMatchObject({
      name: 'Заколка', quantity: 5, // снимок НЕ тронут
    });
    expect(registry._rooms.get(code).pinLedger.get('ch1')).toBe(1); // диагностика
    // Клиент списал штатными средствами и опубликовал обновлённый лист.
    registry.putSnapshot({
      code, characterId: 'ch1', revision: 3, snapshot: snapshot(4),
      fromClientId: 'p1', fromName: 'Игрок',
    });
    expect(act('newAttempt').error).toBeUndefined();
    expect(state().game.pinsTotal).toBe(4);
    expect(state().game.spentPins).toBe(0); // двойного вычета нет
  });

  it('528: после публикации листа без заколок новый подход честно говорит «Заколки закончились»', () => {
    const { act, state, published, registry, code } = setup(1);
    act('start');
    const press = act('press', 'left');
    expect(press.pinsToSpend).toBe(1);
    expect(lockStats(published().snapshot).pins).toBe(1); // сервер не трогал лист
    expect(state().game.result).toBe('OUT OF PINS');
    registry.putSnapshot({
      code, characterId: 'ch1', revision: 3, snapshot: snapshot(0),
      fromClientId: 'p1', fromName: 'Игрок',
    });
    act('newAttempt');
    expect(state().game.status).toBe('awaitingRetry');
    expect(state().game.result).toBe('OUT OF PINS');
  });
});

describe('527: ошибочный «?» остаётся красным', () => {
  it('на ходе с поломкой заколки красная ячейка не стирается', () => {
    const lowSkill = {
      data: {
        attributes: { PER: { value: 10 }, LCK: { value: 4 } },
        skills: [{ name: 'LOCKPICK', value: 0 }],
        items: [{ itemId: 'item_bobby_pin', quantity: 5 }],
      },
    };
    const game = createLockGame({ config: { difficulty: 1 }, characterSnapshot: lowSkill, rng: () => 0 });
    const wrong = applyLockAction({ game, config: {}, action: 'press', value: 'up', rng: () => 0.99 }).game;
    expect(wrong.brokenPins).toBe(1);
    expect(wrong.cells[game.cursor]).toEqual({ arrow: null, state: CELL_STATE.RED });
  });

  it('каждое следующее нажатие оставляет только одну красную ячейку', () => {
    const lowSkill = {
      data: {
        attributes: { PER: { value: 10 }, LCK: { value: 10 } },
        skills: [{ name: 'LOCKPICK', value: 6 }],
        items: [{ itemId: 'item_bobby_pin', quantity: 5 }],
      },
    };
    const game = createLockGame({ config: { difficulty: 1 }, characterSnapshot: lowSkill, rng: () => 0 });
    const first = applyLockAction({ game, config: {}, action: 'press', value: 'up', rng: () => 0.99 }).game;
    expect(first.cells.filter((c) => c.state === CELL_STATE.RED)).toHaveLength(1);
    const second = applyLockAction({ game: first, config: {}, action: 'press', value: 'down', rng: () => 0.99 }).game;
    expect(second.cells.filter((c) => c.state === CELL_STATE.RED)).toHaveLength(1);
  });

  it('в светлой теме красный «?» явно красный, а не тёмно-серый', () => {
    const source = read('components/lootTrade/lockPickingStyles.js');
    expect(source).toMatch(/cellTextRed:\s*\{[^}]*color:\s*'#c1121f'/);
    expect(source).toMatch(/cellRed:\s*\{[^}]*borderColor:\s*'#c1121f'/);
  });
});

describe('527: терминология и стрелки', () => {
  it('по-русски предмет «Заколка», электронная отмычка — другой предмет', () => {
    const catalog = json('modules/fallout/i18n/ru-RU/data/equipment/general_goods.json');
    const pin = catalog.find((x) => x.id === 'item_bobby_pin');
    const electronic = catalog.find((x) => x.id === 'item_electronic_lockpicker');
    expect(pin.name).toBe('Заколка');
    expect(electronic.name).toBe('Электронная отмычка');
    const en = json('modules/fallout/i18n/en-EN/data/equipment/general_goods.json');
    expect(en.find((x) => x.id === 'item_bobby_pin').name).toBe('Bobby Pin');
  });

  it('все строки замка по-русски про заколки, без шпилек/отмычек/булавок', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json').lock;
    const text = JSON.stringify(ru);
    expect(text).toContain('закол');
    expect(text).not.toMatch(/отмычк|шпильк|булавк/i);
    expect(ru.pins).toContain('Заколки');
    expect(ru.noPins).toBe('Заколки закончились');
  });

  it('точная подсказка под счётчиком, парная RU/EN', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json').lock;
    const en = json('i18n/en-EN/screens/lootTrade/screen.json').lock;
    expect(ru.arrowsHint).toBe(HINT_RU);
    expect(en.arrowsHint).toContain('Press the arrows');
    expect(en.arrowsHint).toContain('bobby pin breaks');
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    expect(read('components/lootTrade/LockPickingModal.js')).toContain("testID=\"lock-arrows-hint\"");
  });

  it('область стрелок: заливка темнее карточки, стрелки крупнее и разведены', () => {
    const source = read('components/lootTrade/lockPickingStyles.js');
    expect(source).toContain('arrowPad');
    expect(source).toMatch(/arrowPad:\s*\{[^}]*backgroundColor:\s*ADMIN_MODAL_PALETTE\.surfaceMuted/);
    expect(source).toMatch(/arrowButton:\s*\{[^}]*backgroundColor:\s*'#dadada'/);
    expect(source).toMatch(/crossRow:\s*\{[^}]*gap:\s*16/);
    expect(read('components/lootTrade/LockPickingModal.js')).toMatch(/size=\{30\}/);
    expect(read('components/lootTrade/LockPickingModal.js')).toContain('testID="lock-arrow-pad"');
    expect(read('components/lootTrade/LockPickingModal.js')).toContain('ScrollView');
  });
});
