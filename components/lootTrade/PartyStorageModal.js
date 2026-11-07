/**
 * Патч 518 — «Общее хранилище» по слову владельца:
 *
 * «У мастера отдельная карточка, у игроков кнопка в инвентаре. Мастер может в
 * общее хранилище транслировать ключи и просматривать склад, как список
 * предметов в инвентаре, но без кнопок действий и параметров. Не может
 * забрать оттуда предметы или внести их. Игрок открывая общее хранилище видит
 * модалку двупанельную по дизайну торговца ... Юзер может переносить от себя
 * и к себе предметы, списания по кнопке, аналогично торговцу. Пока кнопка не
 * нажата, товары не перенесены».
 *
 * Патч 556 — уточнение владельца: «Оно должно было выглядеть и работать по
 * аналогии с экраном торговца. Только без функций отслеживания цен и крышек.
 * Т.е обмен без денег». Поэтому окно игрока собрано из ТЕХ ЖЕ каркасов, что
 * двухпанельное окно торговца (`PlayerLootTradeOverlay`): шапка с иконкой и
 * кнопкой «Закрыть», переключатель панелей на телефоне, две панели с буфером
 * внутри каждой, нижняя полоса с «Очистить» и «Перенести». Цены, наценки и
 * касса не показываются и не считаются — только вещи, которые переходят из
 * рук в руки. Пока не нажата «Перенести», ни сервер, ни инвентарь не меняются.
 */

import React, { useEffect, useMemo, useState } from 'react';
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
import useRoomStore from '../../src/room/roomStore';
import * as db from '../../db';
import { saveCharacter, loadCharacter } from '../../src/utils/characterFileTransfer';
import {
  createStorageExportPayload,
  parseStorageImportPayload,
  storageExportFileName,
} from '../../domain/partyStorageTransfer';
import { tInventory, formatInventoryText } from '../screens/InventoryScreen/logic/inventoryI18n';
import { renderTextWithIcons } from '../../modules/fallout/screens/WeaponsAndArmorScreen/textUtils';
import { showRawAlert } from '../alerts/alertService';
import { tLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { useLocale } from '../../i18n/locale';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { resolveItem, getItemPrice, getItemWeight } from '../../domain/resolveItem';
import itemStacking from '../../domain/itemStacking.js';
import { getItemIcon } from './itemIcons';
import { tradeOverlayStyles as trade } from './tradeOverlayStyles';

// Патч 522: предмет на складе — ТОТ ЖЕ предмет, что в инвентаре. Поля больше
// не обрезаются: моды, заряды, прочность, уникальные качества, id экземпляра и
// ключ стака едут вместе с ним. Сбрасывается только состояние РАЗМЕЩЕНИЯ
// (экипировано/заблокировано) и количество — оно передаётся отдельным полем
// операции. Цена и вес берутся от обогащённого предмета, то есть с модами.
const pickItemSnapshot = (item) => {
  const src = item || {};
  const resolved = resolveItem({ ...src }, getEquipmentCatalog()) || src;
  const effectiveCost = itemStacking.effectiveItemCost({ effectiveCost: getItemPrice(resolved) });
  const effectiveWeight = itemStacking.effectiveItemWeight({ effectiveWeight: getItemWeight(resolved) });
  return itemStacking.itemTransferSnapshot({
    ...src,
    name: String(src.name || 'Предмет'),
    itemType: String(src.itemType || 'misc'),
    cost: src.cost ?? effectiveCost,
    weight: src.weight ?? effectiveWeight,
  }, { effectiveCost, effectiveWeight });
};

const PartyStorageModal = ({
  visible,
  inventoryItems = [],
  gmView = false,
  onClose,
  onDepositLocal,
  onWithdrawLocal,
}) => {
  useLocale();
  const { width: windowWidth } = useWindowDimensions();
  const isWideLayout = windowWidth >= 680;
  const rooms = useRoomStore((state) => state.rooms);
  const [busy, setBusy] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  // Отложенные операции. Пока не нажата «Перенести», сервер и локальный
  // инвентарь не меняются.
  const [giveBuffer, setGiveBuffer] = useState({}); // { [itemId]: qty }
  const [takeBuffer, setTakeBuffer] = useState({}); // { [entryId]: qty }
  const [catalog, setCatalog] = useState([]);
  // Как в окне торговца: на узком экране панели показываются по одной.
  const [mobileTab, setMobileTab] = useState('player');

  const room = useMemo(() => {
    const candidates = Object.entries(rooms || {}).filter(([, value]) => value?.partyStorage);
    const entry = candidates.find(([, value]) => (
      gmView ? value.role === 'gm' : value.role === 'player'
    )) || candidates[0];
    if (!entry) return null;
    return {
      code: entry[0],
      role: entry[1].role,
      storage: entry[1].partyStorage || { revision: 0, entries: [] },
    };
  }, [rooms, gmView]);

  const isGm = gmView || room?.role === 'gm';
  const entries = room?.storage?.entries || [];
  const items = entries.filter((entry) => entry.kind !== 'keyItem');
  const keys = entries.filter((entry) => entry.kind === 'keyItem');
  const selectedKey = keys.find((entry) => entry.entryId === selectedKeyId) || null;
  const writable = Boolean(room?.storage?.gmOnline) && !isGm;

  useEffect(() => {
    if (!visible) return;
    setGiveBuffer({});
    setTakeBuffer({});
    setSelectedKeyId(null);
    setMobileTab('player');
    if (isGm) {
      void db.getGmKeyItems().then((list) => setCatalog(list || [])).catch(() => setCatalog([]));
    }
  }, [visible, isGm]);

  const itemIdOf = (item, index = 0) => String(item?.id || item?.name || index);
  const entryById = (entryId) => entries.find((entry) => entry.entryId === entryId) || null;
  const nameOfBufferedItem = (id) => (inventoryItems || [])
    .find((it) => itemIdOf(it) === id)?.name || id;
  const quantityOf = (item) => Math.max(1, Number(item?.quantity) || 1);

  const addGive = (item, delta = 1) => {
    if (!writable || busy || !item) return;
    const id = itemIdOf(item);
    const max = quantityOf(item);
    setGiveBuffer((prev) => {
      const next = Math.min(max, Math.max(0, (prev[id] || 0) + delta));
      return { ...prev, [id]: next };
    });
  };

  const addTake = (entry, delta = 1) => {
    if (!writable || busy || !entry || entry.kind === 'keyItem') return;
    const max = Math.max(1, Number(entry.quantity) || 1);
    setTakeBuffer((prev) => {
      const next = Math.min(max, Math.max(0, (prev[entry.entryId] || 0) + delta));
      return { ...prev, [entry.entryId]: next };
    });
  };

  const giveLines = Object.entries(giveBuffer).filter(([, qty]) => qty > 0);
  const takeLines = Object.entries(takeBuffer).filter(([, qty]) => qty > 0);
  const giveCount = giveLines.reduce((sum, [, qty]) => sum + qty, 0);
  const takeCount = takeLines.reduce((sum, [, qty]) => sum + qty, 0);
  const bufferCount = giveCount + takeCount;
  const canCommit = writable && !busy && bufferCount > 0;

  const commit = async () => {
    if (!room || !canCommit) return;
    const deposits = Object.entries(giveBuffer)
      .map(([id, qty]) => {
        const item = (inventoryItems || []).find((it) => itemIdOf(it) === id);
        return item ? { item: pickItemSnapshot(item), quantity: qty, name: item.name } : null;
      })
      .filter(Boolean);
    const withdrawals = Object.entries(takeBuffer)
      .map(([entryId, quantity]) => ({ entryId, quantity }));
    if (deposits.length === 0 && withdrawals.length === 0) return;
    setBusy(true);
    try {
      const result = await useRoomStore.getState().transferPartyStorage({
        code: room.code,
        deposits,
        withdrawals,
      });
      // Локальный инвентарь меняется ТОЛЬКО после ответа сервера.
      for (const { item, quantity } of deposits) {
        if (item?.id) onDepositLocal?.(item.id, quantity);
      }
      for (const { entryId, quantity } of withdrawals) {
        const entry = entries.find((e) => e.entryId === entryId);
        if (entry) onWithdrawLocal?.(entry.item, quantity);
      }
      setGiveBuffer({});
      setTakeBuffer({});
    } catch (error) {
      // Патч 522: игрового «склад заполнен» больше нет. Ошибка связи/защиты
      // сервера показывается как есть, без выдуманной причины.
      showRawAlert({
        title: tInventory('screen.storage.failed'),
        message: error?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const issueKey = async (record) => {
    if (!room || busy || !room.storage.gmOnline) return;
    setBusy(true);
    try {
      await useRoomStore.getState().addKeyItemToStorage({
        code: room.code,
        keyItemId: record.id,
        name: record.name,
        description: record.description || '',
      });
      showRawAlert({ title: tInventory('screen.storage.issuedKey') });
    } catch (error) {
      showRawAlert({ title: tLootTrade('keyItems.failed'), message: error?.message });
    } finally {
      setBusy(false);
    }
  };

  const exportJson = async () => {
    if (!room) return;
    const payload = createStorageExportPayload({
      code: room.code,
      storage: room.storage,
      exportedBy: isGm ? 'gm' : 'player',
    });
    const result = await saveCharacter(payload, storageExportFileName(room.code));
    if (result?.success) showRawAlert({ title: tInventory('screen.storage.exportDone') });
  };

  const importJson = async () => {
    if (!room) return;
    const raw = await loadCharacter();
    const parsed = parseStorageImportPayload(raw);
    if (parsed.error || !parsed.storage) {
      showRawAlert({ title: tInventory('screen.storage.importError') });
      return;
    }
    try {
      await db.saveRoomStorage(room.code, parsed.storage);
      if (isGm) {
        await useRoomStore.getState().restorePartyStorage({ code: room.code, storage: parsed.storage });
        showRawAlert({ title: tInventory('screen.storage.importDone') });
      } else {
        showRawAlert({
          title: tInventory('screen.storage.importDone'),
          message: tInventory('screen.storage.importPlayerHint'),
        });
      }
    } catch (error) {
      showRawAlert({ title: tInventory('screen.storage.importError'), message: error?.message });
    }
  };

  if (!visible) return null;

  // ── Панель «Предметы персонажа»: что можно положить на склад ──

  const renderPlayerPane = () => (
    <View style={[trade.pane, isWideLayout && trade.paneHalf]}>
      <View style={trade.paneHeader}>
        <Text style={trade.paneHeaderTitle}>{tInventory('screen.storage.yourItems')}</Text>
      </View>

      <ScrollView style={trade.paneScroll}>
        {/* Серый курсив: уже отложено к себе со склада (снимется по «Перенести») */}
        <View style={trade.bufferBox}>
          <Text style={trade.bufferHeader}>{tInventory('screen.storage.bufferTake')}</Text>
          {takeLines.length === 0 ? (
            <Text style={trade.emptyText}>—</Text>
          ) : takeLines.map(([entryId, qty]) => (
            <TouchableOpacity
              key={`buf-take-${entryId}`}
              testID={`storage-buffer-take-${entryId}`}
              style={trade.bufferRow}
              onPress={() => addTake(entryById(entryId), -1)}
            >
              <Text style={trade.bufferItalicText} numberOfLines={1}>
                {`+ ${entryById(entryId)?.name || entryId} ×${qty}`}
              </Text>
              <TouchableOpacity
                testID={`storage-buffer-clear-take-${entryId}`}
                style={trade.bufferClearAllBtn}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  addTake(entryById(entryId), -qty);
                }}
              >
                <Text style={trade.bufferClearAllText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {(inventoryItems || []).length === 0 ? (
          <Text style={trade.emptyText}>{tInventory('screen.storage.empty')}</Text>
        ) : (
          (inventoryItems || []).map((item, index) => {
            const id = itemIdOf(item, index);
            const buffered = giveBuffer[id] || 0;
            const remaining = quantityOf(item) - buffered;
            if (remaining <= 0) return null;
            return (
              <TouchableOpacity
                key={id}
                testID={`storage-give-${id}`}
                style={[trade.tradeRow, !writable && trade.disabledBtn]}
                disabled={busy || !writable}
                onPress={() => addGive(item)}
              >
                <View style={trade.tradeRowInfo}>
                  <Text style={trade.tradeRowName} numberOfLines={1}>
                    {`${getItemIcon(item.itemType)} ${item.name} ×${remaining}`}
                  </Text>
                </View>
                <View style={trade.tradeRowBtns}>
                  <TouchableOpacity
                    testID={`storage-give-one-${id}`}
                    style={trade.miniMoveBtn}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      addGive(item);
                    }}
                  >
                    <Text style={trade.miniMoveBtnText}>{tInventory('screen.storage.depositOne')}</Text>
                  </TouchableOpacity>
                  {remaining > 1 && (
                    <TouchableOpacity
                      testID={`storage-give-all-${id}`}
                      style={trade.miniMoveAllBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        addGive(item, remaining);
                      }}
                    >
                      <Text style={trade.miniMoveBtnText}>{tInventory('screen.storage.depositAll')}</Text>
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

  // ── Панель «Общее хранилище»: что можно забрать ──

  const renderStoragePane = () => (
    <View style={[trade.pane, isWideLayout && trade.paneHalf]}>
      <View style={trade.paneHeader}>
        <Text style={trade.paneHeaderTitle}>{tInventory('screen.storage.title')}</Text>
      </View>

      <ScrollView style={trade.paneScroll}>
        {/* Серый курсив: уже отложено на склад (снимется по «Перенести») */}
        <View style={trade.bufferBox}>
          <Text style={trade.bufferHeader}>{tInventory('screen.storage.bufferGive')}</Text>
          {giveLines.length === 0 ? (
            <Text style={trade.emptyText}>—</Text>
          ) : giveLines.map(([id, qty]) => (
            <TouchableOpacity
              key={`buf-give-${id}`}
              testID={`storage-buffer-give-${id}`}
              style={trade.bufferRow}
              onPress={() => {
                const item = (inventoryItems || []).find((it) => itemIdOf(it) === id);
                addGive(item, -1);
              }}
            >
              <Text style={trade.bufferItalicText} numberOfLines={1}>
                {`+ ${nameOfBufferedItem(id)} ×${qty}`}
              </Text>
              <TouchableOpacity
                testID={`storage-buffer-clear-give-${id}`}
                style={trade.bufferClearAllBtn}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  const item = (inventoryItems || []).find((it) => itemIdOf(it) === id);
                  addGive(item, -qty);
                }}
              >
                <Text style={trade.bufferClearAllText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {items.length === 0 ? (
          <Text style={trade.emptyText}>{tInventory('screen.storage.empty')}</Text>
        ) : (
          items.map((entry) => {
            const buffered = takeBuffer[entry.entryId] || 0;
            const remaining = Math.max(1, Number(entry.quantity) || 1) - buffered;
            if (remaining <= 0) return null;
            return (
              <TouchableOpacity
                key={entry.entryId}
                testID={`storage-take-${entry.entryId}`}
                style={[trade.tradeRow, !writable && trade.disabledBtn]}
                disabled={busy || !writable}
                onPress={() => addTake(entry)}
              >
                <View style={trade.tradeRowInfo}>
                  <Text style={trade.tradeRowName} numberOfLines={1}>
                    {`${getItemIcon(entry.itemType)} ${entry.name} ×${remaining}`}
                  </Text>
                </View>
                <View style={trade.tradeRowBtns}>
                  <TouchableOpacity
                    testID={`storage-take-one-${entry.entryId}`}
                    style={trade.miniMoveBtn}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      addTake(entry);
                    }}
                  >
                    <Text style={trade.miniMoveBtnText}>{tInventory('screen.storage.withdrawOne')}</Text>
                  </TouchableOpacity>
                  {remaining > 1 && (
                    <TouchableOpacity
                      testID={`storage-take-all-${entry.entryId}`}
                      style={trade.miniMoveAllBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        addTake(entry, remaining);
                      }}
                    >
                      <Text style={trade.miniMoveBtnText}>{tInventory('screen.storage.withdrawAll')}</Text>
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

  // ── Ключи: запись остаётся общей, забрать её нельзя ──

  const renderKeysBlock = () => (
    <View style={localStyles.keysBox}>
      <Text style={[trade.paneHeaderTitle, localStyles.keysTitle]}>
        {tLootTrade('keyItems.title')}
      </Text>
      {keys.length === 0
        ? <Text style={trade.emptyText}>{tInventory('screen.storage.noKeyItems')}</Text>
        : keys.map((key) => (
          <TouchableOpacity
            key={key.entryId}
            testID={`storage-key-${key.keyItemId}`}
            style={localStyles.keyRow}
            onPress={() => setSelectedKeyId((prev) => (prev === key.entryId ? null : key.entryId))}
          >
            <Text style={localStyles.keyName}>{key.name}</Text>
            <Text style={localStyles.keyRead}>{tInventory('screen.storage.readKey')}</Text>
          </TouchableOpacity>
        ))}
      {selectedKey && (
        <View style={localStyles.keyCard}>
          <Text style={localStyles.keyCardTitle}>{selectedKey.name}</Text>
          {renderTextWithIcons(
            selectedKey.description || tLootTrade('keyItems.previewEmpty'),
            localStyles.keyCardText,
          )}
          <Text style={localStyles.keyStays}>{tInventory('screen.storage.keyStays')}</Text>
        </View>
      )}
    </View>
  );

  // ── Окно игрока: обмен без денег ──

  const renderPlayerBody = () => (
    <>
      {!isWideLayout && (
        <View style={trade.mobileTabSwitch}>
          <TouchableOpacity
            testID="storage-tab-player"
            style={[trade.mobileTabBtn, mobileTab === 'player' && trade.mobileTabBtnActive]}
            onPress={() => setMobileTab('player')}
          >
            <Text style={[trade.mobileTabText, mobileTab === 'player' && trade.mobileTabTextActive]}>
              {`${tInventory('screen.storage.yourItems')}${giveCount ? ` +${giveCount}` : ''}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="storage-tab-storage"
            style={[trade.mobileTabBtn, mobileTab === 'storage' && trade.mobileTabBtnActive]}
            onPress={() => setMobileTab('storage')}
          >
            <Text style={[trade.mobileTabText, mobileTab === 'storage' && trade.mobileTabTextActive]}>
              {`${tInventory('screen.storage.title')}${takeCount ? ` +${takeCount}` : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={trade.twoPanesContainer}>
        {isWideLayout ? (
          <>
            {renderPlayerPane()}
            {renderStoragePane()}
          </>
        ) : (
          mobileTab === 'player' ? renderPlayerPane() : renderStoragePane()
        )}
      </View>

      {renderKeysBlock()}

      <View style={trade.barterFooter}>
        <View style={trade.barterBalanceCol}>
          <Text style={trade.barterBalanceText}>
            {bufferCount > 0
              ? formatInventoryText(tInventory('screen.storage.exchangeSummary'), {
                give: giveCount,
                take: takeCount,
              })
              : tInventory('screen.storage.exchangeEven')}
          </Text>
          <Text style={trade.barterWarnText}>
            {tInventory('screen.storage.pendingHint')}
          </Text>
        </View>

        <View style={trade.barterFooterBtns}>
          {bufferCount > 0 && (
            <TouchableOpacity
              testID="storage-clear-buffer-button"
              style={trade.clearBufBtn}
              disabled={busy}
              onPress={() => { setGiveBuffer({}); setTakeBuffer({}); }}
            >
              <Text style={trade.clearBufBtnText}>{tInventory('screen.storage.clearBuffer')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            testID="storage-commit-button"
            style={[trade.commitTradeBtn, !canCommit && trade.disabledBtn]}
            disabled={!canCommit}
            onPress={() => void commit()}
          >
            <Text style={trade.commitTradeBtnText}>{tInventory('screen.storage.commit')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  // ── Окно Мастера: только просмотр состава и трансляция ключей ──

  const renderGmBody = () => (
    <>
      <Text style={trade.modalDesc}>{tInventory('screen.storage.gmNoActions')}</Text>

      <View style={trade.twoPanesContainer}>
        <View style={[trade.pane, isWideLayout && trade.paneHalf]}>
          <View style={trade.paneHeader}>
            <Text style={trade.paneHeaderTitle}>{tInventory('screen.storage.title')}</Text>
          </View>
          <ScrollView style={trade.paneScroll}>
            {items.length === 0 ? (
              <Text style={trade.emptyText}>{tInventory('screen.storage.empty')}</Text>
            ) : (
              items.map((entry) => (
                <View
                  key={entry.entryId}
                  testID={`gm-storage-item-${entry.entryId}`}
                  style={trade.tradeRow}
                >
                  <View style={trade.tradeRowInfo}>
                    <Text style={trade.tradeRowName} numberOfLines={1}>
                      {`${getItemIcon(entry.itemType)} ${entry.name} ×${entry.quantity}`}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>

        <View style={[trade.pane, isWideLayout && trade.paneHalf]}>
          <View style={trade.paneHeader}>
            <Text style={trade.paneHeaderTitle}>{tLootTrade('keyItems.title')}</Text>
          </View>
          <ScrollView style={trade.paneScroll}>
            {keys.length === 0
              ? <Text style={trade.emptyText}>{tInventory('screen.storage.noKeyItems')}</Text>
              : keys.map((key) => (
                <TouchableOpacity
                  key={key.entryId}
                  testID={`storage-key-${key.keyItemId}`}
                  style={localStyles.keyRow}
                  onPress={() => setSelectedKeyId((prev) => (prev === key.entryId ? null : key.entryId))}
                >
                  <Text style={localStyles.keyName}>{key.name}</Text>
                  <Text style={localStyles.keyRead}>{tInventory('screen.storage.readKey')}</Text>
                </TouchableOpacity>
              ))}
            {selectedKey && (
              <View style={localStyles.keyCard}>
                <Text style={localStyles.keyCardTitle}>{selectedKey.name}</Text>
                {renderTextWithIcons(
                  selectedKey.description || tLootTrade('keyItems.previewEmpty'),
                  localStyles.keyCardText,
                )}
              </View>
            )}

            {/* Трансляция ключей — единственное действие Мастера со складом. */}
            <Text style={[localStyles.keysTitle, { marginTop: 10 }]}>
              {tInventory('screen.storage.issueKey')}
            </Text>
            {catalog.length === 0
              ? <Text style={trade.emptyText}>{tInventory('screen.storage.noKeyItems')}</Text>
              : catalog.map((record) => (
                <View key={record.id} testID={`gm-issue-key-${record.id}`} style={localStyles.issueRow}>
                  <Text style={localStyles.keyName} numberOfLines={1}>{record.name}</Text>
                  <TouchableOpacity
                    style={localStyles.issueBtn}
                    disabled={busy || !room.storage.gmOnline}
                    onPress={() => void issueKey(record)}
                  >
                    <Text style={localStyles.issueBtnText}>{tInventory('screen.storage.issueKey')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
          </ScrollView>
        </View>
      </View>
    </>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[trade.modalBackdrop, isWideLayout && trade.backdropWide]}>
        <View style={trade.merchantModalCard}>
          <View style={trade.modalHeader}>
            <View style={trade.modalTitleRow}>
              <MaterialCommunityIcons name="warehouse" size={23} color="#f0e68c" />
              <Text style={trade.modalTitle}>
                {tInventory(isGm ? 'screen.storage.gmTitle' : 'screen.storage.title')}
              </Text>
            </View>
            <View style={trade.headerActionsRow}>
              <TouchableOpacity
                testID="storage-close-button"
                style={trade.closeContainerBtn}
                onPress={onClose}
              >
                <Text style={trade.closeContainerBtnText}>{tLootTrade('player.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!room ? (
            <Text style={[trade.emptyText, localStyles.noRoom]}>
              {tInventory('screen.storage.noRoom')}
            </Text>
          ) : (
            <>
              {isGm ? renderGmBody() : renderPlayerBody()}

              <View style={localStyles.transferRow}>
                <TouchableOpacity
                  testID="storage-export-button"
                  style={trade.clearBufBtn}
                  onPress={() => { void exportJson(); }}
                >
                  <Text style={trade.clearBufBtnText}>{tInventory('screen.storage.export')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="storage-import-button"
                  style={trade.clearBufBtn}
                  onPress={() => { void importJson(); }}
                >
                  <Text style={trade.clearBufBtnText}>{tInventory('screen.storage.import')}</Text>
                </TouchableOpacity>
              </View>

              {!room?.storage?.gmOnline && (
                <Text style={[trade.barterErrorText, localStyles.readOnly]}>
                  {tInventory('screen.storage.readOnly')}
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

// Только то, чего нет в общем каркасе торговца: блок ключей и вспомогательные
// строки. Всё остальное — `tradeOverlayStyles`, чтобы окно склада не рисовало
// «похожий, но другой» дизайн.
const localStyles = StyleSheet.create({
  noRoom: { marginTop: 18, marginBottom: 18 },
  readOnly: { textAlign: 'center', marginTop: 10 },
  transferRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  keysBox: {
    borderWidth: 1,
    borderColor: '#29482d',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    maxHeight: 190,
  },
  keysTitle: { marginBottom: 6 },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderColor: '#1c2d20',
  },
  keyName: { flex: 1, color: '#d8e4cc', fontSize: 12 },
  keyRead: { color: '#a4cb77', fontSize: 11, fontWeight: '700' },
  keyCard: { borderWidth: 1, borderColor: '#29482d', borderRadius: 4, padding: 9, marginTop: 6 },
  keyCardTitle: { color: '#93d17a', fontSize: 13, fontWeight: '800', marginBottom: 5 },
  keyCardText: { color: '#c8d4b1', fontSize: 12 },
  keyStays: { color: '#97a392', fontSize: 11, marginTop: 6 },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#1c2d20',
  },
  issueBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#58875d',
    backgroundColor: '#213028',
  },
  issueBtnText: { color: '#a4cb77', fontSize: 11, fontWeight: '700' },
});

export default PartyStorageModal;
