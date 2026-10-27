// Регрессионные и интеграционные тесты патча 456:
// 1) публикация подключённого персонажа игрока в комнату мастера (живой WS-сервер)
//    и мгновенное отображение карточки персонажа внутри комнаты у админа;
// 2) изоляция clientId между вкладками одного браузера (sessionStorage), чтобы
//    открытые рядом вкладки «Админ» и «Пользователь» не затирали друг друга;
// 3) строгое разделение разделов: в окне админа нет локальных персонажей и обычных
//    папок пользователя, а в разделе пользователя не видны серверные комнаты;
// 4) перемещение персонажа в пользовательскую папку не сбрасывает привязку к комнате;
// 5) значок server-network в правом верхнем углу карточки персонажа: зелёный (#16a34a),
//    когда админ в сети и комната доступна, и бледный (#9ca3af), когда админ не в сети.

import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

vi.mock('react-native', () => ({
  StyleSheet: { create: (s) => s },
}));

import { createRoomServer } from '../../server/roomServer.js';
import { createRoomClient } from '../../src/room/roomClient';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';
import {
  isRoomAvailableWithGm,
  filterFoldersForMode,
  buildGmRoomCharacterCards,
} from '../../src/room/roomCharacterSync';
import styles from '../../styles/HomeScreen.styles';

const ROOT = path.resolve(__dirname, '../..');

describe('Патч 456: отображение подключённых персонажей у админа, изоляция разделов и индикатор сети', () => {
  it('живой WS: подключённый персонаж юзера сразу появляется в комнате админа и исчезает при отключении', async () => {
    const app = createRoomServer({ port: 0, host: '127.0.0.1', distDir: '/nonexistent' });
    const { port } = await app.start();
    const url = `ws://127.0.0.1:${port}/ws`;

    const gmInbox = [];
    const playerInbox = [];

    const gmClient = createRoomClient({
      url,
      clientId: 'device-1:t-admin',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => gmInbox.push(m),
    });

    const playerClient = createRoomClient({
      url,
      clientId: 'device-1:t-player',
      webSocketFactory: (u) => new WebSocket(u),
      onStatus: () => {},
      onMessage: (m) => playerInbox.push(m),
    });

    const waitMsg = (box, pred, timeoutMs = 4000) => new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const hit = box.find(pred);
        if (hit) { clearInterval(timer); resolve(hit); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
      }, 15);
    });

    try {
      // 1. Админ создаёт комнату и входит как gm
      gmClient.send(ROOM_MESSAGE.ROOM_CREATE, { name: 'Убежище 111', requestId: 'r-create' }, null);
      const created = await waitMsg(gmInbox, (m) => m.type === ROOM_MESSAGE.ROOM_CREATED);
      const roomCode = created.payload.code;

      gmClient.send(ROOM_MESSAGE.ROOM_JOIN, { code: roomCode, name: 'GM', role: 'gm', requestId: 'r-gm-join' }, roomCode);
      await waitMsg(gmInbox, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'r-gm-join');

      // 2. Юзер во второй вкладке того же браузера входит в комнату и публикует персонажа
      playerClient.send(ROOM_MESSAGE.ROOM_JOIN, { code: roomCode, name: 'Макс', role: 'player', requestId: 'r-pl-join' }, roomCode);
      const playerState = await waitMsg(playerInbox, (m) => m.type === ROOM_MESSAGE.ROOM_STATE && m.payload.requestId === 'r-pl-join');

      // Оба участника одновременно в комнате (админ НЕ затёрт игроком!)
      expect(playerState.payload.members.map((m) => m.role).sort()).toEqual(['gm', 'player']);

      playerClient.send(
        ROOM_MESSAGE.CHAR_PUBLISH,
        {
          characterId: 'char_max',
          revision: 100,
          snapshot: {
            characterId: 'char_max',
            name: 'Выживший Макс',
            level: 4,
            originName: 'vault_dweller',
            updatedAt: 100,
            avatarDataUrl: null,
            data: { level: 4 },
          },
        },
        roomCode,
      );

      // 3. Админ получает живой CHAR_PUBLISH и видит карточку персонажа
      const pubMsg = await waitMsg(
        gmInbox,
        (m) => m.type === ROOM_MESSAGE.CHAR_PUBLISH && m.payload?.characterId === 'char_max',
      );
      const roomEntryAtGm = {
        code: roomCode,
        name: 'Убежище 111',
        role: 'gm',
        joined: true,
        members: playerState.payload.members,
        snapshots: {
          char_max: {
            characterId: 'char_max',
            revision: pubMsg.payload.revision,
            snapshot: pubMsg.payload.snapshot,
            fromClientId: pubMsg.payload.fromClientId,
            fromName: pubMsg.payload.fromName,
          },
        },
      };
      const gmCards = buildGmRoomCharacterCards(roomEntryAtGm);
      expect(gmCards).toHaveLength(1);
      expect(gmCards[0]).toMatchObject({
        id: 'char_max',
        name: 'Выживший Макс',
        level: 4,
        playerOnline: true,
      });

      // 4. При отключении персонажа (removed: true) снапшот удаляется из реестра комнаты
      playerClient.send(
        ROOM_MESSAGE.CHAR_PUBLISH,
        { characterId: 'char_max', revision: 101, snapshot: null, removed: true },
        roomCode,
      );
      const removeMsg = await waitMsg(
        gmInbox,
        (m) => m.type === ROOM_MESSAGE.CHAR_PUBLISH && m.payload?.removed === true,
      );
      expect(removeMsg.payload.snapshot).toBeNull();
      expect(app.registry.getState(roomCode).snapshots).toEqual([]);
    } finally {
      gmClient.close();
      playerClient.close();
      await app.close();
    }
  });

  it('разделы изолированы: комнаты видны только у админа, обычные папки — только у пользователя', () => {
    const allFolders = [
      { id: 'f_user_1', name: 'Мои рейдеры' },
      { id: 'f_room_1', name: 'Кампания Бостон' },
      { id: 'f_user_2', name: 'Братство Стали' },
    ];
    const folderRooms = { f_room_1: 'GM-7Q3K9M' };

    expect(filterFoldersForMode(allFolders, folderRooms, false).map((f) => f.id)).toEqual([
      'f_user_1',
      'f_user_2',
    ]);
    expect(filterFoldersForMode(allFolders, folderRooms, true).map((f) => f.id)).toEqual([
      'f_room_1',
    ]);
  });

  it('значок server-network горит зелёным только когда и соединение живое, и админ в комнате', () => {
    // Админ в сети и комната присоединена -> зелёный (true)
    expect(
      isRoomAvailableWithGm(
        {
          code: 'GM-7Q3K9M',
          name: 'Стол',
          role: 'player',
          joined: true,
          members: [
            { clientId: 'gm-1', name: 'GM', role: 'gm' },
            { clientId: 'pl-1', name: 'Макс', role: 'player' },
          ],
        },
        'online',
      ),
    ).toBe(true);

    // Комната жива на сервере, но админ вышел из режима мастера -> бледный (false)
    expect(
      isRoomAvailableWithGm(
        {
          code: 'GM-7Q3K9M',
          name: 'Стол',
          role: 'player',
          joined: true,
          members: [{ clientId: 'pl-1', name: 'Макс', role: 'player' }],
        },
        'online',
      ),
    ).toBe(false);

    // Клиент оффлайн -> бледный (false)
    expect(
      isRoomAvailableWithGm(
        {
          code: 'GM-7Q3K9M',
          name: 'Стол',
          role: 'player',
          joined: true,
          members: [{ clientId: 'gm-1', name: 'GM', role: 'gm' }],
        },
        'offline',
      ),
    ).toBe(false);
  });

  it('дизайн значка server-network: правый верхний угол в стиле круглых кнопок карточки, перенос в папку не трогает привязку', () => {
    expect(styles.characterServerBadge).toMatchObject({
      position: 'absolute',
      top: 5,
      right: 5,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'white',
    });

    const homeSrc = fs.readFileSync(
      path.join(ROOT, 'components/screens/HomeScreen/HomeScreen.js'),
      'utf8',
    );
    expect(homeSrc).toContain("color={serverOnline ? '#16a34a' : '#9ca3af'}");
    expect(homeSrc).toContain('const displayedCharacters = isGmMode');

    // moveCharacterToFolder в обеих реализациях БД меняет только членство в папке, не трогая character_room_bindings
    const webDb = fs.readFileSync(path.join(ROOT, 'db/Database.web.js'), 'utf8');
    const moveBlock = webDb.slice(
      webDb.indexOf('export async function moveCharacterToFolder'),
      webDb.indexOf('export async function getRootCharactersList'),
    );
    expect(moveBlock).not.toContain('character_room_bindings');
  });
});
