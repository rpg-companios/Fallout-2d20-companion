import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import styles from '../../../styles/PerkSelectModal.styles';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';
import { getPerkModalDisplay } from './perksDisplay';
import { PERK_ATTRIBUTE_FILTER_CODES, perkMatchesAttributeFilters } from '../../../domain/perks';

const isSamePerkRank = (a, b) => a?.id === b?.id && (a?.rank ?? null) === (b?.rank ?? null);

const PerkSelectModal = ({ visible, onClose, annotatedPerks, onChoosePerk, onRemovePerk, title }) => {
  const [expandedId, setExpandedId] = useState(null);
  const [selectedPerk, setSelectedPerk] = useState(null);
  const [search, setSearch] = useState('');
  const [attributeFilters, setAttributeFilters] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setExpandedId(null);
      setSelectedPerk(null);
      setSearch('');
      setAttributeFilters([]);
      setFilterOpen(false);
    }
  }, [visible]);

  const toggleAttribute = (code) => {
    setAttributeFilters((prev) => (
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    ));
    setExpandedId(null);
  };

  const visiblePerks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (annotatedPerks || []).filter((entry) => {
      if (entry.unmet?.maxRank) return false;
      if (!perkMatchesAttributeFilters(entry.perk, attributeFilters)) return false;
      if (!term) return true;
      const display = getPerkModalDisplay(entry.perk, { taken: entry.taken || 0 });
      return String(display.name || '').toLowerCase().includes(term);
    });
  }, [annotatedPerks, attributeFilters, search]);

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

          <View style={styles.filterPanel}>
            <TouchableOpacity
              style={styles.filterSpoilerHeader}
              onPress={() => setFilterOpen((open) => !open)}
            >
              <Text style={styles.filterSpoilerTitle}>{tPerksAndTraits('modal.filterSpoiler')}</Text>
              <Text style={styles.filterSpoilerArrow}>{filterOpen ? '▼' : '►'}</Text>
            </TouchableOpacity>
            {filterOpen && (
              <View style={styles.filterSpoilerBody}>
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={(value) => {
                    setSearch(value);
                    setExpandedId(null);
                  }}
                  placeholder={tPerksAndTraits('modal.searchPlaceholder')}
                />
                <View style={styles.filterRow}>
                  {PERK_ATTRIBUTE_FILTER_CODES.map((code) => {
                    const checked = attributeFilters.includes(code);
                    return (
                      <TouchableOpacity
                        key={code}
                        style={styles.filterItem}
                        onPress={() => toggleAttribute(code)}
                      >
                        <View style={[styles.filterCheckbox, checked && styles.filterCheckboxChecked]}>
                          {checked ? <Text style={styles.filterCheckMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.filterLabel}>{tPerksAndTraits(`modal.attributeFilters.${code}`)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          <ScrollView style={styles.perkList}>
            {visiblePerks.map((entry, index) => {
              const { perk, available, unmet, taken = 0, maxRanks = 1 } = entry;
              const perkId = perk.id || `index-${index}`;
              const isExpanded = expandedId === perkId;
              const display = getPerkModalDisplay(perk, { taken });
              const isSelected = isSamePerkRank(selectedPerk, perk);
              const rankLabel = maxRanks > 1
                ? tPerksAndTraits('labels.ranksProgress')
                  .replace('{current}', taken)
                  .replace('{max}', maxRanks)
                : '';
              const nameStyle = [styles.perkName, !available && styles.perkNameDisabled, isSelected && styles.selectedPerkName];

              // После выбора строка подсвечивается и сворачивается; подтвердить можно кнопкой внизу.
              const shouldShowExpanded = isExpanded && !isSelected;

              return (
                <View
                  key={`${perk.id || index}-${perk.rank || ''}`}
                  style={[styles.perkItem, !available && styles.perkDisabled]}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setExpandedId(isExpanded ? null : perkId);
                    }}
                    style={[styles.perkHeader, isSelected && styles.selectedPerk]}
                  >
                    <View style={styles.perkNameCell}>
                      <Text style={nameStyle} numberOfLines={1}>{display.name}</Text>
                    </View>
                    {rankLabel ? (
                      <View style={styles.perkRankCell}>
                        <Text style={[styles.perkRank, !available && styles.perkNameDisabled, isSelected && styles.selectedPerkName]}>
                          {rankLabel}
                        </Text>
                      </View>
                    ) : null}
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
                            setSelectedPerk(null);
                          } else {
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
