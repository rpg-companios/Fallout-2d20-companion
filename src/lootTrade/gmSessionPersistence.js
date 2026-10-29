// src/lootTrade/gmSessionPersistence.js
// Фоновый слушатель активных сессий комнат Мастера: когда игроки забирают
// предметы из контейнера добычи или совершают сделку с торговцем, обновлённый
// остаток предметов и касса торговца сразу сохраняются в локальную БД Мастера
// и фоном отправляются в Google Drive — даже если Мастер в этот момент смотрит
// другую вкладку («Список кампаний» или лист персонажа).

import * as db from '../../db';
import useRoomStore, { onRoomSessionState } from '../room/roomStore';
import { syncGmContainerToCloudIfEnabled } from '../../components/cloudSync/googleDriveSync';
import { debugLog } from '../debug/falloutDebug';

const gmContainerSyncListeners = new Set();

export const subscribeGmContainerUpdates = (listener) => {
  gmContainerSyncListeners.add(listener);
  return () => {
    gmContainerSyncListeners.delete(listener);
  };
};

export const notifyGmContainerUpdated = (containerId) => {
  gmContainerSyncListeners.forEach((fn) => {
    try { fn(containerId); } catch { /* ignore */ }
  });
};

export const startGmSessionPersistence = () => {
  return onRoomSessionState(async (envelope) => {
    try {
      const code = envelope?.roomCode;
      if (!code) return;
      const room = useRoomStore.getState().rooms[code];
      if (!room || room.role !== 'gm') return;

      const session = envelope?.payload?.session || envelope?.payload?.closedSession;
      if (!session?.containerId) return;

      const existing = await db.getGmContainerById(session.containerId);
      if (!existing) return;

      const nextContainer = {
        ...existing,
        items: Array.isArray(session.items) ? session.items : existing.items,
        caps: existing.kind === 'merchant' && session.caps !== undefined
          ? session.caps
          : existing.caps,
        saleMarkupPercent: existing.kind === 'merchant' && session.saleMarkupPercent !== undefined
          ? session.saleMarkupPercent
          : existing.saleMarkupPercent,
        buyDepreciationPercent: existing.kind === 'merchant' && session.buyDepreciationPercent !== undefined
          ? session.buyDepreciationPercent
          : existing.buyDepreciationPercent,
      };

      await db.saveGmContainer(nextContainer);
      notifyGmContainerUpdated(existing.id);
      void syncGmContainerToCloudIfEnabled(existing.id);
    } catch (error) {
      debugLog('gm.sessionPersistence:failed', {
        message: error?.message || String(error),
      });
    }
  });
};
