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
  isAmmoItem,
  getAmmoFoundSpec,
  formatAmmoFoundFormula,
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
  const ammoMode = isAmmoItem(item);
  const ammoSpec = ammoMode ? getAmmoFoundSpec(item) : null;

  const [count, setCount] = useState('1');
  const [unit, setUnit] = useState(QUANTITY_UNIT.PCS);
  const [markupPercent, setMarkupPercent] = useState('0');
  const [packsTouched, setPacksTouched] = useState(false);

  useEffect(() => {
    if (!visible || !item) return;
    if (isAmmoItem(item)) {
      setCount('1');
      setUnit(QUANTITY_UNIT.PACKS);
      // В контейнере добычи единственное действие в редактировании — перебросить пачками;
      // у торговца по умолчанию сохраняем текущий остаток, если Мастер меняет только % наценки.
      setPacksTouched(!isEditing || !isMerchant);
    } else {
      setCount(String(item.quantity && isEditing ? item.quantity : 1));
      setUnit(QUANTITY_UNIT.PCS);
      setPacksTouched(false);
    }
    setMarkupPercent(String(item.markupPercent ?? 0));
  }, [visible, item, isEditing, isMerchant]);

  if (!item) return null;

  const stepCount = (delta) => {
    const cur = parseInt(count, 10) || 1;
    const next = Math.max(1, cur + delta);
    setCount(String(next));
    if (ammoMode) setPacksTouched(true);
  };

  const handleChangeCount = (val) => {
    setCount(val);
    if (ammoMode) setPacksTouched(true);
  };

  const stepMarkup = (delta) => {
    const cur = parseInt(markupPercent, 10) || 0;
    const next = Math.max(-100, cur + delta);
    setMarkupPercent(String(next));
  };

  const numericCount = Math.max(1, parseInt(count, 10) || 1);
  const baseCost = Math.max(0, Number(item.cost ?? item.price ?? 0) || 0);
  const parsedMarkup = normalizeSaleMarkupPercent(markupPercent, 0);
  const previewPrice = computeMerchantSellPriceToPlayer(
    { cost: baseCost, markupPercent: parsedMarkup },
    { saleMarkupPercent: merchantSaleMarkupPercent, capCollectorPercent: 0 },
  );

  const singlePackFormula = ammoSpec ? formatAmmoFoundFormula(ammoSpec) : '';
  const totalPackFormula = ammoSpec
    ? formatAmmoFoundFormula({
        base: numericCount * ammoSpec.base,
        cd: numericCount * ammoSpec.cd,
      })
    : '';

  const handleConfirm = () => {
    if (ammoMode) {
      if (isEditing && isMerchant && !packsTouched && item.quantity > 0) {
        onSave({
          count: item.quantity,
          unit: QUANTITY_UNIT.PCS,
          keepExistingQuantity: true,
          markupPercent: parsedMarkup,
        });
        return;
      }
      onSave({
        count: numericCount,
        unit: QUANTITY_UNIT.PACKS,
        markupPercent: isMerchant ? parsedMarkup : 0,
      });
      return;
    }

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

          {ammoMode ? (
            <>
              {isEditing && item.quantity > 0 && (
                <Text style={styles.currentStockText}>
                  {formatLootTrade(tLootTrade('itemConfig.packsEditCurrentStock'), {
                    qty: item.quantity,
                  })}
                </Text>
              )}

              <Text style={styles.label}>{tLootTrade('itemConfig.packsLabel')}</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity style={styles.circleBtn} onPress={() => stepCount(-1)}>
                  <Text style={styles.circleBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.countInput}
                  value={count}
                  onChangeText={handleChangeCount}
                  keyboardType="number-pad"
                />
                <TouchableOpacity style={styles.circleBtn} onPress={() => stepCount(1)}>
                  <Text style={styles.circleBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.packFormulaPill}>
                <Text style={styles.packFormulaText}>
                  {formatLootTrade(tLootTrade('itemConfig.packFormulaBadge'), {
                    formula: singlePackFormula,
                  })}
                </Text>
              </View>

              {(!isEditing || packsTouched) ? (
                <Text style={styles.hint}>
                  {ammoSpec?.cd > 0
                    ? formatLootTrade(tLootTrade('itemConfig.packsTotalRollHint'), {
                        packs: numericCount,
                        formula: totalPackFormula,
                      })
                    : formatLootTrade(tLootTrade('itemConfig.packsFixedHint'), {
                        packs: numericCount,
                        total: numericCount * Math.max(1, ammoSpec?.base || 1),
                      })}
                </Text>
              ) : (
                <Text style={styles.hint}>{tLootTrade('itemConfig.packsEditKeepHint')}</Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.label}>{tLootTrade('itemConfig.quantityLabel')}</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity style={styles.circleBtn} onPress={() => stepCount(-1)}>
                  <Text style={styles.circleBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.countInput}
                  value={count}
                  onChangeText={handleChangeCount}
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
            </>
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
              <Text style={styles.saveBtnText}>{tLootTrade('itemConfig.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{tLootTrade('itemConfig.cancel')}</Text>
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
    maxWidth: 460,
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#f0e68c',
    padding: 22,
    alignItems: 'center',
  },
  subtitle: {
    color: '#a3a3a3',
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
  currentStockText: {
    color: '#d4d4d4',
    fontSize: 12,
    marginBottom: 4,
  },
  label: {
    color: '#e8e8e8',
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
    backgroundColor: '#2e2e2e',
    borderWidth: 1,
    borderColor: '#666666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleBtnText: {
    color: '#f0e68c',
    fontSize: 22,
    fontWeight: '700',
  },
  countInput: {
    width: 110,
    height: 42,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 8,
    color: '#f5f5f5',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  packFormulaPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2d2a1e',
    borderWidth: 1,
    borderColor: '#d4af37',
  },
  packFormulaText: {
    color: '#f0e68c',
    fontSize: 14,
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
    borderColor: '#5a5a5a',
    backgroundColor: '#2a2a2a',
  },
  unitBtnActive: {
    backgroundColor: '#f0e68c',
    borderColor: '#d4af37',
  },
  unitBtnText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '700',
  },
  unitBtnTextActive: {
    color: '#1a1a1a',
  },
  hint: {
    color: '#b0b0b0',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  markupSection: {
    width: '100%',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#3d3d3d',
    alignItems: 'center',
  },
  smallStepBtn: {
    backgroundColor: '#2e2e2e',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#666666',
  },
  smallStepText: {
    color: '#e8e8e8',
    fontSize: 12,
    fontWeight: '700',
  },
  markupInput: {
    width: 78,
    height: 38,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 8,
    color: '#f5f5f5',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewPrice: {
    color: '#f0e68c',
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

export default ContainerItemConfigModal;
