// components/gm/FirstAidAndPeerModal.js
// Модальное окно Первой помощи («Использовать первую помощь для улучшения результатов? Да/Нет»)
// и выбора соседа по комнате при действии «Применить на другого» (патч 482).

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../i18n/locale';
import {
  computeFirstAidStatsForStore,
  isFirstAidCapableItem,
  resolveCharacterImmunityContext,
} from '../../modules/fallout/gm/gmEnvCombat';
import { formatGm, tGm } from '../../modules/fallout/gm/gmI18n';

const EMPTY_NEIGHBORS = Object.freeze([]);

export default function FirstAidAndPeerModal({
  visible,
  mode, // 'selfFirstAid' | 'otherTarget'
  item,
  storeState,
  neighbors = EMPTY_NEIGHBORS,
  onClose,
  onConfirmSelf,
  onConfirmOther,
}) {
  const locale = useLocale();
  const [selectedTargetId, setSelectedTargetId] = useState('outside');
  const [selectedInjuryZone, setSelectedInjuryZone] = useState(null);

  useEffect(() => {
    if (!visible) return;
    if (neighbors.length > 0) {
      setSelectedTargetId(neighbors[0].characterId);
    } else {
      setSelectedTargetId('outside');
    }
    setSelectedInjuryZone(null);
  }, [visible, neighbors]);

  const selectedNeighbor = useMemo(
    () => neighbors.find((n) => n.characterId === selectedTargetId) || null,
    [neighbors, selectedTargetId],
  );

  const targetIsRobot = useMemo(() => {
    if (mode === 'selfFirstAid') {
      return resolveCharacterImmunityContext({
        origin: storeState?.origin,
        trait: storeState?.trait,
        equippedRobotSlots: storeState?.robot?.slots,
      }).isRobot;
    }
    if (selectedNeighbor?.snapshot) {
      return resolveCharacterImmunityContext(selectedNeighbor.snapshot?.data || selectedNeighbor.snapshot).isRobot;
    }
    return item?.itemType === 'robotConsumable' || item?.id === 'robot_item_repair_kit';
  }, [mode, storeState, selectedNeighbor, item]);

  const firstAidCapable = isFirstAidCapableItem(item);
  const firstAidStats = useMemo(
    () => (storeState ? computeFirstAidStatsForStore(storeState, { targetIsRobot }, locale) : { tn: 0, skillLabel: 'INT + Medicine' }),
    [storeState, targetIsRobot, locale],
  );

  const neighborActiveInjuries = useMemo(() => {
    const effs = selectedNeighbor?.snapshot?.activeTimedEffects;
    if (!Array.isArray(effs)) return [];
    return effs.filter((e) => e?.effectType === 'injury' && e.injuryStage === 'active');
  }, [selectedNeighbor]);

  useEffect(() => {
    if (neighborActiveInjuries.length > 0) {
      setSelectedInjuryZone(neighborActiveInjuries[0].injuryZone);
    } else {
      setSelectedInjuryZone(null);
    }
  }, [neighborActiveInjuries]);

  if (!visible || !item) return null;

  const itemName = item?.name || item?.Name || item?.id || '—';

  if (mode === 'selfFirstAid') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{tGm('envCombat.firstAid.promptTitle', locale)}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#d1d5db" />
              </TouchableOpacity>
            </View>
            <Text style={styles.itemBadge}>{itemName}</Text>
            <Text style={styles.promptText}>
              {formatGm(tGm('envCombat.firstAid.promptMessage', locale), {
                skillLabel: firstAidStats.skillLabel,
                tn: firstAidStats.tn,
              })}
            </Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => onConfirmSelf?.({ useFirstAid: false })}
              >
                <Text style={styles.secondaryBtnText}>{tGm('envCombat.firstAid.noBtn', locale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => onConfirmSelf?.({ useFirstAid: true })}
              >
                <Text style={styles.primaryBtnText}>{tGm('envCombat.firstAid.yesBtn', locale)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{tGm('envCombat.firstAid.peerModalTitle', locale)}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#d1d5db" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            {formatGm(tGm('envCombat.firstAid.peerModalSubtitle', locale), { item: itemName })}
          </Text>

          <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
            {neighbors.map((nb) => {
              const selected = selectedTargetId === nb.characterId;
              const hp = nb.snapshot?.currentHealth ?? '—';
              const rad = nb.snapshot?.radiation ?? 0;
              const injCount = Array.isArray(nb.snapshot?.activeTimedEffects)
                ? nb.snapshot.activeTimedEffects.filter((e) => e?.effectType === 'injury' && e.injuryStage === 'active').length
                : 0;
              return (
                <TouchableOpacity
                  key={nb.characterId}
                  style={[styles.targetOption, selected && styles.targetOptionSelected]}
                  onPress={() => setSelectedTargetId(nb.characterId)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.targetName, selected && styles.targetNameSelected]}>
                      {nb.name || '—'}
                    </Text>
                    <Text style={styles.targetMeta}>
                      HP: {hp}{rad > 0 ? ` · Rad: ${rad}` : ''}{injCount > 0 ? ` · ⚠ ${injCount}` : ''}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20}
                    color={selected ? '#f0e68c' : '#6b7280'}
                  />
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.targetOption, selectedTargetId === 'outside' && styles.targetOptionSelected]}
              onPress={() => setSelectedTargetId('outside')}
            >
              <Text style={[styles.targetName, selectedTargetId === 'outside' && styles.targetNameSelected, { flex: 1 }]}>
                {tGm('envCombat.firstAid.peerOutsideRoom', locale)}
              </Text>
              <MaterialCommunityIcons
                name={selectedTargetId === 'outside' ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
                color={selectedTargetId === 'outside' ? '#f0e68c' : '#6b7280'}
              />
            </TouchableOpacity>

            {firstAidCapable && neighborActiveInjuries.length > 1 ? (
              <View style={styles.injuryBox}>
                <Text style={styles.injuryBoxTitle}>
                  {tGm('envCombat.firstAid.peerInjuryPickLabel', locale)}
                </Text>
                {neighborActiveInjuries.map((inj) => {
                  const chosen = selectedInjuryZone === inj.injuryZone;
                  return (
                    <TouchableOpacity
                      key={inj.id || inj.injuryZone}
                      style={[styles.injuryChip, chosen && styles.injuryChipActive]}
                      onPress={() => setSelectedInjuryZone(inj.injuryZone)}
                    >
                      <Text style={[styles.injuryChipText, chosen && { color: '#111827', fontWeight: '700' }]}>
                        {inj.effectName || inj.injuryZone}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>

          {firstAidCapable ? (
            <>
              <Text style={styles.promptText}>
                {formatGm(tGm('envCombat.firstAid.promptMessage', locale), {
                  skillLabel: firstAidStats.skillLabel,
                  tn: firstAidStats.tn,
                })}
              </Text>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => onConfirmOther?.({
                    targetNeighbor: selectedNeighbor,
                    useFirstAid: false,
                    stabilizeInjuryZone: selectedInjuryZone,
                  })}
                >
                  <Text style={styles.secondaryBtnText}>{tGm('envCombat.firstAid.noBtn', locale)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => onConfirmOther?.({
                    targetNeighbor: selectedNeighbor,
                    useFirstAid: true,
                    stabilizeInjuryZone: selectedInjuryZone,
                  })}
                >
                  <Text style={styles.primaryBtnText}>{tGm('envCombat.firstAid.yesBtn', locale)}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
                <Text style={styles.secondaryBtnText}>{tGm('commands.cancelBtn', locale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => onConfirmOther?.({
                  targetNeighbor: selectedNeighbor,
                  useFirstAid: false,
                  stabilizeInjuryZone: null,
                })}
              >
                <Text style={styles.primaryBtnText}>{tGm('envCombat.applyBtn', locale)}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.74)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#1f2328',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(240, 230, 140, 0.4)',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    color: '#f0e68c',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 10,
  },
  itemBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(240,230,140,0.14)',
    borderColor: 'rgba(240,230,140,0.45)',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  promptText: {
    color: '#f3f4f6',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 12,
  },
  listScroll: {
    maxHeight: 240,
  },
  listContent: {
    gap: 6,
  },
  targetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#272c33',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  targetOptionSelected: {
    borderColor: '#f0e68c',
    backgroundColor: 'rgba(240, 230, 140, 0.1)',
  },
  targetName: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  targetNameSelected: {
    color: '#f0e68c',
  },
  targetMeta: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 2,
  },
  injuryBox: {
    marginTop: 6,
    padding: 8,
    backgroundColor: '#181b20',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 6,
  },
  injuryBoxTitle: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '600',
  },
  injuryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#2b3038',
  },
  injuryChipActive: {
    backgroundColor: '#f0e68c',
  },
  injuryChipText: {
    color: '#e5e7eb',
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#272c33',
  },
  secondaryBtnText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 5,
    backgroundColor: '#f0e68c',
  },
  primaryBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
});
