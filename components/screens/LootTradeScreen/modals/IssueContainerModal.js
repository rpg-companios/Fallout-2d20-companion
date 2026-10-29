import React, { useState, useEffect } from 'react';
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
import { formatRoomCodeForDisplay } from '../../../../src/room/roomCode';

const IssueContainerModal = ({
  visible,
  container,
  roomName = '',
  roomCharacters = [],
  busy = false,
  onConfirmIssue,
  onClose,
}) => {
  useLocale();
  const [targetType, setTargetType] = useState('room');
  const [selectedCharacterId, setSelectedCharacterId] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setTargetType('room');
    setSelectedCharacterId(roomCharacters[0]?.id || null);
  }, [visible, roomCharacters]);

  if (!container) return null;

  const canSubmit = !busy && (
    targetType === 'room' || (targetType === 'character' && Boolean(selectedCharacterId))
  );

  const handleConfirm = () => {
    if (!canSubmit) return;
    const pickedChar = roomCharacters.find((c) => c.id === selectedCharacterId) || null;
    onConfirmIssue({
      targetType,
      targetCharacterId: targetType === 'character' ? selectedCharacterId : null,
      targetCharacterName: targetType === 'character' ? (pickedChar?.name || null) : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {formatLootTrade(tLootTrade('issueModal.title'), { name: container.name })}
          </Text>
          <Text style={styles.roomSub}>
            {formatLootTrade(tLootTrade('issueModal.roomLabel'), {
              room: `${roomName || container.roomName || ''} (${formatRoomCodeForDisplay(container.roomCode)})`.trim(),
            })}
          </Text>

          <Text style={styles.sectionTitle}>{tLootTrade('issueModal.targetTitle')}</Text>

          <TouchableOpacity
            style={[styles.optionCard, targetType === 'room' && styles.optionCardActive]}
            onPress={() => setTargetType('room')}
          >
            <View style={styles.optionRow}>
              <MaterialCommunityIcons
                name={targetType === 'room' ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
                color={targetType === 'room' ? '#f0e68c' : '#9ca3af'}
              />
              <Text style={styles.optionTitle}>{tLootTrade('issueModal.wholeRoom')}</Text>
            </View>
            <Text style={styles.optionHint}>{tLootTrade('issueModal.wholeRoomHint')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, targetType === 'character' && styles.optionCardActive]}
            onPress={() => {
              setTargetType('character');
              if (!selectedCharacterId && roomCharacters[0]?.id) {
                setSelectedCharacterId(roomCharacters[0].id);
              }
            }}
          >
            <View style={styles.optionRow}>
              <MaterialCommunityIcons
                name={targetType === 'character' ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
                color={targetType === 'character' ? '#f0e68c' : '#9ca3af'}
              />
              <Text style={styles.optionTitle}>{tLootTrade('issueModal.singleCharacter')}</Text>
            </View>
          </TouchableOpacity>

          {targetType === 'character' && (
            <ScrollView style={styles.charList}>
              {roomCharacters.length === 0 ? (
                <Text style={styles.emptyChars}>{tLootTrade('issueModal.noCharactersInRoom')}</Text>
              ) : (
                roomCharacters.map((char) => {
                  const chosen = char.id === selectedCharacterId;
                  return (
                    <TouchableOpacity
                      key={char.id}
                      style={[styles.charRow, chosen && styles.charRowActive]}
                      onPress={() => setSelectedCharacterId(char.id)}
                    >
                      <View style={[styles.dot, char.playerOnline ? styles.dotOnline : styles.dotOffline]} />
                      <Text style={[styles.charName, chosen && styles.charNameActive]}>
                        {char.name}
                      </Text>
                      <Text style={styles.charStatus}>
                        {tLootTrade(char.playerOnline ? 'issueModal.online' : 'issueModal.offline')}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btn, styles.confirmBtn, !canSubmit && styles.btnDisabled]}
              disabled={!canSubmit}
              onPress={handleConfirm}
            >
              <Text style={styles.btnText}>{tLootTrade('issueModal.confirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.btnText}>{tLootTrade('issueModal.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '86%',
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d4af37',
    padding: 18,
  },
  title: {
    color: '#f0e68c',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  roomSub: {
    color: '#d1d5db',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 11,
    marginBottom: 8,
  },
  optionCardActive: {
    borderColor: '#f0e68c',
    backgroundColor: '#292524',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionTitle: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '700',
  },
  optionHint: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 4,
    marginLeft: 28,
  },
  charList: {
    maxHeight: 180,
    marginTop: 2,
    marginBottom: 4,
  },
  emptyChars: {
    color: '#fca5a5',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  charRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1f2937',
    marginBottom: 6,
  },
  charRowActive: {
    borderColor: '#f0e68c',
    backgroundColor: 'rgba(212,175,55,0.2)',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  dotOnline: { backgroundColor: '#22c55e' },
  dotOffline: { backgroundColor: '#6b7280' },
  charName: {
    flex: 1,
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
  charNameActive: {
    color: '#f0e68c',
    fontWeight: '700',
  },
  charStatus: {
    color: '#9ca3af',
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmBtn: { backgroundColor: '#15803d' },
  cancelBtn: { backgroundColor: '#b91c1c' },
  btnDisabled: { opacity: 0.45 },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default IssueContainerModal;
