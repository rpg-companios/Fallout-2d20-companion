import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../logic/lootTradeI18n';
import {
  QUANTITY_UNIT,
  computeMerchantSellPriceToPlayer,
  normalizeSaleMarkupPercent,
} from '../../../../domain/lootTrade';

const ContainerItemConfigModal = ({
  visible,
  item,
  isMerchant = false,
  merchantSaleMarkupPercent = 0,
  isEditing = false,
  onSave,
  onClose,
}) => {
  useLocale();
  const [count, setCount] = useState('1');
  const [unit, setUnit] = useState(QUANTITY_UNIT.PCS);
  const [markupPercent, setMarkupPercent] = useState('0');

  useEffect(() => {
    if (!visible || !item) return;
    setCount(String(item.quantity && isEditing ? item.quantity : 1));
    setUnit(QUANTITY_UNIT.PCS);
    setMarkupPercent(String(item.markupPercent ?? 0));
  }, [visible, item, isEditing]);

  if (!item) return null;

  const stepCount = (delta) => {
    const cur = parseInt(count, 10) || 1;
    const next = Math.max(1, cur + delta);
    setCount(String(next));
  };

  const stepMarkup = (delta) => {
    const cur = parseInt(markupPercent, 10) || 0;
    const next = Math.max(-100, cur + delta);
    setMarkupPercent(String(next));
  };

  const baseCost = Math.max(0, Number(item.cost ?? item.price ?? 0) || 0);
  const parsedMarkup = normalizeSaleMarkupPercent(markupPercent, 0);
  const previewPrice = computeMerchantSellPriceToPlayer(
    { cost: baseCost, markupPercent: parsedMarkup },
    { saleMarkupPercent: merchantSaleMarkupPercent, capCollectorPercent: 0 },
  );

  const handleConfirm = () => {
    const numericCount = Math.max(1, parseInt(count, 10) || 1);
    onSave({
      count: numericCount,
      unit,
      markupPercent: isMerchant ? parsedMarkup : 0,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Text style={styles.subtitle}>
            {tLootTrade(isEditing ? 'itemConfig.titleEdit' : 'itemConfig.titleAdd')}
          </Text>
          <Text style={styles.title}>{item.name}</Text>

          <Text style={styles.label}>{tLootTrade('itemConfig.quantityLabel')}</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity style={styles.circleBtn} onPress={() => stepCount(-1)}>
              <Text style={styles.circleBtnText}>−</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.countInput}
              value={count}
              onChangeText={setCount}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.circleBtn} onPress={() => stepCount(1)}>
              <Text style={styles.circleBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{tLootTrade('itemConfig.unitLabel')}</Text>
          <View style={styles.unitRow}>
            {[
              [QUANTITY_UNIT.PCS, tLootTrade('itemConfig.unitPcs')],
              [QUANTITY_UNIT.CD, tLootTrade('itemConfig.unitCd')],
              [QUANTITY_UNIT.D20, tLootTrade('itemConfig.unitD20')],
            ].map(([uKey, uLabel]) => (
              <TouchableOpacity
                key={uKey}
                style={[styles.unitBtn, unit === uKey && styles.unitBtnActive]}
                onPress={() => setUnit(uKey)}
              >
                <Text style={[styles.unitBtnText, unit === uKey && styles.unitBtnTextActive]}>
                  {uLabel}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {unit === QUANTITY_UNIT.CD && (
            <Text style={styles.hint}>{tLootTrade('itemConfig.diceHintCd')}</Text>
          )}
          {unit === QUANTITY_UNIT.D20 && (
            <Text style={styles.hint}>{tLootTrade('itemConfig.diceHintD20')}</Text>
          )}

          {isMerchant && item.itemType !== 'caps' && (
            <View style={styles.markupSection}>
              <Text style={styles.label}>{tLootTrade('itemConfig.itemMarkupLabel')}</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity style={styles.smallStepBtn} onPress={() => stepMarkup(-10)}>
                  <Text style={styles.smallStepText}>−10%</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallStepBtn} onPress={() => stepMarkup(-5)}>
                  <Text style={styles.smallStepText}>−5%</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.markupInput}
                  value={markupPercent}
                  onChangeText={setMarkupPercent}
                  keyboardType="numbers-and-punctuation"
                />
                <TouchableOpacity style={styles.smallStepBtn} onPress={() => stepMarkup(5)}>
                  <Text style={styles.smallStepText}>+5%</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallStepBtn} onPress={() => stepMarkup(10)}>
                  <Text style={styles.smallStepText}>+10%</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                {formatLootTrade(tLootTrade('itemConfig.itemMarkupHint'), {
                  merchantMarkup: merchantSaleMarkupPercent >= 0
                    ? `+${merchantSaleMarkupPercent}`
                    : String(merchantSaleMarkupPercent),
                })}
              </Text>
              <Text style={styles.previewPrice}>
                {formatLootTrade(tLootTrade('itemConfig.pricePreview'), {
                  base: baseCost,
                  final: previewPrice,
                })}
              </Text>
            </View>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={handleConfirm}>
              <Text style={styles.actionBtnText}>{tLootTrade('itemConfig.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.actionBtnText}>{tLootTrade('itemConfig.cancel')}</Text>
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
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d4af37',
    padding: 20,
    alignItems: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: '#f0e68c',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  label: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
    textAlign: 'center',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#6b7280',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  countInput: {
    width: 110,
    height: 42,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 8,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  unitRow: {
    flexDirection: 'row',
    gap: 10,
  },
  unitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6b7280',
    backgroundColor: '#1f2937',
  },
  unitBtnActive: {
    backgroundColor: '#f0e68c',
    borderColor: '#f0e68c',
  },
  unitBtnText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
  },
  unitBtnTextActive: {
    color: '#111827',
  },
  hint: {
    color: '#9ca3af',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 5,
  },
  markupSection: {
    width: '100%',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    alignItems: 'center',
  },
  smallStepBtn: {
    backgroundColor: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6b7280',
  },
  smallStepText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  markupInput: {
    width: 78,
    height: 38,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewPrice: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 18,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtn: { backgroundColor: '#2e7d32' },
  cancelBtn: { backgroundColor: '#b91c1c' },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ContainerItemConfigModal;
