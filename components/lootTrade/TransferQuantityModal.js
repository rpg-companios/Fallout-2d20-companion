// components/lootTrade/TransferQuantityModal.js
// Патч 561 — «сколько переместить?».
//
// Слово владельца: «тап по назначению или клик автоматически переносят предмет…
// откроется ещё модалка поверх и там будет заголовок: сколько переместить? А
// ниже ячейка с числом. Ещё ниже ползунок, который регулирует количество. Ниже
// 2 кнопки "подтвердить" "отмена"». И уточнение: «Не просто "сколько", а как я и
// говорил — значение +, "−" появляется при количестве отданных более 1».
//
// Одно окно на оба мира: склад и торговец. Количество всегда уходит в БУФЕР —
// окончательный обмен делает нижняя кнопка окна («Перенести» / «Купить» /
// «Продать»), поэтому «Отмена» здесь просто закрывает окно.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { formatLootTrade, tLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function TransferQuantityModal({
  visible = false,
  itemName = '',
  directionLabel = '',
  available = 0,
  max = 1,
  renderTotal = null,
  onCancel,
  onConfirm,
}) {
  const t = (key) => tLootTrade(key);
  const upper = Math.max(1, Number(max) || 1);
  const [value, setValue] = useState(1);
  const [draft, setDraft] = useState('1');
  const [trackWidth, setTrackWidth] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Каждое открытие — с единицы.
  useEffect(() => {
    if (!visible) return;
    setValue(1);
    setDraft('1');
  }, [visible, itemName, upper]);

  const apply = (next) => {
    const clamped = clamp(Math.round(Number(next) || 1), 1, upper);
    setValue(clamped);
    setDraft(String(clamped));
  };

  // 561: поле не показывает недопустимое значение — сразу приводим к 1…upper,
  // пустую строку оставляем только на время набора.
  const onDraftChange = (text) => {
    const digits = String(text || '').replace(/[^\d]/g, '').slice(0, 6);
    if (digits === '') {
      setDraft('');
      return;
    }
    const next = clamp(Number(digits) || 1, 1, upper);
    setValue(next);
    setDraft(String(next));
  };

  const onDraftBlur = () => setDraft(String(value));

  const pct = upper > 1 ? ((value - 1) / (upper - 1)) * 100 : 0;

  const updateFromX = (x) => {
    if (!trackWidth || upper <= 1) return;
    const ratio = clamp(Number(x) || 0, 0, trackWidth) / trackWidth;
    apply(1 + ratio * (upper - 1));
  };

  const totalLine = useMemo(
    () => (typeof renderTotal === 'function' ? renderTotal(value) : ''),
    [renderTotal, value],
  );

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog} testID="transfer-quantity-modal">
          <Text style={styles.title}>{t('player.quantityTitle')}</Text>
          {Boolean(itemName) && (
            <Text style={styles.item} numberOfLines={2}>{itemName}</Text>
          )}
          <Text style={styles.meta}>
            {[directionLabel, formatLootTrade(t('player.quantityAvailable'), { count: available })]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          <View style={styles.stepperRow}>
            {/* 561 (слово владельца): «−» появляется, когда значение больше 1.
                Место под неё резервируем, чтобы ячейка не прыгала. */}
            {value > 1 ? (
              <TouchableOpacity
                testID="transfer-quantity-minus"
                style={styles.stepBtn}
                onPress={() => apply(value - 1)}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.stepBtnPlaceholder} />
            )}

            <TextInput
              testID="transfer-quantity-input"
              style={styles.valueCell}
              value={draft}
              onChangeText={onDraftChange}
              onBlur={onDraftBlur}
              onSubmitEditing={() => { setDraft(String(value)); }}
              keyboardType="number-pad"
              inputMode="numeric"
              textAlign="center"
              selectTextOnFocus
              maxLength={6}
            />

            <TouchableOpacity
              testID="transfer-quantity-plus"
              style={styles.stepBtn}
              onPress={() => apply(value + 1)}
              disabled={value >= upper}
            >
              <Text style={[styles.stepBtnText, value >= upper && styles.stepBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>

          {upper > 1 && (
            <View
              testID="transfer-quantity-slider"
              style={styles.sliderTrack}
              onLayout={(event) => setTrackWidth(event?.nativeEvent?.layout?.width || 0)}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(event) => updateFromX(event?.nativeEvent?.locationX ?? 0)}
              onResponderMove={(event) => updateFromX(event?.nativeEvent?.locationX ?? 0)}
            >
              <View style={[styles.sliderFill, { width: `${pct}%` }]} />
              <View style={[styles.sliderKnob, { left: `${pct}%` }]} />
            </View>
          )}

          {Boolean(totalLine) && <Text style={styles.total}>{totalLine}</Text>}

          <View style={styles.buttonsRow}>
            <TouchableOpacity
              testID="transfer-quantity-cancel"
              style={styles.cancelBtn}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>{t('player.quantityCancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="transfer-quantity-confirm"
              style={styles.confirmBtn}
              onPress={() => onConfirm?.(value)}
            >
              <Text style={styles.confirmText}>{t('player.quantityConfirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: {
    backgroundColor: '#1f1f1f',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#f0e68c',
    paddingHorizontal: 20,
    paddingVertical: 18,
    width: '100%',
    maxWidth: 360,
  },
  title: { color: '#f0e68c', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  item: { color: '#f0f0f0', fontSize: 14, fontWeight: '600', lineHeight: 19 },
  meta: { color: '#a3a3a3', fontSize: 12, marginTop: 3, marginBottom: 14 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f0e68c',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2b2b2b',
  },
  stepBtnPlaceholder: { width: 44, height: 44 },
  stepBtnText: { color: '#f0e68c', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  stepBtnTextDisabled: { color: '#6b6b6b' },
  valueCell: {
    minWidth: 92,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: '#141414',
    color: '#f0f0f0',
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 10,
  },
  sliderTrack: {
    height: 28,
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: '#2b2b2b',
    borderWidth: 1,
    borderColor: '#4a4a4a',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#4a4526' },
  sliderKnob: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    backgroundColor: '#f0e68c',
  },
  total: { color: '#a3a3a3', fontSize: 12, marginTop: 12 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6b6b6b',
  },
  cancelText: { color: '#d4d4d4', fontSize: 13, fontWeight: '600' },
  confirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#f0e68c',
  },
  confirmText: { color: '#1a1a1a', fontSize: 13, fontWeight: '700' },
};
