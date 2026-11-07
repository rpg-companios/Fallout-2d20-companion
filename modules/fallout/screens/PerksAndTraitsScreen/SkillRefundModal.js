import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getSkillDisplayName } from '../CharacterScreen/logic/characterScreenI18n';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';
import { skillFloor } from '../../../../domain/skillPoints';
import styles from '../../styles/SkillRefundModal.styles';

/**
 * 552: снятие перка, очки которого уже потрачены.
 * Игрок сам выбирает навыки, с которых снять очки (решение владельца:
 * суммарно не больше 2, можно 2 с одного или 1 с двух). Минимумы навыков
 * (0 обычный, 2 тегированный) не нарушаются; пока не выбрана вся сумма,
 * подтверждение недоступно — «молчаливого» долга не бывает.
 */
const SkillRefundModal = ({
  visible,
  perkName,
  points,
  skills = [],
  taggedSkills = [],
  onCancel,
  onConfirm,
}) => {
  const [refunds, setRefunds] = useState({});

  useEffect(() => {
    if (visible) setRefunds({});
  }, [visible, perkName, points]);

  const tagged = useMemo(() => new Set(taggedSkills), [taggedSkills]);
  const rows = useMemo(
    () => skills
      .map((skill) => ({
        name: skill.name,
        value: Number(skill.value) || 0,
        floor: skillFloor(tagged.has(skill.name)),
        display: getSkillDisplayName(skill.name),
      }))
      .filter((row) => row.value > row.floor),
    [skills, tagged],
  );

  const total = Object.values(refunds).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const remaining = Math.max(0, points - total);
  const canConfirm = remaining === 0;

  const changeSkill = (row, delta) => {
    setRefunds((prev) => {
      const current = Number(prev[row.name]) || 0;
      const next = current + delta; // delta = +1 → снимаем, -1 → возвращаем
      const maxForSkill = Math.max(0, row.value - row.floor);
      const otherTotal = Object.entries(prev)
        .reduce((sum, [name, value]) => sum + (name === row.name ? 0 : Number(value) || 0), 0);
      const cappedByTotal = Math.max(0, points - otherTotal);
      const clamped = Math.min(Math.max(0, next), maxForSkill, cappedByTotal);
      const copy = { ...prev };
      if (clamped === 0) delete copy[row.name];
      else copy[row.name] = clamped;
      return copy;
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>
            {tPerksAndTraits('refund.title').replace('{perk}', perkName || '')}
          </Text>
          <Text style={styles.message}>
            {tPerksAndTraits('refund.message').replace(/\{points\}/g, String(points))}
          </Text>
          <Text style={styles.remaining}>
            {tPerksAndTraits('refund.remaining').replace('{remaining}', String(remaining))}
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rows.map((row) => {
              const taken = Number(refunds[row.name]) || 0;
              const canTake = remaining > 0 && row.value - taken > row.floor;
              return (
                <View key={row.name} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{row.display}</Text>
                    <Text style={styles.rowValue}>
                      {row.value}
                      {taken > 0 ? ` → ${row.value - taken}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={canTake ? styles.stepButton : [styles.stepButton, styles.stepButtonDisabled]}
                    disabled={!canTake}
                    onPress={() => changeSkill(row, 1)}
                  >
                    <Text style={styles.stepButtonText}>{tPerksAndTraits('refund.decrease')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={taken > 0 ? styles.undoButton : [styles.undoButton, styles.stepButtonDisabled]}
                    disabled={taken === 0}
                    onPress={() => changeSkill(row, -1)}
                  >
                    <Text style={styles.undoButtonText}>{tPerksAndTraits('refund.undo')}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>

          <Text style={styles.hint}>{tPerksAndTraits('refund.taggedHint')}</Text>

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>{tPerksAndTraits('refund.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={canConfirm ? styles.confirmButton : [styles.confirmButton, styles.confirmButtonDisabled]}
              disabled={!canConfirm}
              onPress={() => onConfirm(refunds)}
            >
              <Text style={styles.confirmButtonText}>{tPerksAndTraits('refund.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default SkillRefundModal;
