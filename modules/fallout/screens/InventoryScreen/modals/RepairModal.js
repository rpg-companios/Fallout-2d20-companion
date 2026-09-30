// Модалка ремонта (патчи 413–414, механика от владельца). Слово владельца
// 414: донора предлагать в окне (если есть); отчёт — крафтовый (окно
// отчёта крафта берём за основу: те же строки, вопрос про 2 ОД, «только
// прочность предмета повышается вместо предмета»). Отчёт рисует общий
// CraftReportView (357); строки — словари крафта + repair-секция.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import styles from '../../../styles/RepairModal.styles';
import { tInventory } from '../../../../../components/screens/InventoryScreen/logic/inventoryI18n';
import useCharacterStore from '../../../../../src/store/characterStore';
import { selectAttributeTotal, selectSkillTotal } from '../../../../../src/store/selectors';
import { getCurrentModuleLocale } from '../../../../../i18n/locale';
import CraftReportView from '../../../crafting/CraftReportView';
import {
  repairPreview,
  performRepair,
  performEquippedPieceRepair,
  settleRepairTime,
  buildRepairReport,
} from '../../../repair/operations';
import { REPAIR_RULES, repairMaterialsPlan } from '../../../repair/rules';
import { evaluateRepair } from '../../../../../domain/repairEngine';
import { itemRarityFor, donorCandidatesFor, pieceCatalogMaxHp } from '../../../repair/operations';

const RepairModal = ({ target, onClose }) => {
  // target: { storeItemId, name } | { equippedSlot, name } — две формы строки.
  const storeItemId = target?.storeItemId ?? null;
  const equippedSlot = target?.equippedSlot ?? null;

  const [donorId, setDonorId] = useState(null);
  const [run, setRun] = useState(null);
  const [report, setReport] = useState(null);
  const [settledTime, setSettledTime] = useState(null);

  const preview = useMemo(() => {
    if (equippedSlot != null) return repairEquippedPreview(equippedSlot, donorId);
    if (storeItemId != null) return repairPreview(storeItemId, { donorStoreItemId: donorId });
    return null;
  }, [storeItemId, equippedSlot, donorId]);

  const executeRef = useRef(() => {});
  const startedRef = useRef(false);
  useEffect(() => {
    // Слово владельца 414: донора нет — окно выбора не нужно, сразу
    // попытка и крафтовый отчёт о ремонте.
    if (!startedRef.current && preview && (preview.donors ?? []).length === 0) {
      startedRef.current = true;
      executeRef.current();
    }
  }, [preview]);

  if (!preview) return null;

  const execute = () => {
    const result = equippedSlot != null
      ? performEquippedPieceRepair(equippedSlot, { donorStoreItemId: donorId })
      : performRepair(storeItemId, { donorStoreItemId: donorId });
    if (result.stage === 'gate') { onClose(); return; }
    setRun(result);
    const names = localeNames();
    setReport(buildRepairReport(result, { attributeName: names.attribute, skillName: names.skill }));
    setSettledTime(null);
  };

  const onSettleTime = (spendAp) => {
    setSettledTime(settleRepairTime(run, { spendActionPoints: spendAp }));
  };
  executeRef.current = execute;

  const requirementLines = [];
  if (!run) {
    requirementLines.push(tInventory('repair.testLine')
      .replace('{attribute}', tInventory('repair.attribute'))
      .replace('{skill}', tInventory('repair.skill'))
      .replace('{difficulty}', preview.complexity));
    for (const material of preview.evaluation?.materials ?? []) {
      requirementLines.push(tInventory('repair.materialLine')
        .replace('{name}', tInventory(`repair.materials.${material.itemId}`))
        .replace('{have}', material.have)
        .replace('{need}', material.need));
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.window}>
          {!run && (
            <>
              <Text style={styles.title}>{tInventory('repair.title')}</Text>
              <Text style={styles.subtitle}>{target?.name ?? ''}</Text>
              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <View style={styles.block}>
                  {requirementLines.map((line, index) => (
                    <Text key={index} style={styles.requirementLine}>{line}</Text>
                  ))}
                </View>
                {(preview.donors ?? []).length > 0 && (
                  <View style={styles.block}>
                    <Text style={styles.donorTitle}>{tInventory('repair.donorTitle')}</Text>
                    <Text style={styles.requirementLine}>{tInventory('repair.donorOffer')}</Text>
                    {preview.donors.map((id) => (
                      <TouchableOpacity
                        key={id}
                        style={[styles.donorRow, donorId === id && styles.donorRowSelected]}
                        onPress={() => setDonorId(donorId === id ? null : id)}
                      >
                        <Text style={styles.donorText}>
                          {donorId === id ? '☑' : '☐'} {tInventory('repair.useDonor')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.mainButton, !preview.evaluation?.ready && styles.mainButtonDisabled]}
                  onPress={execute}
                  disabled={!preview.evaluation?.ready}
                >
                  <Text style={styles.mainButtonText}>{tInventory('repair.actions.remake')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Text style={styles.closeButtonText}>{tInventory('repair.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {run && (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.title}>{report.title}</Text>
              <CraftReportView
                report={report}
                settledTime={settledTime}
                onSettleTime={onSettleTime}
                onDone={onClose}
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const localeNames = () => (getCurrentModuleLocale() === 'en-EN'
  ? { attribute: 'INT', skill: 'Repair' }
  : { attribute: 'ИНТ', skill: 'Ремонт' });

// Сводка по надетой части СБ (цели нет в items — см. performEquippedPieceRepair).
const repairEquippedPreview = (slot, donorId) => {
  const store = useCharacterStore.getState();
  const piece = store.equippedPowerArmor?.pieces?.[slot];
  if (!piece) return null;
  const maxHp = pieceCatalogMaxHp(piece.catalogId);
  if (!Number.isFinite(maxHp)) return null;
  const current = Number(piece.hpCurrent) || 0;
  if (current >= maxHp) {
    return { canRepair: false, complexity: 0, donors: [], evaluation: { ready: false, materials: [], blocked: [] } };
  }
  const rarity = itemRarityFor(piece.catalogId);
  const donors = donorCandidatesFor({ id: piece.catalogId, weaponId: piece.catalogId }, null);
  const donorUsed = donorId != null && donors.includes(donorId);
  const complexity = Math.max(0, rarity - (donorUsed ? 1 : 0));
  const materialsPlan = donorUsed ? [] : repairMaterialsPlan(rarity);
  return {
    canRepair: true,
    complexity,
    donors,
    donorUsed,
    evaluation: evaluateRepair({
      complexity,
      materialsPlan,
      inventoryCounts: countFreeItems(store.items),
    }),
    hero: {
      attributeValue: selectAttributeTotal(store, REPAIR_RULES.testAttribute),
      skillValue: selectSkillTotal(store, REPAIR_RULES.testSkill),
    },
  };
};

const countFreeItems = (items) => {
  const counts = {};
  for (const item of Object.values(items || {})) {
    if (!item || item.installedOn || item.equipped) continue;
    const id = item.weaponId || item.id;
    if (!id) continue;
    counts[id] = (counts[id] || 0) + (Number(item.quantity) || 1);
  }
  return counts;
};

export default RepairModal;
