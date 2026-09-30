import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import useCharacterStore from '../../../../src/store/characterStore';
import { selectLegacyAttributes } from '../../../../src/store/selectors';
import { showRawAlert } from '../../../../components/alerts/alertService';
import { getTraitI18nById } from '../../../../domain/traits';
import {
  annotatePerks,
  applyPerkSelection,
  collapseSelectedPerks,
  evaluateSelectedPerkPicks,
  getPerkMaxRanks,
  getPerkSelectionCount,
  removeSelectedPerkAt,
  withAssignedPerkRanks,
} from '../../../../domain/perks';
import { isRobotCharacter } from '../../../../domain/origins';
import { useLocale, useModuleLocale } from '../../../../i18n/locale';
import perksData from '../../data/perks/perks.json';
import PerkSelectModal from './PerkSelectModal';
import { renderTextWithIcons } from '../WeaponsAndArmorScreen/textUtils';
import styles from '../../styles/PerksAndTraitsScreen.styles';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';
import { getPerkDisplay, getPerkSheetDisplay } from './perksDisplay';

const toPerkId = (selected) => {
  if (!selected) return null;
  if (typeof selected === 'string') return selected;
  return selected.id || selected.perkId || null;
};

const PerksAndTraitsScreen = () => {
  // Шаг 7: trait/level/attributesSaved — стор; addPerkAttributePoints — стор-экшен.
  // Шаг 8а: выбранные перки и перковые помощники — стор/домен напрямую
  // (экран больше не зависит от контекста useCharacter()).
  const trait = useCharacterStore((s) => s.trait);
  const origin = useCharacterStore((s) => s.origin);
  const level = useCharacterStore((s) => s.level);
  const selectedPerks = useCharacterStore((s) => s.selectedPerks);
  const setSelectedPerks = useCharacterStore((s) => s.setSelectedPerks);
  // Атрибуты (legacy-массив) — для проверки требований перков (annotatePerks).
  const storeAttributes = useCharacterStore((s) => s.attributes);
  const attributes = useMemo(() => selectLegacyAttributes({ attributes: storeAttributes }), [storeAttributes]);
  const attributesSaved = useCharacterStore((s) => s.attributesSaved);
  const addPerkAttributePoints = useCharacterStore((s) => s.addPerkAttributePoints);
  useLocale();
  const moduleLocale = useModuleLocale();
  const [isPerkModalVisible, setPerkModalVisible] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState(null);
  const [openSpoilers, setOpenSpoilers] = useState({});
  const extraPerkSlots = trait?.modifiers?.extraPerkSlots || 0;
  const perkLimit = level + extraPerkSlots;
  const rankedPerks = useMemo(() => withAssignedPerkRanks(selectedPerks), [selectedPerks]);

  // 412 (слово владельца «пусть сам решает»): перки, погашенные книжными
  // требованиями, остаются в списке — серые и неработающие. Каждая группа
  // (перк) получает статус: сколько рангов действует и почему погас
  // первый недействующий.
  const dormancyById = useMemo(() => {
    const { picks } = evaluateSelectedPerkPicks(selectedPerks, perksData, {
      attributes: storeAttributes,
      level,
      isRobot: isRobotCharacter({ origin, trait }),
    });
    const map = {};
    for (const p of picks) {
      const entry = map[p.id] || (map[p.id] = { total: 0, active: 0, note: null });
      entry.total += 1;
      if (p.active) entry.active += 1;
      else if (!entry.note) entry.note = p;
    }
    return map;
  }, [selectedPerks, storeAttributes, level, origin, trait]);

  const dormantNoteFor = (status) => {
    const n = status.note;
    const detail = n.reason === 'level'
      ? tPerksAndTraits('dormant.level').replace('{need}', n.need).replace('{have}', n.have)
      : n.reason === 'attributes'
        ? tPerksAndTraits('dormant.attributes')
          .replace('{code}', tPerksAndTraits(`modal.attributeFilters.${n.code}`))
          .replace('{need}', n.need).replace('{have}', n.have)
        : n.reason === 'robot'
          ? tPerksAndTraits('dormant.robot')
          : n.reason === 'excluded'
            ? tPerksAndTraits('dormant.excluded').replace('{perk}', getPerkSheetDisplay({ id: n.otherId }).name)
            : tPerksAndTraits('dormant.rankLimit');
    return `${tPerksAndTraits('dormant.prefix')}: ${detail}`;
  };

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
    () => annotatePerks(perksData, attributes, level, selectedPerks, { replaceIndex: replacingIndex }).map((entry) => {
      const perkId = entry.perk?.id;
      const taken = getPerkSelectionCount(selectedPerks, perkId, { ignoreIndex: replacingIndex });
      const maxRanks = getPerkMaxRanks(entry.perk);
      return {
        ...entry,
        taken,
        maxRanks,
      };
    }),
    [annotatePerks, attributes, level, selectedPerks, replacingIndex],
  );

  // Показ через общий AlertHost — одинаково на вебе и на нативе.
  const showAlert = (title, message) => showRawAlert({ title, message: message || '' });

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

  const renderSpoiler = ({ spoilerKey, title, rankLabel, description, onChange, inactive, inactiveNote }) => {
    const open = openSpoilers[spoilerKey] === true;
    return (
      <View key={spoilerKey} style={styles.spoiler}>
        <TouchableOpacity
          style={inactive ? [styles.spoilerHeader, styles.spoilerHeaderInactive] : styles.spoilerHeader}
          onPress={() => toggleSpoiler(spoilerKey)}
        >
          <Text
            style={inactive ? [styles.spoilerTitle, styles.spoilerTitleInactive] : styles.spoilerTitle}
            numberOfLines={1}
          >
            {title}
          </Text>
          {rankLabel ? (
            <Text style={inactive ? [styles.spoilerRank, styles.spoilerRankInactive] : styles.spoilerRank}>
              {rankLabel}
            </Text>
          ) : null}
          <Text style={styles.spoilerArrow}>{open ? '▼' : '►'}</Text>
        </TouchableOpacity>
        {inactive && inactiveNote ? (
          <Text style={styles.spoilerInactiveNote}>{inactiveNote}</Text>
        ) : null}
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
          const status = dormancyById[perk?.id];
          const inactive = !!status && status.active < status.total;
          return renderSpoiler({
            spoilerKey,
            title: display.name,
            rankLabel,
            description: display.description,
            onChange: replaceIndex != null ? () => handleReassignPerk(replaceIndex) : undefined,
            inactive,
            inactiveNote: inactive ? dormantNoteFor(status) : null,
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
