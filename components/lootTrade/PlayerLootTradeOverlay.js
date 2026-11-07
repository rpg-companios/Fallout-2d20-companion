import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import TransferQuantityModal from './TransferQuantityModal';
import { buildModsIndex } from '../../domain/itemNameParts';
import ItemNameLines from './ItemNameLines';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import * as db from '../../db';
import * as savesModule from '../../src/saves/characterSaves';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore, { selectUiMode } from '../../src/store/appSettingsStore';
import useRoomStore, { roomHasTerminalProtocol } from '../../src/room/roomStore';
import useUiModeStore from '../../src/room/uiModeStore';
import usePlayerFocusStore from '../../src/room/playerFocusStore';
import useTransmissionSeenStore from '../../src/room/transmissionSeenStore';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import { useLocale, useModuleLocale } from '../../i18n/locale';
import {
  tLootTrade,
  formatLootTrade,
} from '../screens/LootTradeScreen/logic/lootTradeI18n';
import {
  ACCESS_OP,
  accessBarrierPending,
  expressionCheckIds,
  resolveAccessExpression,
} from '../../domain/accessExpression';
import locationGraph from '../../domain/locationGraph.js';
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
import { restoreLocationSessionNodes } from '../../domain/locationNodeMarker.js';
import { hasLocalCheckAccess, recordLocalCheckAccess } from './localCheckAccess';
import {
  applyCommittedMerchantTradeToCharacter,
  getSellablePlayerInventoryItems,
  grantLootEntriesToCharacter,
} from '../../src/lootTrade/grantCharacterItems';
import { showRawAlert } from '../alerts/alertService';
import TerminalHackingModal from './TerminalHackingModal';
import LockPickingModal from './LockPickingModal';
import StandaloneCheckModal from './StandaloneCheckModal';
import {
  terminalAccessKey,
  canHackTerminal,
  terminalBlockedReason,
} from './terminalAccess';
import { debugLog } from '../../src/debug/falloutDebug';
import {
  HACK_OUTCOME,
  HACK_OUTCOME_DELAY_MS,
  nodeHasChildren,
  hackOutcomeForNode,
  hackWinKey,
  applyHackOutcome,
} from './hackOutcome';

/**
 * Патч 546: проверка считается пройденной по общему реестру комнаты. Нужно
 * только как страховка для старого сервера, который мог потерять `locked` /
 * `keyAccessState`: маркер 544 возвращает само требование, а победу замка или
 * терминала клиент видит в `terminalStates`/`accessEvents`. Обновлённый сервер
 * остаётся источником истины — его явное `open`/`denied` важнее этой оценки.
 */
const roomCheckPassed = (room, checkId, roomCode = '') => {
  const id = String(checkId || '').trim();
  if (!id) return false;
  const state = room?.terminalStates?.[id];
  if (state?.game?.status === 'won' || state?.keyUnlocked || room?.accessEvents?.[id]) return true;
  // Патч 547: локальный резерв мини-игр. Если у комнаты нет протокола, доска
  // живёт в памяти клиента и в реестр комнаты победа не приходит — сигнал
  // приносит сама модалка. При наличии протокола журнал НЕ спрашиваем:
  // источником истины остаётся сервер (урок 506).
  if (roomHasTerminalProtocol(room)) return false;
  return hasLocalCheckAccess({ roomCode, containerId: id });
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
  const homeFocused = usePlayerFocusStore((s) => s.homeFocused);
  // 562: имя без обрезки — базовое имя целиком плюс моды отдельной строкой.
  const modsIndex = useMemo(() => buildModsIndex(getEquipmentCatalog()), []);
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
  // 561: «сколько переместить?» — долгое нажатие по строке товара/вещи.
  const [quantityModal, setQuantityModal] = useState(null);
  const [terminalSelection, setTerminalSelection] = useState(null);
  const [dismissedTerminalId, setDismissedTerminalId] = useState(null);
  // Патч 526: «билет на один взлом» убран. Владелец уточнил, что баг 506 был
  // про АВТОМАТИЧЕСКИЙ перезапуск после ACCESS GRANTED, а не про право игрока
  // на новые подходы: «Юзер может совершать сколько угодно подходов ... Но
  // только по своему усмотрению». Автоперезапуск по-прежнему запрещён
  // правилами shouldAutoStart / shouldAutoStartLock и сервером.

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

  // 560 (слово владельца): «Трансляция доступна только тому персонажу, за
  // которого вошли. Пока не войдёшь другим — ничего не увидишь». Поэтому
  // смотрим только привязки ОТКРЫТОГО персонажа; на списке персонажей плашки
  // нет вовсе — там сигналит только синяя иконка сервера.
  const focusedBindings = useMemo(() => {
    if (!currentCharacterId) return [];
    return bindings.filter((bind) => bind.characterId === currentCharacterId);
  }, [bindings, currentCharacterId]);

  // Находим активную сессию комнаты, подходящую открытому персонажу игрока
  const matchedContext = useMemo(() => {
    if (isGmMode || homeFocused === true || focusedBindings.length === 0) return null;

    const ordered = focusedBindings;

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
  }, [isGmMode, homeFocused, focusedBindings, rooms, currentCharacterId, closedSessionIds, myClientId]);

  const directTerminalContext = useMemo(() => {
    if (isGmMode || homeFocused === true || focusedBindings.length === 0) return null;
    const ordered = focusedBindings;
    for (const bind of ordered) {
      const states = Object.values(rooms[bind.code]?.terminalStates || {});
      // Патч 542: замок не бывает самостоятельной точкой игрока.
      const terminalState = states.find((entry) => entry?.standaloneIssued
        && entry?.config?.containerId
        && entry?.config?.kind !== CONTAINER_KIND.LOCK);
      if (terminalState) return { roomCode: bind.code, characterId: bind.characterId, characterName: bind.name, terminalState };
    }
    return null;
  }, [isGmMode, homeFocused, focusedBindings, currentCharacterId, rooms]);

  const activeSession = matchedContext?.session || null;

  // 560: как только персонаж увидел свою трансляцию — гасим сигнал на карточке
  // (синюю иконку сервера в списке персонажей).
  useEffect(() => {
    if (!activeSession || !matchedContext) return;
    useTransmissionSeenStore.getState().markSeen(matchedContext.characterId, activeSession.sessionId);
  }, [activeSession?.sessionId, matchedContext?.characterId]);
  // Патч 544: восстанавливаем тип/рёбра локаций после старого сервера комнат.
  // Дальше окно работает только с этим списком, а не с сырым activeSession.nodes.
  const sessionNodes = useMemo(
    () => restoreLocationSessionNodes(activeSession?.nodes, activeSession?.containerId),
    [activeSession?.nodes, activeSession?.containerId],
  );

  /**
   * Патч 524: одиночная проверка (терминал/замок), выданная как локация на
   * старом сервере комнат, — это НЕ локация. Такую сессию показываем сразу
   * мини-игрой, без списка точек и без кнопки «Покинуть локацию», которая
   * тут не к месту. Признак: узел ровно один и его id совпадает с id сессии.
   */
  const standaloneCheckSession = useMemo(() => {
    if (!activeSession || activeSession.kind !== CONTAINER_KIND.HUB) return null;
    const nodes = sessionNodes;
    if (nodes.length !== 1) return null;
    const only = nodes[0];
    if (!only || only.containerId !== activeSession.containerId) return null;
    const resolved = resolveCheckSessionNode(only);
    if (!resolved.checkKind) return null;
    return { node: resolved.node, kind: resolved.checkKind };
  }, [sessionNodes, activeSession]);

  /**
   * Патч 506: «Покинуть локацию». Игрок отключается сам, сессия Мастера
   * остаётся активной для остальных. Патч 524: окно закрывается сразу по
   * нажатию — локально, не дожидаясь ответа сервера. Раньше, когда сервер
   * не поддерживал session.playerClose или окно мини-игры перекрывало
   * кнопку, нажатие выглядело «не работающим».
   */
  const leaveLocation = async () => {
    const session = matchedContext?.session;
    if (!session || !matchedContext) return;
    setTerminalSelection(null);
    setDismissedTerminalId(null);
    setParentStack([]);
    markSessionClosedLocally(session.sessionId);
    try {
      await useRoomStore.getState().playerCloseRoomSession({
        code: matchedContext.roomCode,
        sessionId: session.sessionId,
      });
    } catch (error) {
      debugLog('playerOverlay.leaveLocation:failed', { message: error?.message });
    }
  };

  const isHubSession = activeSession?.kind === CONTAINER_KIND.HUB;

  /**
   * Патч 530: один переход на всех путях — обычная кнопка, кнопка после
   * выигранной проверки и автоматический исход ACCESS GRANTED. Локация —
   * входим, контейнер — показываем содержимое. Каскада нет.
   */
  const navigateHackOutcome = useCallback((node) => {
    const id = String(node?.containerId || '').trim();
    if (!id) return HACK_OUTCOME.CONTENTS;
    return applyHackOutcome(hackOutcomeForNode(node), id, {
      enterLocation: (targetId) => {
        setSelectedHubNodeId(null);
        setParentStack((stack) => [...stack, targetId]);
      },
      openContents: (targetId) => setSelectedHubNodeId(targetId),
    });
  }, []);

  /**
   * Патч 547: приём сигнала об успешном взломе от модалки.
   *
   * Слово владельца: «показан, успех, кнопка закрыть — передача сигнала об
   * успешном взломе — доступ к содержимому». Сигнал приходит и в сетевом
   * режиме, и в локальном резерве; в последнем он ещё и снимает преграду
   * локации (журнал `localCheckAccess`), иначе пройти дальше было нельзя.
   * Адресный исход применяет закрытие окна мини-игры («Закрыть» на панели
   * успеха). Сетевой автопереход 530 остаётся как был — по реестру комнаты.
   */
  const [localAccessTick, setLocalAccessTick] = useState(0);
  const hackSignalRef = useRef(null);
  const handleCheckHacked = useCallback(({ containerId, kind, local } = {}) => {
    const id = String(containerId || '').trim();
    if (!id) return;
    const code = matchedContext?.roomCode || '';
    hackSignalRef.current = { containerId: id, kind: String(kind || '') };
    if (local && recordLocalCheckAccess({ roomCode: code, containerId: id, kind })) {
      // Журнал живёт в памяти модуля — поднимаем перерисовку явно.
      setLocalAccessTick((tick) => tick + 1);
    }
  }, [matchedContext?.roomCode]);

  const selectedHubNode = useMemo(() => {
    if (!isHubSession || !selectedHubNodeId) return null;
    const room = rooms?.[matchedContext?.roomCode];
    const found = sessionNodes.find(
      // Патч 546: содержимое нельзя открыть и мимо непройденной проверки.
      (n) => n.containerId === selectedHubNodeId
        && !accessBarrierPending(n, { isPassed: (id) => roomCheckPassed(room, id, matchedContext?.roomCode) }),
    );
    // Локация и точки проверки никогда не попадают в сценарий «открыть сундук»:
    // локация требует входа, терминал/замок — мини-игры.
    if (found && (nodeHasChildren(found) || resolveCheckSessionNode(found).checkKind)) return null;
    return found || null;
  }, [isHubSession, sessionNodes, selectedHubNodeId, rooms, matchedContext?.roomCode, localAccessTick]);

  // Активный объект просмотра: либо прямая сессия (loot / merchant), либо открытый узел внутри Локации
  const viewTarget = isHubSession ? selectedHubNode : activeSession;
  const isInsideHub = Boolean(isHubSession && selectedHubNode);

  // При открытии новой сессии очищаем старый буфер и разворачиваем модалку
  useEffect(() => {
    setBuyBuffer({});
    setSellBuffer({});
    setSelectedHubNodeId(null);
    setParentStack([]);
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

  /**
   * Патч 530: успешный взлом имеет АДРЕСНЫЙ исход. Взлом локации (узел с
   * детьми) ВВОДИТ игрока внутрь, взлом контейнера — показывает СОДЕРЖИМОЕ.
   * Переход делаем с небольшой паузой, чтобы игрок увидел ACCESS GRANTED.
   *
   * Работает только для явного «Взломать» (autoStart) внутри настоящей
   * локации: «Смотреть», отдельно выданная точка и повторное открытие уже
   * выигранной доски навигацию не дёргают. Каскада нет — только targetNodeId.
   */
  const handledWinRef = useRef('');
  const winTimerRef = useRef(null);

  /**
   * Патч 547: закрытие окна взлома ПОСЛЕ победы применяет адресный исход:
   * взлом локации = вход, взлом контейнера = содержимое. Без победы закрытие
   * просто гасит окно. Преграда текущей локации (gateOnly) снимается самим
   * сигналом — игрок остаётся на месте и видит открывшееся содержимое.
   */
  const handleCheckModalClose = useCallback(() => {
    const selection = terminalSelection;
    const signal = hackSignalRef.current;
    const checkId = String(selection?.node?.containerId || '').trim();
    const hacked = Boolean(signal && checkId && signal.containerId === checkId);
    if (winTimerRef.current) {
      clearTimeout(winTimerRef.current);
      winTimerRef.current = null;
    }
    hackSignalRef.current = null;
    setTerminalSelection(null);
    if (!hacked) return;
    const targetId = selection?.targetNodeId;
    if (!targetId) return;
    const target = sessionNodes.find((n) => n.containerId === targetId) || { containerId: targetId };
    navigateHackOutcome(target);
  }, [terminalSelection, sessionNodes, navigateHackOutcome]);
  useEffect(() => {
    if (!isHubSession || !terminalSelection?.autoStart
      || (!terminalSelection?.targetNodeId && !terminalSelection?.gateOnly)) {
      handledWinRef.current = '';
      return;
    }
    const containerId = String(terminalSelection.node?.containerId || '').trim();
    const state = rooms?.[matchedContext?.roomCode]?.terminalStates?.[containerId];
    if (state?.game?.status !== 'won') return;
    const key = hackWinKey(containerId, state);
    if (handledWinRef.current === key) return;
    handledWinRef.current = key;
    if (winTimerRef.current) clearTimeout(winTimerRef.current);
    const targetId = terminalSelection.targetNodeId;
    const nodes = sessionNodes;
    winTimerRef.current = setTimeout(() => {
      winTimerRef.current = null;
      hackSignalRef.current = null;
      setTerminalSelection(null);
      // Патч 542: преграда текущей локации уже пройдена изнутри — остаёмся
      // на месте, сервер раскроет содержимое. Каскада нет.
      if (!targetId) return;
      const target = nodes.find((n) => n.containerId === targetId) || { containerId: targetId };
      navigateHackOutcome(target);
    }, HACK_OUTCOME_DELAY_MS);
  }, [
    rooms, isHubSession, terminalSelection, localAccessTick,
    sessionNodes, matchedContext?.roomCode, navigateHackOutcome,
  ]);
  useEffect(() => () => {
    if (winTimerRef.current) clearTimeout(winTimerRef.current);
  }, []);

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
    // Патч 504/526: «Нет» Мастера запрещает взлом и просмотр до новой
    // трансляции — но только для ТЕРМИНАЛА. Замки пока не блокируются:
    // закрытие доски игрок снимает явным новым подходом.
    const directIsLockPre = config.kind === CONTAINER_KIND.LOCK;
    const directClosed = !directIsLockPre && Boolean(
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
    // Патч 526: закрытое окно больше не «сжигает» доступ. Игрок может
    // вернуться к точке сколько угодно раз — кнопка-пилюля всегда жива.
    const directAccessKey = terminalAccessKey({
      roomCode: directTerminalContext.roomCode,
      containerId: config.containerId,
      accessId: directTerminalContext.terminalState?.accessId,
    });
    const directSelection = terminalSelection?.node?.containerId === config.containerId
      && terminalSelection?.accessKey === directAccessKey
      ? terminalSelection
      : null;
    if (dismissedTerminalId === config.containerId && !directSelection) {
      return (
        <View style={styles.floatingBar} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.floatingPill}
            onPress={() => setDismissedTerminalId(null)}
          >
            <Text style={styles.floatingPillTitle}>{config.name || tLootTrade('terminal.title')}</Text>
            <Text style={styles.floatingPillAction}>{tLootTrade('terminal.openTerminal')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // Патч 525: сначала входная модалка точки (как окно локации, но без
    // «Покинуть локацию»), и только по «Взломать» монтируется мини-игра с
    // уже собранной доской. Пустой «как бы запущенной» игры больше нет.
    const directKind = config.kind === CONTAINER_KIND.LOCK
      ? CONTAINER_KIND.LOCK
      : CONTAINER_KIND.TERMINAL;
    const directIsLock = directKind === CONTAINER_KIND.LOCK;
    const directAwaiting = !directClosed && Boolean(
      directTerminalContext.terminalState.awaitingGm
      || directTerminalContext.terminalState.game?.status === 'awaitingRetry',
    );
    // Патч 505: победа терминала не пересобирается, новая доска — только
    // повторная трансляция Мастера. Замки пока не блокируем вообще.
    const directWon = !directClosed && directTerminalContext.terminalState.game?.status === 'won';
    const directBlocked = !directIsLock && (directAwaiting || directWon);
    const directBadge = !directIsLock
      ? (directAwaiting ? tLootTrade('terminal.retryWaiting')
        : (directWon ? tLootTrade('terminal.stateWon') : null))
      : null;
    const openDirect = (autoStart) => {
      setTerminalSelection({
        node: config,
        kind: directKind,
        autoStart,
        accessKey: directAccessKey,
        // Замок: явное «Взломать» продолжает взлом (память позиций 532).
        // Свежий лист обновляет заколки/навык/удачу, комбинация та же.
        freshAttempt: Boolean(autoStart && directIsLock),
      });
    };
    return (
      <>
        <StandaloneCheckModal
          visible={!directSelection}
          check={config}
          isLock={directIsLock}
          blocked={directBlocked}
          badge={directBadge}
          onView={() => openDirect(false)}
          onHack={() => openDirect(true)}
          onClose={() => {
            setDismissedTerminalId(config.containerId);
            setTerminalSelection(null);
          }}
        />
        {directSelection ? (directSelection.kind === CONTAINER_KIND.LOCK ? (
          <LockPickingModal
            visible
            lock={config}
            roomCode={directTerminalContext.roomCode}
            autoStart={Boolean(directSelection.autoStart)}
            freshAttempt={Boolean(directSelection.freshAttempt)}
            onHacked={handleCheckHacked}
            onClose={() => setTerminalSelection(null)}
          />
        ) : (
          <TerminalHackingModal
            visible
            terminal={config}
            roomCode={directTerminalContext.roomCode}
            autoStart={Boolean(directSelection.autoStart)}
            onHacked={handleCheckHacked}
            onClose={() => setTerminalSelection(null)}
          />
        )) : null}
      </>
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

  // ── Патч 525: отдельно выданная проверка (замок / терминал) ───────────────
  // Это НЕ локация: сначала входная модалка точки с «Взломать»/«Смотреть»
  // и без «Покинуть локацию», и только по «Взломать» монтируется мини-игра
  // с уже собранной доской. Пустая «как бы запущенная» игра убрана.
  if (standaloneCheckSession && matchedContext) {
    // Патч 542 (lock_never_standalone): самостоятельно выданный замок не
    // бывает точкой игрока — для него окно не рисуем вовсе.
    if (standaloneCheckSession.kind === CONTAINER_KIND.LOCK) return null;
    const roomCode = matchedContext.roomCode;
    const node = standaloneCheckSession.node;
    const state = rooms?.[roomCode]?.terminalStates?.[node.containerId];
    const config = {
      ...node,
      ...(state?.config || {}),
      containerId: node.containerId,
      kind: standaloneCheckSession.kind,
    };
    const accessKey = terminalAccessKey({
      roomCode,
      containerId: config.containerId,
      accessId: state?.accessId || activeSession.sessionId,
    });
    const isLock = standaloneCheckSession.kind === CONTAINER_KIND.LOCK;
    // Замки пока не блокируются: «ЗАКРЫТ» и ожидание Мастера — только терминал.
    const closed = !isLock && Boolean(
      state?.closed || state?.locked || state?.game?.status === 'closed',
    );
    const awaiting = !isLock && !closed && Boolean(
      state?.awaitingGm || state?.game?.status === 'awaitingRetry',
    );
    const won = !isLock && !closed && state?.game?.status === 'won';
    const selection = terminalSelection?.node?.containerId === config.containerId
      && terminalSelection?.accessKey === accessKey
      ? terminalSelection
      : null;
    // Патч 526: замки не блокируются. У терминала «ЗАКРЫТ»/ожидание Мастера
    // по-прежнему блокируют кнопки до его решения или повторной трансляции.
    const blocked = !isLock && (closed || awaiting || won);
    const badge = !isLock
      ? (closed ? tLootTrade('terminal.closedBadge')
        : (awaiting ? tLootTrade('terminal.retryWaiting')
          : (won ? tLootTrade('terminal.stateWon') : null)))
      : null;
    const openStandalone = (autoStart) => {
      setTerminalSelection({
        node: config,
        kind: standaloneCheckSession.kind,
        autoStart,
        accessKey,
        freshAttempt: Boolean(autoStart && isLock),
      });
    };
    return (
      <>
        <StandaloneCheckModal
          visible={!selection}
          check={config}
          isLock={isLock}
          blocked={blocked}
          badge={badge}
          onView={() => openStandalone(false)}
          onHack={() => openStandalone(true)}
          onClose={() => {
            // Не гасим сессию: игрок может вернуться к точке позже.
            setMinimizedSessionId(activeSession.sessionId);
            setTerminalSelection(null);
          }}
        />
        {selection ? (selection.kind === CONTAINER_KIND.LOCK ? (
          <LockPickingModal
            visible
            lock={config}
            roomCode={roomCode}
            autoStart={Boolean(selection.autoStart)}
            freshAttempt={Boolean(selection.freshAttempt)}
            onHacked={handleCheckHacked}
            onClose={() => setTerminalSelection(null)}
          />
        ) : (
          <TerminalHackingModal
            visible
            terminal={config}
            roomCode={roomCode}
            autoStart={Boolean(selection.autoStart)}
            onHacked={handleCheckHacked}
            onClose={() => setTerminalSelection(null)}
          />
        )) : null}
      </>
    );
  }

  // ── Рендер ВНЕШНЕГО ОКНА ЛОКАЦИИ (закрыть его может ТОЛЬКО Мастер!) ───────
  if (isHubSession && !viewTarget) {
    const rootId = activeSession.containerId || '';
    const currentParentId = parentStack.length ? parentStack[parentStack.length - 1] : rootId;
    const currentNode = currentParentId === rootId
      ? null
      : sessionNodes.find((node) => node.containerId === currentParentId) || null;
    const currentTarget = currentNode || { ...activeSession, containerId: rootId };
    const currentTitle = currentNode?.name || activeSession.name;
    const currentDescription = currentNode?.description ?? activeSession.description;
    // Патч 542: вход в локацию с преградой показывает сначала только проверки.
    // Патч 543: глухая преграда сильнее замка — при перекрытом проходе
    // взлом не предлагается вообще; снимает только Мастер.
    const currentPassageBlocked = Boolean(currentNode?.passageBlocked);
    // Патч 546: единый предикат преграды. Локация с настроенным замком не
    // пропускает внутрь, даже если старый сервер не прислал флаг `locked`.
    const currentRoom = rooms?.[matchedContext.roomCode];
    const currentIsPassed = (id) => roomCheckPassed(currentRoom, id, matchedContext.roomCode);
    const currentGatePending = accessBarrierPending(currentTarget, { isPassed: currentIsPassed });
    const gateOptionsFor = (target, gateIds) => gateIds.map((id) => {
      const state = rooms?.[matchedContext.roomCode]?.terminalStates?.[id];
      const sourceNode = sessionNodes.find((node) => node.containerId === id);
      const resolved = resolveCheckSessionNode(state?.config || sourceNode);
      // Патч 544: замок не должен становиться терминалом только потому, что
      // лежит в общем реестре terminalStates. Тип берём из маркера/узла.
      if (!state && !resolved.checkKind) return null;
      const kind = resolved.checkKind
        || (sourceNode?.kind === CONTAINER_KIND.LOCK ? CONTAINER_KIND.LOCK : CONTAINER_KIND.TERMINAL);
      const selection = {
        ...(sourceNode || {}),
        ...(state?.config || {}),
        containerId: id,
        kind,
        name: state?.config?.name || sourceNode?.name || tLootTrade('player.gateTerminal'),
        difficulty: state?.config?.difficulty ?? sourceNode?.difficulty ?? 1,
      };
      const accessKey = terminalAccessKey({
        roomCode: matchedContext.roomCode,
        containerId: id,
        accessId: state?.accessId,
      });
      const closed = Boolean(
        state?.closed || state?.locked || state?.game?.status === 'closed',
      );
      const awaiting = Boolean(
        state?.awaitingGm || state?.game?.status === 'awaitingRetry',
      );
      const hackAllowed = canHackTerminal({
        key: accessKey,
        game: state?.game,
        terminalClosed: closed,
        terminalAwaiting: awaiting,
        isLock: kind === CONTAINER_KIND.LOCK,
      });
      return {
        id,
        kind,
        accessKey,
        hackAllowed,
        label: formatLootTrade(
          tLootTrade(kind === CONTAINER_KIND.LOCK
            ? 'player.gateLockLabel'
            : 'player.gateTerminalLabel'),
          { difficulty: selection.difficulty },
        ),
        selection,
      };
    }).filter(Boolean);
    const gateIdsFor = (node) => (node.keyAccessState !== 'denied'
      ? [...new Set([
        ...expressionCheckIds(resolveAccessExpression(node)),
        ...normalizeLinkedCheckIds(node),
      ])]
      : []);
    const gateSeparatorKeyFor = (node) => (
      resolveAccessExpression(node).some((token) => token?.type === 'op' && token?.op === ACCESS_OP.AND)
        ? 'player.gateAnd'
        : 'player.gateOr'
    );
    const currentTargetIsLocation = currentNode ? nodeHasChildren(currentNode) : true;
    const currentGateOptions = currentGatePending ? gateOptionsFor(currentTarget, gateIdsFor(currentTarget)) : [];
    const currentGateSeparatorKey = gateSeparatorKeyFor(currentTarget);
    // Узел может иметь НЕСКОЛЬКО родителей; старые сессии без parentIds
    // считаются детьми корня. Запертые потомки уже скрыты сервером.
    // Патч 542: цель особого выхода не торчит дочерней карточкой; замок
    // никогда не самостоятельная строка игрока.
    // Патч 546: клиентская страховка границы видимости для старого сервера.
    // Потомки узла с непройденной проверкой не показываются, даже если флаг
    // `locked` потерялся по дороге; обновлённый сервер уже скрыл их сам.
    const barrierIds = sessionNodes
      .filter((node) => accessBarrierPending(node, { isPassed: currentIsPassed }))
      .map((node) => node.containerId);
    const barrierGraph = locationGraph.buildGraphFromSession(rootId, sessionNodes);
    const hiddenBehindBarrier = new Set(locationGraph.hiddenBehindLock(barrierGraph, {
      lockedIds: barrierIds,
      isGm: false,
      rootId,
    }));
    const visibleHubNodes = currentGatePending ? [] : sessionNodes.filter((node) => {
      if (node.exitOnly || node.hiddenForPlayers || node.kind === CONTAINER_KIND.LOCK) return false;
      if (hiddenBehindBarrier.has(node.containerId)) return false;
      const parents = Array.isArray(node.parentIds) && node.parentIds.length
        ? node.parentIds
        : [rootId];
      return parents.includes(currentParentId);
    });
    // Патч 545: порядок мест у игрока = порядок дерева Мастера. Внутри
    // вложенной локации сортируем по `childIds` родителя (канон графа), а не
    // по плоскому BFS-списку: общий ребёнок нескольких родителей не «всплывает»
    // раньше братьев. Корень идёт в порядке сессии, собранной тем же графом.
    const parentChildOrder = Array.isArray(currentNode?.childIds) ? currentNode.childIds : [];
    const hubNodes = parentChildOrder.length
      ? [...visibleHubNodes].sort((a, b) => {
        const ia = parentChildOrder.indexOf(a.containerId);
        const ib = parentChildOrder.indexOf(b.containerId);
        return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
      })
      : visibleHubNodes;
    const exitLocationId = String(currentTarget.exitLocationId || '').trim();
    const exitNode = exitLocationId && !currentGatePending
      ? sessionNodes.find((node) => node.containerId === exitLocationId)
      : null;
    return (
      <>
        <Modal
          visible={!terminalSelection}
          transparent
          animationType="slide"
          onRequestClose={() => setMinimizedSessionId(activeSession.sessionId)}
        >
          <View style={[styles.lootModalBackdrop, isWideLayout && styles.backdropWide]}>
            <View style={styles.lootModalCard}>
              <View style={[styles.modalHeader, styles.lootHeaderSpacing]}>
                <View style={styles.modalTitleRow}>
                  <MaterialCommunityIcons name="map-marker-multiple" size={24} color="#f0e68c" />
                  <Text style={styles.modalTitle}>{currentTitle}</Text>
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

              {Boolean(currentDescription) && (
                <IconText style={[styles.modalDesc, styles.lootDescSpacing]}>
                  {currentDescription}
                </IconText>
              )}

              <ScrollView
                style={styles.lootScroll}
                contentContainerStyle={styles.lootScrollContent}
              >
                {currentGatePending ? (
                  currentPassageBlocked ? (
                    // Патч 543: экран-дверь — имя локации, причина, «Назад».
                    <View testID="passage-blocked-screen" style={styles.terminalButtons}>
                      <Text testID="passage-blocked-reason" style={styles.hubLockedHintText}>
                        {String(currentNode?.passageReason || '').trim()
                          || tLootTrade('player.passageBlocked')}
                      </Text>
                      {parentStack.length > 0 && (
                        <TouchableOpacity
                          testID="passage-blocked-back"
                          style={styles.terminalViewButton}
                          onPress={() => setParentStack((stack) => stack.slice(0, -1))}
                        >
                          <Text style={styles.terminalViewButtonText}>
                            {tLootTrade('player.backToParent')}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                  <View style={styles.terminalButtons}>
                    <Text style={styles.hubLockedHintText}>
                      {tLootTrade(currentTarget.keyAccessState === 'denied'
                        ? 'player.keyRequiredError'
                        : 'player.gateOptionsTitle')}
                    </Text>
                    {currentGateOptions.map((option, optionIdx) => (
                      <View key={option.id} style={styles.terminalButtons}>
                        {optionIdx > 0 && (
                          <Text testID={`current-gate-or-${option.id}`} style={styles.hubLockedHintText}>
                            {currentGateSeparatorKey === 'player.gateAnd'
                              ? tLootTrade('player.gateAnd')
                              : tLootTrade('player.gateOr')}
                          </Text>
                        )}
                        <Text testID={`current-gate-option-${option.id}`} style={styles.hubLockedHintText}>
                          {option.label}
                        </Text>
                        <View style={styles.terminalButtons}>
                          <TouchableOpacity
                            testID={`current-gate-view-${option.id}`}
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
                            testID={`current-gate-hack-${option.id}`}
                            style={[styles.terminalHackButton, !option.hackAllowed && styles.terminalButtonDisabled]}
                            disabled={!option.hackAllowed}
                            onPress={() => setTerminalSelection({
                              node: option.selection,
                              kind: option.kind,
                              autoStart: true,
                              freshAttempt: option.kind === CONTAINER_KIND.LOCK,
                              gateOnly: true,
                            })}
                          >
                            <Text style={styles.terminalHackButtonText}>
                              {tLootTrade(currentTargetIsLocation
                                ? 'player.hackAndEnter'
                                : 'player.hackAndOpen')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    {currentGateOptions.length === 0 && currentTarget.keyAccessState !== 'denied' && (
                      <Text style={styles.hubLockedHintText}>{tLootTrade('player.hubNodeLockedBadge')}</Text>
                    )}
                  </View>
                  )
                ) : hubNodes.length === 0 ? (
                  <Text style={styles.emptyText}>{tLootTrade('player.hubEmpty')}</Text>
                ) : (
                  hubNodes.map((rawNode) => {
                    // Старый сервер комнат собирает узел заново и понижает
                    // `kind: 'terminal'` до 'loot'. Маркер в lockLabel и реестр
                    // терминалов комнаты восстанавливают настоящий тип узла.
                    const { node, isTerminal: markedTerminal, isLock: markedLock } = resolveCheckSessionNode(rawNode);
                    const nodeIsMerch = node.kind === CONTAINER_KIND.MERCHANT;
                    const terminalState = rooms?.[matchedContext.roomCode]?.terminalStates?.[node.containerId];
                    // Патч 544: общий реестр проверок хранит и замки, и терминалы.
                    // Наличие terminalState больше не делает узел терминалом.
                    const stateCheck = resolveCheckSessionNode(terminalState?.config);
                    const nodeIsLock = markedLock || node.kind === CONTAINER_KIND.LOCK || stateCheck.isLock;
                    const nodeIsTerminal = !nodeIsLock && (markedTerminal || stateCheck.isTerminal
                      // Совсем старый сервер мог не положить kind в config terminalStates.
                      || (Boolean(terminalState) && !nodeHasChildren(node)));
                    const nodeCheckKind = nodeIsLock ? CONTAINER_KIND.LOCK : CONTAINER_KIND.TERMINAL;
                    const terminalForSelection = {
                      ...node,
                      ...(terminalState?.config || {}),
                      kind: nodeCheckKind,
                    };
                    // Патч 546: строка заперта не только по флагу, но и по
                    // непройденной проверке входа/содержимого.
                    const nodeLocked = accessBarrierPending(node, { isPassed: currentIsPassed });
                    // Патч 530: выигранная проверка = доступ к содержимому
                    // (или вход в локацию), а не только надпись «взломано».
                    const nodeCheckPassed = Boolean(
                      node.keyUnlocked || terminalState?.game?.status === 'won',
                    );
                    // Патч 530: локация (есть дети) — взлом = ВХОД, контейнер
                    // (детей нет) — взлом = СОДЕРЖИМОЕ. Один и тот же предикат
                    // используется и в кнопке «Открыть/Войти», и в исходе взлома.
                    const nodeIsLocation = nodeHasChildren(node);
                    const nodeHackOutcome = hackOutcomeForNode(node);
                    const nodeHackLabelKey = nodeHackOutcome === HACK_OUTCOME.ENTER
                      ? 'player.hackAndEnter'
                      : 'player.hackAndOpen';
                    const nodeHackHintKey = nodeHackOutcome === HACK_OUTCOME.ENTER
                      ? 'player.hackLocationHint'
                      : 'player.hackContainerHint';
                    // Патч 504: «Нет» Мастера оставляет карточку visible, но
                    // запрещает И взлом, И просмотр до новой трансляции.
                    const terminalClosed = Boolean(
                      terminalState?.closed || terminalState?.locked
                      || terminalState?.game?.status === 'closed',
                    );
                    const terminalAwaiting = !terminalClosed && Boolean(
                      terminalState?.awaitingGm || terminalState?.game?.status === 'awaitingRetry',
                    );
                    // Патч 526: accessId — идентификатор трансляции, не «билет».
                    const accessKey = terminalAccessKey({
                      roomCode: matchedContext.roomCode,
                      containerId: node.containerId,
                      accessId: terminalState?.accessId,
                    });
                    const hackAllowed = canHackTerminal({
                      key: accessKey,
                      game: terminalState?.game,
                      terminalClosed,
                      terminalAwaiting,
                      isLock: nodeIsLock,
                    });
                    const accessBlockedReason = terminalBlockedReason({
                      key: accessKey,
                      game: terminalState?.game,
                      terminalClosed,
                      terminalAwaiting,
                      isLock: nodeIsLock,
                    });
                    const accessBadgeKey = {
                      closed: 'terminal.closedBadge',
                      awaiting: 'terminal.retryWaiting',
                      won: 'terminal.stateWon',
                      keyUnlocked: 'terminal.keyUnlockedBadge',
                      finished: 'terminal.accessUsed',
                    }[accessBlockedReason] || null;
                    // Патч 519: привязанный терминал — это «замок» точки, а не
                    // отдельная карточка. Патч 520: источников может быть два
                    // (терминал ИЛИ замок) — они не блокируют точку одновременно.
                    // Обязательный ключ по-прежнему не обойти взломом.
                    const gateIds = gateIdsFor(node);
                    const gateOptions = nodeLocked ? gateOptionsFor(node, gateIds) : [];
                    const gateSeparatorKey = gateSeparatorKeyFor(node);
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
                              name={nodeIsLocation ? 'map-marker-multiple'
                                : (nodeIsLock ? 'lock'
                                  : (nodeIsTerminal ? 'console'
                                    : (nodeLocked ? 'lock' : (nodeIsMerch ? 'sack' : 'treasure-chest'))))}
                              size={19}
                              color={nodeLocked && !nodeIsLocation ? '#e57373' : '#f0e68c'}
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

                          {/* Патч 543: плашка с причиной перекрытия в списке. */}
                          {node.passageBlocked ? (
                            <Text
                              testID={`passage-blocked-hint-${node.containerId}`}
                              style={styles.hubLockedHintText}
                            >
                              {String(node.passageReason || '').trim()
                                || tLootTrade('player.passageBlocked')}
                            </Text>
                          ) : null}

                          {(nodeLocked || nodeIsTerminal) && !node.passageBlocked ? (
                            <Text
                              testID={`hack-outcome-hint-${node.containerId}`}
                              style={styles.hubLockedHintText}
                            >
                              {tLootTrade(nodeHackHintKey)}
                            </Text>
                          ) : null}

                          {node.keyUnlocked ? (
                            <Text style={styles.hubUnlockedMetaText}>
                              {tLootTrade('player.hubNodeKeyUnlockedBadge')}
                            </Text>
                          ) : nodeLocked && !node.passageBlocked ? (
                            // Патч 543: при перекрытом проходе подсказка замка
                            // не показывается — блок сильнее, взлома не будет.
                            <Text style={styles.hubLockedHintText}>
                              {node.lockLabel || tLootTrade('player.hubNodeLockedDefaultHint')}
                            </Text>
                          ) : nodeIsLocation ? (
                            <Text style={styles.hubUnlockedMetaText}>
                              {tLootTrade('card.hubKind')}
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
                          {nodeLocked && !nodeIsLocation ? (
                            gateAvailable ? (
                              <View style={styles.terminalButtons}>
                                {gateOptions.map((option, optionIdx) => (
                                  <View key={option.id} style={styles.terminalButtons}>
                                    {optionIdx > 0 && (
                                      <Text testID={`gate-or-${node.containerId}`} style={styles.hubLockedHintText}>
                                        {gateSeparatorKey === 'player.gateAnd'
                                          ? tLootTrade('player.gateAnd')
                                          : tLootTrade('player.gateOr')}
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
                                          setTerminalSelection({
                                            node: option.selection,
                                            kind: option.kind,
                                            autoStart: true,
                                            freshAttempt: option.kind === CONTAINER_KIND.LOCK,
                                            targetNodeId: node.containerId,
                                          });
                                        }}
                                      >
                                        <Text style={styles.terminalHackButtonText}>{tLootTrade(nodeHackLabelKey)}</Text>
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
                                  // Патч 526/532: явный подход игрока. У замка
                                  // он продолжает ту же доску с угаданными позициями.
                                  setTerminalSelection({
                                    node: terminalForSelection,
                                    kind: nodeCheckKind,
                                    autoStart: true,
                                    freshAttempt: nodeCheckKind === CONTAINER_KIND.LOCK,
                                    targetNodeId: node.containerId,
                                  });
                                }}
                              >
                                <Text style={styles.terminalHackButtonText}>{tLootTrade(nodeHackLabelKey)}</Text>
                              </TouchableOpacity>
                              {(nodeCheckPassed && (nodeIsLocation || nodeIsLock)) ? (
                                <TouchableOpacity
                                  testID={`hack-outcome-button-${node.containerId}`}
                                  style={styles.takeAllRowBtn}
                                  onPress={() => navigateHackOutcome(node)}
                                >
                                  <Text style={styles.takeAllRowBtnText}>
                                    {tLootTrade(
                                      nodeIsLocation
                                        ? 'player.hubNodeOpenLocation'
                                        : (nodeIsMerch
                                          ? 'player.hubNodeOpenMerchant'
                                          : 'player.hubNodeOpenLoot'),
                                    )}
                                  </Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ) : (
                            <TouchableOpacity
                              testID={`hub-node-enter-${node.containerId}`}
                              style={styles.takeAllRowBtn}
                              onPress={() => {
                                setBuyBuffer({});
                                setSellBuffer({});
                                setMobileTab('merchant');
                                // Патч 523: узел с детьми — это вложенная
                                // локация/контейнер, входим внутрь, а не
                                // открываем содержимое сразу.
                                navigateHackOutcome(node);
                              }}
                            >
                              <Text style={styles.takeAllRowBtnText}>
                                {tLootTrade(
                                  nodeIsLocation
                                    ? ((nodeLocked && !node.passageBlocked)
                                      // Патч 542: запертая локация ведёт к
                                      // экрану преград, а не мимо неё.
                                      // Патч 543: перекрытая — тоже к двери,
                                      // но без «взломать» в подписи.
                                      ? nodeHackLabelKey
                                      : 'player.hubNodeOpenLocation')
                                    : (nodeIsMerch
                                      ? 'player.hubNodeOpenMerchant'
                                      : 'player.hubNodeOpenLoot'),
                                )}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
                {exitNode && (
                  <TouchableOpacity
                    testID="hub-exit-button"
                    style={styles.takeAllRowBtn}
                    onPress={() => {
                      setSelectedHubNodeId(null);
                      setParentStack((stack) => [...stack, exitNode.containerId]);
                    }}
                  >
                    <Text style={styles.takeAllRowBtnText}>
                      {formatLootTrade(tLootTrade('player.exitToLocation'), { name: exitNode.name })}
                    </Text>
                  </TouchableOpacity>
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
              freshAttempt={Boolean(terminalSelection.freshAttempt)}
              onHacked={handleCheckHacked}
              onClose={handleCheckModalClose}
            />
          ) : (
            <TerminalHackingModal
              visible
              terminal={terminalSelection.node}
              roomCode={matchedContext.roomCode}
              autoStart={Boolean(terminalSelection.autoStart)}
              onHacked={handleCheckHacked}
              onClose={handleCheckModalClose}
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
                        {isCaps ? (
                          <IconText style={styles.lootRowTitle}>
                            {formatLootTrade(tLootTrade('player.capsItemLabel'), { qty: entry.quantity })}
                          </IconText>
                        ) : (
                          <ItemNameLines
                            item={entry}
                            modsIndex={modsIndex}
                            suffix={` ×${entry.quantity}`}
                            nameStyle={styles.lootRowTitle}
                          />
                        )}
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
                onLongPress={() => setQuantityModal({
                  kind: 'sell', item: pItem, max: remaining, unitPrice: sellUnitPrice,
                })}
                delayLongPress={400}
              >
                <View style={styles.tradeRowInfo}>
                  <ItemNameLines item={pItem} modsIndex={modsIndex} suffix={durSuffix} />
                  <IconText style={styles.tradeRowPrice}>
                    {formatLootTrade(tLootTrade('player.unitPrice'), { price: sellUnitPrice })}
                  </IconText>
                </View>
                <View style={styles.rowQtyBadge}>
                  <Text style={styles.rowQtyBadgeText}>{`×${remaining}`}</Text>
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
                  onLongPress={() => setQuantityModal({
                    kind: 'buy', item: entry, max: remaining, unitPrice: buyUnitPrice,
                  })}
                  delayLongPress={400}
                >
                  <View style={styles.tradeRowInfo}>
                    <ItemNameLines
                      item={entry.itemSnapshot && entry.itemSnapshot.name ? entry.itemSnapshot : entry}
                      modsIndex={modsIndex}
                    />
                    {Boolean(basics) && (
                      <IconText style={styles.tradeRowBasics}>{basics}</IconText>
                    )}
                    <IconText style={styles.tradeRowPriceBuy}>
                      {formatLootTrade(tLootTrade('player.unitPrice'), { price: buyUnitPrice })}
                    </IconText>
                  </View>
                  <View style={styles.rowQtyBadge}>
                    <Text style={styles.rowQtyBadgeText}>{`×${remaining}`}</Text>
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

          {/* 561: «сколько переместить?» — поверх окна торговца. Значение
              уходит в буфер, окончательная сделка — нижней кнопкой. */}
          <TransferQuantityModal
            visible={Boolean(quantityModal)}
            itemName={quantityModal?.item?.name || ''}
            directionLabel={quantityModal?.kind === 'buy'
              ? `${tLootTrade('player.merchantInventoryTab')} → ${tLootTrade('player.playerInventoryTab')}`
              : `${tLootTrade('player.playerInventoryTab')} → ${tLootTrade('player.merchantInventoryTab')}`}
            available={quantityModal?.max || 1}
            max={quantityModal?.max || 1}
            renderTotal={(qty) => {
              const unit = Number(quantityModal?.unitPrice) || 0;
              return formatLootTrade(tLootTrade('player.quantityTotal'), { total: unit * qty });
            }}
            onCancel={() => setQuantityModal(null)}
            onConfirm={(qty) => {
              const target = quantityModal;
              setQuantityModal(null);
              if (!target) return;
              if (target.kind === 'buy') addToBuyBuffer(target.item, qty);
              else addToSellBuffer(target.item, qty);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}


