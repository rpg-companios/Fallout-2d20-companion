import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useCharacter } from '../../CharacterContext';
import { getTraitI18nById } from '../../../domain/traits';
import {
  applyPerkSelection,
  collapseSelectedPerks,
  getPerkMaxRanks,
  getPerkSelectionCount,
  removeSelectedPerkAt,
  withAssignedPerkRanks,
} from '../../../domain/perks';
import { useLocale, useModuleLocale } from '../../../i18n/locale';
import perksData from '../../../modules/fallout/data/perks/perks.json';
import PerkSelectModal from './PerkSelectModal';
import { renderTextWithIcons } from '../WeaponsAndArmorScreen/textUtils';
import styles from '../../../styles/PerksAndTraitsScreen.styles';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';
import { getPerkDisplay, getPerkSheetDisplay } from './perksDisplay';

const toPerkId = (selected) => {
  if (!selected) return null;
  if (typeof selected === 'string') return selected;
  return selected.id || selected.perkId || null;
};

const PerksAndTraitsScreen = () => {
  const {
    trait, level, selectedPerks, setSelectedPerks, annotatePerks,
    addPerkAttributePoints, attributesSaved,
  } = useCharacter();
  useLocale();
  const moduleLocale = useModuleLocale();
  const [isPerkModalVisible, setPerkModalVisible] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState(null);
  const [openSpoilers, setOpenSpoilers] = useState({});
  const extraPerkSlots = trait?.modifiers?.extraPerkSlots || 0;
  const perkLimit = level + extraPerkSlots;
  const rankedPerks = useMemo(() => withAssignedPerkRanks(selectedPerks), [selectedPerks]);

  const perkSpoilers = useMemo(() => {
    const grouped = collapseSelectedPerks(rankedPerks);
    const lastIndexById = {};
    rankedPerks.forEach((perk, index) => {
      const id = toPerkId(perk);
      if (id) lastIndexById[id] = index;
    });
    const fromGroups = grouped.map((perk) => ({
      perk,
      replaceIndex: lastIndexById[perk.id],
      spoilerKey: `perk-${perk.id}`,
    }));
    const withoutId = rankedPerks
      .map((perk, index) => ({ perk, index }))
      .filter(({ perk }) => !toPerkId(perk))
      .map(({ perk, index }) => ({
        perk,
        replaceIndex: index,
        spoilerKey: `perk-noid-${index}`,
      }));
    return [...fromGroups, ...withoutId];
  }, [rankedPerks]);

  const traitSpoilers = useMemo(() => {
    if (!trait) return [];
    const selectedIds = Array.isArray(trait?.modifiers?.selectedTraitIds) && trait.modifiers.selectedTraitIds.length > 0
      ? trait.modifiers.selectedTraitIds
      : (Array.isArray(trait.ids) && trait.ids.length > 0 ? trait.ids : (trait.id ? [trait.id] : []));
    if (selectedIds.length === 0) {
      throw new Error('[PerksAndTraitsScreen] У выбранной черты нет id');
    }
    return selectedIds.map((id) => {
      const display = getTraitI18nById(id);
      return {
        spoilerKey: `trait-${id}`,
        title: display.name,
        description: display.description,
      };
    });
  }, [trait, moduleLocale]);

  const annotatedPerks = useMemo(
    () => annotatePerks(perksData, { replaceIndex: replacingIndex }).map((entry) => {
      const perkId = entry.perk?.id;
      const taken = getPerkSelectionCount(selectedPerks, perkId, { ignoreIndex: replacingIndex });
      const maxRanks = getPerkMaxRanks(entry.perk);
      return {
        ...entry,
        taken,
        maxRanks,
      };
    }),
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

  const toggleSpoiler = (key) => {
    setOpenSpoilers((prev) => ({ ...prev, [key]: !prev[key] }));
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

    if (!isReplacing && selectedPerks.length >= perkLimit) {
      showAlert(tPerksAndTraits('alerts.warningTitle'), tPerksAndTraits('warnings.perkLimitReached'));
      return;
    }

    const previousPerk = isReplacing ? selectedPerks[replacingIndex] : null;

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

  const renderSpoiler = ({ spoilerKey, title, rankLabel, description, onChange }) => {
    const open = openSpoilers[spoilerKey] === true;
    return (
      <View key={spoilerKey} style={styles.spoiler}>
        <TouchableOpacity
          style={styles.spoilerHeader}
          onPress={() => toggleSpoiler(spoilerKey)}
        >
          <Text style={styles.spoilerTitle} numberOfLines={1}>{title}</Text>
          {rankLabel ? <Text style={styles.spoilerRank}>{rankLabel}</Text> : null}
          <Text style={styles.spoilerArrow}>{open ? '▼' : '►'}</Text>
        </TouchableOpacity>
        {open && (
          <View style={styles.spoilerBody}>
            {renderTextWithIcons(description, styles.spoilerDescription)}
            {onChange ? (
              <TouchableOpacity style={styles.changeButton} onPress={onChange}>
                <Text style={styles.changeButtonText}>{tPerksAndTraits('buttons.changePerk')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>{tPerksAndTraits('labels.traitsSection')}</Text>
        {traitSpoilers.map((entry) => renderSpoiler({
          spoilerKey: entry.spoilerKey,
          title: entry.title,
          description: entry.description,
        }))}

        <Text style={styles.sectionTitle}>{tPerksAndTraits('labels.perksSection')}</Text>
        {perkSpoilers.map(({ perk, replaceIndex, spoilerKey }) => {
          const display = getPerkSheetDisplay(perk);
          const rankLabel = perk?.rank != null
            ? tPerksAndTraits('labels.rankValue').replace('{rank}', perk.rank)
            : '';
          return renderSpoiler({
            spoilerKey,
            title: display.name,
            rankLabel,
            description: display.description,
            onChange: replaceIndex != null ? () => handleReassignPerk(replaceIndex) : undefined,
          });
        })}
      </ScrollView>

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
