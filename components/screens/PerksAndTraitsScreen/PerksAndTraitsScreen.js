import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useCharacter } from '../../CharacterContext';
import { getTraitNameKey, resolveTraitDisplayName, getTraitDisplayDescription } from '../../../domain/traits';
import { applyPerkSelection, removeSelectedPerkAt, withAssignedPerkRanks } from '../../../domain/perks';
import { useLocale, useModuleLocale } from '../../../i18n/locale';
import perksData from '../../../modules/fallout/data/perks/perks.json';
import PerkSelectModal from './PerkSelectModal';
import { renderTextWithIcons } from '../WeaponsAndArmorScreen/textUtils';
import styles from '../../../styles/PerksAndTraitsScreen.styles';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';
import { getPerkDisplay, getPerkSheetDisplay } from './perksDisplay';

const PerksAndTraitsScreen = () => {
  const { 
    trait, level, selectedPerks, setSelectedPerks, annotatePerks, 
    addPerkAttributePoints, attributesSaved 
  } = useCharacter();
  useLocale(); // интерфейс движка
  useModuleLocale(); // контент активного сеттинга
  const [isPerkModalVisible, setPerkModalVisible] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState(null);
  const extraPerkSlots = trait?.modifiers?.extraPerkSlots || 0;
  const perkLimit = level + extraPerkSlots;
  const rankedPerks = useMemo(() => withAssignedPerkRanks(selectedPerks), [selectedPerks]);

  // Создаем массив из 20 строк
  const emptyRows = Array(20).fill(null);

  const annotatedPerks = useMemo(
    () => annotatePerks(perksData, { replaceIndex: replacingIndex }),
    [annotatePerks, selectedPerks, replacingIndex],
  );

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(message ? `${title}\n\n${message}` : message || title);
      return;
    }
    if (message) {
      Alert.alert(title, message);
      return;
    }
    Alert.alert(title);
  };

  const closePerkModal = () => {
    setPerkModalVisible(false);
    setReplacingIndex(null);
  };

  const handleAddPerkPress = () => {
    if (selectedPerks.length >= perkLimit) {
      showAlert(tPerksAndTraits('alerts.warningTitle'), tPerksAndTraits('warnings.perkLimitReached'));
      return;
    }
    setReplacingIndex(null);
    setPerkModalVisible(true);
  };

  const handleReassignPerk = (index) => {
    setReplacingIndex(index);
    setPerkModalVisible(true);
  };

  const applyIntenseTrainingDelta = (previousPerk, nextPerk) => {
    const wasIntenseTraining = previousPerk?.id === 'intenseTraining';
    const isIntenseTraining = nextPerk?.id === 'intenseTraining';
    if (isIntenseTraining && !wasIntenseTraining) {
      addPerkAttributePoints(1);
      return;
    }
    if (wasIntenseTraining && !isIntenseTraining) {
      addPerkAttributePoints(-1);
    }
  };

  const handleChoosePerk = (perk) => {
    if (!perk) return;

    const isReplacing = replacingIndex != null;
    
    // Блокируем выбор, если уже взяли максимум на уровне (доп. защита)
    if (!isReplacing && selectedPerks.length >= perkLimit) {
      showAlert(tPerksAndTraits('alerts.warningTitle'), tPerksAndTraits('warnings.perkLimitReached'));
      return;
    }

    const previousPerk = isReplacing ? selectedPerks[replacingIndex] : null;

    // Специальная обработка перка по стабильному id, без привязки к русскому названию.
    if (perk.id === 'intenseTraining' && previousPerk?.id !== 'intenseTraining') {
      const canTakeIntensiveTraining = level >= 2 || attributesSaved;
      
      if (!canTakeIntensiveTraining) {
        showAlert(tPerksAndTraits('alerts.errorTitle'), tPerksAndTraits('errors.intensiveTrainingRequirements'));
        return;
      }

      const successMessage = tPerksAndTraits('perkSelected.intensiveTrainingSuccess')
        .replace('{perkName}', getPerkDisplay(perk).name)
        .replace('{bonus}', 1);
      showAlert(tPerksAndTraits('alerts.perkSelectedTitle'), successMessage);
    }

    const result = applyPerkSelection(selectedPerks, perk, {
      replaceIndex: isReplacing ? replacingIndex : undefined,
    });
    if (!result.ok) {
      showAlert(tPerksAndTraits('alerts.warningTitle'), tPerksAndTraits('warnings.perkAlreadyAtMaxRank'));
      return;
    }

    applyIntenseTrainingDelta(previousPerk, perk);
    setSelectedPerks(result.selectedPerks);
    closePerkModal();
  };

  const handleRemovePerk = () => {
    if (replacingIndex == null) return;
    const previousPerk = selectedPerks[replacingIndex];
    applyIntenseTrainingDelta(previousPerk, null);
    setSelectedPerks(removeSelectedPerkAt(selectedPerks, replacingIndex));
    closePerkModal();
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.table}>
          {/* Заголовок таблицы */}
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.headerText, styles.nameColumn]}>{tPerksAndTraits('labels.name')}</Text>
            <Text style={[styles.cell, styles.headerText, styles.rankColumn]}>{tPerksAndTraits('labels.rank')}</Text>
            <Text style={[styles.cell, styles.headerText, styles.descriptionColumn]}>{tPerksAndTraits('labels.description')}</Text>
          </View>

          {/* Строка с чертой, если она есть */}
          {trait && (() => {
            const selectedNames = trait?.modifiers?.selectedTraitNames;
            if (Array.isArray(selectedNames) && selectedNames.length > 0) {
              return selectedNames.map((name, idx) => {
                const resolvedName = resolveTraitDisplayName(name);
                return (
                  <View key={`trait-${idx}-${name}`} style={styles.row}>
                    <Text style={[styles.cell, styles.nameColumn]}>{resolvedName}</Text>
                    <Text style={[styles.cell, styles.rankColumn]}></Text>
                    {renderTextWithIcons(
                      // getTraitDescriptionKey не читает modifiers — описание резолвится
                      // по имени внутри домена (findTraitByLocalizedName), легаси-мапа
                      // TRAITS из удалённого traitsData.js была no-op для рендера.
                      getTraitDisplayDescription({ name }),
                      [styles.cell, styles.descriptionColumn]
                    )}
                  </View>
                );
              });
            }
            return (
              <View style={styles.row}>
                <Text style={[styles.cell, styles.nameColumn]}>{getTraitNameKey(trait)}</Text>
                <Text style={[styles.cell, styles.rankColumn]}></Text>
                {renderTextWithIcons(
                  getTraitDisplayDescription(trait),
                  [styles.cell, styles.descriptionColumn]
                )}
              </View>
            );
          })()}

          {/* Выбранные перки (по уровням) */}
          {rankedPerks.map((perk, idx) => {
            const display = getPerkSheetDisplay(perk);
            return (
              <TouchableOpacity
                key={`perk-${idx}-${perk.id || 'unknown'}`}
                style={[styles.row, styles.selectedPerkRow]}
                onPress={() => handleReassignPerk(idx)}
              >
                <View style={[styles.cell, styles.nameColumn]}>
                  <Text style={styles.perkNameText}>{display.name}</Text>
                  <Text style={styles.reassignHint}>{tPerksAndTraits('buttons.changePerk')}</Text>
                </View>
                <Text style={[styles.cell, styles.rankColumn]}>{perk.rank ?? ''}</Text>
                {renderTextWithIcons(display.description, [styles.cell, styles.descriptionColumn])}
              </TouchableOpacity>
            );
          })}

          {/* Пустые строки */}
          {emptyRows.map((_, index) => (
            <View key={index} style={styles.row}>
              <Text style={[styles.cell, styles.nameColumn]}></Text>
              <Text style={[styles.cell, styles.rankColumn]}></Text>
              <Text style={[styles.cell, styles.descriptionColumn]}></Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Кнопка Добавить перк */}
      <TouchableOpacity style={styles.addPerkButton} onPress={handleAddPerkPress}>
        <Text style={styles.addPerkButtonText}>{tPerksAndTraits('buttons.addPerk')}</Text>
      </TouchableOpacity>

      <PerkSelectModal
        visible={isPerkModalVisible}
        onClose={closePerkModal}
        annotatedPerks={annotatedPerks}
        onChoosePerk={handleChoosePerk}
        onRemovePerk={replacingIndex != null ? handleRemovePerk : undefined}
        title={replacingIndex != null ? tPerksAndTraits('modal.replaceTitle') : tPerksAndTraits('modal.title')}
      />
    </View>
  );
};

export default PerksAndTraitsScreen;
