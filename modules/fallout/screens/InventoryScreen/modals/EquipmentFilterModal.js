// Окно фильтров снаряжения (патч 429 — слово владельца: «Отдельное окно,
// с чекбоксами категорий. И только когда выбран чекбокс — показать
// параметры категории, а не сразу всё… Наоборот, сначала параметры не
// видно, пока не выбрана категория»). До отметки категорий в окне ТОЛЬКО
// чекбоксы категорий; отметил — появились «Редкость» и параметры
// отмеченных (оружейные — от «Оружия», сопротивления и части тела — от
// «Брони»/«Силовой брони»/«Одежды»). Внизу «Показать (N)» — сколько
// предметов найдётся. Шапка и кнопка на месте, содержимое прокручивается
// (скролл-закон 402). Приложение мобильное — окно вместо встроенной
// панели, чтобы не занимать список предметов.
import React, { useState } from 'react';
import { Modal, SafeAreaView, ScrollView, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { tInventory } from '../../../../../components/screens/InventoryScreen/logic/inventoryI18n';
import styles from '../../../styles/EquipmentFilterModal.styles';

const t = (key) => tInventory(`modals.addItemModal.filter.${key}`);

/** Поле диапазона «от–до»: подсказка-граница серым, исчезает при касании. */
const RangeRow = ({ label, hint, value, onChange }) => {
  // Слово владельца 425: подсказка пропадает, как только поле коснулись.
  const [touchedFrom, setTouchedFrom] = useState(false);
  const [touchedTo, setTouchedTo] = useState(false);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rangeDash}>{t('from')}</Text>
      <TextInput
        style={styles.rangeInput}
        value={value.from}
        onChangeText={(text) => onChange({ ...value, from: text })}
        onFocus={() => setTouchedFrom(true)}
        onBlur={() => setTouchedFrom(false)}
        keyboardType="number-pad"
        placeholder={touchedFrom ? '' : String(hint?.min ?? '')}
        placeholderTextColor="#999"
      />
      <Text style={styles.rangeDash}>{t('to')}</Text>
      <TextInput
        style={styles.rangeInput}
        value={value.to}
        onChangeText={(text) => onChange({ ...value, to: text })}
        onFocus={() => setTouchedTo(true)}
        onBlur={() => setTouchedTo(false)}
        keyboardType="number-pad"
        placeholder={touchedTo ? '' : String(hint?.max ?? '')}
        placeholderTextColor="#999"
      />
    </View>
  );
};

/** Чипсы (одиночный/мультивыбор кликами). */
const ChipsRow = ({ label, options, selected, onToggle }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    {options.map((option) => {
      const on = selected.includes(option.id);
      return (
        <TouchableOpacity
          key={option.id}
          style={[styles.chip, on && styles.chipOn]}
          onPress={() => onToggle(option.id)}
        >
          <Text style={[styles.chipText, on && styles.chipTextOn]}>{option.name}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

/** Выпадающий список с галочками (мультивыбор). */
const DropdownRow = ({ label, options, selected, onToggle }) => {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity style={styles.dropdownHeader} onPress={() => setOpen((prev) => !prev)}>
        <Text style={styles.dropdownArrow}>{open ? '▼' : '►'}</Text>
        <Text style={styles.dropdownTitle}>{label}</Text>
        {selected.length > 0 && (
          <Text style={styles.dropdownCount}>{selected.length} {t('selected')}</Text>
        )}
      </TouchableOpacity>
      {open && options.map((option) => {
        const on = selected.includes(option.id);
        return (
          <TouchableOpacity key={option.id} style={styles.optionRow} onPress={() => onToggle(option.id)}>
            <Text style={styles.optionText}>{on ? '☑' : '☐'} {option.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

/**
 * Окно фильтра (вместо встроенной панели 425–427). options —
 * buildEquipmentFilterOptions(locale, labels); filter/onChange —
 * состояние фильтра; foundCount — сколько предметов найдётся.
 */
const EquipmentFilterModal = ({ visible, options, filter, onChange, onReset, onClose, foundCount }) => {
  if (!options || !filter) return null;
  const toggleIn = (list, id) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const setRange = (key) => (value) => onChange({ ...filter, [key]: value });
  const toggleList = (key) => (id) => onChange({ ...filter, [key]: toggleIn(filter[key], id) });
  const toggleKind = (id) => onChange({ ...filter, kinds: toggleIn(filter.kinds ?? [], id) });

  // Слово владельца 429: параметры не видны, пока не выбрана категория.
  const kinds = filter.kinds ?? [];
  const anyKindChecked = kinds.length > 0;
  const showWeapon = kinds.includes('weapon');
  const showArmor = kinds.includes('armor') || kinds.includes('powerArmor') || kinds.includes('clothing');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('title')}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.sectionTitle}>{t('categories')}</Text>
            <View style={styles.kindsRow}>
              {(options.kinds ?? []).map((kind) => {
                const on = kinds.includes(kind.id);
                return (
                  <TouchableOpacity
                    key={kind.id}
                    style={[styles.kindBox, on && styles.kindBoxOn]}
                    onPress={() => toggleKind(kind.id)}
                  >
                    <Text style={styles.kindCheck}>{on ? '☑' : '☐'}</Text>
                    <Text style={[styles.kindName, on && styles.kindNameOn]}>{kind.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {anyKindChecked && (
              <View>
                <RangeRow label={t('rarity')} hint={options.rarity} value={filter.rarity} onChange={setRange('rarity')} />

                {showWeapon && (
                  <View>
                    <Text style={styles.sectionTitle}>{t('weaponSection')}</Text>
                    <RangeRow label={t('damage')} hint={options.damage} value={filter.damage} onChange={setRange('damage')} />
                    <RangeRow label={t('fireRate')} hint={options.fireRate} value={filter.fireRate} onChange={setRange('fireRate')} />
                    <ChipsRow label={t('distance')} options={options.distances} selected={filter.distance} onToggle={toggleList('distance')} />
                    <ChipsRow label={t('damageType')} options={options.damageTypes} selected={filter.damageTypes} onToggle={toggleList('damageTypes')} />
                    <ChipsRow label={t('weaponType')} options={options.weaponTypes} selected={filter.weaponTypes} onToggle={toggleList('weaponTypes')} />
                    <DropdownRow label={t('ammo')} options={options.ammoOptions} selected={filter.ammo} onToggle={toggleList('ammo')} />
                    <DropdownRow label={t('qualities')} options={options.qualities} selected={filter.qualities} onToggle={toggleList('qualities')} />
                    <DropdownRow label={t('effects')} options={options.effects} selected={filter.effects} onToggle={toggleList('effects')} />
                  </View>
                )}

                {showArmor && (
                  <View>
                    <Text style={styles.sectionTitle}>{t('armorSection')}</Text>
                    <RangeRow label={t('physical')} hint={options.physical} value={filter.physical} onChange={setRange('physical')} />
                    <RangeRow label={t('energy')} hint={options.energy} value={filter.energy} onChange={setRange('energy')} />
                    <RangeRow label={t('radiation')} hint={options.radiation} value={filter.radiation} onChange={setRange('radiation')} />
                    <ChipsRow label={t('bodyParts')} options={options.bodyParts} selected={filter.bodyParts} onToggle={toggleList('bodyParts')} />
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.resetButton} onPress={onReset}>
              <Text style={styles.resetText}>{t('reset')}</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.showButton} onPress={onClose}>
              <Text style={styles.showButtonText}>{t('show')} ({foundCount ?? 0})</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

export default EquipmentFilterModal;
