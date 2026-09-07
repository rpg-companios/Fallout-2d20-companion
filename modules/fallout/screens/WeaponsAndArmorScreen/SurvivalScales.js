// modules/fallout/screens/WeaponsAndArmorScreen/SurvivalScales.js
//
// Поле выживания (docs/survival-system-design.md §7): три вертикальные
// шкалы рядом с панелью «Эффекты». Еда 5 секций, вода 4 (короче, выровнены
// по низу), сон 5. Подписи — иконки (мясо/капля/💤), без текста; тап по
// шкале показывает название текущего состояния. Роботы и киборги поле не
// получают (survival === null → не рендерится).
//
// Модалки еды/питья/сна — следующий этап; сейчас шкалы только отображаются.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SURVIVAL_RULES } from '../../../../domain/survival';
import { useLocale } from '../../../../i18n/locale';
import { tWeaponsAndArmorScreen } from './weaponsAndArmorScreenI18n';

// Цвета и иконки — решение владельца (док 0.3.1): еда красно-коричневый,
// вода синий, сон зелёный; ориентиры оттенков закреплены в доке.
const LADDERS = [
  { key: 'food', icon: '🍖', color: '#A0522D' },
  { key: 'water', icon: '💧', color: '#2E6FBF' },
  { key: 'sleep', icon: '💤', color: '#3F9B63' },
];

export const SurvivalScales = ({ survival }) => {
  const [selected, setSelected] = useState(null);
  useLocale();
  if (!survival) return null;

  const handlePress = (key) => setSelected((prev) => (prev === key ? null : key));

  return (
    <View style={styles.field}>
      <View style={styles.barsRow}>
        {LADDERS.map(({ key, icon, color }) => {
          const max = SURVIVAL_RULES.max[key];
          const current = survival[key];
          const sections = [];
          for (let section = max; section >= 1; section -= 1) sections.push(section);
          return (
            <TouchableOpacity
              key={key}
              style={styles.ladder}
              onPress={() => handlePress(key)}
              activeOpacity={0.7}
            >
              <View style={styles.ladderBars}>
                {sections.map((section) => (
                  <View
                    key={section}
                    style={[
                      styles.section,
                      { borderColor: color },
                      section <= current ? { backgroundColor: color } : styles.sectionEmpty,
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.icon}>{icon}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.stateName}>
        {selected ? tWeaponsAndArmorScreen(`survival.${selected}.${survival[selected]}`) : ''}
      </Text>
    </View>
  );
};

const SECTION_H = 13;
const BAR_W = 16;

const styles = StyleSheet.create({
  field: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  ladder: {
    alignItems: 'center',
    marginHorizontal: 4,
  },
  ladderBars: {
    flexDirection: 'column',
  },
  section: {
    width: BAR_W,
    height: SECTION_H,
    borderWidth: 1,
    borderRadius: 2,
    marginBottom: 3,
  },
  sectionEmpty: {
    backgroundColor: 'transparent',
  },
  icon: {
    fontSize: 14,
    lineHeight: 18,
    marginTop: 1,
  },
  stateName: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    minHeight: 26,
    marginTop: 4,
  },
});
