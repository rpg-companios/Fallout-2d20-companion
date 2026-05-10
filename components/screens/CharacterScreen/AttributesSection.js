// AttributesSection.js
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MIN_ATTRIBUTE, MAX_ATTRIBUTE, getAttributeLimits } from '../../../domain/characterCreation';
import { getAttributeLabel } from './logic/attributeKeyUtils';
import { tCharacterScreen } from './logic/characterScreenI18n';
import styles from '../../../styles/AttributesSection.styles';

const AttributeRow = ({ name, value, onIncrease, onDecrease, disabled, remainingPoints, trait, isPerkMode, baseValue }) => {
  const { min, max } = getAttributeLimits(trait, name);
  
  // В режиме перков нельзя опускаться ниже базового значения
  const decreaseDisabled = isPerkMode ? value <= baseValue : value <= min;

  return (
    <View style={styles.attributeRow}>
      <Text style={[styles.attributeName, { maxWidth: '50%'}]}>{getAttributeLabel(name)}</Text>
      {!disabled ? (
        <CompactCounter 
          value={value}
          onIncrease={onIncrease}
          onDecrease={onDecrease}
          increaseDisabled={remainingPoints <= 0 || value >= max}
          decreaseDisabled={decreaseDisabled}
          minLimit={min}
          maxLimit={max}
        />
      ) : (
        <Text style={[styles.attributeValue, { minWidth: 30 }]}>{value}</Text>
      )}
    </View>
  );
};

const CompactCounter = ({ value, onIncrease, onDecrease, increaseDisabled, decreaseDisabled, minLimit = MIN_ATTRIBUTE, maxLimit = MAX_ATTRIBUTE }) => (
  <View style={styles.compactCounter}>
    <TouchableOpacity 
      onPress={onDecrease} 
      style={[styles.counterButton, decreaseDisabled && styles.disabledButton]}
      disabled={decreaseDisabled}
    >
      <Text style={[styles.counterButtonText, decreaseDisabled && styles.disabledText]}>-</Text>
    </TouchableOpacity>
    <Text style={styles.counterValue}>{value}</Text>
    <TouchableOpacity 
      onPress={onIncrease} 
      style={[styles.counterButton, increaseDisabled && styles.disabledButton]}
      disabled={increaseDisabled}
    >
      <Text style={[styles.counterButtonText, increaseDisabled && styles.disabledText]}>+</Text>
    </TouchableOpacity>
  </View>
);

export const AttributesSection = ({
  attributes,
  onAttributeChange,
  remainingAttributePoints,
  attributesSaved,
  onSaveAttributes,
  onResetAttributes,
  trait,
  isPerkMode,
  onApplyPerkAttributes,
  baseAttributes,
}) => {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {tCharacterScreen('labels.attributes', 'Атрибуты').toUpperCase()}
        </Text>
      </View>
      {(!attributesSaved || isPerkMode) && remainingAttributePoints > 0 && (
        <Text style={styles.pointsHint}>
          {tCharacterScreen('labels.points', 'Очки')}: {remainingAttributePoints}
        </Text>
      )}
      {attributes.map((attr, index) => (
        <AttributeRow 
          key={index}
          name={attr.name}
          value={attr.value}
          onIncrease={() => onAttributeChange(index, 1, trait)}
          onDecrease={() => onAttributeChange(index, -1, trait)}
          disabled={attributesSaved && !isPerkMode}
          remainingPoints={remainingAttributePoints}
          trait={trait}
          isPerkMode={isPerkMode}
          baseValue={baseAttributes ? baseAttributes[index].value : getAttributeLimits(trait, attr.name).min}
        />
      ))}
      
      {!attributesSaved && (
        <View style={styles.buttonsContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.saveButton]}
            onPress={onSaveAttributes}
          >
            <Text style={styles.buttonText}>{tCharacterScreen('buttons.save', 'Сохранить')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, styles.resetButton]}
            onPress={onResetAttributes}
          >
            <Text style={styles.buttonText}>{tCharacterScreen('buttons.reset', 'Сбросить')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {isPerkMode && (
        <View style={styles.buttonsContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.saveButton, remainingAttributePoints > 0 && styles.disabledButton]}
            onPress={onApplyPerkAttributes}
            disabled={remainingAttributePoints > 0}
          >
            <Text style={styles.buttonText}>{tCharacterScreen('buttons.confirm', 'Подтвердить')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export { CompactCounter };
