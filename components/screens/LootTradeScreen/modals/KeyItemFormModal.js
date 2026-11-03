/**
 * Патч 512: форма ключевой записи буквально использует каркас
 * `ContainerFormModal` (`lootTradeFormStyles`), а не «похожий» набор стилей.
 *
 * Владелец (патч 511): ключ должен быть «как карточка контейнера/торговца/
 * терминала и с модалкой в стиле создания контейнера». Владелец (патч 512):
 * «если создаёшь модалки, то хотя бы ориентируйся на дизайн других модалок,
 * которые рядом или делают что-то похожее». Поэтому общие стили (карточка,
 * заголовок, подписи, поля, чипсы комнат, футер) импортируются из соседней
 * формы; локально описаны только элементы, которых там нет (теги и превью).
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
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade } from '../logic/lootTradeI18n';
import { renderTextWithIcons } from '../../../../modules/fallout/screens/WeaponsAndArmorScreen/textUtils';
import { formatRoomCodeForDisplay } from '../../../../src/room/roomCode';
import { showRawAlert } from '../../../alerts/alertService';
import { lootTradeFormStyles as styles } from './ContainerFormModal';

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
  availableParents = [],
  onSave,
  onClose,
}) => {
  useLocale();
  const isEditing = Boolean(initialKeyItem?.id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [attachedTo, setAttachedTo] = useState('');
  const [parentQuery, setParentQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(initialKeyItem?.name || '');
    setDescription(initialKeyItem?.description || '');
    setRoomCode(initialKeyItem?.roomCode || '');
    setAttachedTo(initialKeyItem?.attachedTo || '');
    setParentQuery('');
  }, [visible, initialKeyItem?.id, initialKeyItem?.name, initialKeyItem?.description, initialKeyItem?.roomCode, initialKeyItem?.attachedTo]);

  const filteredParents = availableParents.filter((parent) => (
    !parentQuery.trim()
    || String(parent?.name || '').toLowerCase().includes(parentQuery.trim().toLowerCase())
  ));

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
      attachedTo,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {tLootTrade(isEditing ? 'form.editKeyItemTitle' : 'form.createKeyItemTitle')}
          </Text>

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
              <>
                <View style={styles.roomChips}>
                  {availableRooms.map((room) => {
                    const selected = room.code === roomCode;
                    return (
                      <TouchableOpacity
                        key={room.code}
                        testID={`key-item-room-${room.code}`}
                        style={[styles.roomChip, selected && styles.roomChipActive]}
                        onPress={() => setRoomCode(selected ? '' : room.code)}
                      >
                        <Text style={[styles.roomChipName, selected && styles.roomChipTextActive]}>
                          {room.name || formatRoomCodeForDisplay(room.code)}
                        </Text>
                        <Text style={[styles.roomChipCode, selected && styles.roomChipTextActive]}>
                          {formatRoomCodeForDisplay(room.code)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.hintText}>{tLootTrade('form.roomsMultiHint')}</Text>
              </>
            )}

            <Text style={styles.label}>{tLootTrade('keyItems.attachToLabel')}</Text>
            <TextInput
              testID="key-item-form-parent-search"
              style={styles.input}
              value={parentQuery}
              onChangeText={setParentQuery}
              placeholder={tLootTrade('keyItems.attachToSearchPlaceholder')}
              placeholderTextColor="#8c8c8c"
            />
            <View style={styles.roomChips}>
              <TouchableOpacity
                testID="key-item-parent-none"
                style={[styles.roomChip, !attachedTo && styles.roomChipActive]}
                onPress={() => setAttachedTo('')}
              >
                <Text style={[styles.roomChipName, !attachedTo && styles.roomChipTextActive]}>
                  {tLootTrade('keyItems.attachToNone')}
                </Text>
              </TouchableOpacity>
              {filteredParents.map((parent) => {
                const selected = parent.id === attachedTo;
                return (
                  <TouchableOpacity
                    key={parent.id}
                    testID={`key-item-parent-${parent.id}`}
                    style={[styles.roomChip, selected && styles.roomChipActive]}
                    onPress={() => setAttachedTo(selected ? '' : parent.id)}
                  >
                    <Text style={[styles.roomChipName, selected && styles.roomChipTextActive]} numberOfLines={1}>
                      {parent.name}
                    </Text>
                    <Text style={[styles.roomChipCode, selected && styles.roomChipTextActive]}>
                      {parent.kindLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hintText}>{tLootTrade('keyItems.attachToHint')}</Text>

            <Text style={styles.label}>{tLootTrade('keyItems.descriptionLabel')}</Text>
            <View style={extraStyles.tagRow}>
              {TAG_BUTTONS.map((tag) => (
                <TouchableOpacity
                  key={tag.label}
                  style={extraStyles.tagButton}
                  onPress={() => setDescription((prev) => prev + tag.insert)}
                >
                  <Text style={extraStyles.tagButtonText}>{tag.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              testID="key-item-form-description"
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder={tLootTrade('keyItems.descriptionPlaceholder')}
              placeholderTextColor="#8c8c8c"
              multiline
            />
            <View style={extraStyles.preview}>
              {renderTextWithIcons(
                description || tLootTrade('keyItems.previewEmpty'),
                extraStyles.previewText,
              )}
            </View>
            <Text style={styles.hintText}>{tLootTrade('keyItems.hint')}</Text>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              testID="key-item-form-save"
              style={[styles.btn, styles.saveBtn]}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>{tLootTrade('form.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="key-item-form-cancel"
              style={[styles.btn, styles.cancelBtn]}
              onPress={onClose}
            >
              <Text style={styles.cancelBtnText}>{tLootTrade('form.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Только то, чего нет в форме контейнера: панель тегов и поле предпросмотра.
const extraStyles = StyleSheet.create({
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 6,
  },
  tagButton: {
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
  },
  tagButtonText: { color: '#111111', fontSize: 12, fontWeight: '700' },
  preview: {
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    minHeight: 64,
    backgroundColor: '#ffffff',
  },
  previewText: { color: '#111111', fontSize: 13 },
});

export default KeyItemFormModal;
