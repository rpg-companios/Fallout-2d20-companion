import React, { useState, useEffect } from 'react';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../logic/lootTradeI18n';
import IconText, { CdIcon, withCdToken } from '../../../lootTrade/LootTradeIconText';
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
          <IconText style={styles.title}>{item.name}</IconText>

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
                <IconText style={styles.packFormulaText}>
                  {withCdToken(formatLootTrade(tLootTrade('itemConfig.packFormulaBadge'), {
                    formula: singlePackFormula,
                  }))}
                </IconText>
              </View>

              {(!isEditing || packsTouched) ? (
                <IconText style={styles.hint}>
                  {ammoSpec?.cd > 0
                    ? withCdToken(formatLootTrade(tLootTrade('itemConfig.packsTotalRollHint'), {
                        packs: numericCount,
                        formula: totalPackFormula,
                      }))
                    : formatLootTrade(tLootTrade('itemConfig.packsFixedHint'), {
                        packs: numericCount,
                        total: numericCount * Math.max(1, ammoSpec?.base || 1),
                      })}
                </IconText>
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
                {[QUANTITY_UNIT.PCS, QUANTITY_UNIT.CD, QUANTITY_UNIT.D20].map((uKey) => {
                  const active = unit === uKey;
                  return (
                    <TouchableOpacity
                      key={uKey}
                      style={[
                        styles.unitBtn,
                        uKey === QUANTITY_UNIT.CD && styles.unitBtnCd,
                        active && styles.unitBtnActive,
                      ]}
                      onPress={() => setUnit(uKey)}
                    >
                      {uKey === QUANTITY_UNIT.CD ? (
                        <CdIcon size={38} />
                      ) : uKey === QUANTITY_UNIT.D20 ? (
                        <MaterialCommunityIcons name="dice-d20" size={32} color={ADMIN_MODAL_PALETTE.text} />
                      ) : (
                        <Text style={[styles.unitBtnText, active && styles.unitBtnTextActive]}>
                          {tLootTrade('itemConfig.unitPcs')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {unit === QUANTITY_UNIT.CD && (
                <IconText style={styles.hint}>{tLootTrade('itemConfig.diceHintCd')}</IconText>
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
              <IconText style={styles.previewPrice}>
                {formatLootTrade(tLootTrade('itemConfig.pricePreview'), {
                  base: baseCost,
                  final: previewPrice,
                })}
              </IconText>
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
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  card: {
    width: '90%',
    maxWidth: 460,
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: ADMIN_MODAL_PALETTE.accent,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: 'center',
  },
  subtitle: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  currentStockText: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 12,
    marginBottom: 4,
  },
  label: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 7,
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
    borderRadius: 5,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#666666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 22,
    fontWeight: '700',
  },
  countInput: {
    width: 110,
    height: 42,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 5,
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  packFormulaPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 5,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderWidth: 1,
    borderColor: '#d4af37',
  },
  packFormulaText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unitBtn: {
    minWidth: 58,
    height: 40,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  unitBtnCd: {
    paddingHorizontal: 9,
  },
  unitBtnActive: {
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderColor: ADMIN_MODAL_PALETTE.accent,
  },
  unitBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    fontWeight: '700',
  },
  unitBtnTextActive: {
    color: ADMIN_MODAL_PALETTE.text,
  },
  hint: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 7,
    lineHeight: 16,
  },
  markupSection: {
    width: '100%',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3d3d3d',
    alignItems: 'center',
  },
  smallStepBtn: {
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#666666',
  },
  smallStepText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    fontWeight: '700',
  },
  markupInput: {
    width: 78,
    height: 38,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 5,
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewPrice: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 7,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
  },
  saveBtn: {
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderColor: ADMIN_MODAL_PALETTE.accent,
  },
  saveBtnText: {
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
});

export default ContainerItemConfigModal;
