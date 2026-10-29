import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as db from '../../../db';
import {
  SUPPORTED_LOCALES,
  useLocale,
  useModuleLocale,
} from '../../../i18n/locale';
import { getLocaleLabel } from '../HomeScreen/logic/localeLabel';
import { tHomeScreen } from '../HomeScreen/logic/homeScreenI18n';
import { tLootTrade, formatLootTrade } from './logic/lootTradeI18n';
import useAppSettingsStore from '../../../src/store/appSettingsStore';
import useRoomStore from '../../../src/room/roomStore';
import useUiModeStore from '../../../src/room/uiModeStore';
import { formatRoomCodeForDisplay } from '../../../src/room/roomCode';
import { buildGmRoomCharacterCards } from '../../../src/room/roomCharacterSync';
import {
  CONTAINER_KIND,
  addOrMergeContainerItem,
  computeMerchantSellPriceToPlayer,
  getEffectiveMerchantRates,
  normalizeBuyDepreciationPercent,
  normalizeCapsAmount,
  normalizeSaleMarkupPercent,
  resolveQuantitySpec,
} from '../../../domain/lootTrade';
import { getItemPrice, getItemWeight, resolveItem } from '../../../domain/resolveItem';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import {
  deleteGmContainerFromCloudIfEnabled,
  openCloudFolderInDrive,
  syncAllCharactersWithCloud,
  syncGmContainerToCloudIfEnabled,
} from '../../cloudSync/googleDriveSync';
import {
  confirmAlert,
  showAlert as showCatalogAlert,
  showRawAlert,
} from '../../alerts/alertService';
import { subscribeGmContainerUpdates } from '../../../src/lootTrade/gmSessionPersistence';
import { debugLog } from '../../../src/debug/falloutDebug';
import styles from '../../../styles/LootTradeScreen.styles';
import homeStyles from '../../../styles/HomeScreen.styles';
import ContainerFormModal from './modals/ContainerFormModal';
import ContainerCatalogModal from './modals/ContainerCatalogModal';
import ContainerItemConfigModal from './modals/ContainerItemConfigModal';
import IssueContainerModal from './modals/IssueContainerModal';

const NUM_COLS = 3;
const MENU_WIDTH = 220;

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

const ActionCell = ({ iconName, label, onPress }) => (
  <TouchableOpacity style={styles.createCell} onPress={onPress} activeOpacity={0.75}>
    <MaterialCommunityIcons name={iconName} size={42} color="#5a5a5a" />
    <Text style={styles.createLabel}>{label}</Text>
  </TouchableOpacity>
);

const ContainerCardCell = ({
  container,
  roomLabel,
  isLive,
  onOpen,
  onIssueOrClose,
  onDuplicate,
  onEdit,
  onDelete,
}) => {
  const isMerchant = container.kind === CONTAINER_KIND.MERCHANT;
  const menuBtnRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  const openMenu = (event) => {
    event?.stopPropagation?.();
    menuBtnRef.current?.measureInWindow((x, y, width, height) => {
      const { width: winW, height: winH } = Dimensions.get('window');
      const menuH = 184;
      const left = Math.max(8, Math.min(x + width - MENU_WIDTH, winW - MENU_WIDTH - 8));
      const top = y + height + menuH + 8 <= winH
        ? y + height + 4
        : Math.max(8, y - menuH - 4);
      setMenuPos({ top, left });
    });
  };

  const runMenuAction = (fn) => {
    setMenuPos(null);
    fn();
  };

  const totalPieces = (container.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  return (
    <TouchableOpacity
      style={[styles.cardCell, isLive && styles.cardCellActive]}
      onPress={onOpen}
      activeOpacity={0.82}
    >
      <View style={[styles.cardHero, isMerchant && styles.cardHeroMerchant]}>
        {isLive && (
          <View style={styles.cardLiveBadge}>
            <Text style={styles.cardLiveBadgeText}>{tLootTrade('card.activeBadge')}</Text>
          </View>
        )}
        <MaterialCommunityIcons
          name={isMerchant ? 'sack' : 'treasure-chest'}
          size={34}
          color="#f0e68c"
        />
        <View style={styles.cardRoomChip}>
          <Text style={styles.cardRoomChipText} numberOfLines={1}>
            {roomLabel || formatRoomCodeForDisplay(container.roomCode)}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{container.name}</Text>
        {Boolean(container.description) && (
          <Text style={styles.cardDesc} numberOfLines={2}>{container.description}</Text>
        )}
        <Text style={styles.cardMeta} numberOfLines={1}>
          {formatLootTrade(tLootTrade('card.itemsCount'), { count: totalPieces })}
        </Text>
        {isMerchant && (
          <Text style={styles.cardMeta} numberOfLines={1}>
            {formatLootTrade(tLootTrade('card.capsCount'), { caps: container.caps })}
          </Text>
        )}
      </View>

      <TouchableOpacity
        ref={menuBtnRef}
        style={styles.cardActionButton}
        onPress={openMenu}
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
        accessibilityLabel={tLootTrade('card.openMenu')}
      >
        <MaterialCommunityIcons name="dots-vertical" size={20} color="#4b5563" />
      </TouchableOpacity>

      <Modal
        visible={Boolean(menuPos)}
        transparent
        animationType="none"
        onRequestClose={() => setMenuPos(null)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuPos(null)}>
          {menuPos && (
            <View style={[styles.actionMenu, menuPos]}>
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => runMenuAction(onIssueOrClose)}
              >
                <MaterialCommunityIcons
                  name={isLive ? 'close-octagon-outline' : 'broadcast'}
                  size={19}
                  color={isLive ? '#b91c1c' : '#15803d'}
                />
                <Text style={styles.actionMenuText}>
                  {tLootTrade(isLive ? 'card.closeIssue' : 'card.issue')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => runMenuAction(onDuplicate)}
              >
                <MaterialCommunityIcons name="content-copy" size={19} color="#111827" />
                <Text style={styles.actionMenuText}>{tLootTrade('card.duplicate')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => runMenuAction(onEdit)}
              >
                <MaterialCommunityIcons name="pencil-outline" size={19} color="#111827" />
                <Text style={styles.actionMenuText}>{tLootTrade('card.edit')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => runMenuAction(onDelete)}
              >
                <MaterialCommunityIcons name="delete-outline" size={19} color="#b91c1c" />
                <Text style={[styles.actionMenuText, styles.actionMenuDeleteText]}>
                  {tLootTrade('card.delete')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Modal>
    </TouchableOpacity>
  );
};

export default function LootTradeScreen() {
  const locale = useLocale();
  const moduleLocale = useModuleLocale();
  const setSettingValue = useAppSettingsStore((s) => s.setValue);
  const setTabUiMode = useUiModeStore((s) => s.setTabUiMode);
  const roomRooms = useRoomStore((s) => s.rooms);

  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]); // [{ folderId, name, code, ownerToken }]
  const [activeContainerId, setActiveContainerId] = useState(null);

  // Модалки
  const [formModal, setFormModal] = useState(null); // { kind, initialContainer }
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [issueTargetContainer, setIssueTargetContainer] = useState(null);
  const [issueBusy, setIssueBusy] = useState(false);
  const [rollBanner, setRollBanner] = useState('');
  const [syncingCloud, setSyncingCloud] = useState(false);

  // Живая подкрутка процентов торговца Мастером (п. 5)
  const [rateScopeCharId, setRateScopeCharId] = useState(null); // null = всем, string = characterId
  const [liveSaleInput, setLiveSaleInput] = useState('0');
  const [liveDeprInput, setLiveDeprInput] = useState('50');
  const [liveCapsInput, setLiveCapsInput] = useState('0');

  const catalog = useMemo(() => getEquipmentCatalog(moduleLocale), [moduleLocale]);

  const loadData = useCallback(async () => {
    try {
      const [savedContainers, folders, roomRows] = await Promise.all([
        db.getGmContainersList(),
        db.getCharacterFolders(),
        db.getFolderRooms(),
      ]);
      const folderNameById = Object.fromEntries((folders || []).map((f) => [f.id, f.name]));
      const rooms = (roomRows || []).map((row) => ({
        folderId: row.folder_id,
        code: row.code,
        ownerToken: row.owner_token,
        name: folderNameById[row.folder_id] || formatRoomCodeForDisplay(row.code),
      }));
      setAvailableRooms(rooms);
      setContainers(savedContainers || []);
    } catch (error) {
      debugLog('lootTrade.load:failed', { message: error?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      useUiModeStore.getState().setGmInspectingCharacter(false);
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    return subscribeGmContainerUpdates(() => {
      loadData();
    });
  }, [loadData]);

  const roomByCode = useMemo(
    () => Object.fromEntries(availableRooms.map((r) => [r.code, r])),
    [availableRooms],
  );

  const activeContainer = useMemo(
    () => containers.find((c) => c.id === activeContainerId) || null,
    [containers, activeContainerId],
  );

  const getActiveSessionForContainer = useCallback((cnt) => {
    if (!cnt?.roomCode) return null;
    const active = roomRooms[cnt.roomCode]?.activeSession;
    if (!active || active.containerId !== cnt.id) return null;
    return active;
  }, [roomRooms]);

  const activeLiveSession = activeContainer ? getActiveSessionForContainer(activeContainer) : null;

  // Синхронизируем поля живой панели при смене выбранного получателя или приходе обновления
  useEffect(() => {
    if (!activeLiveSession || activeLiveSession.kind !== CONTAINER_KIND.MERCHANT) return;
    const effective = getEffectiveMerchantRates(activeLiveSession, rateScopeCharId);
    setLiveSaleInput(String(effective.saleMarkupPercent));
    setLiveDeprInput(String(effective.buyDepreciationPercent));
    setLiveCapsInput(String(activeLiveSession.caps ?? 0));
  }, [
    activeLiveSession?.sessionId,
    activeLiveSession?.revision,
    rateScopeCharId,
  ]);

  const showTimedBanner = (text) => {
    setRollBanner(text);
    setTimeout(() => {
      setRollBanner((cur) => (cur === text ? '' : cur));
    }, 4500);
  };

  const ensureGmRoomConnected = async (roomCode) => {
    const store = useRoomStore.getState();
    const record = roomByCode[roomCode];
    const current = store.rooms[roomCode];
    if (current && current.joined !== false && current.role === 'gm') return;
    try {
      await store.joinRoom({ code: roomCode, name: 'GM', role: 'gm' });
    } catch (err) {
      if (err?.message === 'ROOM_NOT_FOUND' && record?.ownerToken) {
        await store.createRoom({
          name: record.name || roomCode,
          requestedCode: roomCode,
          ownerToken: record.ownerToken,
        });
        await store.joinRoom({ code: roomCode, name: 'GM', role: 'gm' });
        return;
      }
      throw err;
    }
  };

  const persistAndSyncContainer = async (nextContainer) => {
    const saved = await db.saveGmContainer(nextContainer);
    await loadData();
    void syncGmContainerToCloudIfEnabled(saved.id);

    // Если этот контейнер прямо сейчас выдан в комнату — транслируем свежее содержимое/параметры
    const live = getActiveSessionForContainer(saved);
    if (live) {
      try {
        await useRoomStore.getState().updateRoomSessionRates({
          code: saved.roomCode,
          sessionId: live.sessionId,
          name: saved.name,
          description: saved.description,
          items: saved.items,
          ...(saved.kind === CONTAINER_KIND.MERCHANT ? {
            caps: saved.caps,
            saleMarkupPercent: saved.saleMarkupPercent,
            buyDepreciationPercent: saved.buyDepreciationPercent,
          } : {}),
        });
      } catch (e) {
        debugLog('lootTrade.liveSyncAfterEdit:failed', { message: e?.message });
      }
    }

    return saved;
  };

  const handleSaveContainerForm = async (draft, capsRollInfo) => {
    const cleanDraft = { ...draft };
    delete cleanDraft.__isDuplicateDraft;
    const saved = await persistAndSyncContainer(cleanDraft);
    setFormModal(null);
    if (!activeContainerId && !draft.id) {
      setActiveContainerId(saved.id);
    }
    if (capsRollInfo?.rolled) {
      showTimedBanner(formatLootTrade(tLootTrade('detail.capsRollNotice'), {
        dice: capsRollInfo.diceCount,
        unit: capsRollInfo.unit === 'cd' ? 'CD' : 'd20',
        total: capsRollInfo.quantity,
      }));
    }
  };

  const handleDuplicateCard = async (container) => {
    try {
      const copy = await db.duplicateGmContainer(container.id, tLootTrade('card.copySuffix'));
      await loadData();
      void syncGmContainerToCloudIfEnabled(copy.id);
      // Открываем параметры дубликата, чтобы при желании сразу сменить комнату/имя
      setFormModal({
        kind: copy.kind,
        initialContainer: { ...copy, __isDuplicateDraft: true },
      });
    } catch (error) {
      debugLog('lootTrade.duplicate:failed', { message: error?.message });
    }
  };

  const handleDeleteCard = async (container) => {
    const confirmed = await new Promise((resolve) => {
      showRawAlert({
        title: tLootTrade('detail.deleteConfirmTitle'),
        message: formatLootTrade(tLootTrade('detail.deleteConfirmMessage'), { name: container.name }),
        buttons: [
          { text: tLootTrade('form.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: tLootTrade('card.delete'), style: 'destructive', onPress: () => resolve(true) },
        ],
      });
    });
    if (!confirmed) return;

    const live = getActiveSessionForContainer(container);
    if (live) {
      await useRoomStore.getState().closeRoomSession({
        code: container.roomCode,
        sessionId: live.sessionId,
      }).catch(() => {});
    }
    await deleteGmContainerFromCloudIfEnabled(container.id);
    await db.deleteGmContainer(container.id);
    if (activeContainerId === container.id) setActiveContainerId(null);
    await loadData();
  };

  const handleIssueOrClosePress = async (container) => {
    const live = getActiveSessionForContainer(container);
    if (live) {
      try {
        await useRoomStore.getState().closeRoomSession({
          code: container.roomCode,
          sessionId: live.sessionId,
        });
      } catch (e) {
        debugLog('lootTrade.closeSession:failed', { message: e?.message });
      }
      return;
    }

    try {
      await ensureGmRoomConnected(container.roomCode);
    } catch {
      // Откроем окно, при подтверждении повторим подключение
    }
    setIssueTargetContainer(container);
  };

  const handleConfirmIssue = async ({ targetType, targetCharacterId, targetCharacterName }) => {
    if (!issueTargetContainer) return;
    setIssueBusy(true);
    try {
      await ensureGmRoomConnected(issueTargetContainer.roomCode);
      await useRoomStore.getState().openRoomSession({
        code: issueTargetContainer.roomCode,
        session: {
          containerId: issueTargetContainer.id,
          kind: issueTargetContainer.kind,
          name: issueTargetContainer.name,
          description: issueTargetContainer.description,
          targetType,
          targetCharacterId,
          targetCharacterName,
          caps: issueTargetContainer.caps,
          saleMarkupPercent: issueTargetContainer.saleMarkupPercent,
          buyDepreciationPercent: issueTargetContainer.buyDepreciationPercent,
          characterOverrides: {},
          items: issueTargetContainer.items,
        },
      });
      setIssueTargetContainer(null);
      setRateScopeCharId(null);
    } catch (error) {
      debugLog('lootTrade.issue:failed', { message: error?.message });
      showRawAlert({ title: tLootTrade('issueModal.issueFailed') });
    } finally {
      setIssueBusy(false);
    }
  };

  const handleAddCatalogItem = async (pickedItem, spec) => {
    if (!activeContainer) return;
    const roll = resolveQuantitySpec({
      count: spec.count,
      unit: spec.unit,
      allowZeroPcs: false,
    });

    const unitLabel = roll.unit === 'cd' ? 'CD' : 'd20';
    if (roll.rolled && roll.quantity <= 0) {
      const zeroMsg = formatLootTrade(tLootTrade('detail.rollZeroNotice'), {
        dice: roll.diceCount,
        unit: unitLabel,
      });
      setCatalogFeedback(zeroMsg);
      showTimedBanner(zeroMsg);
      return;
    }

    const isCaps = pickedItem.itemType === 'caps' || pickedItem.id === 'caps';
    const localized = isCaps ? pickedItem : resolveItem(pickedItem, catalog);
    const baseCost = isCaps ? 1 : (getItemPrice(localized) || Number(pickedItem.cost ?? 0) || 0);
    const weight = isCaps ? 0 : (getItemWeight(localized) || 0);

    const nextItems = addOrMergeContainerItem(activeContainer.items, {
      itemId: isCaps ? 'caps' : (pickedItem.id || pickedItem.weaponId || pickedItem.name),
      itemType: isCaps ? 'caps' : (pickedItem.itemType || 'misc'),
      name: pickedItem.name,
      cost: baseCost,
      weight,
      quantity: roll.quantity,
      markupPercent: activeContainer.kind === CONTAINER_KIND.MERCHANT ? spec.markupPercent : 0,
      itemSnapshot: isCaps ? null : {
        ...pickedItem,
        id: pickedItem.id || pickedItem.weaponId,
        weaponId: pickedItem.weaponId || pickedItem.id,
        itemType: pickedItem.itemType || 'misc',
      },
    });

    await persistAndSyncContainer({
      ...activeContainer,
      items: nextItems,
    });

    const msg = roll.rolled
      ? `${pickedItem.name}: ${formatLootTrade(tLootTrade('detail.rollNotice'), {
          dice: roll.diceCount,
          unit: unitLabel,
          total: roll.quantity,
        })}`
      : `✓ ${pickedItem.name} ×${roll.quantity}`;
    setCatalogFeedback(msg);
    if (roll.rolled) showTimedBanner(msg);
  };

  const handleStepRowQty = async (entry, delta) => {
    if (!activeContainer) return;
    const nextQty = (Number(entry.quantity) || 0) + delta;
    const nextItems = nextQty <= 0
      ? activeContainer.items.filter((it) => it.entryId !== entry.entryId)
      : activeContainer.items.map((it) => (
          it.entryId === entry.entryId ? { ...it, quantity: nextQty } : it
        ));
    await persistAndSyncContainer({ ...activeContainer, items: nextItems });
  };

  const handleRemoveRow = async (entryId) => {
    if (!activeContainer) return;
    const nextItems = activeContainer.items.filter((it) => it.entryId !== entryId);
    await persistAndSyncContainer({ ...activeContainer, items: nextItems });
  };

  const handleSaveEditedRow = async (spec) => {
    if (!activeContainer || !editingEntry) return;
    const roll = resolveQuantitySpec({
      count: spec.count,
      unit: spec.unit,
      allowZeroPcs: false,
    });
    const nextItems = roll.quantity <= 0
      ? activeContainer.items.filter((it) => it.entryId !== editingEntry.entryId)
      : activeContainer.items.map((it) => (
          it.entryId === editingEntry.entryId
            ? {
                ...it,
                quantity: roll.quantity,
                markupPercent: activeContainer.kind === CONTAINER_KIND.MERCHANT
                  ? spec.markupPercent
                  : 0,
              }
            : it
        ));
    setEditingEntry(null);
    await persistAndSyncContainer({ ...activeContainer, items: nextItems });
  };

  const applyLiveMerchantRates = async ({
    sale = normalizeSaleMarkupPercent(liveSaleInput, 0),
    depr = normalizeBuyDepreciationPercent(liveDeprInput, 50),
    caps = normalizeCapsAmount(liveCapsInput, activeLiveSession?.caps ?? 0),
    resetPersonal = false,
  } = {}) => {
    if (!activeContainer || !activeLiveSession) return;
    try {
      await ensureGmRoomConnected(activeContainer.roomCode);
      await useRoomStore.getState().updateRoomSessionRates({
        code: activeContainer.roomCode,
        sessionId: activeLiveSession.sessionId,
        targetCharacterId: rateScopeCharId,
        resetCharacterOverride: resetPersonal,
        saleMarkupPercent: sale,
        buyDepreciationPercent: depr,
        caps,
      });
      if (!rateScopeCharId) {
        // Общие ставки и касса сохраняются на саму карточку торговца у Мастера
        const updated = await db.saveGmContainer({
          ...activeContainer,
          saleMarkupPercent: sale,
          buyDepreciationPercent: depr,
          caps,
        });
        await loadData();
        void syncGmContainerToCloudIfEnabled(updated.id);
      }
    } catch (error) {
      debugLog('lootTrade.applyLiveRates:failed', { message: error?.message });
    }
  };

  const stepLiveRate = (field, delta) => {
    if (field === 'sale') {
      const next = normalizeSaleMarkupPercent((parseInt(liveSaleInput, 10) || 0) + delta, 0);
      setLiveSaleInput(String(next));
      void applyLiveMerchantRates({ sale: next });
      return;
    }
    const next = normalizeBuyDepreciationPercent((parseInt(liveDeprInput, 10) || 50) + delta, 50);
    setLiveDeprInput(String(next));
    void applyLiveMerchantRates({ depr: next });
  };

  const handleExitGmMode = () => {
    availableRooms.forEach((r) => {
      if (r.code) useRoomStore.getState().leaveRoom({ code: r.code }).catch(() => {});
    });
    setTabUiMode('user');
    setSettingValue('uiMode', 'user');
  };

  const handleCloudSyncPress = async () => {
    if (Platform.OS !== 'web') {
      showCatalogAlert('cloudSyncUnsupported');
      return;
    }
    if (syncingCloud) return;
    setSyncingCloud(true);
    try {
      const result = await syncAllCharactersWithCloud({
        confirmDownload: async (items) => confirmAlert('cloudRemoteIsNewer', { count: items.length }),
      });
      await loadData();
      await openCloudFolderInDrive();
      await showCatalogAlert('cloudSyncSuccess', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
      });
    } catch (e) {
      await showCatalogAlert('cloudSyncError', { reason: e?.message || String(e) });
    } finally {
      setSyncingCloud(false);
    }
  };

  const languageOptions = SUPPORTED_LOCALES.map((code) => ({
    code,
    label: getLocaleLabel({ code, displayLocale: locale, translate: tHomeScreen }),
  }));

  const gridItems = [
    { type: 'createLoot', id: '__create_loot__' },
    { type: 'createMerchant', id: '__create_merchant__' },
    ...containers.map((c) => ({ type: 'container', ...c })),
  ];

  const rows = [];
  for (let i = 0; i < gridItems.length; i += NUM_COLS) {
    rows.push(gridItems.slice(i, i + NUM_COLS));
  }
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    while (last.length < NUM_COLS) {
      last.push({ type: 'empty', id: `empty_${last.length}` });
    }
  }

  const issueRoomCharacters = issueTargetContainer?.roomCode
    ? buildGmRoomCharacterCards(roomRooms[issueTargetContainer.roomCode])
    : [];

  const activeContainerRoomCharacters = activeContainer?.roomCode
    ? buildGmRoomCharacterCards(roomRooms[activeContainer.roomCode])
    : [];

  return (
    <View style={styles.container}>
      {/* Верхняя шапка Мастера */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.syncIconButton}
          onPress={handleCloudSyncPress}
          accessibilityLabel={tLootTrade('actions.syncCloud')}
        >
          {syncingCloud ? (
            <ActivityIndicator size="small" color="#f0e68c" />
          ) : (
            <MaterialCommunityIcons name="cloud-sync-outline" size={20} color="#f0e68c" />
          )}
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Pressable style={styles.adminButton} onPress={handleExitGmMode}>
            <MaterialCommunityIcons name="shield-crown-outline" size={18} color="#f0e68c" />
            <Text style={styles.adminButtonText}>{tHomeScreen('gm.exit')}</Text>
          </Pressable>
        </View>

        <View style={homeStyles.languageContainer}>
          {languageOptions.map((lang, idx) => (
            <Pressable
              key={lang.code}
              style={[
                homeStyles.langSegment,
                idx === 0 && homeStyles.langSegmentLeft,
                idx === languageOptions.length - 1 && homeStyles.langSegmentRight,
                locale === lang.code && homeStyles.langSegmentActive,
              ]}
              onPress={() => setSettingValue('language', lang.code)}
            >
              <Text style={[
                homeStyles.langSegmentText,
                locale === lang.code && homeStyles.langSegmentTextActive,
              ]}>
                {lang.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!activeContainer ? (
        <>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{tLootTrade('title')}</Text>
            <Text style={styles.subtitle}>{tLootTrade('subtitle')}</Text>
          </View>

          {Boolean(rollBanner) && (
            <View style={[styles.rollBanner, { marginHorizontal: 16, marginTop: 8 }]}>
              <Text style={styles.rollBannerText}>{rollBanner}</Text>
            </View>
          )}

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {loading ? (
              <ActivityIndicator size="large" color="#d4af37" style={styles.loader} />
            ) : (
              rows.map((row, rIdx) => (
                <View key={rIdx} style={styles.row}>
                  {row.map((cell) => {
                    if (cell.type === 'createLoot') {
                      return (
                        <ActionCell
                          key={cell.id}
                          iconName="treasure-chest"
                          label={tLootTrade('actions.createLoot')}
                          onPress={() => setFormModal({ kind: CONTAINER_KIND.LOOT, initialContainer: null })}
                        />
                      );
                    }
                    if (cell.type === 'createMerchant') {
                      return (
                        <ActionCell
                          key={cell.id}
                          iconName="sack"
                          label={tLootTrade('actions.createMerchant')}
                          onPress={() => setFormModal({ kind: CONTAINER_KIND.MERCHANT, initialContainer: null })}
                        />
                      );
                    }
                    if (cell.type === 'empty') {
                      return <View key={cell.id} style={styles.emptyCell} />;
                    }
                    const roomRec = roomByCode[cell.roomCode];
                    const roomLabel = roomRec
                      ? `${roomRec.name} (${formatRoomCodeForDisplay(cell.roomCode)})`
                      : (cell.roomName || formatRoomCodeForDisplay(cell.roomCode));
                    return (
                      <ContainerCardCell
                        key={cell.id}
                        container={cell}
                        roomLabel={roomLabel}
                        isLive={Boolean(getActiveSessionForContainer(cell))}
                        onOpen={() => setActiveContainerId(cell.id)}
                        onIssueOrClose={() => handleIssueOrClosePress(cell)}
                        onDuplicate={() => handleDuplicateCard(cell)}
                        onEdit={() => setFormModal({ kind: cell.kind, initialContainer: cell })}
                        onDelete={() => handleDeleteCard(cell)}
                      />
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </>
      ) : (
        /* Детальный экран выбранного контейнера / торговца */
        <View style={styles.detailWrapper}>
          <View style={styles.detailHeaderCard}>
            <View style={styles.detailTopRow}>
              <TouchableOpacity onPress={() => setActiveContainerId(null)}>
                <Text style={styles.backLink}>{tLootTrade('detail.backToList')}</Text>
              </TouchableOpacity>
              <View style={styles.detailHeaderButtons}>
                <TouchableOpacity
                  style={styles.smallHeaderBtn}
                  onPress={() => setFormModal({
                    kind: activeContainer.kind,
                    initialContainer: activeContainer,
                  })}
                >
                  <MaterialCommunityIcons name="cog-outline" size={15} color="#fff" />
                  <Text style={styles.smallHeaderBtnText}>{tLootTrade('detail.editSettings')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.smallHeaderBtn,
                    activeLiveSession ? styles.stopIssueHeaderBtn : styles.issueHeaderBtn,
                  ]}
                  onPress={() => handleIssueOrClosePress(activeContainer)}
                >
                  <MaterialCommunityIcons
                    name={activeLiveSession ? 'stop-circle-outline' : 'broadcast'}
                    size={15}
                    color="#fff"
                  />
                  <Text style={styles.smallHeaderBtnText}>
                    {tLootTrade(activeLiveSession ? 'detail.stopIssueButton' : 'detail.issueButton')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.detailTitleRow}>
              <MaterialCommunityIcons
                name={activeContainer.kind === CONTAINER_KIND.MERCHANT ? 'sack' : 'treasure-chest'}
                size={22}
                color="#f0e68c"
              />
              <Text style={styles.detailTitle}>{activeContainer.name}</Text>
            </View>

            <Text style={styles.detailRoomText}>
              {formatLootTrade(tLootTrade('issueModal.roomLabel'), {
                room: `${roomByCode[activeContainer.roomCode]?.name || activeContainer.roomName || ''} (${formatRoomCodeForDisplay(activeContainer.roomCode)})`.trim(),
              })}
            </Text>

            {Boolean(activeContainer.description) && (
              <Text style={styles.detailDescText}>{activeContainer.description}</Text>
            )}

            {activeContainer.kind === CONTAINER_KIND.MERCHANT && (
              <View style={styles.detailRatesRow}>
                <Text style={styles.detailRateBadge}>
                  {formatLootTrade(tLootTrade('card.capsCount'), { caps: activeContainer.caps })}
                </Text>
                <Text style={styles.detailRateBadge}>
                  {formatLootTrade(tLootTrade('card.ratesSummary'), {
                    sale: activeContainer.saleMarkupPercent >= 0
                      ? `+${activeContainer.saleMarkupPercent}`
                      : String(activeContainer.saleMarkupPercent),
                    depr: activeContainer.buyDepreciationPercent,
                  })}
                </Text>
              </View>
            )}
          </View>

          {/* Живая панель управления процентами во время активной раздачи/торговли */}
          {activeLiveSession && (
            <View style={styles.livePanel}>
              <View style={styles.livePanelHeader}>
                <Text style={styles.livePanelTitle}>
                  {tLootTrade(
                    activeLiveSession.kind === CONTAINER_KIND.MERCHANT
                      ? 'livePanel.activeTitleMerchant'
                      : 'livePanel.activeTitleLoot',
                  )}
                </Text>
                <Text style={styles.livePanelTarget}>
                  {activeLiveSession.targetType === 'room'
                    ? tLootTrade('livePanel.issuedToRoom')
                    : formatLootTrade(tLootTrade('livePanel.issuedToCharacter'), {
                        name: activeLiveSession.targetCharacterName || activeLiveSession.targetCharacterId,
                      })}
                </Text>
              </View>

              {activeLiveSession.kind === CONTAINER_KIND.MERCHANT && (
                <>
                  <Text style={styles.liveScopeLabel}>{tLootTrade('livePanel.rateScopeLabel')}</Text>
                  <View style={styles.scopeChipsRow}>
                    <TouchableOpacity
                      style={[styles.scopeChip, rateScopeCharId === null && styles.scopeChipActive]}
                      onPress={() => setRateScopeCharId(null)}
                    >
                      <Text style={[
                        styles.scopeChipText,
                        rateScopeCharId === null && styles.scopeChipTextActive,
                      ]}>
                        {tLootTrade('livePanel.scopeAll')}
                      </Text>
                    </TouchableOpacity>
                    {activeContainerRoomCharacters.map((char) => {
                      const hasPersonal = Boolean(activeLiveSession.characterOverrides?.[char.id]);
                      const selected = rateScopeCharId === char.id;
                      return (
                        <TouchableOpacity
                          key={char.id}
                          style={[styles.scopeChip, selected && styles.scopeChipActive]}
                          onPress={() => setRateScopeCharId(char.id)}
                        >
                          <Text style={[
                            styles.scopeChipText,
                            selected && styles.scopeChipTextActive,
                          ]}>
                            {char.name}{hasPersonal ? ` (${tLootTrade('livePanel.scopePersonalBadge')})` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {rateScopeCharId && activeLiveSession.characterOverrides?.[rateScopeCharId] && (
                      <TouchableOpacity
                        style={styles.scopeChip}
                        onPress={() => applyLiveMerchantRates({ resetPersonal: true })}
                      >
                        <Text style={styles.scopeChipText}>{tLootTrade('livePanel.resetPersonal')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.liveControlsGrid}>
                    <View style={styles.liveControlBox}>
                      <Text style={styles.liveControlLabel}>{tLootTrade('livePanel.saleMarkupControl')}</Text>
                      <View style={styles.liveStepperRow}>
                        <TouchableOpacity style={styles.liveStepBtn} onPress={() => stepLiveRate('sale', -5)}>
                          <Text style={styles.liveStepBtnText}>−5</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.liveStepBtn} onPress={() => stepLiveRate('sale', -1)}>
                          <Text style={styles.liveStepBtnText}>−1</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.liveStepInput}
                          value={liveSaleInput}
                          onChangeText={setLiveSaleInput}
                          keyboardType="numbers-and-punctuation"
                        />
                        <TouchableOpacity style={styles.liveStepBtn} onPress={() => stepLiveRate('sale', 1)}>
                          <Text style={styles.liveStepBtnText}>+1</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.liveStepBtn} onPress={() => stepLiveRate('sale', 5)}>
                          <Text style={styles.liveStepBtnText}>+5</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.liveControlBox}>
                      <Text style={styles.liveControlLabel}>{tLootTrade('livePanel.buyDeprControl')}</Text>
                      <View style={styles.liveStepperRow}>
                        <TouchableOpacity style={styles.liveStepBtn} onPress={() => stepLiveRate('depr', -5)}>
                          <Text style={styles.liveStepBtnText}>−5</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.liveStepBtn} onPress={() => stepLiveRate('depr', -1)}>
                          <Text style={styles.liveStepBtnText}>−1</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.liveStepInput}
                          value={liveDeprInput}
                          onChangeText={setLiveDeprInput}
                          keyboardType="number-pad"
                        />
                        <TouchableOpacity style={styles.liveStepBtn} onPress={() => stepLiveRate('depr', 1)}>
                          <Text style={styles.liveStepBtnText}>+1</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.liveStepBtn} onPress={() => stepLiveRate('depr', 5)}>
                          <Text style={styles.liveStepBtnText}>+5</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.liveControlBox}>
                      <Text style={styles.liveControlLabel}>{tLootTrade('livePanel.merchantCapsControl')}</Text>
                      <View style={styles.liveStepperRow}>
                        <TextInput
                          style={[styles.liveStepInput, { width: 78 }]}
                          value={liveCapsInput}
                          onChangeText={setLiveCapsInput}
                          keyboardType="number-pad"
                        />
                        <TouchableOpacity
                          style={styles.liveApplyBtn}
                          onPress={() => applyLiveMerchantRates()}
                        >
                          <Text style={styles.liveApplyBtnText}>{tLootTrade('livePanel.applyRates')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {Boolean(rollBanner) && (
            <View style={styles.rollBanner}>
              <Text style={styles.rollBannerText}>{rollBanner}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.addItemPrimaryBtn}
            onPress={() => {
              setCatalogFeedback('');
              setCatalogOpen(true);
            }}
          >
            <Text style={styles.addItemPrimaryBtnText}>{tLootTrade('detail.addItem')}</Text>
          </TouchableOpacity>

          <ScrollView style={styles.itemsListContainer}>
            {(activeContainer.items || []).length === 0 ? (
              <Text style={styles.emptyListText}>{tLootTrade('detail.emptyItems')}</Text>
            ) : (
              activeContainer.items.map((entry) => {
                const isMerchant = activeContainer.kind === CONTAINER_KIND.MERCHANT;
                const shopPrice = isMerchant
                  ? computeMerchantSellPriceToPlayer(entry, {
                      saleMarkupPercent: activeContainer.saleMarkupPercent,
                      capCollectorPercent: 0,
                    })
                  : 0;
                return (
                  <View key={entry.entryId} style={styles.itemRow}>
                    <View style={styles.itemRowMain}>
                      <View style={styles.itemRowTitleLine}>
                        <Text style={styles.itemRowIcon}>{getItemIcon(entry.itemType)}</Text>
                        <Text style={styles.itemRowName}>{entry.name}</Text>
                      </View>
                      <View style={styles.itemRowSub}>
                        <Text style={styles.itemRowSubText}>
                          {formatLootTrade(tLootTrade('detail.qtyPieces'), { qty: entry.quantity })}
                        </Text>
                        {entry.itemType !== 'caps' && (
                          <Text style={styles.itemRowSubText}>
                            {formatLootTrade(tLootTrade('detail.baseCost'), { cost: entry.cost })}
                          </Text>
                        )}
                        {isMerchant && entry.markupPercent !== 0 && (
                          <Text style={styles.itemRowSubText}>
                            {formatLootTrade(tLootTrade('detail.itemMarkup'), {
                              markup: entry.markupPercent > 0 ? `+${entry.markupPercent}` : entry.markupPercent,
                            })}
                          </Text>
                        )}
                        {isMerchant && (
                          <Text style={styles.itemRowPriceHighlight}>
                            {formatLootTrade(tLootTrade('detail.shopPrice'), { price: shopPrice })}
                          </Text>
                        )}
                        {entry.weight > 0 && (
                          <Text style={styles.itemRowSubText}>
                            {formatLootTrade(tLootTrade('detail.weight'), {
                              weight: Number((entry.weight * entry.quantity).toFixed(2)),
                            })}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.itemRowControls}>
                      <TouchableOpacity
                        style={styles.itemRowSmallBtn}
                        onPress={() => handleStepRowQty(entry, -1)}
                      >
                        <Text style={styles.itemRowSmallBtnText}>−</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.itemRowSmallBtn}
                        onPress={() => handleStepRowQty(entry, 1)}
                      >
                        <Text style={styles.itemRowSmallBtnText}>+</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.itemRowSmallBtn}
                        onPress={() => setEditingEntry(entry)}
                      >
                        <Text style={styles.itemRowSmallBtnText}>{tLootTrade('detail.editItem')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.itemRowSmallBtn, styles.itemRowDeleteBtn]}
                        onPress={() => handleRemoveRow(entry.entryId)}
                      >
                        <Text style={styles.itemRowDeleteBtnText}>{tLootTrade('detail.removeItem')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* Модалки создания/правки, каталога, правки строки и выдачи */}
      <ContainerFormModal
        visible={Boolean(formModal)}
        kind={formModal?.kind || CONTAINER_KIND.LOOT}
        initialContainer={formModal?.initialContainer || null}
        availableRooms={availableRooms}
        onSave={handleSaveContainerForm}
        onClose={() => setFormModal(null)}
      />

      <ContainerCatalogModal
        visible={catalogOpen}
        isMerchant={activeContainer?.kind === CONTAINER_KIND.MERCHANT}
        merchantSaleMarkupPercent={activeContainer?.saleMarkupPercent || 0}
        feedbackMessage={catalogFeedback}
        onPickConfiguredItem={handleAddCatalogItem}
        onClose={() => setCatalogOpen(false)}
      />

      <ContainerItemConfigModal
        visible={Boolean(editingEntry)}
        item={editingEntry}
        isMerchant={activeContainer?.kind === CONTAINER_KIND.MERCHANT}
        merchantSaleMarkupPercent={activeContainer?.saleMarkupPercent || 0}
        isEditing
        onSave={handleSaveEditedRow}
        onClose={() => setEditingEntry(null)}
      />

      <IssueContainerModal
        visible={Boolean(issueTargetContainer)}
        container={issueTargetContainer}
        roomName={issueTargetContainer ? (roomByCode[issueTargetContainer.roomCode]?.name || '') : ''}
        roomCharacters={issueRoomCharacters}
        busy={issueBusy}
        onConfirmIssue={handleConfirmIssue}
        onClose={() => setIssueTargetContainer(null)}
      />
    </View>
  );
}
