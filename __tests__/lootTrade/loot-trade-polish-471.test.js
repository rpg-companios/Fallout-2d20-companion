import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));

import { createRoomServer } from '../../server/roomServer.js';
import { createRoomClient } from '../../src/room/roomClient';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';
import useRoomStore, {
  resetRoomClientForTests,
  setRoomClientFactoryForTests,
} from '../../src/room/roomStore';
import { setCurrentLocale } from '../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../../components/screens/LootTradeScreen/logic/lootTradeI18n';
import { describeItemBasics } from '../../domain/itemBasics';

const repoRoot = path.resolve(__dirname, '../..');

const readSource = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), 'utf8');

const makeWaitMsg = () => (box, pred, timeoutMs = 4000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    const idx = box.findIndex(pred);
    if (idx >= 0) {
      const [hit] = box.splice(idx, 1);
      clearInterval(timer);
      resolve(hit);
      return;
    }
    if (Date.now() - started > timeoutMs) {
      clearInterval(timer);
      reject(new Error('timeout waiting WS message'));
    }
  }, 12);
});

/** Зеркало withCdToken и formatBasicsWithIcons из LootTradeIconText без подтягивания RN PNG-ассетов в Node. */
const withCdToken = (text) => {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(/(^|[^A-Za-z{])CD(?![A-Za-z}])/g, '$1{CD}');
};

const formatBasicsWithIcons = (text) => {
  if (typeof text !== 'string' || !text) return text;
  return withCdToken(text)
    .replace(/(Урон|Damage)\s+(\d+)(?!\s*\{CD\})/g, '$1 $2 {CD}')
    .replace(/(Цена|Cost)\s+(\d+(?:[.,]\d+)?)(?!\s*\{CAP\})/g, '$1 $2 {CAP}');
};

describe('Патч 471 — поля и воздух модалок, borderRadius 5, «Закрыть» у торговца, скрытый % торговца и иконки {CAP}/{CD}', () => {
  beforeEach(() => {
    setCurrentLocale('ru-RU');
    resetRoomClientForTests();
    setRoomClientFactoryForTests(null);
    useRoomStore.setState({ status: 'offline', clientId: null, rooms: {}, lastError: null });
  });

  it('все модалки добычи и торговли используют View вместо SafeAreaView, отступы от краёв и borderRadius: 5', () => {
    const overlaySrc = readSource('components/lootTrade/PlayerLootTradeOverlay.js');
    const catalogSrc = readSource('components/screens/LootTradeScreen/modals/ContainerCatalogModal.js');
    const formSrc = readSource('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
    const configSrc = readSource('components/screens/LootTradeScreen/modals/ContainerItemConfigModal.js');
    const issueSrc = readSource('components/screens/LootTradeScreen/modals/IssueContainerModal.js');
    const alertHostSrc = readSource('components/alerts/AlertHost.js');

    // Ни одна центрированная модалка не должна оборачивать карточку в SafeAreaView
    // (в react-native-web SafeAreaView сбрасывает внутренний padding в 0px).
    expect(overlaySrc).not.toContain('SafeAreaView');
    expect(catalogSrc).not.toContain('SafeAreaView');

    // Отступы от краёв окна (backdrop padding + width < 100%) и воздух внутри карточек
    for (const src of [overlaySrc, catalogSrc, formSrc, configSrc, issueSrc]) {
      expect(src).toContain('paddingHorizontal: 28');
      expect(src).toContain('paddingVertical: 36');
      expect(src).toContain('paddingHorizontal: 24');
      expect(src).toContain('paddingVertical: 22');
      expect(src).toContain('borderRadius: 5');
      expect(src).not.toMatch(/borderRadius:\s*(1[0-9]|2[0-9])/);
    }

    expect(alertHostSrc).toContain('borderRadius: 5');
    expect(alertHostSrc).toContain('paddingHorizontal: 28');
  });

  it('окно торговли у игрока содержит кнопку «Закрыть» рядом со «Свернуть» и полностью скрывает % наценки/скупки торговца', () => {
    const overlaySrc = readSource('components/lootTrade/PlayerLootTradeOverlay.js');
    const ruJson = JSON.parse(readSource('i18n/ru-RU/screens/lootTrade/screen.json'));
    const enJson = JSON.parse(readSource('i18n/en-EN/screens/lootTrade/screen.json'));

    // Наличие обработчика закрытия торговли и обеих кнопок в шапке торговца
    expect(overlaySrc).toContain('handleCloseMerchantPress');
    expect(overlaySrc).toContain("tLootTrade('player.closeMerchantConfirmTitle')");
    expect(overlaySrc).toContain("tLootTrade('player.closeMerchantConfirmMessage')");
    expect(ruJson.player.close).toBe('Закрыть');
    expect(enJson.player.close).toBe('Close');

    // Процент наценки/скупки торговца для игрока является тайной:
    // ни полосы ставок, ни ключей ratesLine/personalRatesBadge/perkCapCollector в окне игрока нет.
    expect(overlaySrc).not.toContain('ratesStrip');
    expect(overlaySrc).not.toContain('player.ratesLine');
    expect(overlaySrc).not.toContain('player.personalRatesBadge');
    expect(overlaySrc).not.toContain('player.perkCapCollector');
    expect(ruJson.player.ratesLine).toBeUndefined();
    expect(enJson.player.ratesLine).toBeUndefined();

    // Базовая каталожная цена товара также скрывается в описании товара у торговца,
    // чтобы игрок не вычислял % наценки по строке «Цена: X».
    expect(overlaySrc).toContain('cost: null, price: null');
    const sanitizedBasics = formatBasicsWithIcons(describeItemBasics(
      { weaponType: 'Light', damage: 5, cost: null, price: null },
      'ru-RU',
    ));
    expect(sanitizedBasics).toContain('Урон 5 {CD}');
    expect(sanitizedBasics).not.toContain('Цена');
    expect(sanitizedBasics).not.toContain('{CAP}');
  });

  it('сервер комнаты сохраняет сессию торговца открытой для других игроков, когда один игрок нажимает «Закрыть», и гасит её после последнего игрока', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const waitMsg = makeWaitMsg();

    const prevEnvUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
    process.env.EXPO_PUBLIC_ROOM_SERVER_URL = wsUrl;

    setRoomClientFactoryForTests((input) => createRoomClient({
      ...input,
      webSocketFactory: (u) => new WebSocket(u),
    }));

    const p1Box = [];
    const p2Box = [];
    const p1 = createRoomClient({
      url: wsUrl,
      clientId: 'player-a-471',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p1Box.push(m),
    });
    const p2 = createRoomClient({
      url: wsUrl,
      clientId: 'player-b-471',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => p2Box.push(m),
    });

    try {
      const created = await useRoomStore.getState().createRoom({ name: 'Караван 471' });
      const code = created.code;
      await useRoomStore.getState().joinRoom({ code, name: 'GM', role: 'gm' });

      p1.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок А', role: 'player', requestId: 'ja' }, code);
      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'ja');

      p2.send(ROOM_MESSAGE.ROOM_JOIN, { code, name: 'Игрок Б', role: 'player', requestId: 'jb' }, code);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload?.requestId === 'jb');

      const opened = await useRoomStore.getState().openRoomSession({
        code,
        session: {
          containerId: 'cnt-merch-471',
          kind: 'merchant',
          name: 'Караванщик Лукас',
          targetType: 'room',
          caps: 250,
          saleMarkupPercent: 25,
          buyDepreciationPercent: 50,
          items: [
            { entryId: 'e1', itemId: 'stimpak', itemType: 'chem', name: 'Стимулятор', cost: 50, quantity: 4 },
          ],
        },
      });
      expect(opened.kind).toBe('merchant');

      await waitMsg(p1Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId);
      await waitMsg(p2Box, (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.session?.sessionId === opened.sessionId);

      // Игрок А закрывает окно торговли — Игрок Б остаётся подключён к торговцу
      p1.send(ROOM_MESSAGE.SESSION_PLAYER_CLOSE, {
        code,
        sessionId: opened.sessionId,
        requestId: 'close-a',
      }, code);
      const afterAClose = await waitMsg(
        p1Box,
        (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.requestId === 'close-a',
      );
      expect(afterAClose.payload.session).toBeTruthy();
      expect(afterAClose.payload.session.closedByClientIds).toContain('player-a-471');
      expect(afterAClose.payload.session.closedByClientIds).not.toContain('player-b-471');

      // Игрок Б также закрывает окно торговли — активных зрителей не осталось, сессия завершается
      p2.send(ROOM_MESSAGE.SESSION_PLAYER_CLOSE, {
        code,
        sessionId: opened.sessionId,
        requestId: 'close-b',
      }, code);
      const afterBClose = await waitMsg(
        p2Box,
        (m) => m.type === ROOM_MESSAGE.SESSION_STATE && m.payload?.requestId === 'close-b',
      );
      expect(afterBClose.payload.session).toBeNull();
      expect(afterBClose.payload.closedReason).toBe('player_closed');
    } finally {
      p1.close();
      p2.close();
      resetRoomClientForTests();
      if (prevEnvUrl === undefined) delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
      else process.env.EXPO_PUBLIC_ROOM_SERVER_URL = prevEnvUrl;
      await app.close();
    }
  });

  it('тексты окон используют токены иконок {CAP} (caps.png) и {CD} (CD.png) вместо «кр.», «крышки», «крышек» и «CD»', () => {
    const ruRaw = readSource('i18n/ru-RU/screens/lootTrade/screen.json');
    const enRaw = readSource('i18n/en-EN/screens/lootTrade/screen.json');
    const iconHelperSrc = readSource('components/lootTrade/LootTradeIconText.js');
    const textUtilsSrc = readSource('modules/fallout/screens/WeaponsAndArmorScreen/textUtils.js');

    // Проводка реальных иконок caps.png (из инвентаря пользователя) и CD.png (из таблицы статов оружия)
    expect(iconHelperSrc).toContain('modules/fallout/assets/backgrounds/caps.png');
    expect(iconHelperSrc).toContain('assets/CD.png');
    expect(textUtilsSrc).toContain('assets/backgrounds/caps.png');
    expect(textUtilsSrc).toContain('assets/CD.png');

    // Ни одного текстового «кр.», «крышки», «крышек» в локализации окон нет
    expect(ruRaw).not.toMatch(/кр\.|крышки|крышек/i);
    // В английской локализации нет литерального слова caps вне плейсхолдера {caps}
    const enWithoutPlaceholders = enRaw.replace(/\{caps\}|\{CAP\}|\{CD\}/g, '');
    expect(enWithoutPlaceholders).not.toMatch(/\bcaps\b|\bCD\b/i);
    const ruWithoutPlaceholders = ruRaw.replace(/\{caps\}|\{CAP\}|\{CD\}/g, '');
    expect(ruWithoutPlaceholders).not.toMatch(/\bCD\b/);

    // Проверка форматирования строк с токенами {CAP} и {CD}
    expect(formatLootTrade(tLootTrade('player.unitPrice'), { price: 65 })).toContain('{CAP}');
    expect(formatLootTrade(tLootTrade('player.barterPay'), { amount: 120 })).toContain('{CAP}');
    expect(tLootTrade('itemConfig.unitCd')).toBe('{CD}');
    expect(withCdToken('6 + 3 CD')).toBe('6 + 3 {CD}');
    expect(withCdToken('Формула 1 пачки: 10 + 5 {CD}')).toBe('Формула 1 пачки: 10 + 5 {CD}');
  });
});
