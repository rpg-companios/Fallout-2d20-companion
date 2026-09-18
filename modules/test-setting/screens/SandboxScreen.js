// ТЕСТОВЫЙ СЕТТИНГ — экран песочницы (МК-2, патч 286).
//
// ТОЛЬКО СРЕДА РАЗРАБОТКИ: вкладка монтируется в App.js за гейтом __DEV__
// (слово владельца: «в основной программе не показывать вообще»). Продакшн
// её не видит. Экран тонкий: состояние вкладки локальное, логика — во
// вью-модели (viewModel.js) и реестре движка; хранилище персонажа не трогается.
//
// Что можно делать: двигать атрибуты (0–12), навыки (0 — потолок ранга от
// атрибута-покровителя), включать бонусы +5%/+10% к силе магии и +15% к
// защите, смотреть, как каскад пересчитывает производные, потолки счётчиков
// и гейты заклинаний («Колдовство ранга 4» + хватает ли манны).

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Divider, Headline, Surface, Text as PaperText } from 'react-native-paper';
import { getSandboxRegistry } from '../sandbox';
import { buildSandboxViewModel } from '../viewModel';

const HERO = {
  'test.attr.strength': 8,
  'test.attr.agility': 6,
  'test.attr.intellect': 9,
  'test.attr.spirit': 7,
  'test.attr.luck': 5,
  'test.skill.blade': 3,
  'test.skill.bladeDefense': 2,
  'test.skill.sorcery': 2,
  'test.skill.magicDefense': 2,
  'test.skill.aim': 1,
  'test.skill.stealth': 0,
  'test.skill.survival': 0,
};

const BONUSES = [
  { key: 'amulet', label: 'Амулет +5% силы магии', target: 'test.derived.magicPower', value: 5 },
  { key: 'artifact', label: 'Артефакт +10% силы магии', target: 'test.derived.magicPower', value: 10 },
  { key: 'mantle', label: 'Мантия +15% защиты', target: 'test.derived.defense', value: 15 },
];

const Row = ({ label, value, hint, dimmed }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, dimmed ? styles.dimmed : null]}>{label}</Text>
    <Text style={[styles.rowValue, dimmed ? styles.dimmed : null]}>
      {value}
      {hint ? <Text style={styles.hint}> {hint}</Text> : null}
    </Text>
  </View>
);

const SandboxScreen = () => {
  const [hero, setHero] = useState(HERO);
  const [bonuses, setBonuses] = useState({});

  const vm = useMemo(() => {
    const modifiers = {};
    for (const bonus of BONUSES) {
      if (bonuses[bonus.key]) {
        (modifiers[bonus.target] ??= []).push({
          source: `test.bonus.${bonus.key}`,
          operation: '%',
          value: bonus.value,
        });
      }
    }
    const evaluation = getSandboxRegistry().evaluate(hero, modifiers);
    return { ...buildSandboxViewModel(evaluation), ceilings: evaluation.ceilings };
  }, [hero, bonuses]);

  const bump = (id, delta, max) => {
    setHero((prev) => {
      const next = Math.max(0, Math.min(max ?? 12, (prev[id] ?? 0) + delta));
      return { ...prev, [id]: next };
    });
  };

  const skillCeiling = (skillId) =>
    vm.skills.find((s) => s.id === skillId)?.ceiling ?? 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Headline style={styles.headline}>Песочница правил</Headline>
      <PaperText style={styles.sub}>Тестовый сеттинг на контракте выводимости</PaperText>

      <Surface style={styles.card}>
        <Text style={styles.cardTitle}>Производные</Text>
        {vm.derived.map((d) => (
          <Row key={d.id} label={d.label} value={d.value} />
        ))}
        <Divider style={styles.divider} />
        <Row label="Счётчик здоровья (потолок)" value={vm.counters.health} />
        <Row label="Счётчик манны (потолок)" value={vm.counters.mana} />
      </Surface>

      <Surface style={styles.card}>
        <Text style={styles.cardTitle}>Атрибуты</Text>
        {vm.attributes.map((a) => (
          <View key={a.id} style={styles.row}>
            <Text style={styles.rowLabel}>{a.label}</Text>
            <View style={styles.stepper}>
              <Button compact mode="outlined" onPress={() => bump(a.id, -1)}>−</Button>
              <Text style={styles.stepperValue}>{a.value}</Text>
              <Button compact mode="outlined" onPress={() => bump(a.id, +1)}>+</Button>
            </View>
          </View>
        ))}
      </Surface>

      <Surface style={styles.card}>
        <Text style={styles.cardTitle}>Навыки (потолок ранга — от атрибута)</Text>
        {vm.skills.map((s) => (
          <View key={s.id} style={styles.row}>
            <Text style={styles.rowLabel}>
              {s.label}
              {s.atCeiling ? <Text style={styles.hint}> потолок</Text> : null}
            </Text>
            <View style={styles.stepper}>
              <Button compact mode="outlined" onPress={() => bump(s.id, -1, s.ceiling)}>−</Button>
              <Text style={styles.stepperValue}>
                {s.value}
                <Text style={styles.hint}>/{s.ceiling}</Text>
              </Text>
              <Button
                compact
                mode="outlined"
                disabled={s.atCeiling}
                onPress={() => bump(s.id, +1, s.ceiling)}
              >
                +
              </Button>
            </View>
          </View>
        ))}
      </Surface>

      <Surface style={styles.card}>
        <Text style={styles.cardTitle}>Бонусы (+5/10/15% — к силе магии / защите)</Text>
        <View style={styles.chips}>
          {BONUSES.map((bonus) => (
            <Chip
              key={bonus.key}
              selected={Boolean(bonuses[bonus.key])}
              onPress={() => setBonuses((prev) => ({ ...prev, [bonus.key]: !prev[bonus.key] }))}
              style={styles.chip}
            >
              {bonus.label}
            </Chip>
          ))}
        </View>
      </Surface>

      <Surface style={styles.card}>
        <Text style={styles.cardTitle}>Заклинания (гейт: Колдовство ранга 4; тратят манну)</Text>
        {vm.spells.map((spell) => (
          <Row
            key={spell.id}
            label={`${spell.name} (${spell.cost} манны)`}
            value={spell.allowed ? 'доступно' : 'закрыто'}
            hint={!spell.gateOk ? 'нужен ранг 4' : !spell.manaOk ? 'мало манны' : null}
            dimmed={!spell.allowed}
          />
        ))}
      </Surface>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f2ec' },
  content: { padding: 12, paddingBottom: 32 },
  headline: { fontSize: 22, marginBottom: 2 },
  sub: { marginBottom: 12, color: '#666' },
  card: { borderRadius: 10, padding: 12, marginBottom: 12 },
  cardTitle: { fontWeight: 'bold', fontSize: 15, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: 'bold' },
  hint: { fontSize: 11, color: '#8a6d3b', fontWeight: 'normal' },
  dimmed: { color: '#999' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperValue: { minWidth: 34, textAlign: 'center', fontSize: 14, fontWeight: 'bold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { marginBottom: 4 },
  divider: { marginVertical: 6 },
});

export default SandboxScreen;
