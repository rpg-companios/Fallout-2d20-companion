import React, { useMemo } from 'react';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../logic/lootTradeI18n';
import { CONTAINER_KIND } from '../../../../domain/lootTrade';
import { formatRoomCodeForDisplay } from '../../../../src/room/roomCode';
import IconText from '../../../lootTrade/LootTradeIconText';

const HubChildPickerModal = ({
  visible,
  hub,
  allContainers = [],
  roomByCode = {},
  onAddChild,
  onCreateChild,
  onClose,
}) => {
  useLocale();

  const candidates = useMemo(() => {
    if (!hub) return [];
    const linkedIds = new Set((hub.links || []).map((l) => l.containerId));
    return (allContainers || [])
      .filter((c) => (
        c
        && c.id !== hub.id
        && [CONTAINER_KIND.LOOT, CONTAINER_KIND.MERCHANT, CONTAINER_KIND.TERMINAL, CONTAINER_KIND.LOCK].includes(c.kind)
        && !linkedIds.has(c.id)
      ))
      .sort((a, b) => {
        const aSame = a.roomCode === hub.roomCode ? 0 : 1;
        const bSame = b.roomCode === hub.roomCode ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [hub, allContainers]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{tLootTrade('detail.hubPickerTitle')}</Text>
          <Text style={styles.hint}>{tLootTrade('detail.hubPickerSameRoomHint')}</Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {candidates.length === 0 ? (
              <Text style={styles.emptyText}>{tLootTrade('detail.hubPickerEmpty')}</Text>
            ) : (
              candidates.map((item) => {
                const isMerch = item.kind === CONTAINER_KIND.MERCHANT;
                const isTerminal = item.kind === CONTAINER_KIND.TERMINAL;
                const pieces = (item.items || []).reduce(
                  (sum, entry) => sum + (Number(entry.quantity) || 0),
                  0,
                );
                const roomLabel = item.roomCode
                  ? (roomByCode[item.roomCode]?.name || item.roomName || formatRoomCodeForDisplay(item.roomCode))
                  : '';
                const roomSuffix = roomLabel ? ` • ${roomLabel}` : '';

                return (
                  <View key={item.id} style={styles.row}>
                    <View style={styles.rowInfo}>
                      <View style={styles.rowTitleLine}>
                        <MaterialCommunityIcons
                          name={isTerminal ? 'console' : (isMerch ? 'sack' : 'treasure-chest')}
                          size={18}
                          color={ADMIN_MODAL_PALETTE.accent}
                        />
                        <Text style={styles.rowName}>{item.name}</Text>
                      </View>
                      <IconText style={styles.rowMeta}>
                        {isTerminal
                          ? `${formatLootTrade(tLootTrade('card.terminalDifficulty'), { difficulty: item.difficulty })}${roomSuffix}`
                          : (isMerch
                            ? `${formatLootTrade(tLootTrade('card.itemsCount'), { count: pieces })} • ${formatLootTrade(tLootTrade('card.capsCount'), { caps: item.caps })}${roomSuffix}`
                            : `${formatLootTrade(tLootTrade('card.itemsCount'), { count: pieces })}${roomSuffix}`)}
                      </IconText>
                    </View>

                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => onAddChild(item.id)}
                    >
                      <Text style={styles.addBtnText}>{tLootTrade('detail.hubPickerAddBtn')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Патч 563: если нужной вещи ещё нет — её создают ЗДЕСЬ, и она сразу
              встаёт в эту локацию (форма откроется с заполненной «Локацией»). */}
          {typeof onCreateChild === 'function' && (
            <View style={styles.createRow}>
              <Text style={styles.createTitle}>{tLootTrade('detail.hubPickerCreateTitle')}</Text>
              {[
                [CONTAINER_KIND.LOOT, 'treasure-chest', 'actions.createLoot'],
                [CONTAINER_KIND.MERCHANT, 'sack', 'actions.createMerchant'],
                [CONTAINER_KIND.TERMINAL, 'console', 'actions.createTerminal'],
                [CONTAINER_KIND.LOCK, 'lock', 'actions.createLock'],
              ].map(([kind, icon, labelKey]) => (
                <TouchableOpacity
                  key={kind}
                  style={styles.createBtn}
                  testID={`hub-picker-create-${kind}`}
                  onPress={() => onCreateChild(kind)}
                >
                  <MaterialCommunityIcons name={icon} size={16} color={ADMIN_MODAL_PALETTE.accent} />
                  <Text style={styles.createBtnText}>{tLootTrade(labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>{tLootTrade('detail.hubPickerClose')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  card: {
    width: '90%',
    maxWidth: 560,
    maxHeight: '80%',
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: ADMIN_MODAL_PALETTE.accent,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  title: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    gap: 8,
    paddingVertical: 4,
  },
  emptyText: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowName: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  rowMeta: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 12,
    marginTop: 3,
  },
  addBtn: {
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.accent,
    borderRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  addBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    fontWeight: '700',
  },
  createRow: {
    borderTopWidth: 1,
    borderTopColor: ADMIN_MODAL_PALETTE.border,
    paddingTop: 8,
    marginTop: 8,
    gap: 6,
  },
  createTitle: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 12,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  createBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default HubChildPickerModal;
