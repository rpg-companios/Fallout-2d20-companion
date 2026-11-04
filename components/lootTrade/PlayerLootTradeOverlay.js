import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IconText, { formatBasicsWithIcons } from './LootTradeIconText';
import { tradeOverlayStyles as styles } from './tradeOverlayStyles';
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
  resolveTerminalSessionNode,
  resolveCheckSessionNode,
  normalizeLinkedCheckIds,
} from '../../domain/lootTrade';
import { describeItemBasics } from '../../domain/itemBasics';
import itemStacking from '../../domain/itemStacking.js';
import {
  applyCommittedMerchantTradeToCharacter,
  getSellablePlayerInventoryItems,
  grantLootEntriesToCharacter,
} from '../../src/lootTrade/grantCharacterItems';
import { showRawAlert } from '../alerts/alertService';
import TerminalHackingModal from './TerminalHackingModal';
import LockPickingModal from './LockPickingModal';
import {
  terminalAccessKey,
  canHackTerminal,
  terminalBlockedReason,
} from './terminalAccess';
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
  const [selectedHubNodeId, setSelectedHubNodeId] = useState(null);
  // Патч 523: стек вложенных локаций. Одна сессия живёт, пока игрок не вышел
  // из родительской локации или не нажал «Покинуть локацию».
  const [parentStack, setParentStack] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mobileTab, setMobileTab] = useState('merchant'); // 'player' | 'merchant'
  const [terminalSelection, setTerminalSelection] = useState(null);
  const [dismissedTerminalId, setDismissedTerminalId] = useState(null);
  // Патч 506: одноразовый доступ к терминалу в рамках ОДНОЙ трансляции.
  // Раньше признак «терминал открыт» жил в модалке: закрыл окно — и кнопка
  // «Взломать» снова считала терминал свободным, сколько угодно раз.
  // Ключ содержит accessId сервера: новая трансляция Мастера выдаёт новый.
  const [usedTerminalAccess, setUsedTerminalAccess] = useState({});
  const markTerminalAccess = useCallback((key) => {
    if (!key) return;
    setUsedTerminalAccess((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

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

  const directTerminalContext = useMemo(() => {
    if (isGmMode || bindings.length === 0) return null;
    const ordered = [...bindings].sort((a, b) => {
      if (a.characterId === currentCharacterId) return -1;
      if (b.characterId === currentCharacterId) return 1;
      return 0;
    });
    for (const bind of ordered) {
      const states = Object.values(rooms[bind.code]?.terminalStates || {});
      const terminalState = states.find((entry) => entry?.standaloneIssued && entry?.config?.containerId);
      if (terminalState) return { roomCode: bind.code, characterId: bind.characterId, characterName: bind.name, terminalState };
    }
    return null;
  }, [isGmMode, bindings, currentCharacterId, rooms]);

  const activeSession = matchedContext?.session || null;
  /**
   * Патч 506: «Покинуть локацию». Игрок отключается сам, сессия Мастера
   * остаётся активной для остальных. Сервер помечает этого участника в
   * session.closedByClientIds, и matchedContext выше перестаёт показывать
   * окно — источник правды не локальный useState, а состояние комнаты.
   */
  const leaveLocation = async () => {
    const session = matchedContext?.session;
    if (!session || !matchedContext) return;
    setTerminalSelection(null);
    setDismissedTerminalId(null);
    setParentStack([]);
    try {
      await useRoomStore.getState().playerCloseRoomSession({
        code: matchedContext.roomCode,
        sessionId: session.sessionId,
      });
    } catch (error) {
      debugLog('playerOverlay.leaveLocation:failed', { message: error?.message });
      markSessionClosedLocally(session.sessionId);
    }
  };

  const isHubSession = activeSession?.kind === CONTAINER_KIND.HUB;

  const selectedHubNode = useMemo(() => {
    if (!isHubSession || !selectedHubNodeId) return null;
    const found = (activeSession?.nodes || []).find(
      (n) => n.containerId === selectedHubNodeId && !n.locked,
    );
    // Терминал никогда не должен попадать в сценарий «открыть сундук»:
    // возвращаем игрока к списку локации, где он откроет мини-игру.
    if (found && resolveTerminalSessionNode(found).isTerminal) return null;
    return found || null;
  }, [isHubSession, activeSession?.nodes, selectedHubNodeId]);

  // Активный объект просмотра: либо прямая сессия (loot / merchant), либо открытый узел внутри Локации
  const viewTarget = isHubSession ? selectedHubNode : activeSession;
  const isInsideHub = Boolean(isHubSession && selectedHubNode);

  // При открытии новой сессии очищаем старый буфер и разворачиваем модалку
  useEffect(() => {
    setBuyBuffer({});
    setSellBuffer({});
    setSelectedHubNodeId(null);
    setMinimizedSessionId(null);
    setMobileTab('merchant');
  }, [activeSession?.sessionId]);

  // Если Мастер вживую запер или удалил открытый игроком узел в Локации — возвращаем в список Локации
  useEffect(() => {
    if (isHubSession && selectedHubNodeId && !selectedHubNode) {
      setSelectedHubNodeId(null);
      setBuyBuffer({});
      setSellBuffer({});
    }
  }, [isHubSession, selectedHubNodeId, selectedHubNode]);

  // Автоподрезка буфера покупки, если остаток в лавке уменьшился (купил другой игрок)
  useEffect(() => {
    if (!viewTarget || viewTarget.kind !== CONTAINER_KIND.MERCHANT) return;
    setBuyBuffer((prev) => {
      let changed = false;
      const next = {};
      const byId = Object.fromEntries((viewTarget.items || []).map((it) => [it.entryId, it]));
      for (const [entryId, qty] of Object.entries(prev)) {
        const avail = Math.max(0, Math.floor(Number(byId[entryId]?.quantity) || 0));
        const clamped = Math.min(qty, avail);
        if (clamped !== qty) changed = true;
        if (clamped > 0) next[entryId] = clamped;
      }
      return changed ? next : prev;
    });
  }, [activeSession?.revision, viewTarget?.containerId]);

  const sellablePlayerItems = useMemo(() => {
    if (!matchedContext?.isCharacterLoaded || viewTarget?.kind !== CONTAINER_KIND.MERCHANT) {
      return [];
    }
    return getSellablePlayerInventoryItems(storeItems, moduleLocale);
  }, [matchedContext?.isCharacterLoaded, viewTarget?.kind, storeItems, moduleLocale]);

  const capCollectorPercent = Number(perkBonuses?.capCollectorDiscountPercent) || 0;

  const effectiveRates = useMemo(
    () => getEffectiveMerchantRates(viewTarget, matchedContext?.characterId),
    [viewTarget, matchedContext?.characterId],
  );

  const barterSummary = useMemo(() => {
    if (!viewTarget || viewTarget.kind !== CONTAINER_KIND.MERCHANT) return null;
    return computeBarterSummary({
      merchantItems: viewTarget.items || [],
      playerItems: sellablePlayerItems,
      buyBuffer,
      sellBuffer,
      saleMarkupPercent: effectiveRates.saleMarkupPercent,
      buyDepreciationPercent: effectiveRates.buyDepreciationPercent,
      capCollectorPercent,
      playerCaps,
      merchantCaps: viewTarget.caps || 0,
      resolvePlayerItemCatalogCost: (pItem) => pItem.cost,
    });
  }, [
    viewTarget,
    sellablePlayerItems,
    buyBuffer,
    sellBuffer,
    effectiveRates,
    capCollectorPercent,
    playerCaps,
  ]);

  if (isGmMode) return null;
  if ((!matchedContext || !activeSession) && directTerminalContext) {
    const config = directTerminalContext.terminalState.config;
    if (currentCharacterId !== directTerminalContext.characterId) {
      return (
        <View style={styles.floatingBar} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.floatingPill}
            onPress={async () => { await savesModule.loadCharacter(directTerminalContext.characterId); }}
          >
            <Text style={styles.floatingPillTitle}>{config.name || tLootTrade('terminal.title')}</Text>
            <Text style={styles.floatingPillAction}>
              {formatLootTrade(tLootTrade('player.openForBoundChar'), { charName: directTerminalContext.characterName })}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    // Патч 504: «Нет» Мастера запрещает и взлом, и просмотр до новой
    // трансляции. Карточка остаётся на экране с отметкой «Закрыт».
    const directClosed = Boolean(
      directTerminalContext.terminalState.closed
      || directTerminalContext.terminalState.locked
      || directTerminalContext.terminalState.game?.status === 'closed',
    );
    if (directClosed) {
      return (
        <View style={styles.floatingBar} pointerEvents="box-none">
          <View style={styles.floatingPill}>
            <Text style={styles.floatingPillTitle}>{config.name || tLootTrade('terminal.title')}</Text>
            <Text style={styles.floatingClosedLabel}>{tLootTrade('terminal.closedBadge')}</Text>
            <Text style={styles.floatingPillAction}>{tLootTrade('terminal.closedHint')}</Text>
          </View>
        </View>
      );
    }
    // Патч 506: та же одноразовость для терминала, выданного напрямую.
    // Закрыл окно — «Открыть терминал» больше не возвращает к мини-игре.
    const directAccessKey = terminalAccessKey({
      roomCode: directTerminalContext.roomCode,
      containerId: config.containerId,
      accessId: directTerminalContext.terminalState?.accessId,
    });
    const directUsed = Boolean(usedTerminalAccess[directAccessKey]);
    if (dismissedTerminalId === config.containerId || directUsed) {
      return (
        <View style={styles.floatingBar} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.floatingPill}
            disabled={directUsed}
            onPress={() => setDismissedTerminalId(null)}
          >
            <Text style={styles.floatingPillTitle}>{config.name || tLootTrade('terminal.title')}</Text>
            <Text style={styles.floatingPillAction}>
              {directUsed ? tLootTrade('terminal.accessUsed') : tLootTrade('terminal.openTerminal')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (config.kind === CONTAINER_KIND.LOCK) {
      return (
        <LockPickingModal
          visible
          lock={config}
          roomCode={directTerminalContext.roomCode}
          onClose={() => {
            markTerminalAccess(directAccessKey);
            setDismissedTerminalId(config.containerId);
          }}
        />
      );
    }
    return (
      <TerminalHackingModal
        visible
        terminal={config}
        roomCode={directTerminalContext.roomCode}
        onClose={() => {
          markTerminalAccess(directAccessKey);
          setDismissedTerminalId(config.containerId);
        }}
      />
    );
  }
  if (!matchedContext || !activeSession) return null;

  const isMinimized = minimizedSessionId === activeSession.sessionId;
  const minimizedTitleKey = activeSession.kind === CONTAINER_KIND.HUB
    ? 'player.minimizedHub'
    : (activeSession.kind === CONTAINER_KIND.MERCHANT
      ? 'player.minimizedMerchant'
      : 'player.minimizedLoot');

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
            {formatLootTrade(tLootTrade(minimizedTitleKey), { name: activeSession.name })}
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
            {formatLootTrade(tLootTrade(minimizedTitleKey), { name: activeSession.name })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Рендер ВНЕШНЕГО ОКНА ЛОКАЦИИ (закрыть его может ТОЛЬКО Мастер!) ───────
  if (isHubSession && !viewTarget) {
    const rootId = activeSession.containerId || '';
    const currentParentId = parentStack.length ? parentStack[parentStack.length - 1] : rootId;
    // Узел может иметь НЕСКОЛЬКО родителей; старые сессии без parentIds
    // считаются детьми корня. Запертые потомки уже скрыты сервером.
    const hubNodes = (activeSession.nodes || []).filter((node) => {
      const parents = Array.isArray(node.parentIds) && node.parentIds.length
        ? node.parentIds
        : [rootId];
      return parents.includes(currentParentId);
    });
    return (
      <>
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setMinimizedSessionId(activeSession.sessionId)}
        >
          <View style={[styles.lootModalBackdrop, isWideLayout && styles.backdropWide]}>
            <View style={styles.lootModalCard}>
              <View style={[styles.modalHeader, styles.lootHeaderSpacing]}>
                <View style={styles.modalTitleRow}>
                  <MaterialCommunityIcons name="map-marker-multiple" size={24} color="#f0e68c" />
                  <Text style={styles.modalTitle}>{activeSession.name}</Text>
                </View>
                <View style={styles.headerActionsRow}>
                  {/* Патч 506: «Свернуть» и «Покинуть локацию». Закрыть сцену
                      по-прежнему может только Мастер; игрок отключается сам. */}
                  <TouchableOpacity
                    style={styles.minimizeBtn}
                    onPress={() => setMinimizedSessionId(activeSession.sessionId)}
                  >
                    <Text style={styles.minimizeBtnText}>{tLootTrade('player.minimize')}</Text>
                  </TouchableOpacity>
                  {parentStack.length > 0 && (
                    <TouchableOpacity
                      testID="hub-back-button"
                      style={styles.minimizeBtn}
                      onPress={() => setParentStack((stack) => stack.slice(0, -1))}
                    >
                      <Text style={styles.minimizeBtnText}>{tLootTrade('player.backToParent')}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    testID="leave-hub-button"
                    accessibilityRole="button"
                    style={styles.leaveHubBtn}
                    onPress={() => { void leaveLocation(); }}
                  >
                    <Text style={styles.leaveHubBtnText}>{tLootTrade('player.leaveHub')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {Boolean(activeSession.description) && (
                <IconText style={[styles.modalDesc, styles.lootDescSpacing]}>
                  {activeSession.description}
                </IconText>
              )}

              <ScrollView
                style={styles.lootScroll}
                contentContainerStyle={styles.lootScrollContent}
              >
                {hubNodes.length === 0 ? (
                  <Text style={styles.emptyText}>{tLootTrade('player.hubEmpty')}</Text>
                ) : (
                  hubNodes.map((rawNode) => {
                    // Старый сервер комнат собирает узел заново и понижает
                    // `kind: 'terminal'` до 'loot'. Маркер в lockLabel и реестр
                    // терминалов комнаты восстанавливают настоящий тип узла.
                    const { node, isTerminal: markedTerminal, isLock: markedLock } = resolveCheckSessionNode(rawNode);
                    const nodeIsMerch = node.kind === CONTAINER_KIND.MERCHANT;
                    const terminalState = rooms?.[matchedContext.roomCode]?.terminalStates?.[node.containerId];
                    const nodeIsTerminal = markedTerminal || Boolean(terminalState)
                      || node.kind === CONTAINER_KIND.LOCK;
                    // Патч 520: видимый (не привязанный как ворота) замок —
                    // самостоятельная точка локации со своей мини-игрой.
                    const nodeIsLock = markedLock || node.kind === CONTAINER_KIND.LOCK
                      || terminalState?.config?.kind === 'lock';
                    const nodeCheckKind = nodeIsLock ? CONTAINER_KIND.LOCK : CONTAINER_KIND.TERMINAL;
                    const terminalForSelection = {
                      ...node,
                      ...(terminalState?.config || {}),
                      kind: nodeCheckKind,
                    };
                    const nodeLocked = Boolean(node.locked);
                    // Патч 504: «Нет» Мастера оставляет карточку visible, но
                    // запрещает И взлом, И просмотр до новой трансляции.
                    const terminalClosed = Boolean(
                      terminalState?.closed || terminalState?.locked
                      || terminalState?.game?.status === 'closed',
                    );
                    const terminalAwaiting = !terminalClosed && Boolean(
                      terminalState?.awaitingGm || terminalState?.game?.status === 'awaitingRetry',
                    );
                    // Патч 506: доступ привязан к трансляции, а не к окну.
                    const accessKey = terminalAccessKey({
                      roomCode: matchedContext.roomCode,
                      containerId: node.containerId,
                      accessId: terminalState?.accessId,
                    });
                    const hackAllowed = canHackTerminal({
                      used: usedTerminalAccess,
                      key: accessKey,
                      game: terminalState?.game,
                      terminalClosed,
                      terminalAwaiting,
                    });
                    const accessBlockedReason = terminalBlockedReason({
                      used: usedTerminalAccess,
                      key: accessKey,
                      game: terminalState?.game,
                      terminalClosed,
                      terminalAwaiting,
                    });
                    const accessBadgeKey = {
                      closed: 'terminal.closedBadge',
                      awaiting: 'terminal.retryWaiting',
                      won: 'terminal.stateWon',
                      keyUnlocked: 'terminal.keyUnlockedBadge',
                      finished: 'terminal.accessUsed',
                      used: 'terminal.accessUsed',
                    }[accessBlockedReason] || null;
                    // Патч 519: привязанный терминал — это «замок» точки, а не
                    // отдельная карточка. Патч 520: источников может быть два
                    // (терминал ИЛИ замок) — они не блокируют точку одновременно.
                    // Обязательный ключ по-прежнему не обойти взломом.
                    const gateIds = node.keyAccessState !== 'denied'
                      ? normalizeLinkedCheckIds(node)
                      : [];
                    const gateOptions = nodeLocked
                      ? gateIds.map((id) => {
                          const state = rooms?.[matchedContext.roomCode]?.terminalStates?.[id];
                          if (!state) return null;
                          const kind = state.config?.kind === 'lock'
                            ? CONTAINER_KIND.LOCK
                            : CONTAINER_KIND.TERMINAL;
                          const accessKey = terminalAccessKey({
                            roomCode: matchedContext.roomCode,
                            containerId: id,
                            accessId: state?.accessId,
                          });
                          const closed = Boolean(
                            state.closed || state.locked || state.game?.status === 'closed',
                          );
                          const awaiting = Boolean(
                            state.awaitingGm || state.game?.status === 'awaitingRetry',
                          );
                          const hackAllowed = canHackTerminal({
                            used: usedTerminalAccess,
                            key: accessKey,
                            game: state?.game,
                            terminalClosed: closed,
                            terminalAwaiting: awaiting,
                          });
                          const difficulty = state.config?.difficulty ?? 1;
                          return {
                            id,
                            kind,
                            accessKey,
                            hackAllowed,
                            label: formatLootTrade(
                              tLootTrade(kind === CONTAINER_KIND.LOCK
                                ? 'player.gateLockLabel'
                                : 'player.gateTerminalLabel'),
                              { difficulty },
                            ),
                            selection: {
                              ...(state.config || {}),
                              containerId: id,
                              kind,
                              name: state.config?.name || tLootTrade('player.gateTerminal'),
                              difficulty,
                            },
                          };
                        }).filter(Boolean)
                      : [];
                    const gateAvailable = gateOptions.length > 0;
                    const gateHackAllowed = gateOptions.some((option) => option.hackAllowed);
                    const piecesCount = (node.items || []).reduce(
                      (sum, entry) => sum + (Number(entry.quantity) || 0),
                      0,
                    );

                    return (
                      <View
                        key={node.containerId}
                        style={[styles.lootRow, nodeLocked && styles.hubNodeRowLocked]}
                      >
                        <View style={styles.lootRowInfo}>
                          <View style={styles.hubNodeTitleRow}>
                            <MaterialCommunityIcons
                              name={nodeLocked ? 'lock' : (nodeIsTerminal ? 'console' : (nodeIsMerch ? 'sack' : 'treasure-chest'))}
                              size={19}
                              color={nodeLocked ? '#e57373' : '#f0e68c'}
                            />
                            <Text style={[
                              styles.lootRowTitle,
                              nodeLocked && styles.hubNodeTitleLocked,
                            ]}>
                              {node.name}
                            </Text>
                          </View>

                          {Boolean(node.description) && (
                            <IconText style={styles.lootRowSub}>{node.description}</IconText>
                          )}

                          {node.keyUnlocked ? (
                            <Text style={styles.hubUnlockedMetaText}>
                              {tLootTrade('player.hubNodeKeyUnlockedBadge')}
                            </Text>
                          ) : nodeLocked ? (
                            <Text style={styles.hubLockedHintText}>
                              {node.lockLabel || tLootTrade('player.hubNodeLockedDefaultHint')}
                            </Text>
                          ) : nodeIsTerminal ? (
                            <Text style={[styles.hubUnlockedMetaText, (terminalClosed || terminalAwaiting) && styles.terminalDeniedMeta]}>
                              {terminalClosed
                                ? tLootTrade('terminal.closedBadge')
                                : (terminalAwaiting
                                  ? tLootTrade('terminal.retryWaiting')
                                  : formatLootTrade(tLootTrade(nodeIsLock
                                      ? 'card.lockKindLabel'
                                      : 'card.terminalDifficulty'), {
                                      difficulty: terminalForSelection.difficulty || 0,
                                    }))}
                            </Text>
                          ) : nodeIsMerch ? (
                            <IconText style={styles.hubUnlockedMetaText}>
                              {`${formatLootTrade(tLootTrade('player.merchantCaps'), { caps: node.caps || 0 })} • ${formatLootTrade(tLootTrade('player.hubNodeItemsCount'), { count: piecesCount })}`}
                            </IconText>
                          ) : (
                            <Text style={styles.hubUnlockedMetaText}>
                              {piecesCount > 0
                                ? formatLootTrade(tLootTrade('player.hubNodeItemsCount'), { count: piecesCount })
                                : tLootTrade('player.hubNodeEmptyLoot')}
                            </Text>
                          )}
                        </View>

                        <View style={styles.lootRowBtns}>
                          {nodeLocked ? (
                            gateAvailable ? (
                              <View style={styles.terminalButtons}>
                                {gateOptions.map((option, optionIdx) => (
                                  <View key={option.id} style={styles.terminalButtons}>
                                    {optionIdx > 0 && (
                                      <Text testID={`gate-or-${node.containerId}`} style={styles.hubLockedHintText}>
                                        {tLootTrade('player.gateOr')}
                                      </Text>
                                    )}
                                    <Text testID={`gate-option-${option.id}`} style={styles.hubLockedHintText}>
                                      {option.label}
                                    </Text>
                                    <View style={styles.terminalButtons}>
                                      <TouchableOpacity
                                        testID={optionIdx === 0
                                          ? `gate-view-button-${node.containerId}`
                                          : `gate-view-button-${node.containerId}-${option.id}`}
                                        style={styles.terminalViewButton}
                                        onPress={() => setTerminalSelection({
                                          node: option.selection,
                                          kind: option.kind,
                                          autoStart: false,
                                        })}
                                      >
                                        <Text style={styles.terminalViewButtonText}>{tLootTrade('terminal.view')}</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        testID={optionIdx === 0
                                          ? `gate-hack-button-${node.containerId}`
                                          : `gate-hack-button-${node.containerId}-${option.id}`}
                                        style={[styles.terminalHackButton, !option.hackAllowed && styles.terminalButtonDisabled]}
                                        disabled={!option.hackAllowed}
                                        onPress={() => {
                                          markTerminalAccess(option.accessKey);
                                          setTerminalSelection({
                                            node: option.selection,
                                            kind: option.kind,
                                            autoStart: true,
                                          });
                                        }}
                                      >
                                        <Text style={styles.terminalHackButtonText}>{tLootTrade('terminal.hack')}</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <View style={styles.hubLockedBadge}>
                                <Text style={styles.hubLockedBadgeText}>
                                  {tLootTrade(node.keyAccessState === 'denied'
                                    ? 'player.keyRequiredError'
                                    : 'player.hubNodeLockedBadge')}
                                </Text>
                              </View>
                            )
                          ) : nodeIsTerminal ? (
                            <View style={styles.terminalButtons}>
                              {accessBadgeKey && (
                                <View testID="terminal-closed-badge" style={styles.terminalClosedBadge}>
                                  <Text style={styles.terminalClosedBadgeText}>{tLootTrade(accessBadgeKey)}</Text>
                                </View>
                              )}
                              <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityState={{ disabled: Boolean(accessBlockedReason) }}
                                disabled={Boolean(accessBlockedReason)}
                                testID="terminal-view-button"
                                style={[styles.terminalViewButton, accessBlockedReason && styles.terminalButtonDisabled]}
                                onPress={() => setTerminalSelection({
                                  node: terminalForSelection, kind: nodeCheckKind, autoStart: false,
                                })}
                              >
                                <Text style={styles.terminalViewButtonText}>{tLootTrade('terminal.view')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !hackAllowed }}
                                disabled={!hackAllowed}
                                testID="terminal-hack-button"
                                style={[styles.terminalHackButton, !hackAllowed && styles.terminalButtonDisabled]}
                                onPress={() => {
                                  // Один «Взломать» на трансляцию: даже если
                                  // игрок закроет окно, кнопка не оживёт.
                                  markTerminalAccess(accessKey);
                                  setTerminalSelection({
                                    node: terminalForSelection, kind: nodeCheckKind, autoStart: true,
                                  });
                                }}
                              >
                                <Text style={styles.terminalHackButtonText}>{tLootTrade('terminal.hack')}</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.takeAllRowBtn}
                              onPress={() => {
                                setBuyBuffer({});
                                setSellBuffer({});
                                setMobileTab('merchant');
                                // Патч 523: узел с детьми — это вложенная
                                // локация/контейнер, входим внутрь, а не
                                // открываем содержимое сразу.
                                const hasChildren = Array.isArray(node.childIds)
                                  ? node.childIds.length > 0
                                  : node.kind === CONTAINER_KIND.HUB;
                                if (hasChildren) {
                                  setParentStack((stack) => [...stack, node.containerId]);
                                } else {
                                  setSelectedHubNodeId(node.containerId);
                                }
                              }}
                            >
                              <Text style={styles.takeAllRowBtnText}>
                                {tLootTrade(
                                  nodeIsMerch
                                    ? 'player.hubNodeOpenMerchant'
                                    : 'player.hubNodeOpenLoot',
                                )}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <Text style={styles.hubMasterClosesHint}>
                {tLootTrade('player.hubMasterClosesHint')}
              </Text>
              <Text style={styles.hubMasterClosesHint}>
                {tLootTrade('player.leaveHubHint')}
              </Text>
            </View>
          </View>
        </Modal>
        {terminalSelection ? (
          terminalSelection.kind === CONTAINER_KIND.LOCK ? (
            <LockPickingModal
              visible
              lock={terminalSelection.node}
              roomCode={matchedContext.roomCode}
              autoStart={Boolean(terminalSelection.autoStart)}
              onClose={() => setTerminalSelection(null)}
            />
          ) : (
            <TerminalHackingModal
              visible
              terminal={terminalSelection.node}
              roomCode={matchedContext.roomCode}
              autoStart={Boolean(terminalSelection.autoStart)}
              onClose={() => setTerminalSelection(null)}
            />
          )
        ) : null}
      </>
    );
  }

  // ── Обработчики КОНТЕЙНЕРА ДОБЫЧИ ──────────────────────────────────────────

  const returnToHubList = () => {
    setSelectedHubNodeId(null);
    setBuyBuffer({});
    setSellBuffer({});
  };

  const handleTakeLoot = async (takes) => {
    if (busy || !takes.length || !activeSession || !viewTarget || !matchedContext) return;
    const targetSessionId = activeSession.sessionId;
    const targetRoomCode = matchedContext.roomCode;
    const targetCharacterId = matchedContext.characterId;
    const nodeContainerId = isInsideHub ? viewTarget.containerId : null;
    setBusy(true);
    try {
      const { granted, session: updatedSession, closedReason } =
        await useRoomStore.getState().takeFromLootSession({
          code: targetRoomCode,
          sessionId: targetSessionId,
          characterId: targetCharacterId,
          takes,
          nodeContainerId,
        });
      if (granted?.length) {
        grantLootEntriesToCharacter(granted);
        setTimeout(() => {
          void pushSavedCharacterToBoundRoomIfAny(targetCharacterId);
        }, 650);
      }

      if (isInsideHub) {
        const updatedNode = (updatedSession?.nodes || []).find(
          (n) => n.containerId === nodeContainerId,
        );
        if (!updatedNode || (updatedNode.items || []).length === 0) {
          returnToHubList();
        }
      } else {
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
      }
    } catch (error) {
      const code = error?.code || error?.message;
      if (code === 'CONTAINER_LOCKED') {
        showRawAlert({ title: tLootTrade('player.containerLockedError') });
        if (isInsideHub) returnToHubList();
      } else if (code === 'KEY_REQUIRED') {
        showRawAlert({ title: tLootTrade('player.keyRequiredError') });
        if (isInsideHub) returnToHubList();
      } else {
        debugLog('playerOverlay.lootTake:failed', { message: error?.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const performPlayerSessionClose = async () => {
    if (!activeSession || !matchedContext) return;
    if (isInsideHub) {
      returnToHubList();
      return;
    }
    const targetSessionId = activeSession.sessionId;
    const targetRoomCode = matchedContext.roomCode;
    markSessionClosedLocally(targetSessionId);
    setBuyBuffer({});
    setSellBuffer({});
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
    if (busy || !viewTarget) return;
    if (isInsideHub) {
      returnToHubList();
      return;
    }
    const remainingCount = Array.isArray(viewTarget.items) ? viewTarget.items.length : 0;
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
              void performPlayerSessionClose();
            },
          },
        ],
      });
      return;
    }
    void performPlayerSessionClose();
  };

  const handleCloseMerchantPress = () => {
    if (busy || !viewTarget) return;
    if (barterSummary?.hasItems) {
      showRawAlert({
        title: tLootTrade('player.closeMerchantConfirmTitle'),
        message: tLootTrade('player.closeMerchantConfirmMessage'),
        buttons: [
          { text: tLootTrade('form.cancel'), style: 'cancel' },
          {
            text: tLootTrade('player.close'),
            style: 'destructive',
            onPress: () => {
              void performPlayerSessionClose();
            },
          },
        ],
      });
      return;
    }
    void performPlayerSessionClose();
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
            have: viewTarget.caps || 0,
            shortfall: barterSummary.merchantCapShortfall,
          }),
          buttons: [
            { text: tLootTrade('form.cancel'), style: 'cancel', onPress: () => resolve(false) },
            {
              text: formatLootTrade(tLootTrade('player.shortfallAccept'), {
                have: viewTarget.caps || 0,
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
      // Патч 522: торговцу уходит ПОЛНЫЙ предмет с модами, состоянием и
      // эффективными ценой/весом. Сервер не пересчитывает их из базового каталога.
      const sellItems = barterSummary.sellLines.map((line) => {
        const effectiveCost = itemStacking.effectiveItemCost(line.item);
        const effectiveWeight = itemStacking.effectiveItemWeight(line.item);
        const snapshot = line.item.itemSnapshot || {};
        return {
          clientItemId: line.playerItemId,
          itemId: line.item.catalogId,
          itemType: line.item.itemType,
          name: line.item.name,
          cost: effectiveCost,
          weight: effectiveWeight,
          effectiveCost,
          effectiveWeight,
          quantity: line.quantity,
          itemSnapshot: {
            ...snapshot,
            cost: effectiveCost,
            weight: effectiveWeight,
            effectiveCost,
            effectiveWeight,
          },
        };
      });

      const { committed } = await useRoomStore.getState().commitMerchantTrade({
        code: matchedContext.roomCode,
        sessionId: activeSession.sessionId,
        characterId: matchedContext.characterId,
        perkCapCollectorPercent: capCollectorPercent,
        playerCapsAvailable: playerCaps,
        acceptCapShortfall,
        buyItems,
        sellItems,
        nodeContainerId: isInsideHub ? viewTarget.containerId : null,
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
      if (code === 'CONTAINER_LOCKED') {
        showRawAlert({ title: tLootTrade('player.containerLockedError') });
        if (isInsideHub) returnToHubList();
      } else if (code === 'KEY_REQUIRED') {
        showRawAlert({ title: tLootTrade('player.keyRequiredError') });
        if (isInsideHub) returnToHubList();
      } else if (code === 'TRADE_STOCK_CHANGED') {
        showRawAlert({ title: tLootTrade('player.stockChangedError') });
      } else if (code === 'TRADE_NOT_ENOUGH_MERCHANT_CAPS') {
        const have = Number(error?.payload?.merchantCaps ?? viewTarget.caps ?? 0);
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

  // ── Рендер модалки КОНТЕЙНЕРА ДОБЫЧИ (отдельного или внутри Локации) ──────

  if (viewTarget.kind === CONTAINER_KIND.LOOT) {
    const items = viewTarget.items || [];
    return (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={() => (isInsideHub ? handleCloseLootPress() : setMinimizedSessionId(activeSession.sessionId))}
      >
        <View style={[styles.lootModalBackdrop, isWideLayout && styles.backdropWide]}>
          <View style={styles.lootModalCard}>
            {isInsideHub && (
              <TouchableOpacity
                style={styles.backToLocationBtn}
                disabled={busy}
                onPress={handleCloseLootPress}
              >
                <Text style={styles.backToLocationBtnText}>
                  {`${tLootTrade('player.backToLocation')} (${activeSession.name})`}
                </Text>
              </TouchableOpacity>
            )}
            <View style={[styles.modalHeader, styles.lootHeaderSpacing]}>
              <View style={styles.modalTitleRow}>
                <MaterialCommunityIcons name="treasure-chest" size={24} color="#f0e68c" />
                <Text style={styles.modalTitle}>{viewTarget.name}</Text>
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

            {Boolean(viewTarget.description) && (
              <IconText style={[styles.modalDesc, styles.lootDescSpacing]}>
                {viewTarget.description}
              </IconText>
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
                        <IconText style={styles.lootRowTitle}>
                          {isCaps
                            ? formatLootTrade(tLootTrade('player.capsItemLabel'), { qty: entry.quantity })
                            : `${getItemIcon(entry.itemType)} ${entry.name} ×${entry.quantity}`}
                        </IconText>
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
          </View>
        </View>
      </Modal>
    );
  }

  // ── Рендер ДВУХПАНЕЛЬНОЙ МОДАЛКИ ТОРГОВЦА (покупка + продажа через буфер) ─

  const renderPlayerPane = () => (
    <View style={[styles.pane, isWideLayout && styles.paneHalf]}>
      <View style={styles.paneHeader}>
        <Text style={styles.paneHeaderTitle}>{tLootTrade('player.playerInventoryTab')}</Text>
        <IconText style={styles.paneHeaderCaps}>
          {formatLootTrade(tLootTrade('player.playerCaps'), { caps: playerCaps })}
        </IconText>
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
                <IconText style={styles.bufferItalicText}>
                  {`+ ${line.name} ×${line.quantity} (${line.lineTotal} {CAP})`}
                </IconText>
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
                  <IconText style={styles.tradeRowPrice}>
                    {formatLootTrade(tLootTrade('player.unitPrice'), { price: sellUnitPrice })}
                  </IconText>
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
    const merchantStock = viewTarget.items || [];
    return (
      <View style={[styles.pane, isWideLayout && styles.paneHalf]}>
        <View style={styles.paneHeader}>
          <Text style={styles.paneHeaderTitle}>{tLootTrade('player.merchantInventoryTab')}</Text>
          <IconText style={styles.paneHeaderCaps}>
            {formatLootTrade(tLootTrade('player.merchantCaps'), { caps: viewTarget.caps || 0 })}
          </IconText>
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
                  <IconText style={styles.bufferItalicText}>
                    {`+ ${line.name} ×${line.quantity} (${line.lineTotal} {CAP})`}
                  </IconText>
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
              // Не показываем каталожную базовую цену в карточке торговца,
              // чтобы наценка торговца оставалась тайной для игрока.
              const basics = entry.itemSnapshot
                ? formatBasicsWithIcons(describeItemBasics(
                    { ...entry.itemSnapshot, cost: null, price: null },
                    moduleLocale,
                  ))
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
                      <IconText style={styles.tradeRowBasics} numberOfLines={2}>{basics}</IconText>
                    )}
                    <IconText style={styles.tradeRowPriceBuy}>
                      {formatLootTrade(tLootTrade('player.unitPrice'), { price: buyUnitPrice })}
                    </IconText>
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
      onRequestClose={() => (isInsideHub ? handleCloseMerchantPress() : setMinimizedSessionId(activeSession.sessionId))}
    >
      <View style={[styles.modalBackdrop, isWideLayout && styles.backdropWide]}>
        <View style={styles.merchantModalCard}>
          {isInsideHub && (
            <TouchableOpacity
              style={styles.backToLocationBtn}
              disabled={busy}
              onPress={handleCloseMerchantPress}
            >
              <Text style={styles.backToLocationBtnText}>
                {`${tLootTrade('player.backToLocation')} (${activeSession.name})`}
              </Text>
            </TouchableOpacity>
          )}
          {/* Шапка торговца */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <MaterialCommunityIcons name="sack" size={23} color="#f0e68c" />
              <Text style={styles.modalTitle}>{viewTarget.name}</Text>
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
                onPress={handleCloseMerchantPress}
              >
                <Text style={styles.closeContainerBtnText}>{tLootTrade('player.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {Boolean(viewTarget.description) && (
            <IconText style={styles.modalDesc}>{viewTarget.description}</IconText>
          )}

          {/* На узком экране телефона — компактный переключатель двух панелей */}
          {!isWideLayout && (
            <View style={styles.mobileTabSwitch}>
              <TouchableOpacity
                style={[styles.mobileTabBtn, mobileTab === 'player' && styles.mobileTabBtnActive]}
                onPress={() => setMobileTab('player')}
              >
                <IconText style={[
                  styles.mobileTabText,
                  mobileTab === 'player' && styles.mobileTabTextActive,
                ]}>
                  {`${tLootTrade('player.playerInventoryTab')} (${playerCaps} {CAP})${
                    barterSummary?.buyLines.length ? ` +${barterSummary.buyLines.length}` : ''
                  }`}
                </IconText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mobileTabBtn, mobileTab === 'merchant' && styles.mobileTabBtnActive]}
                onPress={() => setMobileTab('merchant')}
              >
                <IconText style={[
                  styles.mobileTabText,
                  mobileTab === 'merchant' && styles.mobileTabTextActive,
                ]}>
                  {`${tLootTrade('player.merchantInventoryTab')} (${viewTarget.caps || 0} {CAP})${
                    barterSummary?.sellLines.length ? ` +${barterSummary.sellLines.length}` : ''
                  }`}
                </IconText>
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
                  <IconText style={[
                    styles.barterBalanceText,
                    !barterSummary.canPlayerAfford && styles.barterErrorText,
                  ]}>
                    {formatLootTrade(tLootTrade('player.barterPay'), {
                      amount: barterSummary.playerOwes,
                    })}
                  </IconText>
                ) : barterSummary.merchantOwes > 0 ? (
                  <IconText style={styles.barterReceiveText}>
                    {formatLootTrade(tLootTrade('player.barterReceive'), {
                      amount: barterSummary.actualMerchantPayout,
                    })}
                  </IconText>
                ) : (
                  <IconText style={styles.barterBalanceText}>
                    {tLootTrade('player.barterEven')}
                  </IconText>
                )}

                {!barterSummary.canPlayerAfford && (
                  <IconText style={styles.barterErrorText}>
                    {formatLootTrade(tLootTrade('player.notEnoughPlayerCaps'), {
                      need: barterSummary.playerOwes,
                      have: playerCaps,
                    })}
                  </IconText>
                )}

                {barterSummary.merchantCapShortfall > 0 && (
                  <IconText style={styles.barterWarnText}>
                    {formatLootTrade(tLootTrade('player.merchantShortfallWarn'), {
                      have: viewTarget.caps || 0,
                      need: barterSummary.merchantOwes,
                      shortfall: barterSummary.merchantCapShortfall,
                    })}
                  </IconText>
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
        </View>
      </View>
    </Modal>
  );
}


