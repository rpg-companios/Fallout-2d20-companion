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
import { isGmLootTradeLicensed } from '../../domain/premium';

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
      if (!isGmLootTradeLicensed()) return;
      const code = envelope?.roomCode;
      if (!code) return;
      const room = useRoomStore.getState().rooms[code];
      if (!room || room.role !== 'gm') return;

      const closedReason = envelope?.payload?.closedReason || null;
      const emptiedNodeContainerId = envelope?.payload?.emptiedNodeContainerId || null;
      const session = envelope?.payload?.session || envelope?.payload?.closedSession;
      if (!session?.containerId) return;

      const existing = await db.getGmContainerById(session.containerId);
      if (!existing) return;

      if (session.kind === 'hub' && existing.kind === 'hub') {
        const nodes = Array.isArray(session.nodes) ? session.nodes : [];
        const nodeById = new Map(nodes.map((n) => [n.containerId, n]));

        // Синхронизируем флаги замков/подписей локации
        const updatedLinks = (existing.links || []).map((lnk) => {
          const liveNode = nodeById.get(lnk.containerId);
          if (!liveNode) return lnk;
          return {
            ...lnk,
            locked: Boolean(liveNode.locked),
            lockLabel: liveNode.lockLabel !== undefined ? String(liveNode.lockLabel || '') : lnk.lockLabel,
          };
        });
        await db.saveGmContainer({
          ...existing,
          links: updatedLinks,
        });

        // Синхронизируем каждый дочерний контейнер и каждого торговца локации в БД и Облако
        for (const node of nodes) {
          if (!node?.containerId) continue;
          const childExisting = await db.getGmContainerById(node.containerId);
          if (!childExisting) continue;
          await db.saveGmContainer({
            ...childExisting,
            items: Array.isArray(node.items) ? node.items : childExisting.items,
            caps: childExisting.kind === 'merchant' && node.caps !== undefined
              ? node.caps
              : childExisting.caps,
            saleMarkupPercent: childExisting.kind === 'merchant' && node.saleMarkupPercent !== undefined
              ? node.saleMarkupPercent
              : childExisting.saleMarkupPercent,
            buyDepreciationPercent: childExisting.kind === 'merchant' && node.buyDepreciationPercent !== undefined
              ? node.buyDepreciationPercent
              : childExisting.buyDepreciationPercent,
          });
          void syncGmContainerToCloudIfEnabled(childExisting.id);
        }

        notifyGmContainerUpdated(existing.id);
        void syncGmContainerToCloudIfEnabled(existing.id);

        if (emptiedNodeContainerId) {
          const emptiedKey = `hub:${session.sessionId}:${emptiedNodeContainerId}:${session.revision || 0}`;
          const emptiedChild = await db.getGmContainerById(emptiedNodeContainerId);
          if (
            emptiedChild
            && emptiedChild.kind === 'loot'
            && !promptedEmptySessionIds.has(emptiedKey)
          ) {
            promptedEmptySessionIds.add(emptiedKey);
            showRawAlert({
              title: tLootTrade('detail.emptyLootPromptTitle'),
              message: formatLootTrade(tLootTrade('detail.emptyLootPromptMessage'), {
                name: emptiedChild.name,
              }),
              buttons: [
                { text: tLootTrade('detail.emptyLootKeep'), style: 'cancel' },
                {
                  text: tLootTrade('card.delete'),
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      try {
                        await deleteGmContainerFromCloudIfEnabled(emptiedChild.id);
                        await db.deleteGmContainer(emptiedChild.id);
                        const allNow = await db.getGmContainersList();
                        for (const item of allNow) {
                          if (
                            item.kind === 'hub'
                            && (item.links || []).some((l) => l.containerId === emptiedChild.id)
                          ) {
                            const prunedLinks = item.links.filter(
                              (l) => l.containerId !== emptiedChild.id,
                            );
                            await db.saveGmContainer({ ...item, links: prunedLinks });
                            void syncGmContainerToCloudIfEnabled(item.id);
                          }
                        }
                        const liveNow = useRoomStore.getState().rooms[code]?.activeSession;
                        if (liveNow && liveNow.sessionId === session.sessionId && liveNow.kind === 'hub') {
                          const prunedNodes = (liveNow.nodes || []).filter(
                            (n) => n.containerId !== emptiedChild.id,
                          );
                          await useRoomStore.getState().updateRoomSessionRates({
                            code,
                            sessionId: liveNow.sessionId,
                            nodes: prunedNodes,
                          }).catch(() => {});
                        }
                        notifyGmContainerUpdated(emptiedChild.id);
                      } catch (err) {
                        debugLog('gm.sessionPersistence.deleteEmptyHubChild:failed', {
                          message: err?.message || String(err),
                        });
                      }
                    })();
                  },
                },
              ],
            });
          }
        }
        return;
      }

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
                    const allNow = await db.getGmContainersList();
                    for (const item of allNow) {
                      if (
                        item.kind === 'hub'
                        && (item.links || []).some((l) => l.containerId === existing.id)
                      ) {
                        const prunedLinks = item.links.filter(
                          (l) => l.containerId !== existing.id,
                        );
                        await db.saveGmContainer({ ...item, links: prunedLinks });
                        void syncGmContainerToCloudIfEnabled(item.id);
                      }
                    }
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
