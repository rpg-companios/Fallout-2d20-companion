// src/lootTrade/gmSessionPersistence.js
// Фоновый слушатель активных сессий комнат Мастера: когда игроки забирают
// предметы из контейнера добычи или совершают сделку с торговцем, обновлённый
// остаток предметов и касса торговца сразу сохраняются в локальную БД Мастера
// и фоном отправляются в Google Drive — даже если Мастер в этот момент смотрит
// другую вкладку («Список кампаний» или лист персонажа).
// Если из контейнера добычи забрали весь лут — раздача закрывается автоматически,
// а Мастеру показывается вопрос «Контейнер пуст. Хотите удалить?».

import * as db from '../../db';
import useRoomStore, { onRoomSessionState } from '../room/roomStore';
import {
  syncGmContainerToCloudIfEnabled,
  deleteGmContainerFromCloudIfEnabled,
} from '../../components/cloudSync/googleDriveSync';
import { showRawAlert } from '../../components/alerts/alertService';
import {
  tLootTrade,
  formatLootTrade,
} from '../../components/screens/LootTradeScreen/logic/lootTradeI18n';
import { debugLog } from '../debug/falloutDebug';

const gmContainerSyncListeners = new Set();
const promptedEmptySessionIds = new Set();

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

export const resetPromptedEmptySessionsForTests = () => {
  promptedEmptySessionIds.clear();
};

export const startGmSessionPersistence = () => {
  return onRoomSessionState(async (envelope) => {
    try {
      const code = envelope?.roomCode;
      if (!code) return;
      const room = useRoomStore.getState().rooms[code];
      if (!room || room.role !== 'gm') return;

      const closedReason = envelope?.payload?.closedReason || null;
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

      const promptKey = String(session.sessionId || `${code}:${existing.id}:${session.revision || 0}`);
      if (
        closedReason === 'loot_emptied'
        && existing.kind === 'loot'
        && !promptedEmptySessionIds.has(promptKey)
      ) {
        promptedEmptySessionIds.add(promptKey);
        void syncGmContainerToCloudIfEnabled(existing.id);
        showRawAlert({
          title: tLootTrade('detail.emptyLootPromptTitle'),
          message: formatLootTrade(tLootTrade('detail.emptyLootPromptMessage'), {
            name: existing.name,
          }),
          buttons: [
            { text: tLootTrade('detail.emptyLootKeep'), style: 'cancel' },
            {
              text: tLootTrade('card.delete'),
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  try {
                    await deleteGmContainerFromCloudIfEnabled(existing.id);
                    await db.deleteGmContainer(existing.id);
                    notifyGmContainerUpdated(existing.id);
                  } catch (err) {
                    debugLog('gm.sessionPersistence.deleteEmpty:failed', {
                      message: err?.message || String(err),
                    });
                  }
                })();
              },
            },
          ],
        });
        return;
      }

      void syncGmContainerToCloudIfEnabled(existing.id);
    } catch (error) {
      debugLog('gm.sessionPersistence:failed', {
        message: error?.message || String(error),
      });
    }
  });
};
