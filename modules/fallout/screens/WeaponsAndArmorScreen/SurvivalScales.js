// modules/fallout/screens/WeaponsAndArmorScreen/SurvivalScales.js
//
// Поле выживания (docs/survival-system-design.md §7): три горизонтальные
// шкалы под панелью «Эффекты». Дизайн (владелец, док 0.3.5): светлый фон;
// иконки в чёрных кружках, кружки вплотную к полосам; полоса — скруглённая
// капсула с обводкой, шкала-заполнение находится внутри, как будто объёмная;
// под цветным заполнением — прозрачный слой (виден цвет фона).
// Тап по шкале показывает название текущего состояния. Роботы и киборги
// поле не получают (survival === null → не рендерится).
//
// Модалки еды/питья/сна — следующий этап; сейчас шкалы только отображаются.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SURVIVAL_RULES } from '../../../../domain/survival';
import { useLocale } from '../../../../i18n/locale';
import { tWeaponsAndArmorScreen } from './weaponsAndArmorScreenI18n';

// Цвета заполнения — решение владельца (док 0.3.1): еда красно-коричневый,
// вода синий, сон зелёный.
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
      {LADDERS.map(({ key, icon, color }) => {
        const max = SURVIVAL_RULES.max[key];
        const current = survival[key];
        const fillPct = `${(current / max) * 100}%`;
        return (
          <TouchableOpacity
            key={key}
            style={styles.row}
            onPress={() => handlePress(key)}
            activeOpacity={0.7}
          >
            {/* Иконка в чёрном кружке — вплотную к полосе. */}
            <View style={styles.iconCircle}>
              <Text style={styles.icon}>{icon}</Text>
            </View>
            {/* Полоса-капсула: обводка, внутри — объёмное заполнение,
                под ним прозрачный слой (цвет фона поля). */}
            <View style={styles.track}>
              <View style={[styles.fill, { width: fillPct, backgroundColor: color }]} />
            </View>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.stateName}>
        {selected ? tWeaponsAndArmorScreen(`survival.${selected}.${survival[selected]}`) : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  field: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 12,
    lineHeight: 14,
  },
  track: {
    flex: 1,
    height: 16,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 8,
    padding: 2,
    backgroundColor: 'transparent',
    flexDirection: 'row',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  stateName: {
    color: '#444',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    minHeight: 14,
    marginTop: 6,
  },
});
