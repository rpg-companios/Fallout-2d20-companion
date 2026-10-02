// Модалка ремонта (патчи 413–417, механика от владельца). Слово владельца
// 414: донора предлагать в окне (если есть); отчёт — крафтовый (окно
// отчёта крафта берём за основу: те же строки, вопрос про 2 ОД, «только
// прочность предмета повышается вместо предмета»). Отчёт рисует общий
// CraftReportView (357); строки — словари крафта + repair-секция.
// Слово владельца 417: с перком «Очумелые ручки» окно выбора всегда —
// ТРИ кнопки: «Без затрат (некачественно)» (доступна всегда — это перк),
// «За счёт донора (ускоренный ремонт)» (серая без донора), «За счёт
// материалов» (серая без материалов). Тест и время — в любом режиме.
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
import { juryRiggingRanksFor } from '../../../repair/operations';
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

  // 417: подписка на выборы перков — окно выбора видно, пока перк активен.
  useCharacterStore((state) => state.selectedPerks);
  const juryActive = juryRiggingRanksFor() > 0;

  const preview = useMemo(() => {
    if (equippedSlot != null) return repairEquippedPreview(equippedSlot, donorId);
    if (storeItemId != null) return repairPreview(storeItemId, { donorStoreItemId: donorId });
    return null;
  }, [storeItemId, equippedSlot, donorId]);

  const executeRef = useRef(() => {});
  const startedRef = useRef(false);
  useEffect(() => {
    // Слово владельца 414 (без перка): донора нет — окно выбора не нужно,
    // сразу попытка и крафтовый отчёт о ремонте. С перком (417) автостарта
    // нет: «Без затрат» доступна всегда — пусть игрок выбирает.
    if (!startedRef.current && preview && !juryActive && (preview.donors ?? []).length === 0) {
      startedRef.current = true;
      executeRef.current({ mode: 'materials' });
    }
  }, [preview]);

  if (!preview) return null;

  const execute = ({ mode = 'materials' } = {}) => {
    // Донор: выбранный в списке, иначе первый из имеющихся (для кнопки
    // «За счёт донора»); в остальных режимах донор не тратится.
    const donorForRun = mode === 'donor'
      ? (donorId ?? (preview.donors ?? [])[0] ?? null)
      : (mode === 'materials' ? donorId : null);
    const result = equippedSlot != null
      ? performEquippedPieceRepair(equippedSlot, { donorStoreItemId: donorForRun, mode })
      : performRepair(storeItemId, { donorStoreItemId: donorForRun, mode });
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
                    {preview.donors.map((id, index) => (
                      <TouchableOpacity
                        key={id}
                        style={[styles.donorRow, (donorId ?? (preview.donors ?? [])[0]) === id && styles.donorRowSelected]}
                        onPress={() => setDonorId(id)}
                      >
                        <Text style={styles.donorText}>
                          {(donorId ?? (preview.donors ?? [])[0]) === id ? '☑' : '☐'} {tInventory('repair.useDonor')}{preview.donors.length > 1 ? ` #${index + 1}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
              {juryActive ? (
                // Слово владельца 417: три кнопки, серые по наличию.
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={styles.mainButton}
                    onPress={() => execute({ mode: 'free' })}
                  >
                    <Text style={styles.mainButtonText}>{tInventory('repair.choice.free')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.mainButton, (preview.donors ?? []).length === 0 && styles.mainButtonDisabled]}
                    disabled={(preview.donors ?? []).length === 0}
                    onPress={() => execute({ mode: 'donor' })}
                  >
                    <Text style={styles.mainButtonText}>{tInventory('repair.choice.donor')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.mainButton, !preview.evaluation?.ready && styles.mainButtonDisabled]}
                    disabled={!preview.evaluation?.ready}
                    onPress={() => execute({ mode: 'materials' })}
                  >
                    <Text style={styles.mainButtonText}>{tInventory('repair.choice.materials')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <Text style={styles.closeButtonText}>{tInventory('repair.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={[styles.mainButton, !preview.evaluation?.ready && styles.mainButtonDisabled]}
                    onPress={() => execute({ mode: 'materials' })}
                    disabled={!preview.evaluation?.ready}
                  >
                    <Text style={styles.mainButtonText}>{tInventory('repair.actions.remake')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <Text style={styles.closeButtonText}>{tInventory('repair.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              )}
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
