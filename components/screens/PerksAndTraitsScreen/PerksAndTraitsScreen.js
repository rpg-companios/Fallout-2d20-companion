import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useCharacter } from '../../CharacterContext';
import { getTraitNameKey, resolveTraitDisplayName, getTraitDisplayDescription } from '../../../domain/traits';
import { useLocale, useModuleLocale } from '../../../i18n/locale';
import perksData from '../../../modules/fallout/data/perks/perks.json';
import PerkSelectModal from './PerkSelectModal';
import { renderTextWithIcons } from '../WeaponsAndArmorScreen/textUtils';
import styles from '../../../styles/PerksAndTraitsScreen.styles';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';
import { getPerkDisplay, withPerkDisplay } from './perksDisplay';

const PerksAndTraitsScreen = () => {
  const { 
    trait, level, selectedPerks, setSelectedPerks, annotatePerks, 
    addPerkAttributePoints, attributesSaved 
  } = useCharacter();
  useLocale(); // интерфейс движка
  useModuleLocale(); // контент активного сеттинга
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

    const selectedPerk = withPerkDisplay(perk);

    // Специальная обработка перка по стабильному id, без привязки к русскому названию.
    if (selectedPerk.id === 'intenseTraining') {
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

      const attributeBonus = 1;
      addPerkAttributePoints(attributeBonus);
      
      const successMessage = tPerksAndTraits('perkSelected.intensiveTrainingSuccess')
        .replace('{perkName}', selectedPerk.perk_name)
        .replace('{bonus}', attributeBonus);
      if (Platform.OS === 'web') {
        window.alert(successMessage);
      } else {
        Alert.alert(tPerksAndTraits('alerts.perkSelectedTitle'), successMessage);
      }
    }

    setSelectedPerks(prev => [...prev, selectedPerk]);
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
          {selectedPerks.map((perk, idx) => {
            const display = getPerkDisplay(perk);
            return (
              <View key={`perk-${perk.id || idx}`} style={styles.row}>
                <Text style={[styles.cell, styles.nameColumn]}>{display.name}</Text>
                <Text style={[styles.cell, styles.rankColumn]}>{perk.rank ?? ''}</Text>
                {renderTextWithIcons(display.description, [styles.cell, styles.descriptionColumn])}
              </View>
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
        onClose={() => setPerkModalVisible(false)}
        annotatedPerks={annotatedPerks}
        onChoosePerk={handleChoosePerk}
      />
    </View>
  );
};

export default PerksAndTraitsScreen; 
