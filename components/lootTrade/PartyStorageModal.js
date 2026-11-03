/**
 * Патч 507 — «Общее хранилище» комнаты (шаг 1 дизайна, без ключевых записей).
 *
 * Простая модалка: слева предметы текущего персонажа («Положить»), справа
 * общий склад комнаты («Забрать»). Канон — сервер; локальный инвентарь меняют
 * колбэки, переданные из InventoryScreen, и только ПОСЛЕ успешного ответа.
 *
 * Название не настраивается: это просто «Общее хранилище».
 */

import React, { useMemo, useState } from 'react';
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
import { showRawAlert } from '../alerts/alertService';
import { useLocale } from '../../i18n/locale';

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

const PartyStorageModal = ({ visible, inventoryItems = [], onClose, onDepositLocal, onWithdrawLocal }) => {
  useLocale();
  const rooms = useRoomStore((state) => state.rooms);
  const [busy, setBusy] = useState(false);

  const room = useMemo(() => {
    // Патч 509: окно склада доступно и Мастеру, и игроку — оба должны уметь
    // выгрузить снимок в JSON. Предпочитаем комнату игрока, если их несколько.
    const candidates = Object.entries(rooms || {}).filter(([, value]) => value?.partyStorage);
    const entry = candidates.find(([, value]) => value.role === 'player') || candidates[0];
    if (!entry) return null;
    return {
      code: entry[0],
      role: entry[1].role,
      storage: entry[1].partyStorage || { revision: 0, entries: [] },
    };
  }, [rooms]);

  const entries = room?.storage?.entries || [];
  // Без Мастера в сети хранилище только для чтения.
  const writable = Boolean(room?.storage?.gmOnline);

  const deposit = async (item) => {
    if (!room || busy || !writable) return;
    setBusy(true);
    try {
      await useRoomStore.getState().depositToPartyStorage({
        code: room.code,
        item: pickItemSnapshot(item),
        quantity: 1,
        name: item?.name,
      });
      // Списываем у себя только после подтверждения сервера.
      if (item?.id) onDepositLocal?.(item.id, 1);
    } catch (error) {
      showRawAlert({ title: tInventory('screen.storage.failed'), message: error?.message });
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (entry) => {
    if (!room || busy || !writable) return;
    setBusy(true);
    try {
      const result = await useRoomStore.getState().withdrawFromPartyStorage({
        code: room.code,
        entryId: entry.entryId,
        quantity: entry.quantity,
      });
      if (result?.withdrawn) {
        onWithdrawLocal?.(result.withdrawn.item, result.withdrawn.quantity);
      }
    } catch (error) {
      showRawAlert({ title: tInventory('screen.storage.failed'), message: error?.message });
    } finally {
      setBusy(false);
    }
  };

  const exportJson = async () => {
    if (!room) return;
    const payload = createStorageExportPayload({
      code: room.code,
      storage: room.storage,
      exportedBy: room.role === 'gm' ? 'gm' : 'player',
    });
    const result = await saveCharacter(payload, storageExportFileName(room.code));
    if (result?.success) {
      showRawAlert({ title: tInventory('screen.storage.exportDone') });
    }
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
      // Снимок сохраняется локально под кодом ТЕКУЩЕЙ комнаты: если игрок
      // позже станет Мастером, restoreMasterStorage поднимет его.
      await db.saveRoomStorage(room.code, parsed.storage);
      if (room.role === 'gm') {
        await useRoomStore.getState().restorePartyStorage({
          code: room.code,
          storage: parsed.storage,
        });
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

  return (
    <Modal visible transparent animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.window}>
          <View style={styles.header}>
            <Text style={styles.title}>{tInventory('screen.storage.title')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          {!room ? (
            <Text style={styles.hint}>{tInventory('screen.storage.noRoom')}</Text>
          ) : (
            <View style={styles.columns}>
              <View style={styles.column}>
                <Text style={styles.columnTitle}>{tInventory('screen.storage.yourItems')}</Text>
                <ScrollView style={styles.list}>
                  {(inventoryItems || []).length === 0
                    ? <Text style={styles.hint}>{tInventory('screen.storage.empty')}</Text>
                    : (inventoryItems || []).map((item, index) => (
                      <TouchableOpacity
                        key={item.id || `${item.name}-${index}`}
                        style={styles.row}
                        disabled={busy || !writable}
                        onPress={() => void deposit(item)}
                      >
                        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.rowAction}>{tInventory('screen.storage.deposit')}</Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>

              <View style={styles.column}>
                <Text style={styles.columnTitle}>{tInventory('screen.storage.title')}</Text>
                <ScrollView style={styles.list}>
                  {entries.length === 0
                    ? <Text style={styles.hint}>{tInventory('screen.storage.empty')}</Text>
                    : entries.map((entry) => (
                      <TouchableOpacity
                        key={entry.entryId}
                        style={styles.row}
                        disabled={busy || !writable}
                        onPress={() => void withdraw(entry)}
                      >
                        <Text style={styles.rowName} numberOfLines={1}>
                          {`${entry.name} × ${entry.quantity}`}
                        </Text>
                        <Text style={styles.rowAction}>{tInventory('screen.storage.withdraw')}</Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            </View>
          )}

          <View style={styles.transferRow}>
            <TouchableOpacity
              testID="storage-export-button"
              style={styles.transferButton}
              onPress={() => { void exportJson(); }}
            >
              <Text style={styles.transferButtonText}>{tInventory('screen.storage.export')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="storage-import-button"
              style={styles.transferButton}
              onPress={() => { void importJson(); }}
            >
              <Text style={styles.transferButtonText}>{tInventory('screen.storage.import')}</Text>
            </TouchableOpacity>
          </View>
          {!writable && <Text style={styles.readOnly}>{tInventory('screen.storage.readOnly')}</Text>}
          <Text style={styles.hint}>{tInventory('screen.storage.hint')}</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  window: { width: '100%', maxWidth: 720, maxHeight: '86%', backgroundColor: '#0b140d', borderWidth: 1.5, borderColor: '#42784a', borderRadius: 6, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#29482d', paddingBottom: 9, marginBottom: 10 },
  title: { color: '#93d17a', fontSize: 16, fontWeight: '800' },
  closeButton: { paddingHorizontal: 10, paddingVertical: 2 },
  closeText: { color: '#bdc8b7', fontSize: 22 },
  columns: { flexDirection: 'row', gap: 10, minHeight: 180 },
  column: { flex: 1, borderWidth: 1, borderColor: '#29482d', borderRadius: 5, padding: 8 },
  columnTitle: { color: '#8da38b', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, fontFamily: 'monospace' },
  list: { maxHeight: 320 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderColor: '#1c2d20' },
  rowName: { flex: 1, color: '#d8e4cc', fontSize: 12 },
  rowAction: { color: '#93d17a', fontSize: 11, fontWeight: '700' },
  hint: { color: '#97a392', fontSize: 11, textAlign: 'center', marginTop: 8 },
  transferRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  transferButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#58875d',
    backgroundColor: '#213028',
  },
  transferButtonText: { color: '#a4cb77', fontSize: 11, fontWeight: '700' },
  readOnly: { color: '#e2a3a3', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});

export default PartyStorageModal;
