// src/room/roomCharacterSync.ts
// Публикация и отображение персонажей между разделом пользователя и комнатой
// мастера (патч 456):
// - персонаж пользователя отправляется в комнату только через явное подключение
//   (и далее автоматически при переподключении/редактировании, пока привязка жива);
// - перемещение персонажа по пользовательским папкам никак не меняет привязку к комнате;
// - статус «зелёный / бледный» на карточке персонажа определяется наличием активного
//   соединения с комнатой И присутствием мастера (role === 'gm') в сети этой комнаты.

import { debugLog } from '../debug/falloutDebug';
import useRoomStore, { type RoomStateEntry } from './roomStore';
import type { RoomConnectionStatus } from './roomClient';
import type { RoomSnapshotEntry } from './roomProtocol';

export interface PublishedRoomCharacterPayload {
  characterId: string;
  name: string;
  level: number;
  originName: string | null;
  updatedAt: number;
  avatarDataUrl: string | null;
  data: unknown;
}

export interface GmRoomCharacterCardItem {
  id: string;
  name: string;
  level: number;
  originName: string | null;
  avatarDataUrl: string | null;
  updatedAt: number;
  fromClientId: string;
  playerOnline: boolean;
  snapshotPayload: PublishedRoomCharacterPayload;
}

/**
 * Зелёный индикатор на карточке персонажа у игрока горит ТОЛЬКО когда:
 * 1) WebSocket-клиент в сети ('online'),
 * 2) вход в комнату подтверждён сервером (joined !== false),
 * 3) в списке участников комнаты сейчас есть мастер (role === 'gm').
 */
export const isRoomAvailableWithGm = (
  room: RoomStateEntry | undefined | null,
  connectionStatus: RoomConnectionStatus,
): boolean => {
  if (connectionStatus !== 'online') return false;
  if (!room || room.joined === false) return false;
  if (!Array.isArray(room.members)) return false;
  return room.members.some((member) => member?.role === 'gm');
};

/**
 * Разделяет папки на пользовательские каталоги и серверные комнаты мастера:
 * - в разделе пользователя видны ТОЛЬКО обычные папки (без штампа комнаты);
 * - в интерфейсе мастера видны ТОЛЬКО серверные комнаты.
 */
export const filterFoldersForMode = <T extends { id: string }>(
  folders: T[],
  folderRooms: Record<string, string>,
  isGmMode: boolean,
): T[] => (
  folders.filter((folder) => (isGmMode ? Boolean(folderRooms[folder.id]) : !folderRooms[folder.id]))
);

/**
 * Превращает снапшоты комнаты из roomStore в список карточек персонажей
 * для экрана комнаты в интерфейсе мастера.
 */
export const buildGmRoomCharacterCards = (
  room: RoomStateEntry | undefined | null,
): GmRoomCharacterCardItem[] => {
  const map = room?.snapshots || {};
  const onlineIds = new Set(
    (room?.members || [])
      .filter((member) => member?.role === 'player')
      .map((member) => member.clientId),
  );

  const items: GmRoomCharacterCardItem[] = [];
  for (const entry of Object.values(map) as RoomSnapshotEntry[]) {
    const raw = entry?.snapshot as Partial<PublishedRoomCharacterPayload> | null;
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.characterId || entry.characterId || '');
    if (!id) continue;
    items.push({
      id,
      name: String(raw.name || entry.fromName || '—'),
      level: Number(raw.level) || 1,
      originName: raw.originName ?? null,
      avatarDataUrl: raw.avatarDataUrl ?? null,
      updatedAt: Number(raw.updatedAt || entry.revision) || 0,
      fromClientId: entry.fromClientId || '',
      playerOnline: Boolean(entry.fromClientId && onlineIds.has(entry.fromClientId)),
      snapshotPayload: {
        characterId: id,
        name: String(raw.name || entry.fromName || '—'),
        level: Number(raw.level) || 1,
        originName: raw.originName ?? null,
        updatedAt: Number(raw.updatedAt || entry.revision) || 0,
        avatarDataUrl: raw.avatarDataUrl ?? null,
        data: raw.data ?? null,
      },
    });
  }

  items.sort((a, b) => (b.updatedAt - a.updatedAt) || a.name.localeCompare(b.name));
  return items;
};

/** Собирает полный сетевой снапшот локального персонажа по его id в БД. */
export const buildLocalCharacterRoomSnapshot = async (
  characterId: string,
): Promise<PublishedRoomCharacterPayload | null> => {
  try {
    const db = await import('../../db');
    const row = await (db as any).loadCharacterById(characterId);
    if (!row) return null;
    let avatarDataUrl: string | null = null;
    try {
      const avatarCache = await import('../../db/avatarCache');
      const cached = await (avatarCache as any).getAvatarCache(characterId);
      avatarDataUrl = cached?.data_url || cached?.dataUrl || null;
    } catch {
      // Отсутствие аватара не мешает публикации персонажа.
    }
    const updatedAt = Number(row.updatedAt ?? row.updated_at) || Date.now();
    return {
      characterId: String(row.id),
      name: String(row.name || '—'),
      level: Number(row.level) || 1,
      originName: row.originName ?? row.origin_name ?? null,
      updatedAt,
      avatarDataUrl,
      data: row.data,
    };
  } catch (error) {
    debugLog('room.buildSnapshot:failed', {
      characterId,
      message: (error as Error)?.message || String(error),
    });
    return null;
  }
};

/**
 * Гарантирует вход игрока в привязанную комнату и публикует актуальный
 * снапшот персонажа. Безопасно вызывать при подключении, автосейве и реконнекте.
 */
export const syncBoundCharacterToRoom = async (
  characterId: string,
  code: string,
): Promise<boolean> => {
  const snapshot = await buildLocalCharacterRoomSnapshot(characterId);
  if (!snapshot) return false;
  const store = useRoomStore.getState();
  await store.joinRoom({ code, name: snapshot.name, role: 'player' });
  await store.publishCharacter({
    code,
    characterId,
    revision: Math.max(snapshot.updatedAt, Date.now()),
    snapshot,
  });
  return true;
};

/**
 * Если персонаж привязан к комнате и комната уже активна/доступна, пушит
 * свежий снапшот после локального сохранения (автосейв / ручной сейв).
 */
export const pushSavedCharacterToBoundRoomIfAny = async (
  characterId: string,
): Promise<void> => {
  try {
    const db = await import('../../db');
    const binding = await (db as any).getCharacterRoomBinding?.(characterId);
    const code = binding?.code;
    if (!code) return;
    await syncBoundCharacterToRoom(characterId, code);
  } catch (error) {
    debugLog('room.pushOnSave:skipped', {
      characterId,
      message: (error as Error)?.message || String(error),
    });
  }
};
