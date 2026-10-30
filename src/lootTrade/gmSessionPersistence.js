// src/lootTrade/gmSessionPersistence.js
// Фоновый слушатель активных сессий комнат Мастера: когда игроки забирают
// предметы из контейнера добычи или совершают сделку с торговцем, обновлённый
// остаток предметов и касса торговца сразу сохраняются в локальную БД Мастера
// и фоном отправляются в Google Drive — даже если Мастер в этот момент смотрит
// другую вкладку («Список кампаний» или лист персонажа) или проверяет раздачу
// из режима Пользователя на том же устройстве.
// Если из контейнера добычи забрали весь лут — раздача и открытый экран контейнера
// закрываются автоматически, а Мастеру показывается вопрос «Контейнер пуст. Хотите удалить?».

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
const emptiedSessionIds = new Set();
const sessionRevisionById = new Map();
const pendingEmptyPrompts = new Map();
let persistenceChain = Promise.resolve();

export const subscribeGmContainerUpdates = (listener) => {
  gmContainerSyncListeners.add(listener);
  return () => {
    gmContainerSyncListeners.delete(listener);
  };
};

export const notifyGmContainerUpdated = (containerId, meta = {}) => {
  gmContainerSyncListeners.forEach((fn) => {
    try { fn(containerId, meta); } catch { /* ignore */ }
  });
};

export const resetPromptedEmptySessionsForTests = () => {
  promptedEmptySessionIds.clear();
  emptiedSessionIds.clear();
  sessionRevisionById.clear();
  pendingEmptyPrompts.clear();
  persistenceChain = Promise.resolve();
};

const showEmptyContainerDeleteAlert = ({
  containerId,
  containerName,
  roomCode = '',
  hubSessionId = null,
}) => {
  showRawAlert({
    title: tLootTrade('detail.emptyLootPromptTitle'),
    message: formatLootTrade(tLootTrade('detail.emptyLootPromptMessage'), {
      name: containerName,
    }),
    buttons: [
      { text: tLootTrade('detail.emptyLootKeep'), style: 'cancel' },
      {
        text: tLootTrade('card.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteGmContainerFromCloudIfEnabled(containerId);
              await db.deleteGmContainer(containerId);
              const allNow = await db.getGmContainersList();
              for (const item of allNow) {
                if (
                  item.kind === 'hub'
                  && (item.links || []).some((l) => l.containerId === containerId)
                ) {
                  const prunedLinks = item.links.filter(
                    (l) => l.containerId !== containerId,
                  );
                  await db.saveGmContainer({ ...item, links: prunedLinks });
                  void syncGmContainerToCloudIfEnabled(item.id);
                }
              }
              if (roomCode && hubSessionId) {
                const liveNow = useRoomStore.getState().rooms[roomCode]?.activeSession;
                if (liveNow && liveNow.sessionId === hubSessionId && liveNow.kind === 'hub') {
                  const prunedNodes = (liveNow.nodes || []).filter(
                    (n) => n.containerId !== containerId,
                  );
                  await useRoomStore.getState().updateRoomSessionRates({
                    code: roomCode,
                    sessionId: liveNow.sessionId,
                    nodes: prunedNodes,
                  }).catch(() => {});
                }
              }
              notifyGmContainerUpdated(containerId, { deleted: true });
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
};

export const flushPendingEmptyLootPrompts = async () => {
  if (pendingEmptyPrompts.size === 0) return;
  const entries = [...pendingEmptyPrompts.values()];
  pendingEmptyPrompts.clear();
  for (const item of entries) {
    try {
      const current = await db.getGmContainerById(item.containerId);
      if (current && current.kind === 'loot' && (current.items || []).length === 0) {
        notifyGmContainerUpdated(current.id, { emptied: true });
        showEmptyContainerDeleteAlert({
          containerId: current.id,
          containerName: current.name,
          roomCode: item.roomCode,
          hubSessionId: item.hubSessionId,
        });
      }
    } catch {
      // ignore
    }
  }
};

const resolveLocalRoomOwnership = async (code) => {
  try {
    const ownedRows = await db.getFolderRooms();
    const hit = Array.isArray(ownedRows)
      ? ownedRows.find((r) => r?.code === code && Boolean(r?.owner_token))
      : null;
    return hit ? String(hit.owner_token) : null;
  } catch {
    return null;
  }
};

export const startGmSessionPersistence = () => {
  return onRoomSessionState((envelope) => {
    persistenceChain = persistenceChain
      .then(() => handleRoomSessionEnvelope(envelope))
      .catch((error) => {
        debugLog('gm.sessionPersistence:failed', {
          message: error?.message || String(error),
        });
      });
    return persistenceChain;
  });
};

const handleRoomSessionEnvelope = async (envelope) => {
  try {
      if (!isGmLootTradeLicensed()) return;
      const code = envelope?.roomCode;
      if (!code) return;
      const room = useRoomStore.getState().rooms[code];
      const isGmRoomInStore = Boolean(room && room.role === 'gm');
      const localOwnerToken = isGmRoomInStore ? null : await resolveLocalRoomOwnership(code);
      if (!isGmRoomInStore && !localOwnerToken) return;

      const closedReason = envelope?.payload?.closedReason || null;
      const emptiedNodeContainerId = envelope?.payload?.emptiedNodeContainerId || null;
      const session = envelope?.payload?.session || envelope?.payload?.closedSession;
      if (!session?.containerId) return;

      const incomingRev = Number(session.revision) || 0;
      if (session.sessionId) {
        if (emptiedSessionIds.has(session.sessionId)) {
          return;
        }
        const prevRev = sessionRevisionById.get(session.sessionId) || 0;
        if (incomingRev > 0 && incomingRev < prevRev) {
          return;
        }
        if (incomingRev > prevRev) {
          sessionRevisionById.set(session.sessionId, incomingRev);
        }
      }

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

        notifyGmContainerUpdated(
          emptiedNodeContainerId || existing.id,
          emptiedNodeContainerId ? { emptied: true, hubId: existing.id } : {},
        );
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
            if (isGmRoomInStore) {
              showEmptyContainerDeleteAlert({
                containerId: emptiedChild.id,
                containerName: emptiedChild.name,
                roomCode: code,
                hubSessionId: session.sessionId,
              });
            } else {
              pendingEmptyPrompts.set(emptiedChild.id, {
                containerId: emptiedChild.id,
                roomCode: code,
                hubSessionId: session.sessionId,
              });
            }
          }
        }
        return;
      }

      const hadItemsBefore = Array.isArray(existing.items) && existing.items.length > 0;
      const nextItems = Array.isArray(session.items) ? session.items : existing.items;
      const isNowEmptyLoot = existing.kind === 'loot'
        && session.kind === 'loot'
        && Array.isArray(nextItems)
        && nextItems.length === 0;

      let effectiveClosedReason = closedReason;
      let shouldSendAutoCloseToServer = false;
      const liveSessionStillOpen = Boolean(envelope?.payload?.session);

      // Защита от зависшей открытой раздачи пустого сундука (например, при работе со старым WS-сервером
      // или когда ни один другой игрок больше не смотрит в опустевший сундук):
      if (!effectiveClosedReason && liveSessionStillOpen && isNowEmptyLoot && hadItemsBefore) {
        const closedSet = new Set(Array.isArray(session.closedByClientIds) ? session.closedByClientIds : []);
        const serverTracksClosedClients = Array.isArray(session.closedByClientIds) && closedSet.size > 0;
        const unclosedPlayersCount = (room?.members || []).filter(
          (m) => m?.role === 'player' && !closedSet.has(m.clientId),
        ).length;
        const waitingForOtherPlayers = serverTracksClosedClients && unclosedPlayersCount > 0;

        if (!waitingForOtherPlayers) {
          effectiveClosedReason = 'loot_emptied';
          shouldSendAutoCloseToServer = isGmRoomInStore;
        }
      }

      const nextContainer = {
        ...existing,
        items: nextItems,
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

      const isEmptiedLootClose = effectiveClosedReason === 'loot_emptied' && existing.kind === 'loot';
      if (isEmptiedLootClose && session.sessionId) {
        emptiedSessionIds.add(session.sessionId);
      }

      if (shouldSendAutoCloseToServer) {
        const ownerToken = localOwnerToken || await resolveLocalRoomOwnership(code);
        void useRoomStore.getState().closeRoomSession({
          code,
          sessionId: session.sessionId,
          ...(ownerToken ? { ownerToken } : {}),
        }).catch(() => {});
      }

      notifyGmContainerUpdated(
        existing.id,
        isEmptiedLootClose ? { emptied: true } : {},
      );

      const promptKey = String(session.sessionId || `${code}:${existing.id}:${session.revision || 0}`);
      if (isEmptiedLootClose && !promptedEmptySessionIds.has(promptKey)) {
        promptedEmptySessionIds.add(promptKey);
        void syncGmContainerToCloudIfEnabled(existing.id);
        if (isGmRoomInStore) {
          showEmptyContainerDeleteAlert({
            containerId: existing.id,
            containerName: existing.name,
            roomCode: code,
            hubSessionId: null,
          });
        } else {
          pendingEmptyPrompts.set(existing.id, {
            containerId: existing.id,
            roomCode: code,
            hubSessionId: null,
          });
        }
        return;
      }

      void syncGmContainerToCloudIfEnabled(existing.id);
  } catch (error) {
    debugLog('gm.sessionPersistence:failed', {
      message: error?.message || String(error),
    });
  }
};
