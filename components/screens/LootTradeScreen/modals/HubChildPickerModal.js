import React, { useMemo } from 'react';
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
        && (c.kind === CONTAINER_KIND.LOOT || c.kind === CONTAINER_KIND.MERCHANT)
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
                const pieces = (item.items || []).reduce(
                  (sum, entry) => sum + (Number(entry.quantity) || 0),
                  0,
                );
                const roomLabel = roomByCode[item.roomCode]?.name
                  || item.roomName
                  || formatRoomCodeForDisplay(item.roomCode);

                return (
                  <View key={item.id} style={styles.row}>
                    <View style={styles.rowInfo}>
                      <View style={styles.rowTitleLine}>
                        <MaterialCommunityIcons
                          name={isMerch ? 'sack' : 'treasure-chest'}
                          size={18}
                          color="#f0e68c"
                        />
                        <Text style={styles.rowName}>{item.name}</Text>
                      </View>
                      <IconText style={styles.rowMeta}>
                        {isMerch
                          ? `${formatLootTrade(tLootTrade('card.itemsCount'), { count: pieces })} • ${formatLootTrade(tLootTrade('card.capsCount'), { caps: item.caps })} • ${roomLabel}`
                          : `${formatLootTrade(tLootTrade('card.itemsCount'), { count: pieces })} • ${roomLabel}`}
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
    backgroundColor: '#1f1f1f',
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#f0e68c',
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  title: {
    color: '#f0e68c',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    color: '#b0b0b0',
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
    color: '#a3a3a3',
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
    borderColor: '#484848',
    backgroundColor: '#2a2a2a',
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
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  rowMeta: {
    color: '#b5b5b5',
    fontSize: 12,
    marginTop: 3,
  },
  addBtn: {
    backgroundColor: '#3a3a1e',
    borderWidth: 1,
    borderColor: '#f0e68c',
    borderRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  addBtnText: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default HubChildPickerModal;
