import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useCharacter } from '../../CharacterContext';
import { getTraitDisplayDescription, TRAITS } from '../CharacterScreen/logic/traitsData';
import perksData from '../../../assets/Perks/perks.json';
import PerkSelectModal from './PerkSelectModal';
import { renderTextWithIcons } from '../WeaponsAndArmorScreen/textUtils';
import styles from '../../../styles/PerksAndTraitsScreen.styles';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';

const PerksAndTraitsScreen = () => {
  const { 
    trait, level, selectedPerks, setSelectedPerks, annotatePerks, 
    addPerkAttributePoints, attributesSaved 
  } = useCharacter();
  const [isPerkModalVisible, setPerkModalVisible] = useState(false);
  const extraPerkSlots = trait?.modifiers?.extraPerkSlots || 0;
  const perkLimit = level + extraPerkSlots;

  // Создаем массив из 20 строк
  const emptyRows = Array(20).fill(null);

  const annotatedPerks = useMemo(() => annotatePerks(perksData), [annotatePerks]);

  const handleAddPerkPress = () => {
    if (selectedPerks.length >= perkLimit) {
      const message = tPerksAndTraits('warnings.perkLimitReached');
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert(tPerksAndTraits('alerts.warningTitle'), message);
      }
      return;
    }
    setPerkModalVisible(true);
  };

  const handleChoosePerk = (perk) => {
    if (!perk) return;
    
    // Блокируем выбор, если уже взяли максимум на уровне (доп. защита)
    if (selectedPerks.length >= perkLimit) {
      const message = tPerksAndTraits('warnings.perkLimitReached');
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert(tPerksAndTraits('alerts.warningTitle'), message);
      }
      return;
    }

    // Специальная обработка для перка "ИНТЕНСИВНЫЕ ТРЕНИРОВКИ"
    if (perk.perk_name === "ИНТЕНСИВНЫЕ ТРЕНИРОВКИ") {
      const canTakeIntensiveTraining = level >= 2 || attributesSaved;
      
      if (!canTakeIntensiveTraining) {
        const message = tPerksAndTraits('errors.intensiveTrainingRequirements');
        if (Platform.OS === 'web') {
          window.alert(message);
        } else {
          Alert.alert(tPerksAndTraits('alerts.errorTitle'), message);
        }
        return;
      }

      const attributeBonus = perk.modifiers?.attributeBonus || 1;
      addPerkAttributePoints(attributeBonus);
      
      const successMessage = tPerksAndTraits('perkSelected.intensiveTrainingSuccess')
        .replace('{perkName}', perk.perk_name)
        .replace('{bonus}', attributeBonus);
      if (Platform.OS === 'web') {
        window.alert(successMessage);
      } else {
        Alert.alert(tPerksAndTraits('alerts.perkSelectedTitle'), successMessage);
      }
    }

    setSelectedPerks(prev => [...prev, perk]);
    setPerkModalVisible(false);
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
                const baseTrait = TRAITS[name] || {};
                return (
                  <View key={`trait-${idx}-${name}`} style={styles.row}>
                    <Text style={[styles.cell, styles.nameColumn]}>{name}</Text>
                    <Text style={[styles.cell, styles.rankColumn]}></Text>
                    {renderTextWithIcons(
                      getTraitDisplayDescription({ name, modifiers: baseTrait.modifiers }),
                      [styles.cell, styles.descriptionColumn]
                    )}
                  </View>
                );
              });
            }
            return (
              <View style={styles.row}>
                <Text style={[styles.cell, styles.nameColumn]}>{trait.name}</Text>
                <Text style={[styles.cell, styles.rankColumn]}></Text>
                {renderTextWithIcons(
                  getTraitDisplayDescription(trait),
                  [styles.cell, styles.descriptionColumn]
                )}
              </View>
            );
          })()}

          {/* Выбранные перки (по уровням) */}
          {selectedPerks.map((perk, idx) => (
            <View key={`perk-${idx}`} style={styles.row}>
              <Text style={[styles.cell, styles.nameColumn]}>{perk.perk_name}</Text>
              <Text style={[styles.cell, styles.rankColumn]}>{perk.rank ?? ''}</Text>
              {renderTextWithIcons(perk.description, [styles.cell, styles.descriptionColumn])}
            </View>
          ))}

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
        onClose={() => setPerkModalVisible(false)}
        annotatedPerks={annotatedPerks}
        onChoosePerk={handleChoosePerk}
      />
    </View>
  );
};

export default PerksAndTraitsScreen; 
