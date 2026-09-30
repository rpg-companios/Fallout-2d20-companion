// Модалка ремонта (патч 413, механика от владельца — книга): тест ИНТ +
// Ремонт со сложностью = редкость (+моды, −донор), материалы по редкости
// (или разборка донора), полчаса (успех + 2 ОД → 15 минут), осложнение —
// д20 19–20 теряет материалы, иначе +15 минут. Скролл-закон (402):
// заголовок и кнопки фиксированы, содержимое в ScrollView. Отчёт о
// попытке — в той же модалке (закон 357). Сложность 0 — окно спрашивает,
// бросать ли кубики (закон 356). Вся механика — в repair/operations.js;
// здесь только кнопки, списки и строки словаря.
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import styles from '../../../styles/RepairModal.styles';
import { tInventory } from '../../../../../components/screens/InventoryScreen/logic/inventoryI18n';
import { showRawAlert } from '../../../../../components/alerts/alertService';
import useCharacterStore from '../../../../../src/store/characterStore';
import { selectAttributeTotal, selectSkillTotal } from '../../../../../src/store/selectors';
import { evaluateRepair } from '../../../../../domain/repairEngine';
import {
  repairPreview,
  performRepair,
  performEquippedPieceRepair,
  settleRepairTime,
  itemRarityFor,
  donorCandidatesFor,
  pieceCatalogMaxHp,
} from '../../../repair/operations';
import { REPAIR_RULES, repairMaterialsPlan } from '../../../repair/rules';

const fmt = (template, params) => {
  let out = template;
  for (const [key, value] of Object.entries(params || {})) {
    out = out.split(`{${key}}`).join(String(value));
  }
  return out;
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

const RepairModal = ({ target, onClose }) => {
  // target: { storeItemId, name } | { equippedSlot, name } — две формы строки.
  const storeItemId = target?.storeItemId ?? null;
  const equippedSlot = target?.equippedSlot ?? null;

  const [donorId, setDonorId] = useState(null);
  const [report, setReport] = useState(null);
  const [settled, setSettled] = useState(null);
  const [askZero, setAskZero] = useState(false);

  const preview = useMemo(() => {
    if (equippedSlot != null) return repairEquippedPreview(equippedSlot, donorId);
    if (storeItemId != null) return repairPreview(storeItemId, { donorStoreItemId: donorId });
    return null;
  }, [storeItemId, equippedSlot, donorId]);

  if (!preview) return null;

  const evaluation = preview.evaluation;
  const run = (zeroDifficulty) => {
    setAskZero(false);
    const result = equippedSlot != null
      ? performEquippedPieceRepair(equippedSlot, { donorStoreItemId: donorId })
      : performRepair(storeItemId, { donorStoreItemId: donorId, ...(zeroDifficulty ? { zeroDifficulty } : {}) });
    setReport(result);
    setSettled(null);
    if (result.stage === 'store') {
      showRawAlert(tInventory('repair.alerts.storeTitle'), tInventory('repair.alerts.storeMessage'));
    }
  };

  const onRepairPress = () => {
    if (!evaluation?.ready) return;
    if (evaluation.auto && report == null) {
      setAskZero(true); // закон 356: сложность 0 — окно спрашивает
      return;
    }
    run();
  };

  const requirementLines = [
    fmt(tInventory('repair.testLine'), {
      attribute: tInventory('repair.attribute'),
      skill: tInventory('repair.skill'),
      difficulty: preview.complexity,
    }),
  ];
  for (const material of evaluation?.materials ?? []) {
    requirementLines.push(fmt(tInventory('repair.materialLine'), {
      name: tInventory(`repair.materials.${material.itemId}`),
      have: material.have,
      need: material.need,
    }));
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.window}>
          <Text style={styles.title}>{tInventory('repair.title')}</Text>
          <Text style={styles.subtitle}>{target?.name ?? ''}</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {!report && (
              <>
                <View style={styles.block}>
                  {requirementLines.map((line, index) => (
                    <Text key={index} style={styles.requirementLine}>{line}</Text>
                  ))}
                </View>

                {(preview.donors ?? []).length > 0 && (
                  <View style={styles.block}>
                    {preview.donors.map((id) => (
                      <TouchableOpacity
                        key={id}
                        style={[styles.donorRow, donorId === id && styles.donorRowSelected]}
                        onPress={() => setDonorId(donorId === id ? null : id)}
                      >
                        <Text style={styles.donorText}>
                          {donorId === id ? '☑' : '☐'} {tInventory('repair.donorLine')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={styles.timeLine}>
                  {fmt(tInventory('repair.timeLine'), { minutes: REPAIR_RULES.baseMinutes })}
                </Text>
                {evaluation?.blocked?.length > 0 && (
                  <Text style={styles.blockedLine}>{tInventory('repair.notReady')}</Text>
                )}
              </>
            )}

            {report && (
              <View style={styles.block}>
                <Text style={[styles.reportLine, report.done ? styles.success : styles.failure]}>
                  {report.done ? tInventory('repair.report.success') : tInventory('repair.report.failure')}
                </Text>
                {report.check && (
                  <Text style={styles.reportLine}>
                    {fmt(tInventory('repair.report.rolls'), {
                      rolls: (report.check.rolls ?? report.check.dice ?? []).join(', '),
                    })}
                  </Text>
                )}
                {(report.complications ?? 0) > 0 && (
                  <Text style={styles.reportLine}>
                    {fmt(tInventory('repair.report.complications'), {
                      n: report.complications,
                      minutes: report.complications * REPAIR_RULES.complicationExtraMinutes,
                    })}
                  </Text>
                )}
                {report.resolution?.kind === 'lost-materials' && (
                  <Text style={styles.reportLine}>
                    {fmt(tInventory('repair.report.lostMaterials'), { face: report.resolution.face })}
                  </Text>
                )}
                {(report.spent ?? []).length > 0 && (
                  <Text style={styles.reportLine}>
                    {report.spent.map((row) => fmt(tInventory('repair.materialShort'), {
                      name: tInventory(`repair.materials.${row.itemId}`),
                      n: row.count,
                    })).join(', ')}
                  </Text>
                )}
                {report.done && settled == null && (
                  <View style={styles.apBlock}>
                    <Text style={styles.apQuestion}>{tInventory('repair.report.apQuestion')}</Text>
                    <View style={styles.apRow}>
                      <TouchableOpacity style={styles.apButton} onPress={() => settle(true)}>
                        <Text style={styles.apButtonText}>{tInventory('repair.report.spendAp')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.apButton} onPress={() => settle(false)}>
                        <Text style={styles.apButtonText}>{tInventory('repair.report.fullTime')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {settled != null && (
                  <Text style={styles.reportLine}>
                    {fmt(tInventory('repair.report.timeSpent'), {
                      minutes: settled.minutes,
                      pool: settled.pool,
                    })}
                  </Text>
                )}
                {!report.done && settled == null && (
                  <TouchableOpacity style={styles.apButton} onPress={() => settle(false)}>
                    <Text style={styles.apButtonText}>{tInventory('repair.report.confirmTime')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {askZero && (
              <View style={styles.block}>
                <Text style={styles.apQuestion}>{tInventory('repair.zeroDiffQuestion')}</Text>
                <View style={styles.apRow}>
                  <TouchableOpacity style={styles.apButton} onPress={() => run('roll')}>
                    <Text style={styles.apButtonText}>{tInventory('repair.zeroDiffRoll')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.apButton} onPress={() => run(undefined)}>
                    <Text style={styles.apButtonText}>{tInventory('repair.zeroDiffAuto')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {!report && (
              <TouchableOpacity
                style={[styles.mainButton, !evaluation?.ready && styles.mainButtonDisabled]}
                onPress={onRepairPress}
                disabled={!evaluation?.ready}
              >
                <Text style={styles.mainButtonText}>{tInventory('repair.actions.repair')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>{tInventory('repair.actions.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default RepairModal;
