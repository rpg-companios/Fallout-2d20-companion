import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
import { tLootTrade } from '../logic/lootTradeI18n';
import {
  ACCESS_OP,
  appendCheck,
  appendOp,
  canAppendCheck,
  canAppendOp,
  removeLastToken,
  isCompleteAccessExpression,
} from '../../../../domain/accessExpression';

/**
 * Патч 538: конструктор требования доступа «И/ИЛИ».
 * Владелец: «кнопки "+" и "/"… + — и, / — или… Замок 1 + = нельзя,
 * + Замок = нельзя, Замок + Терминал = можно, Замок / Терминал = можно».
 * Строка собирается чередованием операндов (точек-проверок) и операторов;
 * начать или закончить оператором нельзя — кнопки блокируются.
 */
const AccessExpressionBuilder = ({
  tokens = [],
  onChange,
  availableChecks = [],
}) => {
  const [query, setQuery] = useState('');
  const list = Array.isArray(tokens) ? tokens : [];
  const emit = (next) => { if (typeof onChange === 'function') onChange(next); };

  const nameOf = useMemo(() => {
    const map = new Map();
    for (const check of Array.isArray(availableChecks) ? availableChecks : []) {
      if (check?.id) map.set(check.id, check);
    }
    return (id) => map.get(id) || null;
  }, [availableChecks]);

  const filteredChecks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (Array.isArray(availableChecks) ? availableChecks : [])
      .filter((c) => c?.id && (!q || String(c?.name || '').toLowerCase().includes(q)));
  }, [availableChecks, query]);

  const allowCheck = canAppendCheck(list);
  const allowOp = canAppendOp(list);
  const complete = isCompleteAccessExpression(list);
  const endsWithOp = list.length > 0 && list[list.length - 1].type === 'op';

  return (
    <View>
      {/* Строка выражения: операнды и операторы по порядку. */}
      <View testID="access-expression-row" style={styles.expressionRow}>
        {list.length === 0 ? (
          <Text style={styles.emptyText}>{tLootTrade('form.accessExprEmpty')}</Text>
        ) : list.map((token, idx) => (
          token.type === 'check' ? (
            <View key={`c-${idx}-${token.id}`} style={styles.operandChip}>
              <Text style={styles.operandName} numberOfLines={1}>
                {nameOf(token.id)?.name || token.id}
              </Text>
              {nameOf(token.id)?.kindLabel ? (
                <Text style={styles.operandKind}>{nameOf(token.id).kindLabel}</Text>
              ) : null}
            </View>
          ) : (
            <Text key={`o-${idx}`} style={styles.opSymbol}>{token.op}</Text>
          )
        ))}
      </View>

      {/* Кнопки операторов и шага назад. */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          testID="access-op-and"
          style={[styles.opButton, !allowOp && styles.opButtonDisabled]}
          disabled={!allowOp}
          onPress={() => emit(appendOp(list, ACCESS_OP.AND))}
        >
          <Text style={[styles.opButtonText, !allowOp && styles.opButtonTextDisabled]}>
            {tLootTrade('form.accessOpAnd')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="access-op-or"
          style={[styles.opButton, !allowOp && styles.opButtonDisabled]}
          disabled={!allowOp}
          onPress={() => emit(appendOp(list, ACCESS_OP.OR))}
        >
          <Text style={[styles.opButtonText, !allowOp && styles.opButtonTextDisabled]}>
            {tLootTrade('form.accessOpOr')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="access-remove-last"
          style={[styles.opButton, list.length === 0 && styles.opButtonDisabled]}
          disabled={list.length === 0}
          onPress={() => emit(removeLastToken(list))}
        >
          <MaterialCommunityIcons
            name="backspace-outline"
            size={18}
            color={list.length === 0 ? ADMIN_MODAL_PALETTE.borderMuted : ADMIN_MODAL_PALETTE.text}
          />
        </TouchableOpacity>
        <TouchableOpacity
          testID="access-clear"
          style={[styles.opButton, list.length === 0 && styles.opButtonDisabled]}
          disabled={list.length === 0}
          onPress={() => emit([])}
        >
          <MaterialCommunityIcons
            name="close"
            size={18}
            color={list.length === 0 ? ADMIN_MODAL_PALETTE.borderMuted : ADMIN_MODAL_PALETTE.danger}
          />
        </TouchableOpacity>
      </View>

      {/* Выбор операнда: поиск и список точек-проверок. */}
      <TextInput
        testID="access-check-search"
        style={[styles.input, !allowCheck && styles.inputDisabled]}
        value={query}
        onChangeText={setQuery}
        editable={allowCheck}
        placeholder={tLootTrade('form.accessCheckSearchPlaceholder')}
        placeholderTextColor="#8c8c8c"
      />
      <View style={styles.checkChips}>
        {filteredChecks.length === 0 ? (
          <Text style={styles.hintText}>{tLootTrade('form.linkedCheckEmpty')}</Text>
        ) : filteredChecks.map((check) => (
          <TouchableOpacity
            key={check.id}
            testID={`access-check-${check.id}`}
            style={[styles.checkChip, !allowCheck && styles.checkChipDisabled]}
            disabled={!allowCheck}
            onPress={() => emit(appendCheck(list, check.id))}
          >
            <Text style={styles.checkChipName} numberOfLines={1}>{check.name}</Text>
            <Text style={styles.checkChipKind}>
              {check.kindLabel || tLootTrade('form.linkedCheckTerminal')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.hintText}>{tLootTrade('form.accessExprHint')}</Text>
      {endsWithOp && (
        <Text testID="access-expr-incomplete" style={styles.warnText}>
          {tLootTrade('form.accessExprIncomplete')}
        </Text>
      )}
      {list.length > 0 && complete && (
        <Text testID="access-expr-complete" style={styles.hintText}>
          {tLootTrade('form.accessExprReady')}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  expressionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  emptyText: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 12 },
  operandChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.selectedBorder,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  operandName: { color: ADMIN_MODAL_PALETTE.text, fontSize: 12, fontWeight: '700' },
  operandKind: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 10 },
  opSymbol: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  controlsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  opButton: {
    minWidth: 44,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  opButtonDisabled: { opacity: 0.4 },
  opButtonText: { color: ADMIN_MODAL_PALETTE.text, fontSize: 15, fontWeight: '700' },
  opButtonTextDisabled: { color: ADMIN_MODAL_PALETTE.mutedText },
  input: {
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    marginTop: 8,
  },
  inputDisabled: { opacity: 0.5 },
  checkChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  checkChip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  checkChipDisabled: { opacity: 0.4 },
  checkChipName: { color: ADMIN_MODAL_PALETTE.text, fontSize: 13, fontWeight: '700' },
  checkChipKind: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11 },
  hintText: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11, marginTop: 6, lineHeight: 16 },
  warnText: { color: ADMIN_MODAL_PALETTE.danger, fontSize: 11, marginTop: 4, lineHeight: 16 },
});

export default AccessExpressionBuilder;
