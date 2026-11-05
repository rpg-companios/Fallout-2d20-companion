import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
import { tLootTrade } from '../logic/lootTradeI18n';

/**
 * Патч 539: выпадающий список локаций (родитель / выход).
 * Владелец: «Родительские и локации выхода — не кнопки, а выпадающие списки.
 * Если будет 100 локаций, тогда на экране станет 200 кнопок». Один селект
 * с поиском вместо россыпи чипов.
 */
const LocationSelect = ({
  value = '',
  onChange,
  options = [],
  placeholder,
  testID = 'location-select',
  allowNone = true,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => (options || []).find((o) => o?.id === value) || null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (options || []).filter((o) => o?.id && (!q || String(o?.name || '').toLowerCase().includes(q)));
  }, [options, query]);

  const pick = (id) => {
    if (typeof onChange === 'function') onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <View>
      <TouchableOpacity
        testID={`${testID}-toggle`}
        style={[styles.trigger, open && styles.triggerOpen]}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
      >
        <Text style={[styles.triggerText, !selected && styles.triggerPlaceholder]} numberOfLines={1}>
          {selected ? selected.name : (placeholder || tLootTrade('form.locationNone'))}
        </Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={ADMIN_MODAL_PALETTE.mutedText}
        />
      </TouchableOpacity>

      {open && (
        <View style={styles.menu}>
          <TextInput
            testID={`${testID}-search`}
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={tLootTrade('form.locationSearchPlaceholder')}
            placeholderTextColor="#8c8c8c"
          />
          <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {allowNone && (
              <TouchableOpacity
                testID={`${testID}-none`}
                style={[styles.item, !value && styles.itemSelected]}
                onPress={() => pick('')}
              >
                <Text style={[styles.itemText, !value && styles.itemTextSelected]}>
                  {tLootTrade('form.locationNone')}
                </Text>
                {!value && <MaterialCommunityIcons name="check" size={16} color={ADMIN_MODAL_PALETTE.text} />}
              </TouchableOpacity>
            )}
            {filtered.length === 0 ? (
              <Text style={styles.empty}>{tLootTrade('form.locationNoMatch')}</Text>
            ) : filtered.map((o) => {
              const isSel = o.id === value;
              return (
                <TouchableOpacity
                  key={o.id}
                  testID={`${testID}-opt-${o.id}`}
                  style={[styles.item, isSel && styles.itemSelected]}
                  onPress={() => pick(o.id)}
                >
                  <Text style={[styles.itemText, isSel && styles.itemTextSelected]} numberOfLines={1}>
                    {o.name}
                  </Text>
                  {isSel && <MaterialCommunityIcons name="check" size={16} color={ADMIN_MODAL_PALETTE.text} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerOpen: { borderColor: ADMIN_MODAL_PALETTE.gold },
  triggerText: { flex: 1, color: ADMIN_MODAL_PALETTE.text, fontSize: 14 },
  triggerPlaceholder: { color: ADMIN_MODAL_PALETTE.mutedText },
  menu: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    borderRadius: 5,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    overflow: 'hidden',
  },
  search: {
    borderBottomWidth: 1,
    borderBottomColor: ADMIN_MODAL_PALETTE.borderMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
  },
  list: { maxHeight: 200 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: ADMIN_MODAL_PALETTE.surfaceMuted,
  },
  itemSelected: { backgroundColor: ADMIN_MODAL_PALETTE.selected },
  itemText: { flex: 1, color: ADMIN_MODAL_PALETTE.text, fontSize: 13 },
  itemTextSelected: { fontWeight: '700' },
  empty: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 12, paddingHorizontal: 12, paddingVertical: 10 },
});

export default LocationSelect;
