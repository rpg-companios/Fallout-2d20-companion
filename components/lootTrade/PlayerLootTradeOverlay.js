import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as db from '../../db';
import * as savesModule from '../../src/saves/characterSaves';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore, { selectUiMode } from '../../src/store/appSettingsStore';
import useRoomStore from '../../src/room/roomStore';
import useUiModeStore from '../../src/room/uiModeStore';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import { useLocale, useModuleLocale } from '../../i18n/locale';
import {
  tLootTrade,
  formatLootTrade,
} from '../screens/LootTradeScreen/logic/lootTradeI18n';
import {
  CONTAINER_KIND,
  computeBarterSummary,
  computeMerchantBuybackPriceFromPlayer,
  computeMerchantSellPriceToPlayer,
  getEffectiveMerchantRates,
} from '../../domain/lootTrade';
import { describeItemBasics } from '../../domain/itemBasics';
import {
  applyCommittedMerchantTradeToCharacter,
  getSellablePlayerInventoryItems,
  grantLootEntriesToCharacter,
} from '../../src/lootTrade/grantCharacterItems';
import { showRawAlert } from '../alerts/alertService';
import { debugLog } from '../../src/debug/falloutDebug';

const getItemIcon = (itemType) => {
  if (itemType === 'caps') return '💰';
  if (itemType === 'weapon') return '🔫';
  if (itemType === 'armor') return '🛡️';
  if (itemType === 'powerArmor') return '⚡';
  if (itemType === 'clothing' || itemType === 'outfit') return '👕';
  if (itemType === 'ammo') return '🔹';
  if (itemType === 'chem' || itemType === 'chems') return '💊';
  if (itemType === 'drinks') return '🥤';
  if (itemType === 'food') return '🍖';
  if (itemType === 'magazine') return '📖';
  if (itemType === 'junk') return '🗑️';
  if (itemType === 'materials') return '🧰';
  return '📦';
};

export default function PlayerLootTradeOverlay() {
  useLocale();
  const moduleLocale = useModuleLocale();
  const { width: windowWidth } = useWindowDimensions();
  const isWideLayout = windowWidth >= 680;

  const storeUiMode = useAppSettingsStore(selectUiMode);
  const tabUiMode = useUiModeStore((s) => s.tabUiMode);
  const isGmMode = (tabUiMode || storeUiMode) === 'gm';

  const rooms = useRoomStore((s) => s.rooms);
  const roomStatus = useRoomStore((s) => s.status);
  const myClientId = useRoomStore((s) => s.clientId);

  const currentCharacterId = useCharacterStore((s) => s.currentCharacterId);
  const storeItems = useCharacterStore((s) => s.items);
  const playerCaps = useCharacterStore((s) => s.currency);
  const perkBonuses = useCharacterStore((s) => s.perkBonuses);

  const [bindings, setBindings] = useState([]); // [{ characterId, code, name }]
  const [minimizedSessionId, setMinimizedSessionId] = useState(null);
  const [closedSessionIds, setClosedSessionIds] = useState({}); // { [sessionId]: true }
  const [busy, setBusy] = useState(false);
  const [mobileTab, setMobileTab] = useState('merchant'); // 'player' | 'merchant'

  // Буферы обмена с торговцем
  const [buyBuffer, setBuyBuffer] = useState({}); // { [entryId]: qty }
  const [sellBuffer, setSellBuffer] = useState({}); // { [playerItemId]: qty }

  const markSessionClosedLocally = useCallback((sessionId) => {
    if (!sessionId) return;
    setClosedSessionIds((prev) => (prev[sessionId] ? prev : { ...prev, [sessionId]: true }));
    setMinimizedSessionId((prev) => (prev === sessionId ? null : prev));
  }, []);

  const refreshBindings = useCallback(async () => {
    if (isGmMode) return;
    try {
      const [bindingRows, charList] = await Promise.all([
        db.getCharacterRoomBindings(),
        db.getCharactersList(),
      ]);
      const nameMap = Object.fromEntries((charList || []).map((c) => [c.id, c.name]));
      setBindings(
        (bindingRows || [])
          .filter((b) => b?.character_id && b?.code && nameMap[b.character_id])
          .map((b) => ({
            characterId: b.character_id,
            code: b.code,
            name: nameMap[b.character_id],
          })),
      );
    } catch (error) {
      debugLog('playerOverlay.bindings:failed', { message: error?.message });
    }
  }, [isGmMode]);

  useEffect(() => {
    refreshBindings();
  }, [refreshBindings, currentCharacterId, roomStatus, rooms]);

  // Находим активную сессию комнаты, подходящую привязанному персонажу игрока
  const matchedContext = useMemo(() => {
    if (isGmMode || bindings.length === 0) return null;

    // Сначала приоритет — персонажу, который уже открыт прямо сейчас
    const ordered = [...bindings].sort((a, b) => {
      if (a.characterId === currentCharacterId) return -1;
      if (b.characterId === currentCharacterId) return 1;
      return 0;
    });

    for (const bind of ordered) {
      const room = rooms[bind.code];
      const session = room?.activeSession;
      if (!session) continue;
      if (closedSessionIds[session.sessionId]) continue;
      if (
        myClientId
        && Array.isArray(session.closedByClientIds)
        && session.closedByClientIds.includes(myClientId)
      ) {
        continue;
      }
      if (session.targetType === 'room' || session.targetCharacterId === bind.characterId) {
        return {
          roomCode: bind.code,
          characterId: bind.characterId,
          characterName: bind.name,
          isCharacterLoaded: currentCharacterId === bind.characterId,
          session,
        };
      }
    }
    return null;
  }, [isGmMode, bindings, rooms, currentCharacterId, closedSessionIds, myClientId]);

  const activeSession = matchedContext?.session || null;

  // При открытии новой сессии очищаем старый буфер и разворачиваем модалку
  useEffect(() => {
    setBuyBuffer({});
    setSellBuffer({});
    setMinimizedSessionId(null);
    setMobileTab('merchant');
  }, [activeSession?.sessionId]);

  // Автоподрезка буфера покупки, если остаток в лавке уменьшился (купил другой игрок)
  useEffect(() => {
    if (!activeSession || activeSession.kind !== CONTAINER_KIND.MERCHANT) return;
    setBuyBuffer((prev) => {
      let changed = false;
      const next = {};
      const byId = Object.fromEntries((activeSession.items || []).map((it) => [it.entryId, it]));
      for (const [entryId, qty] of Object.entries(prev)) {
        const avail = Math.max(0, Math.floor(Number(byId[entryId]?.quantity) || 0));
        const clamped = Math.min(qty, avail);
        if (clamped !== qty) changed = true;
        if (clamped > 0) next[entryId] = clamped;
      }
      return changed ? next : prev;
    });
  }, [activeSession?.revision]);

  const sellablePlayerItems = useMemo(() => {
    if (!matchedContext?.isCharacterLoaded || activeSession?.kind !== CONTAINER_KIND.MERCHANT) {
      return [];
    }
    return getSellablePlayerInventoryItems(storeItems, moduleLocale);
  }, [matchedContext?.isCharacterLoaded, activeSession?.kind, storeItems, moduleLocale]);

  const capCollectorPercent = Number(perkBonuses?.capCollectorDiscountPercent) || 0;

  const effectiveRates = useMemo(
    () => getEffectiveMerchantRates(activeSession, matchedContext?.characterId),
    [activeSession, matchedContext?.characterId],
  );

  const barterSummary = useMemo(() => {
    if (!activeSession || activeSession.kind !== CONTAINER_KIND.MERCHANT) return null;
    return computeBarterSummary({
      merchantItems: activeSession.items || [],
      playerItems: sellablePlayerItems,
      buyBuffer,
      sellBuffer,
      saleMarkupPercent: effectiveRates.saleMarkupPercent,
      buyDepreciationPercent: effectiveRates.buyDepreciationPercent,
      capCollectorPercent,
      playerCaps,
      merchantCaps: activeSession.caps || 0,
      resolvePlayerItemCatalogCost: (pItem) => pItem.cost,
    });
  }, [
    activeSession,
    sellablePlayerItems,
    buyBuffer,
    sellBuffer,
    effectiveRates,
    capCollectorPercent,
    playerCaps,
  ]);

  if (isGmMode || !matchedContext || !activeSession) return null;

  const isMinimized = minimizedSessionId === activeSession.sessionId;

  // Если привязанный персонаж ещё не открыт (например, игрок стоит в Менеджере персонажей) —
  // показываем компактную кнопку быстрого открытия этого персонажа и окна выдачи.
  if (!matchedContext.isCharacterLoaded) {
    return (
      <View style={styles.floatingBar} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.floatingPill}
          onPress={async () => {
            const ok = await savesModule.loadCharacter(matchedContext.characterId);
            if (ok) setMinimizedSessionId(null);
          }}
        >
          <Text style={styles.floatingPillTitle}>
            {formatLootTrade(
              tLootTrade(
                activeSession.kind === CONTAINER_KIND.MERCHANT
                  ? 'player.minimizedMerchant'
                  : 'player.minimizedLoot',
              ),
              { name: activeSession.name },
            )}
          </Text>
          <Text style={styles.floatingPillAction}>
            {formatLootTrade(tLootTrade('player.openForBoundChar'), {
              charName: matchedContext.characterName,
            })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isMinimized) {
    return (
      <View style={styles.floatingBar} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.floatingPill}
          onPress={() => setMinimizedSessionId(null)}
        >
          <Text style={styles.floatingPillTitle}>
            {formatLootTrade(
              tLootTrade(
                activeSession.kind === CONTAINER_KIND.MERCHANT
                  ? 'player.minimizedMerchant'
                  : 'player.minimizedLoot',
              ),
              { name: activeSession.name },
            )}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Обработчики КОНТЕЙНЕРА ДОБЫЧИ ──────────────────────────────────────────

  const handleTakeLoot = async (takes) => {
    if (busy || !takes.length || !activeSession || !matchedContext) return;
    const targetSessionId = activeSession.sessionId;
    const targetRoomCode = matchedContext.roomCode;
    const targetCharacterId = matchedContext.characterId;
    setBusy(true);
    try {
      const { granted, session: updatedSession, closedReason } =
        await useRoomStore.getState().takeFromLootSession({
          code: targetRoomCode,
          sessionId: targetSessionId,
          characterId: targetCharacterId,
          takes,
        });
      if (granted?.length) {
        grantLootEntriesToCharacter(granted);
        setTimeout(() => {
          void pushSavedCharacterToBoundRoomIfAny(targetCharacterId);
        }, 650);
      }

      const sessionClosedOnServer = !updatedSession || Boolean(closedReason);
      const emptiedByThisTake =
        Boolean(granted?.length)
        && Array.isArray(updatedSession?.items)
        && updatedSession.items.length === 0;

      if (sessionClosedOnServer || emptiedByThisTake) {
        markSessionClosedLocally(targetSessionId);
        if (
          updatedSession
          && (!myClientId || !updatedSession.closedByClientIds?.includes(myClientId))
        ) {
          void useRoomStore.getState().playerCloseRoomSession({
            code: targetRoomCode,
            sessionId: targetSessionId,
          }).catch(() => {});
        }
      }
    } catch (error) {
      debugLog('playerOverlay.lootTake:failed', { message: error?.message });
    } finally {
      setBusy(false);
    }
  };

  const performPlayerLootClose = async () => {
    if (!activeSession || !matchedContext) return;
    const targetSessionId = activeSession.sessionId;
    const targetRoomCode = matchedContext.roomCode;
    markSessionClosedLocally(targetSessionId);
    try {
      await useRoomStore.getState().playerCloseRoomSession({
        code: targetRoomCode,
        sessionId: targetSessionId,
      });
    } catch (error) {
      debugLog('playerOverlay.playerClose:failed', { message: error?.message });
    }
  };

  const handleCloseLootPress = () => {
    if (busy || !activeSession) return;
    const remainingCount = Array.isArray(activeSession.items) ? activeSession.items.length : 0;
    if (remainingCount > 0) {
      showRawAlert({
        title: tLootTrade('player.closeLootConfirmTitle'),
        message: tLootTrade('player.closeLootConfirmMessage'),
        buttons: [
          { text: tLootTrade('form.cancel'), style: 'cancel' },
          {
            text: tLootTrade('player.close'),
            style: 'destructive',
            onPress: () => {
              void performPlayerLootClose();
            },
          },
        ],
      });
      return;
    }
    void performPlayerLootClose();
  };

  // ── Обработчики ТОРГОВЦА (буфер обмена) ───────────────────────────────────

  const addToBuyBuffer = (entry, delta) => {
    setBuyBuffer((prev) => {
      const cur = prev[entry.entryId] || 0;
      const nextQty = Math.max(0, Math.min(entry.quantity, cur + delta));
      const next = { ...prev };
      if (nextQty <= 0) delete next[entry.entryId];
      else next[entry.entryId] = nextQty;
      return next;
    });
  };

  const addToSellBuffer = (pItem, delta) => {
    setSellBuffer((prev) => {
      const cur = prev[pItem.id] || 0;
      const nextQty = Math.max(0, Math.min(pItem.quantity, cur + delta));
      const next = { ...prev };
      if (nextQty <= 0) delete next[pItem.id];
      else next[pItem.id] = nextQty;
      return next;
    });
  };

  const executeTradeCommit = async (acceptCapShortfall = false) => {
    if (!barterSummary || !barterSummary.hasItems || busy) return;
    if (!barterSummary.canPlayerAfford) {
      showRawAlert({
        title: formatLootTrade(tLootTrade('player.notEnoughPlayerCaps'), {
          need: barterSummary.playerOwes,
          have: playerCaps,
        }),
      });
      return;
    }

    if (barterSummary.merchantCapShortfall > 0 && !acceptCapShortfall) {
      const accepted = await new Promise((resolve) => {
        showRawAlert({
          title: tLootTrade('player.shortfallConfirmTitle'),
          message: formatLootTrade(tLootTrade('player.shortfallConfirmMessage'), {
            need: barterSummary.merchantOwes,
            have: activeSession.caps || 0,
            shortfall: barterSummary.merchantCapShortfall,
          }),
          buttons: [
            { text: tLootTrade('form.cancel'), style: 'cancel', onPress: () => resolve(false) },
            {
              text: formatLootTrade(tLootTrade('player.shortfallAccept'), {
                have: activeSession.caps || 0,
              }),
              onPress: () => resolve(true),
            },
          ],
        });
      });
      if (!accepted) return;
      return executeTradeCommit(true);
    }

    setBusy(true);
    try {
      const buyItems = barterSummary.buyLines.map((line) => ({
        entryId: line.entryId,
        quantity: line.quantity,
      }));
      const sellItems = barterSummary.sellLines.map((line) => ({
        clientItemId: line.playerItemId,
        itemId: line.item.catalogId,
        itemType: line.item.itemType,
        name: line.item.name,
        cost: line.item.cost,
        weight: line.item.weight,
        quantity: line.quantity,
        itemSnapshot: line.item.itemSnapshot,
      }));

      const { committed } = await useRoomStore.getState().commitMerchantTrade({
        code: matchedContext.roomCode,
        sessionId: activeSession.sessionId,
        characterId: matchedContext.characterId,
        perkCapCollectorPercent: capCollectorPercent,
        playerCapsAvailable: playerCaps,
        acceptCapShortfall,
        buyItems,
        sellItems,
      });

      if (committed) {
        applyCommittedMerchantTradeToCharacter(committed);
        setBuyBuffer({});
        setSellBuffer({});
        setTimeout(() => {
          void pushSavedCharacterToBoundRoomIfAny(matchedContext.characterId);
        }, 650);
      }
    } catch (error) {
      const code = error?.code || error?.message;
      if (code === 'TRADE_STOCK_CHANGED') {
        showRawAlert({ title: tLootTrade('player.stockChangedError') });
      } else if (code === 'TRADE_NOT_ENOUGH_MERCHANT_CAPS') {
        const have = Number(error?.payload?.merchantCaps ?? activeSession.caps ?? 0);
        const need = Number(error?.payload?.owedCaps ?? 0);
        showRawAlert({
          title: tLootTrade('player.shortfallConfirmTitle'),
          message: formatLootTrade(tLootTrade('player.shortfallConfirmMessage'), {
            need,
            have,
            shortfall: Math.max(0, need - have),
          }),
        });
      } else {
        debugLog('playerOverlay.tradeCommit:failed', { message: error?.message });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Рендер модалки КОНТЕЙНЕРА ДОБЫЧИ ──────────────────────────────────────

  if (activeSession.kind === CONTAINER_KIND.LOOT) {
    const items = activeSession.items || [];
    return (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={() => setMinimizedSessionId(activeSession.sessionId)}
      >
        <View style={styles.lootModalBackdrop}>
          <SafeAreaView style={styles.lootModalCard}>
            <View style={[styles.modalHeader, styles.lootHeaderSpacing]}>
              <View style={styles.modalTitleRow}>
                <MaterialCommunityIcons name="treasure-chest" size={24} color="#f0e68c" />
                <Text style={styles.modalTitle}>{activeSession.name}</Text>
              </View>
              <View style={styles.headerActionsRow}>
                <TouchableOpacity
                  style={styles.minimizeBtn}
                  disabled={busy}
                  onPress={() => setMinimizedSessionId(activeSession.sessionId)}
                >
                  <Text style={styles.minimizeBtnText}>{tLootTrade('player.minimize')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.closeContainerBtn, busy && styles.disabledBtn]}
                  disabled={busy}
                  onPress={handleCloseLootPress}
                >
                  <Text style={styles.closeContainerBtnText}>{tLootTrade('player.close')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {Boolean(activeSession.description) && (
              <Text style={[styles.modalDesc, styles.lootDescSpacing]}>
                {activeSession.description}
              </Text>
            )}

            <ScrollView
              style={styles.lootScroll}
              contentContainerStyle={styles.lootScrollContent}
            >
              {items.length === 0 ? (
                <Text style={styles.emptyText}>{tLootTrade('player.lootEmpty')}</Text>
              ) : (
                items.map((entry) => {
                  const isCaps = entry.itemType === 'caps' || entry.itemId === 'caps';
                  return (
                    <View key={entry.entryId} style={styles.lootRow}>
                      <View style={styles.lootRowInfo}>
                        <Text style={styles.lootRowTitle}>
                          {getItemIcon(entry.itemType)}{' '}
                          {isCaps
                            ? formatLootTrade(tLootTrade('player.capsItemLabel'), { qty: entry.quantity })
                            : `${entry.name} ×${entry.quantity}`}
                        </Text>
                        {!isCaps && entry.weight > 0 && (
                          <Text style={styles.lootRowSub}>
                            {formatLootTrade(tLootTrade('detail.weight'), {
                              weight: Number((entry.weight * entry.quantity).toFixed(2)),
                            })}
                          </Text>
                        )}
                      </View>
                      <View style={styles.lootRowBtns}>
                        {!isCaps && entry.quantity > 1 && (
                          <TouchableOpacity
                            style={styles.takeOneBtn}
                            disabled={busy}
                            onPress={() => handleTakeLoot([{ entryId: entry.entryId, quantity: 1 }])}
                          >
                            <Text style={styles.takeOneBtnText}>{tLootTrade('player.takeOne')}</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.takeAllRowBtn}
                          disabled={busy}
                          onPress={() => handleTakeLoot([{ entryId: entry.entryId, quantity: entry.quantity }])}
                        >
                          <Text style={styles.takeAllRowBtnText}>
                            {entry.quantity > 1 && !isCaps
                              ? formatLootTrade(tLootTrade('player.takeAllRow'), { qty: entry.quantity })
                              : tLootTrade('player.takeOne')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.lootFooter}>
              {items.length > 0 && (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, busy && styles.disabledBtn]}
                  disabled={busy}
                  onPress={() => handleTakeLoot(
                    items.map((it) => ({ entryId: it.entryId, quantity: it.quantity })),
                  )}
                >
                  <Text style={styles.primaryActionBtnText}>
                    {tLootTrade('player.takeAllContainer')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    );
  }

  // ── Рендер ДВУХПАНЕЛЬНОЙ МОДАЛКИ ТОРГОВЦА (покупка + продажа через буфер) ─

  const renderPlayerPane = () => (
    <View style={[styles.pane, isWideLayout && styles.paneHalf]}>
      <View style={styles.paneHeader}>
        <Text style={styles.paneHeaderTitle}>{tLootTrade('player.playerInventoryTab')}</Text>
        <Text style={styles.paneHeaderCaps}>
          {formatLootTrade(tLootTrade('player.playerCaps'), { caps: playerCaps })}
        </Text>
      </View>

      <ScrollView style={styles.paneScroll}>
        {/* Серый курсив: выбранные у торговца товары (пока сделка не проведена) */}
        {barterSummary && barterSummary.buyLines.length > 0 && (
          <View style={styles.bufferBox}>
            <Text style={styles.bufferHeader}>{tLootTrade('player.bufferReceivingHeader')}</Text>
            {barterSummary.buyLines.map((line) => (
              <TouchableOpacity
                key={`buf-buy-${line.entryId}`}
                style={styles.bufferRow}
                onPress={() => addToBuyBuffer(line.entry, -1)}
              >
                <Text style={styles.bufferItalicText}>
                  + {line.name} ×{line.quantity} ({line.lineTotal} кр.)
                </Text>
                <TouchableOpacity
                  style={styles.bufferClearAllBtn}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    addToBuyBuffer(line.entry, -line.quantity);
                  }}
                >
                  <Text style={styles.bufferClearAllText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Собственные предметы игрока для продажи */}
        {sellablePlayerItems.length === 0 ? (
          <Text style={styles.emptyText}>{tLootTrade('player.playerEmpty')}</Text>
        ) : (
          sellablePlayerItems.map((pItem) => {
            const buffered = sellBuffer[pItem.id] || 0;
            const remaining = pItem.quantity - buffered;
            if (remaining <= 0) return null;

            const sellUnitPrice = computeMerchantBuybackPriceFromPlayer(pItem, {
              buyDepreciationPercent: effectiveRates.buyDepreciationPercent,
              capCollectorPercent,
              catalogCost: pItem.cost,
            });
            const durSuffix = pItem.durability != null
              ? ` [${pItem.durability}/100]`
              : (pItem.charges != null ? ` [${pItem.charges}]` : '');

            return (
              <TouchableOpacity
                key={pItem.id}
                style={styles.tradeRow}
                onPress={() => addToSellBuffer(pItem, 1)}
              >
                <View style={styles.tradeRowInfo}>
                  <Text style={styles.tradeRowName}>
                    {getItemIcon(pItem.itemType)} {pItem.name}{durSuffix} ×{remaining}
                  </Text>
                  <Text style={styles.tradeRowPrice}>
                    {formatLootTrade(tLootTrade('player.unitPrice'), { price: sellUnitPrice })}
                  </Text>
                </View>
                <View style={styles.tradeRowBtns}>
                  <TouchableOpacity
                    style={styles.miniMoveBtn}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      addToSellBuffer(pItem, 1);
                    }}
                  >
                    <Text style={styles.miniMoveBtnText}>{tLootTrade('player.giveOne')}</Text>
                  </TouchableOpacity>
                  {remaining > 1 && (
                    <TouchableOpacity
                      style={styles.miniMoveAllBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        addToSellBuffer(pItem, remaining);
                      }}
                    >
                      <Text style={styles.miniMoveBtnText}>{tLootTrade('player.giveAll')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  const renderMerchantPane = () => {
    const merchantStock = activeSession.items || [];
    return (
      <View style={[styles.pane, isWideLayout && styles.paneHalf]}>
        <View style={styles.paneHeader}>
          <Text style={styles.paneHeaderTitle}>{tLootTrade('player.merchantInventoryTab')}</Text>
          <Text style={styles.paneHeaderCaps}>
            {formatLootTrade(tLootTrade('player.merchantCaps'), { caps: activeSession.caps || 0 })}
          </Text>
        </View>

        <ScrollView style={styles.paneScroll}>
          {/* Серый курсив: то, что игрок отдаёт торговцу (можно забрать назад до продажи) */}
          {barterSummary && barterSummary.sellLines.length > 0 && (
            <View style={styles.bufferBox}>
              <Text style={styles.bufferHeader}>{tLootTrade('player.bufferGivingHeader')}</Text>
              {barterSummary.sellLines.map((line) => (
                <TouchableOpacity
                  key={`buf-sell-${line.playerItemId}`}
                  style={styles.bufferRow}
                  onPress={() => addToSellBuffer(line.item, -1)}
                >
                  <Text style={styles.bufferItalicText}>
                    + {line.name} ×{line.quantity} ({line.lineTotal} кр.)
                  </Text>
                  <TouchableOpacity
                    style={styles.bufferClearAllBtn}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      addToSellBuffer(line.item, -line.quantity);
                    }}
                  >
                    <Text style={styles.bufferClearAllText}>✕</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Ассортимент торговца */}
          {merchantStock.length === 0 ? (
            <Text style={styles.emptyText}>{tLootTrade('player.merchantEmpty')}</Text>
          ) : (
            merchantStock.map((entry) => {
              const buffered = buyBuffer[entry.entryId] || 0;
              const remaining = entry.quantity - buffered;
              if (remaining <= 0) return null;

              const buyUnitPrice = computeMerchantSellPriceToPlayer(entry, {
                saleMarkupPercent: effectiveRates.saleMarkupPercent,
                capCollectorPercent,
              });
              const basics = entry.itemSnapshot
                ? describeItemBasics(entry.itemSnapshot, moduleLocale)
                : '';

              return (
                <TouchableOpacity
                  key={entry.entryId}
                  style={styles.tradeRow}
                  onPress={() => addToBuyBuffer(entry, 1)}
                >
                  <View style={styles.tradeRowInfo}>
                    <Text style={styles.tradeRowName}>
                      {getItemIcon(entry.itemType)} {entry.name} ×{remaining}
                    </Text>
                    {Boolean(basics) && (
                      <Text style={styles.tradeRowBasics} numberOfLines={2}>{basics}</Text>
                    )}
                    <Text style={styles.tradeRowPriceBuy}>
                      {formatLootTrade(tLootTrade('player.unitPrice'), { price: buyUnitPrice })}
                    </Text>
                  </View>
                  <View style={styles.tradeRowBtns}>
                    <TouchableOpacity
                      style={styles.miniMoveBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        addToBuyBuffer(entry, 1);
                      }}
                    >
                      <Text style={styles.miniMoveBtnText}>{tLootTrade('player.giveOne')}</Text>
                    </TouchableOpacity>
                    {remaining > 1 && (
                      <TouchableOpacity
                        style={styles.miniMoveAllBtn}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          addToBuyBuffer(entry, remaining);
                        }}
                      >
                        <Text style={styles.miniMoveBtnText}>{tLootTrade('player.giveAll')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  };

  const canCommit = Boolean(
    barterSummary
    && barterSummary.hasItems
    && barterSummary.canPlayerAfford
    && !busy,
  );

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => setMinimizedSessionId(activeSession.sessionId)}
    >
      <View style={styles.modalBackdrop}>
        <SafeAreaView style={styles.merchantModalCard}>
          {/* Шапка торговца */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <MaterialCommunityIcons name="sack" size={23} color="#f0e68c" />
              <Text style={styles.modalTitle}>{activeSession.name}</Text>
            </View>
            <TouchableOpacity
              style={styles.minimizeBtn}
              onPress={() => setMinimizedSessionId(activeSession.sessionId)}
            >
              <Text style={styles.minimizeBtnText}>{tLootTrade('player.minimize')}</Text>
            </TouchableOpacity>
          </View>

          {Boolean(activeSession.description) && (
            <Text style={styles.modalDesc}>{activeSession.description}</Text>
          )}

          {/* Живые ставки и автоперки */}
          <View style={styles.ratesStrip}>
            <Text style={styles.ratesStripText}>
              {formatLootTrade(tLootTrade('player.ratesLine'), {
                sale: effectiveRates.saleMarkupPercent >= 0
                  ? `+${effectiveRates.saleMarkupPercent}`
                  : String(effectiveRates.saleMarkupPercent),
                depr: effectiveRates.buyDepreciationPercent,
              })}
            </Text>
            {effectiveRates.isPersonalOverride && (
              <Text style={styles.personalBadgeText}>{tLootTrade('player.personalRatesBadge')}</Text>
            )}
            {capCollectorPercent > 0 && (
              <Text style={styles.perkBadgeText}>{tLootTrade('player.perkCapCollector')}</Text>
            )}
          </View>

          {/* На узком экране телефона — компактный переключатель двух панелей */}
          {!isWideLayout && (
            <View style={styles.mobileTabSwitch}>
              <TouchableOpacity
                style={[styles.mobileTabBtn, mobileTab === 'player' && styles.mobileTabBtnActive]}
                onPress={() => setMobileTab('player')}
              >
                <Text style={[
                  styles.mobileTabText,
                  mobileTab === 'player' && styles.mobileTabTextActive,
                ]}>
                  {tLootTrade('player.playerInventoryTab')} ({playerCaps} кр.)
                  {barterSummary?.buyLines.length ? ` +${barterSummary.buyLines.length}` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mobileTabBtn, mobileTab === 'merchant' && styles.mobileTabBtnActive]}
                onPress={() => setMobileTab('merchant')}
              >
                <Text style={[
                  styles.mobileTabText,
                  mobileTab === 'merchant' && styles.mobileTabTextActive,
                ]}>
                  {tLootTrade('player.merchantInventoryTab')} ({activeSession.caps || 0} кр.)
                  {barterSummary?.sellLines.length ? ` +${barterSummary.sellLines.length}` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Две панели: бок о бок на планшете/ПК, по переключателю на узком экране */}
          <View style={styles.twoPanesContainer}>
            {isWideLayout ? (
              <>
                {renderPlayerPane()}
                {renderMerchantPane()}
              </>
            ) : (
              mobileTab === 'player' ? renderPlayerPane() : renderMerchantPane()
            )}
          </View>

          {/* Нижняя панель баланса сделки */}
          {barterSummary && (
            <View style={styles.barterFooter}>
              <View style={styles.barterBalanceCol}>
                {barterSummary.playerOwes > 0 ? (
                  <Text style={[
                    styles.barterBalanceText,
                    !barterSummary.canPlayerAfford && styles.barterErrorText,
                  ]}>
                    {formatLootTrade(tLootTrade('player.barterPay'), {
                      amount: barterSummary.playerOwes,
                    })}
                  </Text>
                ) : barterSummary.merchantOwes > 0 ? (
                  <Text style={styles.barterReceiveText}>
                    {formatLootTrade(tLootTrade('player.barterReceive'), {
                      amount: barterSummary.actualMerchantPayout,
                    })}
                  </Text>
                ) : (
                  <Text style={styles.barterBalanceText}>
                    {tLootTrade('player.barterEven')}
                  </Text>
                )}

                {!barterSummary.canPlayerAfford && (
                  <Text style={styles.barterErrorText}>
                    {formatLootTrade(tLootTrade('player.notEnoughPlayerCaps'), {
                      need: barterSummary.playerOwes,
                      have: playerCaps,
                    })}
                  </Text>
                )}

                {barterSummary.merchantCapShortfall > 0 && (
                  <Text style={styles.barterWarnText}>
                    {formatLootTrade(tLootTrade('player.merchantShortfallWarn'), {
                      have: activeSession.caps || 0,
                      need: barterSummary.merchantOwes,
                      shortfall: barterSummary.merchantCapShortfall,
                    })}
                  </Text>
                )}
              </View>

              <View style={styles.barterFooterBtns}>
                {barterSummary.hasItems && (
                  <TouchableOpacity
                    style={styles.clearBufBtn}
                    onPress={() => {
                      setBuyBuffer({});
                      setSellBuffer({});
                    }}
                  >
                    <Text style={styles.clearBufBtnText}>{tLootTrade('player.clearBuffer')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.commitTradeBtn, !canCommit && styles.disabledBtn]}
                  disabled={!canCommit}
                  onPress={() => executeTradeCommit(false)}
                >
                  <Text style={styles.commitTradeBtnText}>{tLootTrade('player.commitTrade')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  floatingBar: {
    position: 'absolute',
    bottom: 64,
    right: 14,
    left: 14,
    alignItems: 'flex-end',
    zIndex: 90,
  },
  floatingPill: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1.5,
    borderColor: '#f0e68c',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  floatingPillTitle: {
    color: '#f0e68c',
    fontWeight: '700',
    fontSize: 13,
  },
  floatingPillAction: {
    color: '#d4af37',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  lootModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  lootModalCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '82%',
    backgroundColor: '#1f1f1f',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#f0e68c',
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  merchantModalCard: {
    width: '100%',
    maxWidth: 1040,
    height: '90%',
    backgroundColor: '#1f1f1f',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#f0e68c',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  lootHeaderSpacing: {
    marginBottom: 8,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalTitle: {
    color: '#f0e68c',
    fontSize: 19,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimizeBtn: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#777777',
    backgroundColor: '#2a2a2a',
  },
  minimizeBtnText: {
    color: '#e5e5e5',
    fontSize: 12,
    fontWeight: '600',
  },
  closeContainerBtn: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e57373',
    backgroundColor: '#4a1f1f',
  },
  closeContainerBtnText: {
    color: '#f5bcbc',
    fontSize: 12,
    fontWeight: '700',
  },
  modalDesc: {
    color: '#cccccc',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 18,
  },
  lootDescSpacing: {
    marginTop: 2,
    marginBottom: 6,
  },
  lootScroll: {
    marginTop: 10,
    marginBottom: 4,
    maxHeight: 420,
  },
  lootScrollContent: {
    paddingVertical: 4,
    gap: 10,
  },
  emptyText: {
    color: '#a3a3a3',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  lootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#484848',
    backgroundColor: '#2a2a2a',
    gap: 12,
  },
  lootRowInfo: {
    flex: 1,
    paddingRight: 8,
  },
  lootRowTitle: {
    color: '#f0f0f0',
    fontSize: 15,
    fontWeight: '700',
  },
  lootRowSub: {
    color: '#b0b0b0',
    fontSize: 12,
    marginTop: 3,
  },
  lootRowBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  takeOneBtn: {
    backgroundColor: '#333333',
    borderWidth: 1,
    borderColor: '#777777',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  takeOneBtnText: {
    color: '#e8e8e8',
    fontSize: 12,
    fontWeight: '700',
  },
  takeAllRowBtn: {
    backgroundColor: '#3a3a1e',
    borderWidth: 1,
    borderColor: '#f0e68c',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 6,
  },
  takeAllRowBtnText: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
  },
  lootFooter: {
    marginTop: 18,
    paddingTop: 4,
  },
  primaryActionBtn: {
    backgroundColor: '#3a3a1e',
    borderWidth: 1,
    borderColor: '#f0e68c',
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryActionBtnText: {
    color: '#f0e68c',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.45,
  },

  // Стили двухпанельного торговца
  ratesStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#4a4a4a',
    borderRadius: 6,
  },
  ratesStripText: {
    color: '#e5e5e5',
    fontSize: 12,
  },
  personalBadgeText: {
    color: '#f0e68c',
    fontSize: 11,
    fontWeight: '700',
  },
  perkBadgeText: {
    color: '#d4af37',
    fontSize: 11,
    fontWeight: '700',
  },
  mobileTabSwitch: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  mobileTabBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
  },
  mobileTabBtnActive: {
    backgroundColor: '#f0e68c',
    borderColor: '#d4af37',
  },
  mobileTabText: {
    color: '#d4d4d4',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  mobileTabTextActive: {
    color: '#1a1a1a',
  },
  twoPanesContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  pane: {
    flex: 1,
    backgroundColor: '#242424',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    overflow: 'hidden',
  },
  paneHalf: {
    width: '50%',
  },
  paneHeader: {
    backgroundColor: '#2d2a1e',
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d4af37',
  },
  paneHeaderTitle: {
    color: '#f0e68c',
    fontSize: 13,
    fontWeight: '700',
  },
  paneHeaderCaps: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
  },
  paneScroll: {
    flex: 1,
  },
  bufferBox: {
    backgroundColor: '#1b1b1b',
    borderBottomWidth: 2,
    borderBottomColor: '#4d4d4d',
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  bufferHeader: {
    color: '#a3a3a3',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  bufferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  bufferItalicText: {
    flex: 1,
    color: '#9e9e9e',
    fontStyle: 'italic',
    fontSize: 13,
    paddingRight: 8,
  },
  bufferClearAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#333333',
    borderWidth: 1,
    borderColor: '#666666',
  },
  bufferClearAllText: {
    color: '#d4d4d4',
    fontSize: 11,
    fontWeight: '700',
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#363636',
    backgroundColor: '#2a2a2a',
  },
  tradeRowInfo: {
    flex: 1,
    paddingRight: 8,
  },
  tradeRowName: {
    color: '#f0f0f0',
    fontSize: 13,
    fontWeight: '700',
  },
  tradeRowBasics: {
    color: '#a8a8a8',
    fontSize: 11,
    marginTop: 1,
  },
  tradeRowPrice: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  tradeRowPriceBuy: {
    color: '#d4af37',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  tradeRowBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  miniMoveBtn: {
    backgroundColor: '#3a3a1e',
    borderWidth: 1,
    borderColor: '#f0e68c',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 5,
  },
  miniMoveAllBtn: {
    backgroundColor: '#333333',
    borderWidth: 1,
    borderColor: '#777777',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 5,
  },
  miniMoveBtnText: {
    color: '#f0e68c',
    fontSize: 11,
    fontWeight: '700',
  },
  barterFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#444444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  barterBalanceCol: {
    flex: 1,
    minWidth: 200,
  },
  barterBalanceText: {
    color: '#f2f2f2',
    fontSize: 14,
    fontWeight: '700',
  },
  barterReceiveText: {
    color: '#f0e68c',
    fontSize: 14,
    fontWeight: '700',
  },
  barterErrorText: {
    color: '#e57373',
    fontSize: 12,
    fontWeight: '700',
  },
  barterWarnText: {
    color: '#d4af37',
    fontSize: 11,
    marginTop: 2,
  },
  barterFooterBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBufBtn: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#777777',
  },
  clearBufBtnText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '700',
  },
  commitTradeBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3a3a1e',
    borderWidth: 1,
    borderColor: '#f0e68c',
  },
  commitTradeBtnText: {
    color: '#f0e68c',
    fontSize: 14,
    fontWeight: '700',
  },
});
