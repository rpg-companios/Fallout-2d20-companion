import { beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteCharacterFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncGmContainerToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteGmContainerFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncAllCharactersWithCloud: vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0 }),
  openCloudFolderInDrive: vi.fn().mockResolvedValue(undefined),
}));

import { createRoomServer } from '../../server/roomServer.js';
import { createRoomClient } from '../../src/room/roomClient';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';
import useCharacterStore from '../../src/store/characterStore';
import { selectItemsByEquipped } from '../../src/store/selectors';
import {
  applyCommittedMerchantTradeToCharacter,
  getSellablePlayerInventoryItems,
  grantLootEntriesToCharacter,
} from '../../src/lootTrade/grantCharacterItems';

describe('Патч 468 — живой WS-сервер сессий Добычи и Торговли (атомарный пул, перки поиска, живые % и лимит крышек)', () => {
  beforeEach(() => {
    useCharacterStore.getState().resetCharacterStore();
  });

  const makeWaitMsg = () => (box, pred, timeoutMs = 4000) => new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const idx = box.findIndex(pred);
      if (idx >= 0) {
        const [hit] = box.splice(idx, 1);
        clearInterval(timer);
        resolve(hit);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error('timeout waiting for WS message'));
      }
    }, 12);
  });

  it('общий пул добычи (targetType=room) атомарно делит предметы между игроками без дюпа + начисляет бонус перков поверх базы', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const url = `ws://127.0.0.1:${port}/ws`;
    const waitMsg = makeWaitMsg();

    const gmBox = [];
    const p1Box = [];
    const p2Box = [];

    const gm = createRoomClient({
      url,
      clientId: 'gm-dev:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => gmBox.push(m),
    });
    const p1 = createRoomClient({
      url,
      clientId: 'p1-dev:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p1Box.push(m),
    });
    const p2 = createRoomClient({
      url,
      clientId: 'p2-dev:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p2Box.push(m),
    });

    try {
      gm.send(ROOM_MESSAGE.ROOM_CREATE, { name: 'Супермарт', requestId: 'c1' }, null);
      const created = await waitMsg(gmBox, (m) => m.type === ROOM_MESSAGE.ROOM_CREATED);
      const code = created.payload.code;

      gm.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'GM', role: 'gm', requestId: 'j-gm' }, code);
      await waitMsg(gmBox, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'j-gm');

      p1.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок 1', role: 'player', requestId: 'j-p1' }, code);
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'j-p1');

      p2.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок 2', role: 'player', requestId: 'j-p2' }, code);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'j-p2');

      // Мастер выдаёт сундук на всю комнату: 3 стимулятора + 25 крышек
      gm.send(
        ROOM_MESSAGE.SESSION_OPEN,
        {
          code,
          requestId: 'open-loot',
          session: {
            containerId: 'gm_cont_loot_1',
            kind: 'loot',
            name: 'Аптечка на стене',
            description: 'Ржавый медицинский ящик',
            targetType: 'room',
            items: [
              {
                entryId: 'e_stim',
                itemId: 'chem_stimpak',
                itemType: 'chems',
                name: 'Стимулятор',
                quantity: 3,
                cost: 40,
                weight: 0,
              },
              {
                entryId: 'e_caps',
                itemId: 'caps',
                itemType: 'caps',
                name: 'Крышки',
                quantity: 25,
                cost: 1,
                weight: 0,
              },
            ],
          },
        },
        code,
      );

      const p1Open = await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload.session?.kind === 'loot');
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload.session?.kind === 'loot');
      const sessionId = p1Open.payload.session.sessionId;

      // Оба игрока одновременно пытаются забрать все 3 стимулятора!
      p1.send(
        ROOM_MESSAGE.SESSION_LOOT_TAKE,
        {
          code,
          sessionId,
          characterId: 'char_p1',
          takes: [
            { entryId: 'e_stim', quantity: 3 },
            { entryId: 'e_caps', quantity: 25 },
          ],
          requestId: 'take-p1',
        },
        code,
      );
      p2.send(
        ROOM_MESSAGE.SESSION_LOOT_TAKE,
        {
          code,
          sessionId,
          characterId: 'char_p2',
          takes: [{ entryId: 'e_stim', quantity: 3 }],
          requestId: 'take-p2',
        },
        code,
      );

      const res1 = await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.SESSION_LOOT_TAKE && m.payload.requestId === 'take-p1');
      const res2 = await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.SESSION_LOOT_TAKE && m.payload.requestId === 'take-p2');

      const totalStimsGranted = [
        ...(res1.payload.granted || []),
        ...(res2.payload.granted || []),
      ]
        .filter((g) => g.itemId === 'chem_stimpak')
        .reduce((s, g) => s + g.quantity, 0);

      // Атомарность пула: суммарно выдано ровно 3 стимулятора, никакого дублирования!
      expect(totalStimsGranted).toBe(3);

      // Начисляем в стор того игрока, который успел забрать добычу, с активным перком «Фармацевт» (pharmaFarmer):
      // бонус перка начисляется ПОВЕРХ базового содержимого контейнера.
      const winnerGranted = (res1.payload.granted || []).length > 0
        ? res1.payload.granted
        : res2.payload.granted;

      useCharacterStore.getState().resetCharacterStore();
      useCharacterStore.setState({
        currency: 10,
        perkBonuses: {
          foundItemBonuses: [
            {
              perkId: 'pharmaFarmer',
              itemType: 'chem',
              extra: 1,
              extraRandom: true,
            },
          ],
        },
      });

      const grantedSummary = grantLootEntriesToCharacter(winnerGranted);
      expect(grantedSummary.addedCaps).toBe(25);
      expect(useCharacterStore.getState().currency).toBe(35);
      expect(grantedSummary.bonusMessages.length).toBe(1);
      // В инвентаре игрока как базовые 3 стимулятора из сундука, так и +1 случайный препарат от перка
      const unequipped = selectItemsByEquipped(useCharacterStore.getState(), false);
      const totalItemsCount = unequipped.reduce((s, it) => s + (it.quantity || 1), 0);
      expect(totalItemsCount).toBe(4);
    } finally {
      gm.close();
      p1.close();
      p2.close();
      await app.close();
    }
  });

  it('таргетинг конкретному персонажу блокирует чужого игрока (SESSION_FORBIDDEN)', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const url = `ws://127.0.0.1:${port}/ws`;
    const waitMsg = makeWaitMsg();

    const gmBox = [];
    const p2Box = [];

    const gm = createRoomClient({
      url,
      clientId: 'gm-target:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => gmBox.push(m),
    });
    const p2 = createRoomClient({
      url,
      clientId: 'p2-target:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p2Box.push(m),
    });

    try {
      gm.send(ROOM_MESSAGE.ROOM_CREATE, { name: 'Личный тайник', requestId: 'c2' }, null);
      const created = await waitMsg(gmBox, (m) => m.type === ROOM_MESSAGE.ROOM_CREATED);
      const code = created.payload.code;

      gm.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'GM', role: 'gm', requestId: 'j-gm' }, code);
      await waitMsg(gmBox, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'j-gm');

      p2.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Чужой', role: 'player', requestId: 'j-p2' }, code);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'j-p2');

      gm.send(
        ROOM_MESSAGE.SESSION_OPEN,
        {
          code,
          requestId: 'open-target',
          session: {
            containerId: 'gm_cont_personal',
            kind: 'loot',
            name: 'Награда разведчика',
            targetType: 'character',
            targetCharacterId: 'char_vip_only',
            items: [{ entryId: 'e1', itemId: 'caps', itemType: 'caps', name: 'Крышки', quantity: 50 }],
          },
        },
        code,
      );

      const st = await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && Boolean(m.payload.session));

      p2.send(
        ROOM_MESSAGE.SESSION_LOOT_TAKE,
        {
          code,
          sessionId: st.payload.session.sessionId,
          characterId: 'char_intruder',
          takes: [{ entryId: 'e1', quantity: 50 }],
          requestId: 'bad-take',
        },
        code,
      );

      const err = await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.ERROR && m.payload.requestId === 'bad-take');
      expect(err.payload.code).toBe('SESSION_FORBIDDEN');
    } finally {
      gm.close();
      p2.close();
      await app.close();
    }
  });

  it('торговля с живой сменой % Мастером, двухпанельным бартером и предупреждением при нехватке крышек у торговца', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const url = `ws://127.0.0.1:${port}/ws`;
    const waitMsg = makeWaitMsg();

    const gmBox = [];
    const plBox = [];

    const gm = createRoomClient({
      url,
      clientId: 'gm-merch:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => gmBox.push(m),
    });
    const pl = createRoomClient({
      url,
      clientId: 'pl-merch:tab1',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => plBox.push(m),
    });

    try {
      gm.send(ROOM_MESSAGE.ROOM_CREATE, { name: 'Даймонд-сити', requestId: 'cm' }, null);
      const created = await waitMsg(gmBox, (m) => m.type === ROOM_MESSAGE.ROOM_CREATED);
      const code = created.payload.code;

      gm.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'GM', role: 'gm', requestId: 'j-gm' }, code);
      await waitMsg(gmBox, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'j-gm');

      pl.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Курьер', role: 'player', requestId: 'j-pl' }, code);
      await waitMsg(plBox, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'j-pl');

      // 1. Мастер открывает торговца: касса 40 кр., общая наценка +20%, обесценивание закупки 50%,
      // у стимулятора собственная наценка специализации +30% (итого со старта +50%: 40 -> 60 кр.)
      gm.send(
        ROOM_MESSAGE.SESSION_OPEN,
        {
          code,
          requestId: 'open-merch',
          session: {
            containerId: 'gm_merch_solomon',
            kind: 'merchant',
            name: 'Соломон',
            targetType: 'room',
            caps: 40,
            saleMarkupPercent: 20,
            buyDepreciationPercent: 50,
            items: [
              {
                entryId: 'm_stim',
                itemId: 'chem_stimpak',
                itemType: 'chems',
                name: 'Стимулятор',
                quantity: 4,
                cost: 40,
                weight: 0,
                markupPercent: 30,
              },
            ],
          },
        },
        code,
      );

      const initialState = await waitMsg(plBox, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload.session?.kind === 'merchant');
      const sessionId = initialState.payload.session.sessionId;

      // 2. Игрок успешно кидает оффлайн-проверку Бартера -> Мастер прямо во время торговли
      // снижает персонально для char_courier наценку лавки до -10% и уценку скупки до 40%!
      gm.send(
        ROOM_MESSAGE.SESSION_UPDATE_RATES,
        {
          code,
          targetCharacterId: 'char_courier',
          saleMarkupPercent: -10,
          buyDepreciationPercent: 40,
          requestId: 'upd-rates',
        },
        code,
      );

      const updatedState = await waitMsg(
        plBox,
        (m) => m.type === ROOM_MESSAGE.SESSION_STATE && Boolean(m.payload.session?.characterOverrides?.char_courier),
      );
      expect(updatedState.payload.session.characterOverrides.char_courier).toEqual({
        saleMarkupPercent: -10,
        buyDepreciationPercent: 40,
      });

      // Подготовим инвентарь игрока: 1 дорогой карабин (база 200 кр.) и 30 крышек.
      // При персональной уценке 40% карабин стоит при продаже 200 * 0.6 = 120 кр.
      // Стимулятор стоит при покупке: 40 * (1 + (-10 + 30)/100) = 48 кр.
      // Баланс сделки: 120 - 48 = 72 кр. должен доплатить торговец, но в кассе только 40 кр.!
      useCharacterStore.getState().resetCharacterStore();
      useCharacterStore.setState({ currency: 30 });
      useCharacterStore.getState().addNewItem({
        id: 'weapon_combat_rifle',
        weaponId: 'weapon_combat_rifle',
        itemType: 'weapon',
        name: 'Боевой карабин',
        cost: 200,
        weight: 5.5,
        quantity: 1,
        equipped: false,
      });
      const sellableBefore = getSellablePlayerInventoryItems(useCharacterStore.getState().items);
      const rifleId = sellableBefore.find((it) => it.catalogId === 'weapon_combat_rifle')?.id;
      expect(Boolean(rifleId)).toBe(true);

      // 3. Без подтверждения дефицита сервер возвращает предупреждение TRADE_NOT_ENOUGH_MERCHANT_CAPS
      pl.send(
        ROOM_MESSAGE.SESSION_TRADE_COMMIT,
        {
          code,
          sessionId,
          characterId: 'char_courier',
          perkCapCollectorPercent: 0,
          playerCapsAvailable: 30,
          acceptCapShortfall: false,
          buyItems: [{ entryId: 'm_stim', quantity: 1 }],
          sellItems: [
            {
              clientItemId: rifleId,
              itemId: 'weapon_combat_rifle',
              itemType: 'weapon',
              name: 'Боевой карабин',
              cost: 200,
              weight: 5.5,
              quantity: 1,
            },
          ],
          requestId: 'trade-warn',
        },
        code,
      );

      const shortfallErr = await waitMsg(plBox, (m) => m.type === ROOM_MESSAGE.ERROR && m.payload.requestId === 'trade-warn');
      expect(shortfallErr.payload.code).toBe('TRADE_NOT_ENOUGH_MERCHANT_CAPS');
      expect(shortfallErr.payload.owedCaps).toBe(72);
      expect(shortfallErr.payload.merchantCaps).toBe(40);

      // 4. Игрок соглашается забрать все имеющиеся у торговца 40 кр. (acceptCapShortfall: true)
      pl.send(
        ROOM_MESSAGE.SESSION_TRADE_COMMIT,
        {
          code,
          sessionId,
          characterId: 'char_courier',
          perkCapCollectorPercent: 0,
          playerCapsAvailable: 30,
          acceptCapShortfall: true,
          buyItems: [{ entryId: 'm_stim', quantity: 1 }],
          sellItems: [
            {
              clientItemId: rifleId,
              itemId: 'weapon_combat_rifle',
              itemType: 'weapon',
              name: 'Боевой карабин',
              cost: 200,
              weight: 5.5,
              quantity: 1,
            },
          ],
          requestId: 'trade-ok',
        },
        code,
      );

      const tradeRes = await waitMsg(plBox, (m) => m.type === ROOM_MESSAGE.SESSION_TRADE_COMMIT && m.payload.requestId === 'trade-ok');
      expect(tradeRes.payload.committed.playerCapsDelta).toBe(40);
      expect(tradeRes.payload.committed.capShortfallAccepted).toBe(32);

      // Касса торговца опустела до 0, стимуляторов осталось 3, а боевой карабин появился на витрине торговца!
      expect(tradeRes.payload.session.caps).toBe(0);
      expect(tradeRes.payload.session.items.find((it) => it.entryId === 'm_stim')?.quantity).toBe(3);
      expect(tradeRes.payload.session.items.find((it) => it.itemId === 'weapon_combat_rifle')?.quantity).toBe(1);

      // Применяем результат к стору персонажа: карабин ушёл, стимулятор пришёл, крышек стало 30 + 40 = 70
      applyCommittedMerchantTradeToCharacter(tradeRes.payload.committed);
      const afterState = useCharacterStore.getState();
      const unequippedAfter = selectItemsByEquipped(afterState, false);
      expect(afterState.currency).toBe(70);
      expect(unequippedAfter.find((it) => it.id === rifleId)).toBeUndefined();
      expect(unequippedAfter.find((it) => it.stackKey?.includes('chem_stimpak') || it.id?.includes('chem_stimpak') || it.name?.includes('Стимулятор'))?.quantity).toBe(1);
    } finally {
      gm.close();
      pl.close();
      await app.close();
    }
  });
});
