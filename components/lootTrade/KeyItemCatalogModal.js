/**
 * Патч 510, шаг 2: справочник ключевых записей Мастера.
 *
 * «Ключ от склада» без описания и «Записка наёмника» с мини-историей —
 * это одна и та же запись: id, имя, описание с уже существующими тегами.
 * Справочник принадлежит Мастеру; добытая копия на складе самодостаточна и
 * не зависит от последующих правок этого справочника.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import * as db from '../../db';
import useRoomStore from '../../src/room/roomStore';
import { renderTextWithIcons } from '../../modules/fallout/screens/WeaponsAndArmorScreen/textUtils';
import { showRawAlert } from '../alerts/alertService';
import { tLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { useLocale } from '../../i18n/locale';

const makeId = () => `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const TAG_BUTTONS = [
  { label: '**Ж**', insert: '**жирный**' },
  { label: '*К*', insert: '*курсив*' },
  { label: '• список', insert: '\n- пункт' },
  { label: '{CD}', insert: ' {CD}' },
  { label: '{CAP}', insert: ' {CAP}' },
];

const KeyItemCatalogModal = ({ visible, onClose }) => {
  useLocale();
  const rooms = useRoomStore((state) => state.rooms);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState({ id: '', name: '', description: '' });
  const [busy, setBusy] = useState(false);

  const gmRoom = useMemo(() => {
    const entry = Object.entries(rooms || {}).find(([, room]) => room?.role === 'gm');
    return entry ? { code: entry[0] } : null;
  }, [rooms]);

  const refresh = useCallback(async () => {
    try { setItems(await db.getGmKeyItems()); } catch { setItems([]); }
  }, []);
  useEffect(() => { if (visible) void refresh(); }, [visible, refresh]);

  const save = async () => {
    const name = draft.name.trim();
    if (!name) { showRawAlert({ title: tLootTrade('keyItems.nameRequired') }); return; }
    setBusy(true);
    try {
      await db.saveGmKeyItem({
        id: draft.id || makeId(),
        name,
        description: draft.description,
        roomCode: gmRoom?.code || '',
      });
      setDraft({ id: '', name: '', description: '' });
      await refresh();
    } finally { setBusy(false); }
  };

  const issue = async (item) => {
    if (!gmRoom) { showRawAlert({ title: tLootTrade('keyItems.noRoom') }); return; }
    setBusy(true);
    try {
      await useRoomStore.getState().addKeyItemToStorage({
        code: gmRoom.code,
        keyItemId: item.id,
        name: item.name,
        description: item.description,
      });
      showRawAlert({ title: tLootTrade('keyItems.issued') });
    } catch (error) {
      showRawAlert({ title: tLootTrade('keyItems.failed'), message: error?.message });
    } finally { setBusy(false); }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.window}>
          <View style={styles.header}>
            <Text style={styles.title}>{tLootTrade('keyItems.title')}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={onClose}>
              <Text style={styles.close}>×</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{tLootTrade('keyItems.nameLabel')}</Text>
          <TextInput
            testID="key-item-name"
            style={styles.input}
            value={draft.name}
            onChangeText={(text) => setDraft((prev) => ({ ...prev, name: text }))}
            placeholder={tLootTrade('keyItems.namePlaceholder')}
            placeholderTextColor="#6b7a68"
          />

          <Text style={styles.label}>{tLootTrade('keyItems.descriptionLabel')}</Text>
          <View style={styles.tagRow}>
            {TAG_BUTTONS.map((tag) => (
              <TouchableOpacity
                key={tag.label}
                style={styles.tagButton}
                onPress={() => setDraft((prev) => ({ ...prev, description: prev.description + tag.insert }))}
              >
                <Text style={styles.tagButtonText}>{tag.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            testID="key-item-description"
            style={[styles.input, styles.multiline]}
            value={draft.description}
            onChangeText={(text) => setDraft((prev) => ({ ...prev, description: text }))}
            placeholder={tLootTrade('keyItems.descriptionPlaceholder')}
            placeholderTextColor="#6b7a68"
            multiline
          />
          <View style={styles.preview}>
            {renderTextWithIcons(
              draft.description || tLootTrade('keyItems.previewEmpty'),
              styles.previewText,
            )}
          </View>

          <View style={styles.formActions}>
            <TouchableOpacity testID="key-item-save" style={styles.primaryButton} disabled={busy} onPress={() => void save()}>
              <Text style={styles.primaryButtonText}>{tLootTrade('keyItems.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setDraft({ id: '', name: '', description: '' })}>
              <Text style={styles.secondaryButtonText}>{tLootTrade('keyItems.clear')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{tLootTrade('keyItems.catalog')}</Text>
          <ScrollView style={styles.list}>
            {items.length === 0
              ? <Text style={styles.hint}>{tLootTrade('keyItems.empty')}</Text>
              : items.map((item) => (
                <View key={item.id} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    {Boolean(item.description) && (
                      <Text style={styles.rowDesc} numberOfLines={1}>{item.description.replace(/\*/g, '')}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    testID={`key-item-edit-${item.id}`}
                    style={styles.rowButton}
                    onPress={() => setDraft({ id: item.id, name: item.name, description: item.description })}
                  >
                    <Text style={styles.rowButtonText}>{tLootTrade('keyItems.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`key-item-issue-${item.id}`}
                    style={[styles.rowButton, styles.issueButton]}
                    disabled={busy}
                    onPress={() => void issue(item)}
                  >
                    <Text style={styles.rowButtonText}>{tLootTrade('keyItems.issue')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
          </ScrollView>
          <Text style={styles.hint}>{tLootTrade('keyItems.hint')}</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  window: { width: '100%', maxWidth: 720, maxHeight: '90%', backgroundColor: '#0b140d', borderWidth: 1.5, borderColor: '#42784a', borderRadius: 6, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#29482d', paddingBottom: 8, marginBottom: 10 },
  title: { color: '#93d17a', fontSize: 16, fontWeight: '800' },
  close: { color: '#bdc8b7', fontSize: 22 },
  label: { color: '#8da38b', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginBottom: 4, fontFamily: 'monospace' },
  input: { borderWidth: 1, borderColor: '#29482d', borderRadius: 4, color: '#d8e4cc', paddingHorizontal: 9, paddingVertical: 7, fontSize: 13 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 5 },
  tagButton: { borderWidth: 1, borderColor: '#3a5a3d', borderRadius: 3, paddingHorizontal: 7, paddingVertical: 3 },
  tagButtonText: { color: '#a4cb77', fontSize: 10 },
  preview: { borderWidth: 1, borderColor: '#29482d', borderRadius: 4, padding: 8, marginTop: 6, minHeight: 40 },
  previewText: { color: '#c8d4b1', fontSize: 12 },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 9 },
  primaryButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 4, backgroundColor: '#315331', borderWidth: 1, borderColor: '#a4cb77' },
  primaryButtonText: { color: '#e2f1d5', fontSize: 12, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, borderWidth: 1, borderColor: '#42604a' },
  secondaryButtonText: { color: '#a9bba4', fontSize: 12 },
  list: { maxHeight: 210, marginTop: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, borderBottomWidth: 1, borderColor: '#1c2d20' },
  rowInfo: { flex: 1 },
  rowName: { color: '#d8e4cc', fontSize: 13, fontWeight: '700' },
  rowDesc: { color: '#8da38b', fontSize: 11, marginTop: 2 },
  rowButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 3, borderWidth: 1, borderColor: '#3a5a3d' },
  issueButton: { borderColor: '#a4cb77' },
  rowButtonText: { color: '#a4cb77', fontSize: 11, fontWeight: '700' },
  hint: { color: '#97a392', fontSize: 11, textAlign: 'center', marginTop: 8 },
});

export default KeyItemCatalogModal;
