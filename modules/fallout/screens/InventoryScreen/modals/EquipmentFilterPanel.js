// Панель фильтров снаряжения (патч 425) — по образцу фильтра перков:
// спойлер «Фильтр» с рядом параметров. Диапазоны «от–до» — два поля с
// СЕРЫМИ подсказками (границы каталога), подсказка исчезает, как только
// поле тронули; выпадающие списки (качества/эффекты/патрон) — много-
// выбор галочками; типы/дистанция/части тела — чипсы. Вес не фильтруется
// (слово владельца).
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { tInventory } from '../../../../../components/screens/InventoryScreen/logic/inventoryI18n';
import styles from '../../../styles/EquipmentFilterPanel.styles';

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
 * Панель фильтра. options — buildEquipmentFilterOptions(locale, labels);
 * filter/onChange — состояние фильтра; open/onToggleOpen — спойлер.
 */
const EquipmentFilterPanel = ({ options, filter, onChange, onReset, open, onToggleOpen }) => {
  if (!options || !filter) return null;
  const toggleIn = (list, id) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const setRange = (key) => (value) => onChange({ ...filter, [key]: value });
  const toggleList = (key) => (id) => onChange({ ...filter, [key]: toggleIn(filter[key], id) });

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.spoilerHeader} onPress={onToggleOpen}>
        <Text style={styles.spoilerTitle}>{t('title')}</Text>
        <Text style={styles.spoilerArrow}>{open ? '▼' : '►'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.body}>
          <RangeRow label={t('rarity')} hint={options.rarity} value={filter.rarity} onChange={setRange('rarity')} />

          <Text style={styles.sectionTitle}>{t('weaponSection')}</Text>
          <RangeRow label={t('damage')} hint={options.damage} value={filter.damage} onChange={setRange('damage')} />
          <RangeRow label={t('fireRate')} hint={options.fireRate} value={filter.fireRate} onChange={setRange('fireRate')} />
          <ChipsRow label={t('distance')} options={options.distances} selected={filter.distance} onToggle={toggleList('distance')} />
          <ChipsRow label={t('damageType')} options={options.damageTypes} selected={filter.damageTypes} onToggle={toggleList('damageTypes')} />
          <ChipsRow label={t('weaponType')} options={options.weaponTypes} selected={filter.weaponTypes} onToggle={toggleList('weaponTypes')} />
          <DropdownRow label={t('ammo')} options={options.ammoOptions} selected={filter.ammo} onToggle={toggleList('ammo')} />
          <DropdownRow label={t('qualities')} options={options.qualities} selected={filter.qualities} onToggle={toggleList('qualities')} />
          <DropdownRow label={t('effects')} options={options.effects} selected={filter.effects} onToggle={toggleList('effects')} />

          <Text style={styles.sectionTitle}>{t('armorSection')}</Text>
          <RangeRow label={t('physical')} hint={options.physical} value={filter.physical} onChange={setRange('physical')} />
          <RangeRow label={t('energy')} hint={options.energy} value={filter.energy} onChange={setRange('energy')} />
          <RangeRow label={t('radiation')} hint={options.radiation} value={filter.radiation} onChange={setRange('radiation')} />
          <ChipsRow label={t('bodyParts')} options={options.bodyParts} selected={filter.bodyParts} onToggle={toggleList('bodyParts')} />

          <TouchableOpacity style={styles.resetButton} onPress={onReset}>
            <Text style={styles.resetText}>{t('reset')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default EquipmentFilterPanel;
