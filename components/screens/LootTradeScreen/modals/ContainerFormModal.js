import React, { useState, useEffect } from 'react';
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
import { formatRoomCodeForDisplay } from '../../../../src/room/roomCode';
import {
  CONTAINER_KIND,
  QUANTITY_UNIT,
  DEFAULT_MERCHANT_CAPS,
  DEFAULT_SALE_MARKUP_PERCENT,
  DEFAULT_BUY_DEPRECIATION_PERCENT,
  resolveQuantitySpec,
  normalizeSaleMarkupPercent,
  normalizeBuyDepreciationPercent,
} from '../../../../domain/lootTrade';
import { showRawAlert } from '../../../alerts/alertService';

const ContainerFormModal = ({
  visible,
  kind = CONTAINER_KIND.LOOT,
  initialContainer = null,
  availableRooms = [],
  onSave,
  onClose,
}) => {
  useLocale();

  const isMerchant = (initialContainer?.kind || kind) === CONTAINER_KIND.MERCHANT;
  const isEditing = Boolean(initialContainer?.id && !initialContainer?.__isDuplicateDraft);

  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [description, setDescription] = useState('');
  const [capsCount, setCapsCount] = useState(String(DEFAULT_MERCHANT_CAPS));
  const [capsUnit, setCapsUnit] = useState(QUANTITY_UNIT.PCS);
  const [saleMarkup, setSaleMarkup] = useState(String(DEFAULT_SALE_MARKUP_PERCENT));
  const [buyDepreciation, setBuyDepreciation] = useState(String(DEFAULT_BUY_DEPRECIATION_PERCENT));

  useEffect(() => {
    if (!visible) return;
    setName(initialContainer?.name || '');
    const defaultRoom = initialContainer?.roomCode || availableRooms[0]?.code || '';
    setRoomCode(defaultRoom);
    setDescription(initialContainer?.description || '');
    setCapsCount(String(
      initialContainer?.caps !== undefined ? initialContainer.caps : DEFAULT_MERCHANT_CAPS,
    ));
    setCapsUnit(QUANTITY_UNIT.PCS);
    setSaleMarkup(String(
      initialContainer?.saleMarkupPercent !== undefined
        ? initialContainer.saleMarkupPercent
        : DEFAULT_SALE_MARKUP_PERCENT,
    ));
    setBuyDepreciation(String(
      initialContainer?.buyDepreciationPercent !== undefined
        ? initialContainer.buyDepreciationPercent
        : DEFAULT_BUY_DEPRECIATION_PERCENT,
    ));
  }, [visible, initialContainer, availableRooms]);

  const stepCaps = (delta) => {
    const cur = parseInt(capsCount, 10) || 0;
    const min = capsUnit === QUANTITY_UNIT.PCS ? 0 : 1;
    const next = Math.max(min, cur + delta);
    setCapsCount(String(next));
  };

  const handleSave = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      showRawAlert({ title: tLootTrade('form.validationName') });
      return;
    }
    if (!roomCode) {
      showRawAlert({ title: tLootTrade('form.validationRoom') });
      return;
    }

    const roomRecord = availableRooms.find((r) => r.code === roomCode);
    let resolvedCaps = 0;
    let capsRollInfo = null;

    if (isMerchant) {
      const roll = resolveQuantitySpec({
        count: parseInt(capsCount, 10) || 0,
        unit: capsUnit,
        allowZeroPcs: true,
      });
      resolvedCaps = roll.quantity;
      if (roll.rolled) capsRollInfo = roll;
    }

    onSave({
      ...(initialContainer || {}),
      kind: isMerchant ? CONTAINER_KIND.MERCHANT : CONTAINER_KIND.LOOT,
      name: cleanName,
      roomCode,
      roomName: roomRecord?.name || initialContainer?.roomName || roomCode,
      description: description.trim(),
      caps: resolvedCaps,
      saleMarkupPercent: isMerchant ? normalizeSaleMarkupPercent(saleMarkup, 0) : 0,
      buyDepreciationPercent: isMerchant ? normalizeBuyDepreciationPercent(buyDepreciation, 50) : 50,
    }, capsRollInfo);
  };

  const titleKey = isMerchant
    ? (isEditing ? 'form.editMerchantTitle' : 'form.createMerchantTitle')
    : (isEditing ? 'form.editLootTitle' : 'form.createLootTitle');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{tLootTrade(titleKey)}</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.label}>{tLootTrade('form.nameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={tLootTrade('form.namePlaceholder')}
              placeholderTextColor="#8c8c8c"
            />

            <Text style={styles.label}>{tLootTrade('form.roomLabel')}</Text>
            {availableRooms.length === 0 ? (
              <Text style={styles.warnText}>{tLootTrade('form.noRoomsHint')}</Text>
            ) : (
              <View style={styles.roomChips}>
                {availableRooms.map((room) => {
                  const selected = room.code === roomCode;
                  return (
                    <TouchableOpacity
                      key={room.code}
                      style={[styles.roomChip, selected && styles.roomChipActive]}
                      onPress={() => setRoomCode(room.code)}
                    >
                      <Text style={[styles.roomChipName, selected && styles.roomChipTextActive]}>
                        {room.name}
                      </Text>
                      <Text style={[styles.roomChipCode, selected && styles.roomChipTextActive]}>
                        {formatRoomCodeForDisplay(room.code)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={styles.label}>{tLootTrade('form.descriptionLabel')}</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder={tLootTrade('form.descriptionPlaceholder')}
              placeholderTextColor="#8c8c8c"
              multiline
            />

            {isMerchant && (
              <>
                <Text style={styles.label}>{tLootTrade('form.merchantCapsLabel')}</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => stepCaps(-10)}>
                    <Text style={styles.stepBtnText}>−10</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => stepCaps(-1)}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.counterInput}
                    value={capsCount}
                    onChangeText={setCapsCount}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity style={styles.stepBtn} onPress={() => stepCaps(1)}>
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => stepCaps(10)}>
                    <Text style={styles.stepBtnText}>+10</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.unitSegments}>
                  {[
                    [QUANTITY_UNIT.PCS, tLootTrade('itemConfig.unitPcs')],
                    [QUANTITY_UNIT.CD, tLootTrade('itemConfig.unitCd')],
                    [QUANTITY_UNIT.D20, tLootTrade('itemConfig.unitD20')],
                  ].map(([uKey, uLabel]) => (
                    <TouchableOpacity
                      key={uKey}
                      style={[styles.unitSeg, capsUnit === uKey && styles.unitSegActive]}
                      onPress={() => setCapsUnit(uKey)}
                    >
                      <Text style={[styles.unitSegText, capsUnit === uKey && styles.unitSegTextActive]}>
                        {uLabel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>{tLootTrade('form.saleMarkupLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={saleMarkup}
                  onChangeText={setSaleMarkup}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.hintText}>{tLootTrade('form.saleMarkupHint')}</Text>

                <Text style={styles.label}>{tLootTrade('form.buyDepreciationLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={buyDepreciation}
                  onChangeText={setBuyDepreciation}
                  keyboardType="number-pad"
                />
                <Text style={styles.hintText}>{tLootTrade('form.buyDepreciationHint')}</Text>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{tLootTrade('form.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{tLootTrade('form.cancel')}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#f0e68c',
    padding: 20,
  },
  title: {
    color: '#f0e68c',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 8 },
  label: {
    color: '#e8e8e8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#f2f2f2',
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 62,
    textAlignVertical: 'top',
  },
  warnText: {
    color: '#e57373',
    fontSize: 12,
    paddingVertical: 6,
  },
  hintText: {
    color: '#a3a3a3',
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  roomChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: '#2a2a2a',
  },
  roomChipActive: {
    backgroundColor: '#f0e68c',
    borderColor: '#d4af37',
  },
  roomChipName: {
    color: '#f0f0f0',
    fontSize: 13,
    fontWeight: '700',
  },
  roomChipCode: {
    color: '#a3a3a3',
    fontSize: 11,
  },
  roomChipTextActive: {
    color: '#1a1a1a',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 4,
  },
  stepBtn: {
    backgroundColor: '#2e2e2e',
    minWidth: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#666666',
  },
  stepBtnText: {
    color: '#f0e68c',
    fontSize: 15,
    fontWeight: '700',
  },
  counterInput: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 8,
    width: 96,
    height: 38,
    textAlign: 'center',
    color: '#f5f5f5',
    fontSize: 16,
    fontWeight: '700',
  },
  unitSegments: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  unitSeg: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: '#2a2a2a',
  },
  unitSegActive: {
    backgroundColor: '#f0e68c',
    borderColor: '#d4af37',
  },
  unitSegText: {
    color: '#dcdcdc',
    fontSize: 13,
    fontWeight: '700',
  },
  unitSegTextActive: {
    color: '#1a1a1a',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  saveBtn: {
    backgroundColor: '#3a3a1e',
    borderColor: '#f0e68c',
  },
  saveBtnText: {
    color: '#f0e68c',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: '#2a2a2a',
    borderColor: '#777777',
  },
  cancelBtnText: {
    color: '#d4d4d4',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ContainerFormModal;
