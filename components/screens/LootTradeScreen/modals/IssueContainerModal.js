import React, { useState, useEffect, useMemo } from 'react';
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
import { formatRoomCodeForDisplay } from '../../../../src/room/roomCode';
import { CONTAINER_KIND, normalizeRoomCodes } from '../../../../domain/lootTrade';
import { buildGmRoomCharacterCards } from '../../../../src/room/roomCharacterSync';

const IssueContainerModal = ({
  visible,
  container,
  availableRooms = [],
  roomRooms = {},
  roomName = '',
  roomCharacters = [],
  busy = false,
  onSelectRoom,
  onConfirmIssue,
  onClose,
}) => {
  useLocale();
  const [selectedRoomCode, setSelectedRoomCode] = useState('');
  const [targetType, setTargetType] = useState('room');
  const [selectedCharacterId, setSelectedCharacterId] = useState(null);

  const candidateRooms = useMemo(() => {
    if (!container) return [];
    if (container.kind === CONTAINER_KIND.HUB) {
      const codes = normalizeRoomCodes(container.roomCodes, container.roomCode);
      if (codes.length > 0) {
        return codes.map((code) => {
          const found = availableRooms.find((r) => r.code === code);
          return found || { code, name: roomName || container.roomName || code };
        });
      }
    }
    if (availableRooms.length > 0) return availableRooms;
    if (container.roomCode) {
      return [{ code: container.roomCode, name: roomName || container.roomName || container.roomCode }];
    }
    return [];
  }, [container, availableRooms, roomName]);

  useEffect(() => {
    if (!visible || !container) return;
    const preferred = candidateRooms.find((r) => r.code === container.roomCode)?.code
      || candidateRooms[0]?.code
      || '';
    setSelectedRoomCode(preferred);
    setTargetType('room');
    if (preferred && onSelectRoom) {
      onSelectRoom(preferred);
    }
  }, [visible, container?.id]);

  const effectiveRoomCharacters = useMemo(() => {
    if (!selectedRoomCode) return roomCharacters;
    if (roomRooms && roomRooms[selectedRoomCode]) {
      return buildGmRoomCharacterCards(roomRooms[selectedRoomCode]);
    }
    return roomCharacters;
  }, [selectedRoomCode, roomRooms, roomCharacters]);

  useEffect(() => {
    if (!visible) return;
    if (
      !selectedCharacterId
      || !effectiveRoomCharacters.some((c) => c.id === selectedCharacterId)
    ) {
      setSelectedCharacterId(effectiveRoomCharacters[0]?.id || null);
    }
  }, [visible, effectiveRoomCharacters, selectedCharacterId]);

  if (!container) return null;

  const canSubmit = !busy
    && Boolean(selectedRoomCode)
    && (targetType === 'room' || (targetType === 'character' && Boolean(selectedCharacterId)));

  const handleConfirm = () => {
    if (!canSubmit) return;
    const pickedChar = effectiveRoomCharacters.find((c) => c.id === selectedCharacterId) || null;
    onConfirmIssue({
      roomCode: selectedRoomCode,
      targetType,
      targetCharacterId: targetType === 'character' ? selectedCharacterId : null,
      targetCharacterName: targetType === 'character' ? (pickedChar?.name || null) : null,
    });
  };

  const singleRoomObj = candidateRooms.length === 1 ? candidateRooms[0] : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {formatLootTrade(tLootTrade('issueModal.title'), { name: container.name })}
          </Text>

          {candidateRooms.length === 0 ? (
            <Text style={styles.emptyChars}>{tLootTrade('issueModal.noRoomsAvailable')}</Text>
          ) : singleRoomObj ? (
            <Text style={styles.roomSub}>
              {formatLootTrade(tLootTrade('issueModal.roomLabel'), {
                room: `${singleRoomObj.name || ''} (${formatRoomCodeForDisplay(singleRoomObj.code)})`.trim(),
              })}
            </Text>
          ) : (
            <View style={styles.roomsPickerBlock}>
              <Text style={styles.sectionTitle}>{tLootTrade('issueModal.selectRoomTitle')}</Text>
              <View style={styles.roomChipsRow}>
                {candidateRooms.map((r) => {
                  const active = r.code === selectedRoomCode;
                  return (
                    <TouchableOpacity
                      key={r.code}
                      style={[styles.roomChip, active && styles.roomChipActive]}
                      onPress={() => {
                        setSelectedRoomCode(r.code);
                        onSelectRoom?.(r.code);
                      }}
                    >
                      <Text style={[styles.roomChipText, active && styles.roomChipTextActive]}>
                        {`${r.name} (${formatRoomCodeForDisplay(r.code)})`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>{tLootTrade('issueModal.targetTitle')}</Text>

          <TouchableOpacity
            style={[styles.optionCard, targetType === 'room' && styles.optionCardActive]}
            onPress={() => setTargetType('room')}
          >
            <View style={styles.optionRow}>
              <MaterialCommunityIcons
                name={targetType === 'room' ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
                color={targetType === 'room' ? ADMIN_MODAL_PALETTE.accent : ADMIN_MODAL_PALETTE.mutedText}
              />
              <Text style={styles.optionTitle}>{tLootTrade('issueModal.wholeRoom')}</Text>
            </View>
            <Text style={styles.optionHint}>{tLootTrade('issueModal.wholeRoomHint')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, targetType === 'character' && styles.optionCardActive]}
            onPress={() => {
              setTargetType('character');
              if (!selectedCharacterId && effectiveRoomCharacters[0]?.id) {
                setSelectedCharacterId(effectiveRoomCharacters[0].id);
              }
            }}
          >
            <View style={styles.optionRow}>
              <MaterialCommunityIcons
                name={targetType === 'character' ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
                color={targetType === 'character' ? ADMIN_MODAL_PALETTE.accent : ADMIN_MODAL_PALETTE.mutedText}
              />
              <Text style={styles.optionTitle}>{tLootTrade('issueModal.singleCharacter')}</Text>
            </View>
          </TouchableOpacity>

          {targetType === 'character' && (
            <ScrollView style={styles.charList}>
              {effectiveRoomCharacters.length === 0 ? (
                <Text style={styles.emptyChars}>{tLootTrade('issueModal.noCharactersInRoom')}</Text>
              ) : (
                effectiveRoomCharacters.map((char) => {
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
              <Text style={styles.confirmBtnText}>{tLootTrade('issueModal.confirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{tLootTrade('issueModal.cancel')}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  card: {
    width: '90%',
    maxWidth: 460,
    maxHeight: '82%',
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
  roomSub: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  roomsPickerBlock: {
    marginTop: 10,
    marginBottom: 12,
  },
  roomChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#555555',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  roomChipActive: {
    borderColor: ADMIN_MODAL_PALETTE.accent,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  roomChipText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    fontWeight: '600',
  },
  roomChipTextActive: {
    color: ADMIN_MODAL_PALETTE.text,
    fontWeight: '700',
  },
  sectionTitle: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 9,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: '#555555',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderRadius: 5,
    padding: 13,
    marginBottom: 10,
  },
  optionCardActive: {
    borderColor: ADMIN_MODAL_PALETTE.accent,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionTitle: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    fontWeight: '700',
  },
  optionHint: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 28,
  },
  charList: {
    maxHeight: 180,
    marginTop: 2,
    marginBottom: 6,
  },
  emptyChars: {
    color: '#e57373',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  charRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    marginBottom: 6,
  },
  charRowActive: {
    borderColor: ADMIN_MODAL_PALETTE.accent,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  dotOnline: { backgroundColor: '#d4af37' },
  dotOffline: { backgroundColor: '#777777' },
  charName: {
    flex: 1,
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '600',
  },
  charNameActive: {
    color: ADMIN_MODAL_PALETTE.text,
    fontWeight: '700',
  },
  charStatus: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
  },
  confirmBtn: {
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderColor: ADMIN_MODAL_PALETTE.accent,
  },
  confirmBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderColor: '#777777',
  },
  cancelBtnText: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.45 },
});

export default IssueContainerModal;
