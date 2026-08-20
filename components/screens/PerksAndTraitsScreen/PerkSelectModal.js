import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import styles from '../../../styles/PerkSelectModal.styles';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';
import { getPerkDisplay } from './perksDisplay';

const isSamePerkRank = (a, b) => a?.id === b?.id && (a?.rank ?? null) === (b?.rank ?? null);

const PerkSelectModal = ({ visible, onClose, annotatedPerks, onChoosePerk, onRemovePerk, title }) => {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [selectedPerk, setSelectedPerk] = useState(null);

  useEffect(() => {
    if (visible) {
      setExpandedIndex(null);
      setSelectedPerk(null);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{title || tPerksAndTraits('modal.title')}</Text>

          <ScrollView style={{ maxHeight: 420 }}>
            {(annotatedPerks || []).map((entry, index) => {
              const { perk, available, unmet } = entry;
              const isExpanded = expandedIndex === index;
              const display = getPerkDisplay(perk);
              const isSelected = isSamePerkRank(selectedPerk, perk);
              
              // После выбора строка подсвечивается и сворачивается; подтвердить можно кнопкой внизу.
              const shouldShowExpanded = isExpanded && !isSelected;
              
              return (
                <View
                  key={`${perk.id || index}-${perk.rank || ''}`}
                  style={[styles.perkItem, !available && styles.perkDisabled]}
                >
                  <TouchableOpacity
                    onPress={() => {
                      // При клике на заголовок перка переключаем показ описания.
                      setExpandedIndex(isExpanded ? null : index);
                    }}
                    style={[styles.perkHeader, isSelected && styles.selectedPerk]}
                  >
                    <Text style={[styles.perkName, !available && styles.perkNameDisabled, isSelected && styles.selectedPerkName]}>
                      {display.name}
                    </Text>
                  </TouchableOpacity>
                  {shouldShowExpanded && (
                    <View style={styles.perkBody}>
                      <Text style={styles.perkDescription}>{display.description}</Text>
                      {!available && unmet && (
                        <View style={styles.unmetContainer}>
                          {unmet.level && (
                            <Text style={styles.unmetText}>
                              {tPerksAndTraits('modal.requiresLevel')
                                .replace('{required}', unmet.level.required)
                                .replace('{current}', unmet.level.current)}
                            </Text>
                          )}
                          {unmet.maxRank && (
                            <Text style={styles.unmetText}>
                              {tPerksAndTraits('modal.alreadyAtMaxRank')
                                .replace('{current}', unmet.maxRank.current)
                                .replace('{max}', unmet.maxRank.max)}
                            </Text>
                          )}
                          {unmet.excluded && (
                            <Text style={styles.unmetText}>
                              {tPerksAndTraits('modal.excludedByPerk')}
                            </Text>
                          )}
                          {unmet.attributes && Object.entries(unmet.attributes).map(([code, info]) => (
                            <Text key={`${perk.id || index}-${code}`} style={styles.unmetText}>
                              {tPerksAndTraits('modal.requiresAttribute')
                                .replace('{code}', code)
                                .replace('{required}', info.required)
                                .replace('{current}', info.current)}
                            </Text>
                          ))}
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => {
                          if (isSelected) {
                            // Отменить выбор
                            setSelectedPerk(null);
                          } else {
                            // Выбрать один перк для текущего открытия модального окна
                            setSelectedPerk(perk);
                          }
                        }}
                        style={[
                          styles.chooseButton,
                          !available && styles.chooseButtonDisabled,
                          isSelected && styles.selectedChooseButton
                        ]}
                        disabled={!available}
                      >
                        <Text style={styles.chooseButtonText}>
                          {isSelected ? tPerksAndTraits('modal.buttons.cancelChoice') : tPerksAndTraits('modal.buttons.choose')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.modalButtons}>
            {onRemovePerk && (
              <TouchableOpacity
                style={[styles.modalButton, styles.removeButton]}
                onPress={() => {
                  onRemovePerk();
                  onClose();
                }}
              >
                <Text style={styles.modalButtonText}>{tPerksAndTraits('modal.buttons.remove')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.modalButton, styles.confirmButton]} 
              onPress={() => {
                if (selectedPerk) {
                  onChoosePerk && onChoosePerk(selectedPerk);
                }
                onClose();
              }}
              disabled={!selectedPerk}
            >
              <Text style={styles.modalButtonText}>{tPerksAndTraits('modal.buttons.confirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.modalButtonText}>{tPerksAndTraits('modal.buttons.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default PerkSelectModal;
