import React, { useEffect, useState } from 'react';
import { ADMIN_MODAL_PALETTE } from '../admin/adminModalTheme';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IconText from '../lootTrade/LootTradeIconText';
import { useLocale } from '../../i18n/locale';
import {
  GM_DIRECTIVE_CATALOG,
  GM_DIRECTIVE_KIND,
  formatDirectiveBadgeLabel,
} from '../../modules/fallout/gm/gmDirectives';
import { formatGm, tGm } from '../../modules/fallout/gm/gmI18n';

export default function GmCommandModal({
  visible,
  targetCharacter = null, // null -> вся группа комнаты
  roomCharactersCount = 0,
  recentDirectives = [],
  busy = false,
  onClose,
  onSubmit,
}) {
  const locale = useLocale();
  const [selectedKind, setSelectedKind] = useState(GM_DIRECTIVE_KIND.LEVEL_GRANT);
  const [amountInput, setAmountInput] = useState('1');
  const [healMode, setHealMode] = useState('full');
  const [note, setNote] = useState('');

  const sessionKey = visible
    ? `${targetCharacter?.id || 'room'}`
    : 'closed';

  useEffect(() => {
    if (sessionKey === 'closed') return;
    setSelectedKind(GM_DIRECTIVE_KIND.LEVEL_GRANT);
    setAmountInput('1');
    setHealMode('full');
    setNote('');
  }, [sessionKey]);

  const activeSpec = GM_DIRECTIVE_CATALOG.find((c) => c.kind === selectedKind)
    || GM_DIRECTIVE_CATALOG[0];

  const handleSelectKind = (spec) => {
    setSelectedKind(spec.kind);
    if (spec.kind === GM_DIRECTIVE_KIND.HP_HEAL) {
      setHealMode('full');
      setAmountInput('5');
    } else {
      setAmountInput(String(spec.defaultAmount || 1));
    }
  };

  const stepAmount = (delta) => {
    const parsed = parseInt(amountInput, 10);
    const base = Number.isFinite(parsed) ? parsed : (activeSpec.defaultAmount || 1);
    const next = activeSpec.allowNegative
      ? base + delta
      : Math.max(1, base + delta);
    setAmountInput(String(next));
  };

  const handleConfirm = () => {
    if (busy) return;
    let parsedAmount = parseInt(amountInput, 10);
    if (!Number.isFinite(parsedAmount)) {
      parsedAmount = activeSpec.defaultAmount || 1;
    }
    if (!activeSpec.allowNegative && activeSpec.hasAmountInput) {
      parsedAmount = Math.max(1, parsedAmount);
    }
    if (selectedKind === GM_DIRECTIVE_KIND.HP_HEAL && healMode === 'full') {
      parsedAmount = 0;
    }
    onSubmit?.({
      kind: selectedKind,
      amount: parsedAmount,
      mode: selectedKind === GM_DIRECTIVE_KIND.HP_HEAL ? healMode : null,
      note: note.trim(),
      targetType: targetCharacter?.id ? 'character' : 'room',
      targetCharacterId: targetCharacter?.id || null,
    });
  };

  const recentSlice = Array.isArray(recentDirectives)
    ? [...recentDirectives].slice(-3).reverse()
    : [];

  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalOuter} onPress={() => {}}>
          <View style={styles.modalInner}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                {targetCharacter?.id
                  ? formatGm(tGm('commands.modalTitleCharacter', locale), { name: targetCharacter.name })
                  : tGm('commands.modalTitleRoom', locale)}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeIconBtn}>
                <MaterialCommunityIcons name="close" size={20} color={ADMIN_MODAL_PALETTE.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollBody} keyboardShouldPersistTaps="handled">
              <View style={styles.bodyPadding}>
                <Text style={styles.targetBanner}>
                  {targetCharacter?.id
                    ? formatGm(tGm('commands.targetCharLabel', locale), { name: targetCharacter.name })
                    : formatGm(tGm('commands.targetRoomLabel', locale), { count: roomCharactersCount })}
                </Text>

                <Text style={styles.sectionLabel}>
                  {tGm('commands.selectCommandLabel', locale)}
                </Text>

                <View style={styles.commandList}>
                  {GM_DIRECTIVE_CATALOG.map((spec) => {
                    const active = spec.kind === selectedKind;
                    return (
                      <TouchableOpacity
                        key={spec.kind}
                        testID={`gm-directive-kind-${spec.kind}`}
                        style={[styles.kindBtn, active && styles.kindBtnActive]}
                        onPress={() => handleSelectKind(spec)}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons
                          name={spec.icon}
                          size={18}
                          color={active ? ADMIN_MODAL_PALETTE.accent : ADMIN_MODAL_PALETTE.mutedText}
                        />
                        <Text style={[styles.kindBtnText, active && styles.kindBtnTextActive]}>
                          {tGm(`commands.kinds.${spec.kind}.title`, locale)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.hintText}>
                  {tGm(`commands.kinds.${selectedKind}.hint`, locale)}
                </Text>

                {selectedKind === GM_DIRECTIVE_KIND.HP_HEAL ? (
                  <View style={styles.modeRow}>
                    {['full', 'amount'].map((mKey) => {
                      const active = healMode === mKey;
                      return (
                        <TouchableOpacity
                          key={mKey}
                          style={[styles.presetBtn, active && styles.presetBtnActive]}
                          onPress={() => setHealMode(mKey)}
                        >
                          <Text style={[styles.presetBtnText, active && styles.presetBtnTextActive]}>
                            {tGm(
                              mKey === 'full'
                                ? 'commands.kinds.hp.heal.modeFull'
                                : 'commands.kinds.hp.heal.modeAmount',
                              locale,
                            )}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {activeSpec.hasAmountInput && (selectedKind !== GM_DIRECTIVE_KIND.HP_HEAL || healMode === 'amount') ? (
                  <View style={styles.amountBlock}>
                    <Text style={styles.sectionLabel}>
                      {tGm('commands.amountLabel', locale)}
                    </Text>
                    <View style={styles.stepperRow}>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => stepAmount(-1)}>
                        <Text style={styles.stepBtnText}>−</Text>
                      </TouchableOpacity>
                      <TextInput
                        testID="gm-directive-amount-input"
                        style={styles.amountInput}
                        value={amountInput}
                        onChangeText={setAmountInput}
                        keyboardType="numbers-and-punctuation"
                      />
                      <TouchableOpacity style={styles.stepBtn} onPress={() => stepAmount(1)}>
                        <Text style={styles.stepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    {activeSpec.presets.length > 0 ? (
                      <View style={styles.presetsRow}>
                        {activeSpec.presets.map((val) => {
                          const active = String(val) === String(amountInput);
                          return (
                            <TouchableOpacity
                              key={String(val)}
                              style={[styles.presetBtn, active && styles.presetBtnActive]}
                              onPress={() => setAmountInput(String(val))}
                            >
                              <Text style={[styles.presetBtnText, active && styles.presetBtnTextActive]}>
                                {val > 0 ? `+${val}` : `${val}`}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <Text style={styles.sectionLabel}>
                  {tGm('commands.noteLabel', locale)}
                </Text>
                <TextInput
                  testID="gm-directive-note-input"
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder={tGm('commands.notePlaceholder', locale)}
                  placeholderTextColor="#7a7a7a"
                  maxLength={240}
                />

                {recentSlice.length > 0 ? (
                  <View style={styles.recentBox}>
                    <Text style={styles.recentHeader}>
                      {tGm('commands.recentTitle', locale)}
                    </Text>
                    {recentSlice.map((dir) => {
                      const total = Array.isArray(dir.targetCharacterIds) ? dir.targetCharacterIds.length : 0;
                      const acked = Array.isArray(dir.ackedByCharacterIds) ? dir.ackedByCharacterIds.length : 0;
                      return (
                        <View key={dir.directiveId} style={styles.recentRow}>
                          <IconText style={styles.recentLabel}>
                            {formatDirectiveBadgeLabel(dir, locale)}
                          </IconText>
                          <Text style={styles.recentAck}>
                            {formatGm(tGm('commands.recentDelivery', locale), { acked, total })}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelBtnText}>
                  {tGm('commands.cancelBtn', locale)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="gm-directive-submit-btn"
                style={[styles.submitBtn, busy && styles.submitBtnDisabled]}
                onPress={handleConfirm}
                disabled={busy}
              >
                <Text style={styles.submitBtnText}>
                  {tGm('commands.sendBtn', locale)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: ADMIN_MODAL_PALETTE.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalOuter: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderWidth: 1,
    borderColor: '#6b6335',
    borderRadius: 5,
    overflow: 'hidden',
  },
  modalInner: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderBottomWidth: 1,
    borderBottomColor: ADMIN_MODAL_PALETTE.borderMuted,
  },
  headerTitle: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  closeIconBtn: {
    padding: 4,
  },
  scrollBody: {
    flexGrow: 0,
  },
  bodyPadding: {
    padding: 16,
  },
  targetBanner: {
    color: ADMIN_MODAL_PALETTE.text,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionLabel: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 6,
  },
  commandList: {
    gap: 6,
  },
  kindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  kindBtnActive: {
    borderColor: ADMIN_MODAL_PALETTE.accent,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  kindBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '600',
  },
  kindBtnTextActive: {
    color: ADMIN_MODAL_PALETTE.text,
    fontWeight: '700',
  },
  hintText: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  amountBlock: {
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#666666',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 20,
    fontWeight: '700',
  },
  amountInput: {
    width: 104,
    height: 40,
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 5,
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#555555',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  presetBtnActive: {
    borderColor: ADMIN_MODAL_PALETTE.accent,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  presetBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    fontWeight: '700',
  },
  presetBtnTextActive: {
    color: ADMIN_MODAL_PALETTE.text,
  },
  noteInput: {
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderWidth: 1,
    borderColor: '#555555',
    borderRadius: 5,
    color: ADMIN_MODAL_PALETTE.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  recentBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    gap: 5,
  },
  recentHeader: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentLabel: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    fontWeight: '600',
  },
  recentAck: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderTopWidth: 1,
    borderTopColor: '#444444',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#555555',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  cancelBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#d4af37',
    backgroundColor: ADMIN_MODAL_PALETTE.accent,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: ADMIN_MODAL_PALETTE.accentText,
    fontSize: 13,
    fontWeight: '700',
  },
});
