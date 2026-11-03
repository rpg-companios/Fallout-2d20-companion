/**
 * Патч 511: форма ключевой записи в стиле ContainerFormModal.
 *
 * Владелец: «я полагал ключ будет, как карточка контейнера/торговца/терминала
 * и с модалкой в стиле создания контейнера и потом сохранением в экран».
 * Поэтому здесь те же тема ADMIN_MODAL_PALETTE, карточка, подписи полей,
 * выбор комнаты и футер «Отмена / Сохранить», что и у формы контейнера.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade } from '../logic/lootTradeI18n';
import { renderTextWithIcons } from '../../../../modules/fallout/screens/WeaponsAndArmorScreen/textUtils';
import { formatRoomCodeForDisplay } from '../../../../src/room/roomCode';
import { showRawAlert } from '../../../alerts/alertService';

const TAG_BUTTONS = [
  { label: '**Ж**', insert: '**жирный**' },
  { label: '*К*', insert: '*курсив*' },
  { label: '• список', insert: '\n- пункт' },
  { label: '{CD}', insert: ' {CD}' },
  { label: '{CAP}', insert: ' {CAP}' },
];

const KeyItemFormModal = ({
  visible,
  initialKeyItem = null,
  availableRooms = [],
  onSave,
  onClose,
}) => {
  useLocale();
  const isEditing = Boolean(initialKeyItem?.id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(initialKeyItem?.name || '');
    setDescription(initialKeyItem?.description || '');
    setRoomCode(initialKeyItem?.roomCode || '');
  }, [visible, initialKeyItem?.id, initialKeyItem?.name, initialKeyItem?.description, initialKeyItem?.roomCode]);

  const handleSave = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      showRawAlert({ title: tLootTrade('keyItems.nameRequired') });
      return;
    }
    onSave({
      ...(initialKeyItem || {}),
      name: cleanName,
      description,
      roomCode,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <MaterialCommunityIcons name="key-variant" size={24} color={ADMIN_MODAL_PALETTE.accent} />
            <Text style={styles.title}>
              {tLootTrade(isEditing ? 'form.editKeyItemTitle' : 'form.createKeyItemTitle')}
            </Text>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>{tLootTrade('form.nameLabel')}</Text>
            <TextInput
              testID="key-item-form-name"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={tLootTrade('keyItems.namePlaceholder')}
              placeholderTextColor="#8c8c8c"
            />

            <Text style={styles.label}>{tLootTrade('form.roomsMultiLabel')}</Text>
            {availableRooms.length === 0 ? (
              <Text style={styles.warnText}>{tLootTrade('form.noRoomsHint')}</Text>
            ) : (
              <View style={styles.chipsRow}>
                {availableRooms.map((room) => {
                  const active = room.code === roomCode;
                  return (
                    <TouchableOpacity
                      key={room.code}
                      testID={`key-item-room-${room.code}`}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setRoomCode(active ? '' : room.code)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                        {room.name || formatRoomCodeForDisplay(room.code)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={styles.label}>{tLootTrade('keyItems.descriptionLabel')}</Text>
            <View style={styles.tagRow}>
              {TAG_BUTTONS.map((tag) => (
                <TouchableOpacity
                  key={tag.label}
                  style={styles.tagButton}
                  onPress={() => setDescription((prev) => prev + tag.insert)}
                >
                  <Text style={styles.tagButtonText}>{tag.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              testID="key-item-form-description"
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder={tLootTrade('keyItems.descriptionPlaceholder')}
              placeholderTextColor="#8c8c8c"
              multiline
            />
            <View style={styles.preview}>
              {renderTextWithIcons(
                description || tLootTrade('keyItems.previewEmpty'),
                styles.previewText,
              )}
            </View>
            <Text style={styles.hint}>
              {tLootTrade('keyItems.hint')}
            </Text>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity testID="key-item-form-cancel" style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{tLootTrade('form.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="key-item-form-save" style={[styles.btn, styles.saveBtn]} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{tLootTrade('keyItems.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxWidth: 520,
    maxHeight: '92%',
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderWidth: 1.5,
    borderColor: ADMIN_MODAL_PALETTE.accent,
    borderRadius: 8,
    padding: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderColor: ADMIN_MODAL_PALETTE.accent, paddingBottom: 10, marginBottom: 8 },
  title: { color: ADMIN_MODAL_PALETTE.text, fontSize: 17, fontWeight: '800', flex: 1 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 4 },
  label: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.border,
    borderRadius: 5,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    color: ADMIN_MODAL_PALETTE.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: ADMIN_MODAL_PALETTE.border, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised },
  chipActive: { backgroundColor: ADMIN_MODAL_PALETTE.selected, borderColor: ADMIN_MODAL_PALETTE.accent },
  chipText: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 12 },
  chipTextActive: { color: ADMIN_MODAL_PALETTE.text, fontWeight: '700' },
  warnText: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 12, fontStyle: 'italic' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  tagButton: { borderWidth: 1, borderColor: ADMIN_MODAL_PALETTE.border, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 3 },
  tagButtonText: { color: ADMIN_MODAL_PALETTE.accent, fontSize: 10 },
  preview: { borderWidth: 1, borderColor: ADMIN_MODAL_PALETTE.border, borderRadius: 5, padding: 9, marginTop: 8, minHeight: 42 },
  previewText: { color: ADMIN_MODAL_PALETTE.text, fontSize: 13 },
  hint: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11, marginTop: 8 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 5, alignItems: 'center', borderWidth: 1 },
  saveBtn: { backgroundColor: ADMIN_MODAL_PALETTE.selected, borderColor: ADMIN_MODAL_PALETTE.accent },
  saveBtnText: { color: ADMIN_MODAL_PALETTE.text, fontSize: 15, fontWeight: '700' },
  cancelBtn: { backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised, borderColor: ADMIN_MODAL_PALETTE.border },
  cancelBtnText: { color: ADMIN_MODAL_PALETTE.text, fontSize: 15 },
});

export default KeyItemFormModal;
