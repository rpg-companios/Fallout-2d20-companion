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
 * Каркас строк, буфера и кнопки подтверждения импортируется из
 * `PlayerLootTradeOverlay` (правило `docs/ui-modals-rules.md`): двухпанельное
 * окно склада не рисует «похожий, но другой» дизайн.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import useRoomStore from '../../src/room/roomStore';
import * as db from '../../db';
import { saveCharacter, loadCharacter } from '../../src/utils/characterFileTransfer';
import {
  createStorageExportPayload,
  parseStorageImportPayload,
  storageExportFileName,
} from '../../domain/partyStorageTransfer';
import { tInventory } from '../screens/InventoryScreen/logic/inventoryI18n';
import { renderTextWithIcons } from '../../modules/fallout/screens/WeaponsAndArmorScreen/textUtils';
import { showRawAlert } from '../alerts/alertService';
import { tLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { useLocale } from '../../i18n/locale';
import { tradeOverlayStyles as trade } from './tradeOverlayStyles';

// В сейве/сторе предмета есть служебные поля, которые не должны уезжать на
// сервер: уникальные id экземпляра, экипировка, ключи стаканья и т.п.
const pickItemSnapshot = (item) => {
  const src = item || {};
  const { uniqueId, equipInstanceId, stackKey, equipped, locked, appliedMods, ...rest } = src;
  return {
    ...rest,
    name: String(src.name || 'Предмет'),
    itemType: String(src.itemType || 'misc'),
    quantity: 1,
    equipped: false,
    locked: false,
  };
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
  const rooms = useRoomStore((state) => state.rooms);
  const [busy, setBusy] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  // Патч 518: отложенные операции. Пока не нажата «Перенести», сервер и
  // локальный инвентарь не меняются.
  const [giveBuffer, setGiveBuffer] = useState({}); // { [itemId]: qty }
  const [takeBuffer, setTakeBuffer] = useState({}); // { [entryId]: qty }
  const [catalog, setCatalog] = useState([]);

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
    if (isGm) {
      void db.getGmKeyItems().then((list) => setCatalog(list || [])).catch(() => setCatalog([]));
    }
  }, [visible, isGm]);

  const addGive = (item) => {
    if (!writable || busy) return;
    const id = String(item?.id || item?.name || '');
    if (!id) return;
    const max = Math.max(1, Number(item?.quantity) || 1);
    setGiveBuffer((prev) => ({ ...prev, [id]: Math.min(max, (prev[id] || 0) + 1) }));
  };

  const addTake = (entry) => {
    if (!writable || busy || entry?.kind === 'keyItem') return;
    const max = Math.max(1, Number(entry?.quantity) || 1);
    setTakeBuffer((prev) => ({ ...prev, [entry.entryId]: Math.min(max, (prev[entry.entryId] || 0) + 1) }));
  };

  const bufferCount = Object.values(giveBuffer).reduce((a, b) => a + b, 0)
    + Object.values(takeBuffer).reduce((a, b) => a + b, 0);
  const canCommit = writable && !busy && bufferCount > 0;

  const commit = async () => {
    if (!room || !canCommit) return;
    const deposits = Object.entries(giveBuffer)
      .map(([id, qty]) => {
        const item = (inventoryItems || []).find((it) => String(it?.id || it?.name || '') === id);
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
      showRawAlert({ title: tInventory('screen.storage.failed'), message: error?.message });
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

  const bufferedGive = Object.entries(giveBuffer).filter(([, qty]) => qty > 0);
  const bufferedTake = Object.entries(takeBuffer).filter(([, qty]) => qty > 0);

  return (
    <Modal visible transparent animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.window}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {tInventory(isGm ? 'screen.storage.gmTitle' : 'screen.storage.title')}
            </Text>
            <TouchableOpacity accessibilityRole="button" style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          {!room ? (
            <Text style={styles.hint}>{tInventory('screen.storage.noRoom')}</Text>
          ) : isGm ? (
            <>
              {/* Мастер: список как в инвентаре, но БЕЗ кнопок и параметров. */}
              <ScrollView style={localStyles.gmList}>
                {items.length === 0
                  ? <Text style={styles.hint}>{tInventory('screen.storage.empty')}</Text>
                  : items.map((entry) => (
                    <View key={entry.entryId} testID={`gm-storage-item-${entry.entryId}`} style={localStyles.gmRow}>
                      <Text style={localStyles.gmRowName} numberOfLines={1}>
                        {`${entry.name} × ${entry.quantity}`}
                      </Text>
                    </View>
                  ))}
              </ScrollView>
              <Text style={styles.hint}>{tInventory('screen.storage.gmNoActions')}</Text>

              <Text style={styles.keysTitle}>{tLootTrade('keyItems.title')}</Text>
              {keys.length === 0
                ? <Text style={styles.hint}>{tInventory('screen.storage.noKeyItems')}</Text>
                : keys.map((key) => (
                  <TouchableOpacity
                    key={key.entryId}
                    testID={`storage-key-${key.keyItemId}`}
                    style={styles.keyRow}
                    onPress={() => setSelectedKeyId((prev) => (prev === key.entryId ? null : key.entryId))}
                  >
                    <Text style={styles.rowName}>{key.name}</Text>
                    <Text style={styles.keyRead}>{tInventory('screen.storage.readKey')}</Text>
                  </TouchableOpacity>
                ))}
              {selectedKey && (
                <View style={styles.keyCard}>
                  <Text style={styles.keyCardTitle}>{selectedKey.name}</Text>
                  {renderTextWithIcons(
                    selectedKey.description || tLootTrade('keyItems.previewEmpty'),
                    styles.keyCardText,
                  )}
                </View>
              )}

              {/* Трансляция ключей — единственное действие Мастера со складом. */}
              <Text style={styles.keysTitle}>{tInventory('screen.storage.issueKey')}</Text>
              <ScrollView style={localStyles.gmKeyCatalog}>
                {catalog.length === 0
                  ? <Text style={styles.hint}>{tInventory('screen.storage.noKeyItems')}</Text>
                  : catalog.map((record) => (
                    <View key={record.id} testID={`gm-issue-key-${record.id}`} style={localStyles.issueRow}>
                      <Text style={localStyles.gmRowName} numberOfLines={1}>{record.name}</Text>
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
            </>
          ) : (
            <>
              {/* Игрок: двупанельный обмен по дизайну торговца, без цен и настроек. */}
              <View style={styles.columns}>
                <View style={styles.column}>
                  <Text style={styles.columnTitle}>{tInventory('screen.storage.yourItems')}</Text>
                  <ScrollView style={styles.list}>
                    {(inventoryItems || []).length === 0
                      ? <Text style={styles.hint}>{tInventory('screen.storage.empty')}</Text>
                      : (inventoryItems || []).map((item, index) => {
                        const id = String(item?.id || item?.name || index);
                        const buffered = giveBuffer[id] || 0;
                        return (
                          <TouchableOpacity
                            key={id}
                            testID={`storage-give-${id}`}
                            style={[trade.tradeRow, !writable && trade.disabledBtn]}
                            disabled={busy || !writable}
                            onPress={() => addGive(item)}
                          >
                            <Text style={trade.tradeRowName} numberOfLines={1}>
                              {`${item.name}${buffered ? ` · ${buffered}` : ''}`}
                            </Text>
                            <Text style={styles.rowAction}>{tInventory('screen.storage.bufferGive')}</Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>

                <View style={styles.column}>
                  <Text style={styles.columnTitle}>{tInventory('screen.storage.title')}</Text>
                  <ScrollView style={styles.list}>
                    {items.length === 0
                      ? <Text style={styles.hint}>{tInventory('screen.storage.empty')}</Text>
                      : items.map((entry) => {
                        const buffered = takeBuffer[entry.entryId] || 0;
                        return (
                          <TouchableOpacity
                            key={entry.entryId}
                            testID={`storage-take-${entry.entryId}`}
                            style={[trade.tradeRow, !writable && trade.disabledBtn]}
                            disabled={busy || !writable}
                            onPress={() => addTake(entry)}
                          >
                            <Text style={trade.tradeRowName} numberOfLines={1}>
                              {`${entry.name} × ${entry.quantity}${buffered ? ` · ${buffered}` : ''}`}
                            </Text>
                            <Text style={styles.rowAction}>{tInventory('screen.storage.bufferTake')}</Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>
              </View>

              {/* Буфер: клик по строке возвращает предмет, как у торговца. */}
              <View style={localStyles.bufferBox}>
                <Text style={trade.bufferHeader}>{tInventory('screen.storage.bufferGive')}</Text>
                {bufferedGive.length === 0
                  ? <Text style={styles.hint}>—</Text>
                  : bufferedGive.map(([id, qty]) => (
                    <TouchableOpacity
                      key={id}
                      testID={`storage-buffer-give-${id}`}
                      style={trade.bufferRow}
                      onPress={() => setGiveBuffer((prev) => ({ ...prev, [id]: 0 }))}
                    >
                      <Text style={trade.bufferItalicText} numberOfLines={1}>
                        {(inventoryItems || []).find((it) => String(it?.id || it?.name || '') === id)?.name || id}
                        {` × ${qty}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                <Text style={trade.bufferHeader}>{tInventory('screen.storage.bufferTake')}</Text>
                {bufferedTake.length === 0
                  ? <Text style={styles.hint}>—</Text>
                  : bufferedTake.map(([entryId, qty]) => (
                    <TouchableOpacity
                      key={entryId}
                      testID={`storage-buffer-take-${entryId}`}
                      style={trade.bufferRow}
                      onPress={() => setTakeBuffer((prev) => ({ ...prev, [entryId]: 0 }))}
                    >
                      <Text style={trade.bufferItalicText} numberOfLines={1}>
                        {`${entries.find((e) => e.entryId === entryId)?.name || entryId} × ${qty}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>

              <Text style={styles.hint}>{tInventory('screen.storage.pendingHint')}</Text>
              <View style={localStyles.commitRow}>
                <TouchableOpacity
                  testID="storage-commit-button"
                  style={[trade.commitTradeBtn, !canCommit && trade.disabledBtn]}
                  disabled={!canCommit}
                  onPress={() => void commit()}
                >
                  <Text style={trade.commitTradeBtnText}>{tInventory('screen.storage.commit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="storage-clear-buffer-button"
                  style={localStyles.clearBtn}
                  disabled={busy || bufferCount === 0}
                  onPress={() => { setGiveBuffer({}); setTakeBuffer({}); }}
                >
                  <Text style={styles.transferButtonText}>{tInventory('screen.storage.clearBuffer')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.keysTitle}>{tLootTrade('keyItems.title')}</Text>
              {keys.length === 0
                ? <Text style={styles.hint}>{tInventory('screen.storage.empty')}</Text>
                : keys.map((key) => (
                  <TouchableOpacity
                    key={key.entryId}
                    testID={`storage-key-${key.keyItemId}`}
                    style={styles.keyRow}
                    onPress={() => setSelectedKeyId((prev) => (prev === key.entryId ? null : key.entryId))}
                  >
                    <Text style={styles.rowName}>{key.name}</Text>
                    <Text style={styles.keyRead}>{tInventory('screen.storage.readKey')}</Text>
                  </TouchableOpacity>
                ))}
              {selectedKey && (
                <View style={styles.keyCard}>
                  <Text style={styles.keyCardTitle}>{selectedKey.name}</Text>
                  {renderTextWithIcons(
                    selectedKey.description || tLootTrade('keyItems.previewEmpty'),
                    styles.keyCardText,
                  )}
                  <Text style={styles.hint}>{tInventory('screen.storage.keyStays')}</Text>
                </View>
              )}
            </>
          )}

          <View style={styles.transferRow}>
            <TouchableOpacity testID="storage-export-button" style={styles.transferButton} onPress={() => { void exportJson(); }}>
              <Text style={styles.transferButtonText}>{tInventory('screen.storage.export')}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="storage-import-button" style={styles.transferButton} onPress={() => { void importJson(); }}>
              <Text style={styles.transferButtonText}>{tInventory('screen.storage.import')}</Text>
            </TouchableOpacity>
          </View>
          {!room?.storage?.gmOnline && <Text style={styles.readOnly}>{tInventory('screen.storage.readOnly')}</Text>}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  window: { width: '100%', maxWidth: 760, maxHeight: '90%', backgroundColor: '#0b140d', borderWidth: 1.5, borderColor: '#42784a', borderRadius: 6, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#29482d', paddingBottom: 9, marginBottom: 10 },
  title: { color: '#93d17a', fontSize: 16, fontWeight: '800' },
  closeButton: { paddingHorizontal: 10, paddingVertical: 2 },
  closeText: { color: '#bdc8b7', fontSize: 22 },
  columns: { flexDirection: 'row', gap: 10, minHeight: 180 },
  column: { flex: 1, borderWidth: 1, borderColor: '#29482d', borderRadius: 5, padding: 8 },
  columnTitle: { color: '#8da38b', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, fontFamily: 'monospace' },
  list: { maxHeight: 240 },
  rowAction: { color: '#93d17a', fontSize: 11, fontWeight: '700' },
  rowName: { flex: 1, color: '#d8e4cc', fontSize: 12 },
  hint: { color: '#97a392', fontSize: 11, textAlign: 'center', marginTop: 8 },
  transferRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  transferButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 4, borderWidth: 1, borderColor: '#58875d', backgroundColor: '#213028' },
  transferButtonText: { color: '#a4cb77', fontSize: 11, fontWeight: '700' },
  readOnly: { color: '#e2a3a3', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  keysTitle: { color: '#8da38b', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, fontFamily: 'monospace' },
  keyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderColor: '#1c2d20' },
  keyRead: { color: '#a4cb77', fontSize: 11, fontWeight: '700' },
  keyCard: { borderWidth: 1, borderColor: '#29482d', borderRadius: 4, padding: 9, marginTop: 6 },
  keyCardTitle: { color: '#93d17a', fontSize: 13, fontWeight: '800', marginBottom: 5 },
  keyCardText: { color: '#c8d4b1', fontSize: 12 },
});

// Только уникальные для склада мелочи; строки, буфер и кнопка «Перенести»
// приходят из tradeOverlayStyles.
const localStyles = StyleSheet.create({
  gmList: { maxHeight: 240 },
  gmKeyCatalog: { maxHeight: 150 },
  gmRow: { paddingVertical: 7, borderBottomWidth: 1, borderColor: '#1c2d20' },
  gmRowName: { flex: 1, color: '#d8e4cc', fontSize: 12 },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: '#1c2d20' },
  issueBtn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: '#58875d', backgroundColor: '#213028' },
  issueBtnText: { color: '#a4cb77', fontSize: 11, fontWeight: '700' },
  bufferBox: { borderWidth: 1, borderColor: '#29482d', borderRadius: 5, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, maxHeight: 160 },
  commitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  clearBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 5, borderWidth: 1, borderColor: '#58875d' },
});

export default PartyStorageModal;
