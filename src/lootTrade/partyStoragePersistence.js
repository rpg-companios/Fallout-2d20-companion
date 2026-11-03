/**
 * Патч 508: «Общее хранилище» = хранилище Мастера + снапшот игрокам.
 *
 * Сервер держит только текущий снимок в памяти комнаты и ничего не пишет на
 * диск. Здесь, на устройстве Мастера, каждый `storage.state` сохраняется в
 * локальную БД и фоном выгружается в его Google Drive — тем же путём, что
 * контейнеры добычи. Игроки снимок не сохраняют: у них только копия для
 * чтения, а запись возможна лишь пока Мастер в сети.
 *
 * Конфликтов и офлайн-коммитов нет: все изменения происходят онлайн.
 */

import * as db from '../../db';
import useRoomStore, { onRoomStorageState } from '../room/roomStore';
import { syncRoomStorageToCloudIfEnabled } from '../../components/cloudSync/googleDriveSync';
import { debugLog } from '../debug/falloutDebug';

let persistenceChain = Promise.resolve();

const isMasterRoom = async (code) => {
  const room = useRoomStore.getState().rooms?.[code];
  if (room?.role === 'gm') return true;
  try {
    const rows = await db.getFolderRooms();
    return Boolean((rows || []).find((row) => row?.code === code && row?.owner_token));
  } catch {
    return false;
  }
};

/** Восстановить сохранённое хранилище Мастера в комнату при подключении. */
export const restoreMasterStorage = async (code) => {
  try {
    const saved = await db.getRoomStorage(code);
    if (!saved) return false;
    await useRoomStore.getState().restorePartyStorage({ code, storage: saved });
    return true;
  } catch (error) {
    debugLog('roomStorage.restore:failed', { message: error?.message || String(error) });
    return false;
  }
};

export const startPartyStoragePersistence = () => onRoomStorageState((envelope) => {
  persistenceChain = persistenceChain
    .then(async () => {
      const code = envelope?.roomCode;
      const storage = envelope?.payload?.storage;
      if (!code || !storage) return;
      if (!await isMasterRoom(code)) return;
      await db.saveRoomStorage(code, storage);
      void syncRoomStorageToCloudIfEnabled(code);
    })
    .catch((error) => {
      debugLog('roomStorage.persistence:failed', { message: error?.message || String(error) });
    });
  return persistenceChain;
});

export default startPartyStoragePersistence;
