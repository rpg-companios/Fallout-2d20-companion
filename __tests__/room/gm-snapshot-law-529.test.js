// Патч 529 — ЗАКОН СНИМКА владельца:
// «Снапшот юзера не трогаем, если надо что-то изменить у пользователя —
// посылаем команду, которую исполнит клиент. По нему должно работать всё
// пространство мастера. Снапшот нужен для наблюдением за изменением состояния
// пользователя без вмешательства даже между сессиями».
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import { MESSAGE as SERVER_MESSAGE } from '../../server/protocol.js';
import { ROOM_MESSAGE as CLIENT_MESSAGE } from '../../src/room/roomProtocol';
import {
  CHAR_COMMAND_KIND,
  CHAR_COMMAND_KINDS,
  normalizeCharacterCommand,
  applyCharacterCommand,
} from '../../components/gm/charCommands.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const serverFiles = readdirSync(path.join(ROOT, 'server'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => `server/${f}`);

const sheet = (pins = 5) => ({
  characterName: 'Сталкер',
  data: {
    attributes: [{ name: 'PER', value: 10 }, { name: 'LCK', value: 4 }],
    skills: [{ name: 'LOCKPICK', value: 0 }],
    equipment: { items: [{ id: 'pin', weaponId: 'item_bobby_pin', name: 'Заколка', quantity: pins }] },
  },
});

const setup = () => {
  const registry = createRoomRegistry({ now: () => 1000 });
  const { room } = registry.createRoom({ clientId: 'gm', name: 'Стол', ownerToken: 't' });
  const code = room.code;
  registry.joinRoom({ code, clientId: 'gm', name: 'GM', role: 'gm' });
  registry.joinRoom({ code, clientId: 'p1', name: 'Игрок', role: 'player' });
  registry.putSnapshot({
    code, characterId: 'ch1', revision: 1, snapshot: sheet(5),
    fromClientId: 'p1', fromName: 'Игрок',
  });
  return { registry, code };
};

describe('529: закон снимка зафиксирован в документах и протоколе', () => {
  it('канон закона существует и содержит три формулировки владельца', () => {
    const law = read('docs/gm-snapshot-law.md');
    expect(law).toContain('не трогаем');
    expect(law).toContain('команду');
    expect(law).toContain('наблюд');
    expect(law).toContain('между сессиями');
    expect(read('docs/roadmap.md')).toContain('gm-snapshot-law.md');
  });

  it('char.command зеркально есть на сервере и клиенте', () => {
    expect(SERVER_MESSAGE.CHAR_COMMAND).toBe('char.command');
    expect(CLIENT_MESSAGE.CHAR_COMMAND).toBe('char.command');
    expect(CLIENT_MESSAGE.CHAR_REFRESH).toBe('char.refresh');
    expect(read('src/room/roomStore.ts')).toContain('ROOM_MESSAGE.CHAR_COMMAND');
    expect(read('App.js')).toContain('<CharSpendCommandHost />');
  });
});

describe('529: сервер НЕ пишет в снимок игрока', () => {
  it('единственный_writer lastSnapshots — putSnapshot (обычный char.publish)', () => {
    const writes = [];
    for (const file of serverFiles) {
      const text = read(file);
      const matches = [...text.matchAll(/lastSnapshots\.set\(/g)];
      matches.forEach((m) => writes.push({ file, index: m.index }));
    }
    expect(writes).toHaveLength(1);
    expect(writes[0].file).toBe('server/roomRegistry.js');
    const registrySource = read('server/roomRegistry.js');
    const start = registrySource.indexOf('const putSnapshot = (');
    const end = registrySource.indexOf('const isOwner =', start);
    expect(start).toBeGreaterThan(-1);
    expect(writes[0].index).toBeGreaterThan(start);
    expect(writes[0].index).toBeLessThan(end);
  });

  it('журнал «Программиста» больше не правит лист на сервере', () => {
    const registrySource = read('server/roomRegistry.js');
    expect(registrySource).not.toContain('usedMagazineEffects =');
    expect(registrySource).not.toContain('snapshot: nextSnapshot');
    expect(registrySource).toContain('digestCommand');
    expect(read('server/roomServer.js')).toContain("kind: digest.kind");
  });

  it('ни один серверный модуль не поднимает ревизию листа самовольно', () => {
    for (const file of serverFiles) {
      const text = read(file);
      expect(text).not.toContain('published.revision + 1');
    }
  });

  it('всё пространство Мастера ссылается на снимок только через реестр', () => {
    // gm.directive исполняется клиентом; склад/сессии — состояние Мастера,
    // а не лист игрока; читать/писать lastSnapshots может только реестр.
    for (const file of serverFiles) {
      if (file === 'server/roomRegistry.js') continue;
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/lastSnapshots\.(set|get|delete|clear)\(/);
    }
    expect(read('components/gm/PlayerDirectiveOverlay.js')).toContain('applyDirectiveToLiveCharacterStore');
  });
});

describe('529: снимок — наблюдение между сессиями', () => {
  it('лист виден в room.state, когда ни одна сессия не открыта', () => {
    const { registry, code } = setup();
    const state = registry.getState(code);
    expect(state.activeSession).toBeNull();
    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].characterId).toBe('ch1');
    expect(state.snapshots[0].snapshot.data.equipment.items[0].quantity).toBe(5);
  });

  it('открытие и закрытие сессии НЕ очищает снимки игроков', () => {
    const { registry, code } = setup();
    const opened = registry.openSession({
      code, clientId: 'gm',
      session: { name: 'Бункер', kind: 'hub', targetType: 'room', nodes: [] },
    });
    expect(opened.error).toBeUndefined();
    expect(registry.getState(code).snapshots).toHaveLength(1);
    registry.closeSession({ code, clientId: 'gm', sessionId: null });
    expect(registry.getState(code).activeSession).toBeNull();
    expect(registry.getState(code).snapshots).toHaveLength(1);
    expect(registry.getState(code).snapshots[0].snapshot).toEqual(sheet(5));
  });

  it('только сам клиент может удалить свою запись (removed / snapshot:null)', () => {
    const { registry, code } = setup();
    const room = registry._rooms.get(code);
    expect(room.lastSnapshots.has('ch1')).toBe(true);
    registry.putSnapshot({ code, characterId: 'ch1', revision: 9, removed: true, fromClientId: 'p1' });
    expect(room.lastSnapshots.has('ch1')).toBe(false);
  });
});

describe('529: единая команда char.command во всём пространстве Мастера', () => {
  it('реестр хранит команды любых kind и повторяет их после реконнекта', () => {
    const { registry, code } = setup();
    const pin = registry.registerCharacterCommand({
      code, characterId: 'ch1', clientId: 'p1', commandId: 'c1',
      kind: CHAR_COMMAND_KIND.ITEM_SPEND, payload: { itemId: 'item_bobby_pin', count: 1 },
    });
    const magazine = registry.registerCharacterCommand({
      code, characterId: 'ch1', clientId: 'p1', commandId: 'c2',
      kind: CHAR_COMMAND_KIND.MAGAZINE_USE, payload: { magazineId: 'mag_programmers_digest' },
    });
    expect(pin.kind).toBe('item.spend');
    expect(magazine.kind).toBe('magazine.use');
    const state = registry.getState(code);
    expect(state.pendingCommands).toHaveLength(2);
    expect(state.pendingSpends).toHaveLength(1); // алиас 528
    expect(registry.pendingCommandsForClient(code, 'p1')).toHaveLength(2);
    registry.putSnapshot({
      code, characterId: 'ch1', revision: 4, snapshot: sheet(4), fromClientId: 'p1',
    });
    expect(registry.getState(code).pendingCommands).toHaveLength(0);
  });

  it('char.spend 528 нормализуется в item.spend 529 (совместимость)', () => {
    const normalized = normalizeCharacterCommand({
      type: CLIENT_MESSAGE.CHAR_SPEND,
      payload: { spendId: 'legacy-1', characterId: 'ch1', itemId: 'item_bobby_pin', count: 2 },
    }, CLIENT_MESSAGE);
    expect(normalized).toMatchObject({
      commandId: 'legacy-1', characterId: 'ch1', kind: 'item.spend', legacy: true,
    });
    expect(normalized.payload).toEqual({ itemId: 'item_bobby_pin', count: 2 });
  });

  it('char.command с kind и payload нормализуется без легаси-флага', () => {
    const normalized = normalizeCharacterCommand({
      type: CLIENT_MESSAGE.CHAR_COMMAND,
      payload: {
        commandId: 'c3', characterId: 'ch1', kind: 'magazine.use',
        payload: { magazineId: 'mag_programmers_digest' },
      },
    }, CLIENT_MESSAGE);
    expect(normalized).toMatchObject({ commandId: 'c3', kind: 'magazine.use', legacy: false });
    expect(normalized.payload.magazineId).toBe('mag_programmers_digest');
  });

  it('item.spend исполняется штатным spendBobbyPins без публикации', async () => {
    const spendBobbyPins = vi.fn(async () => 1);
    const result = await applyCharacterCommand({
      kind: CHAR_COMMAND_KIND.ITEM_SPEND, characterId: 'ch1',
      payload: { itemId: 'item_bobby_pin', count: 2 },
    }, { spendBobbyPins });
    expect(result).toEqual({ ok: true, spent: 1 });
    expect(spendBobbyPins).toHaveBeenCalledWith(2, { characterId: 'ch1', publish: false });
  });

  it('magazine.use исполняется штатным markMagazineEffectUsed + saveCharacter', async () => {
    const markMagazineEffectUsed = vi.fn();
    const saveCharacter = vi.fn(async () => 'ch1');
    const result = await applyCharacterCommand({
      kind: CHAR_COMMAND_KIND.MAGAZINE_USE, characterId: 'ch1',
      payload: { magazineId: 'mag_programmers_digest' },
    }, { markMagazineEffectUsed, saveCharacter, getCharacterName: () => 'Сталкер' });
    expect(result).toEqual({ ok: true, magazineId: 'mag_programmers_digest' });
    expect(markMagazineEffectUsed).toHaveBeenCalledWith('mag_programmers_digest');
    expect(saveCharacter).toHaveBeenCalledWith('Сталкер');
  });

  it('неизвестный kind и чужой предмет не исполняются (белый список)', async () => {
    expect(CHAR_COMMAND_KINDS).toEqual(['item.spend', 'magazine.use']);
    const spendBobbyPins = vi.fn(async () => 1);
    expect((await applyCharacterCommand({ kind: 'sheet.delete', payload: {} }, { spendBobbyPins })).reason)
      .toBe('unknown-kind');
    expect((await applyCharacterCommand({
      kind: CHAR_COMMAND_KIND.ITEM_SPEND, payload: { itemId: 'caps', count: 1 },
    }, { spendBobbyPins })).reason).toBe('unsupported-item');
    expect((await applyCharacterCommand({
      kind: CHAR_COMMAND_KIND.MAGAZINE_USE, payload: {},
    }, {})).reason).toBe('no-magazine');
    expect(spendBobbyPins).not.toHaveBeenCalled();
  });
});
