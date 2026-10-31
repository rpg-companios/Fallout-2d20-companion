// components/screens/EnvCombatScreen/modals/EnvMechanicModal.js
// Позитрониум-модалка настройки и применения 4 механик «Окружающая среда/бой»
// (Погода, Радиация, Увечье, Провал атаки) + сохранение состояния как отдельной плитки (патч 482).

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../../../i18n/locale';
import IconText from '../../../lootTrade/LootTradeIconText';
import { ENV_MECHANIC_TYPE } from '../../../../domain/envCombatPresets';
import {
  ATTACK_FAIL_OUTCOMES,
  DURATION_UNITS,
  ENV_DIRECTIVE_KIND,
  WEATHER_CONDITIONS,
  describeInjuryEffect,
  getCharacterZonesForInjury,
  resolveCharacterImmunityContext,
  rollCdValue,
} from '../../../../modules/fallout/gm/gmEnvCombat';
import { formatGm, tGm } from '../../../../modules/fallout/gm/gmI18n';

const StepperRow = ({ label, value, min = 1, max = 99, onChange }) => (
  <View style={styles.stepperRow}>
    <IconText style={styles.fieldLabel}>{label}</IconText>
    <View style={styles.stepperControls}>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => onChange(Math.max(min, (Number(value) || min) - 1))}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepValue}>{value}</Text>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => onChange(Math.min(max, (Number(value) || min) + 1))}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  </View>
);

export default function EnvMechanicModal({
  visible,
  mechanicType,
  initialPayload = null,
  initialPresetMeta = null, // { id?, name, description, parentFolderId }
  folders = [],
  roomCharacters = [], // [{ characterId, name, snapshot }]
  selectedTargetId = 'all', // 'all' | characterId
  hasLiveRoom = false,
  onClose,
  onDispatchDirective, // ({ kind, targetCharacterId?, envPayload }) => void
  onSavePresetTile, // ({ id?, mechanicType, name, description, parentFolderId, payload }) => void
}) {
  const locale = useLocale();

  // Общие поля силы и длительности (для Погоды и Радиации, а также урона Взрыва/Рикошета)
  const [conditionKey, setConditionKey] = useState('heat');
  const [valueMode, setValueMode] = useState('fixed');
  const [value, setValue] = useState(2);
  const [durationUnit, setDurationUnit] = useState('scenes');
  const [totalIntervals, setTotalIntervals] = useState(3);

  // Зона попадания / увечья
  const [zoneKey, setZoneKey] = useState('auto');
  const [bleedDice, setBleedDice] = useState(1);

  // Провал атаки
  const [attackOutcome, setAttackOutcome] = useState('weaponJam');
  const [selectedWeaponId, setSelectedWeaponId] = useState('');
  const [ammoMode, setAmmoMode] = useState('fixed');
  const [explodeRepairable, setExplodeRepairable] = useState(true);
  const [ricochetTargetMode, setRicochetTargetMode] = useState('self');
  const [ricochetChosenCharId, setRicochetChosenCharId] = useState('');

  // Настройка значений и форма сохранения пресета
  const [rolledCdLine, setRolledCdLine] = useState('');
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [presetFolderId, setPresetFolderId] = useState(null);

  const primaryCharacter = useMemo(() => {
    if (selectedTargetId && selectedTargetId !== 'all') {
      return roomCharacters.find((c) => c.characterId === selectedTargetId) || null;
    }
    return null;
  }, [roomCharacters, selectedTargetId]);

  const charZones = useMemo(
    () => (primaryCharacter ? getCharacterZonesForInjury(primaryCharacter.snapshot || {}, locale) : []),
    [primaryCharacter, locale],
  );

  const targetIsRobot = useMemo(
    () => resolveCharacterImmunityContext(primaryCharacter?.snapshot || {}).isRobot,
    [primaryCharacter],
  );

  const targetWeapons = useMemo(() => {
    const snap = primaryCharacter?.snapshot || {};
    const eqList = Array.isArray(snap.equippedWeapons) ? snap.equippedWeapons : [];
    const invItems = Array.isArray(snap.equipment?.items) ? snap.equipment.items : [];
    const seen = new Set();
    const out = [];
    const pushW = (w, isEq) => {
      if (!w || w.isBuiltin || w.isManipulator) return;
      const key = w.instanceId || w.id || w.weaponId;
      if (!key || seen.has(key)) return;
      if (!(w.itemType === 'weapon' || w.weaponId || w.damage !== undefined || isEq)) return;
      seen.add(key);
      out.push({
        id: key,
        name: w.name || w.Name || w.weaponId || key,
        equipped: Boolean(isEq || w.equipped || w.isEquipped),
        ammoId: w.ammoId || null,
      });
    };
    eqList.forEach((w) => pushW(w, true));
    invItems.forEach((w) => pushW(w, Boolean(w?.equipped || w?.isEquipped)));
    return out;
  }, [primaryCharacter]);

  useEffect(() => {
    if (!visible) return;
    setRolledCdLine('');
    const p = initialPayload || {};

    if (mechanicType === ENV_MECHANIC_TYPE.WEATHER) {
      const def = WEATHER_CONDITIONS.find((c) => c.key === (p.conditionKey || 'heat')) || WEATHER_CONDITIONS[0];
      setConditionKey(def.key);
      setValueMode('fixed');
      setValue(p.value ?? def.defaultValue);
      setDurationUnit(p.durationUnit || def.defaultUnit);
      setTotalIntervals(p.totalIntervals ?? def.defaultIntervals);
    } else if (mechanicType === ENV_MECHANIC_TYPE.RADIATION) {
      setValueMode('fixed');
      setValue(p.value ?? 3);
      setDurationUnit(p.durationUnit && p.durationUnit !== 'once' ? p.durationUnit : 'scenes');
      setTotalIntervals(p.totalIntervals ?? 3);
    } else if (mechanicType === ENV_MECHANIC_TYPE.INJURY) {
      setZoneKey(p.zoneKey && charZones.some((z) => z.key === p.zoneKey) ? p.zoneKey : 'auto');
      setBleedDice(p.bleedDice ?? 1);
    } else if (mechanicType === ENV_MECHANIC_TYPE.ATTACK_FAIL) {
      setAttackOutcome(p.outcome || 'weaponJam');
      setSelectedWeaponId(p.weaponId || targetWeapons[0]?.id || '');
      setAmmoMode(p.ammoMode || 'fixed');
      setValueMode(p.valueMode || 'cd');
      setValue(p.value ?? 3);
      setExplodeRepairable(p.repairable !== false);
      setRicochetTargetMode(p.ricochetTargetMode || 'self');
      setRicochetChosenCharId(p.ricochetChosenCharId || roomCharacters[0]?.characterId || '');
      setZoneKey(p.hitZone || 'auto');
    }

    if (initialPresetMeta) {
      setPresetName(initialPresetMeta.name || '');
      setPresetDesc(initialPresetMeta.description || '');
      setPresetFolderId(initialPresetMeta.parentFolderId || null);
      setSavePanelOpen(Boolean(initialPresetMeta.openSavePanel));
    } else {
      setPresetName('');
      setPresetDesc('');
      setPresetFolderId(null);
      setSavePanelOpen(false);
    }
  }, [visible, mechanicType, initialPayload, initialPresetMeta, charZones]);

  useEffect(() => {
    if (targetWeapons.length > 0 && !targetWeapons.some((w) => w.id === selectedWeaponId)) {
      setSelectedWeaponId(targetWeapons[0].id);
    }
  }, [targetWeapons, selectedWeaponId]);

  if (!visible || !mechanicType) return null;

  const selectWeatherCond = (cond) => {
    setConditionKey(cond.key);
    setValueMode('fixed');
    setValue(cond.defaultValue);
    setDurationUnit(cond.defaultUnit);
    setTotalIntervals(cond.defaultIntervals);
  };

  const handleRollCdPreview = () => {
    const res = rollCdValue(value);
    setRolledCdLine(formatGm(tGm('envCombat.valueMode.rolledResult', locale), {
      total: res.total,
      faces: res.rolls.join(', '),
    }));
  };

  const handleRandomAttackOutcome = () => {
    const idx = Math.floor(Math.random() * ATTACK_FAIL_OUTCOMES.length);
    setAttackOutcome(ATTACK_FAIL_OUTCOMES[idx].key);
  };

  const buildCurrentEnvPayload = () => {
    if (mechanicType === ENV_MECHANIC_TYPE.WEATHER) {
      return {
        conditionKey,
        valueMode,
        value,
        durationUnit,
        totalIntervals: durationUnit === 'once' ? 1 : totalIntervals,
      };
    }
    if (mechanicType === ENV_MECHANIC_TYPE.RADIATION) {
      return {
        valueMode: 'fixed',
        value,
        durationUnit,
        totalIntervals,
      };
    }
    if (mechanicType === ENV_MECHANIC_TYPE.INJURY) {
      return {
        zoneKey,
        bleedDice,
      };
    }
    const chosenWep = targetWeapons.find((w) => w.id === selectedWeaponId);
    return {
      outcome: attackOutcome,
      weaponId: selectedWeaponId || null,
      weaponName: chosenWep?.name || null,
      ammoId: chosenWep?.ammoId || null,
      ammoMode,
      valueMode: attackOutcome === 'ammoLoss' ? (ammoMode === 'cd' ? 'cd' : 'fixed') : valueMode,
      value,
      repairable: explodeRepairable,
      ricochetTargetMode,
      ricochetChosenCharId: ricochetChosenCharId || null,
      hitZone: zoneKey === 'auto' ? null : zoneKey,
    };
  };

  const resolveDirectiveKind = () => {
    if (mechanicType === ENV_MECHANIC_TYPE.WEATHER) return ENV_DIRECTIVE_KIND.WEATHER_APPLY;
    if (mechanicType === ENV_MECHANIC_TYPE.RADIATION) return ENV_DIRECTIVE_KIND.RADIATION_APPLY;
    if (mechanicType === ENV_MECHANIC_TYPE.INJURY) return ENV_DIRECTIVE_KIND.INJURY_APPLY;
    return ENV_DIRECTIVE_KIND.ATTACK_FAIL;
  };

  const requiresCharacter = mechanicType === ENV_MECHANIC_TYPE.INJURY || mechanicType === ENV_MECHANIC_TYPE.ATTACK_FAIL;
  const handleApply = () => {
    if (!hasLiveRoom || (requiresCharacter && !primaryCharacter)) return;
    const envPayload = buildCurrentEnvPayload();
    if (presetName.trim()) {
      envPayload.customTitle = presetName.trim();
    }
    let overrideTargetId = null;
    if (mechanicType === ENV_MECHANIC_TYPE.ATTACK_FAIL && attackOutcome === 'ricochet') {
      if (ricochetTargetMode === 'chosen' && ricochetChosenCharId) {
        overrideTargetId = ricochetChosenCharId;
      } else if (ricochetTargetMode === 'randomAlly' && roomCharacters.length > 0) {
        const pool = roomCharacters.filter((c) => c.characterId !== primaryCharacter?.characterId);
        const pickPool = pool.length > 0 ? pool : roomCharacters;
        overrideTargetId = pickPool[Math.floor(Math.random() * pickPool.length)]?.characterId || null;
      } else if (primaryCharacter?.characterId) {
        overrideTargetId = primaryCharacter.characterId;
      }
    }
    onDispatchDirective?.({
      kind: resolveDirectiveKind(),
      targetCharacterId: overrideTargetId,
      envPayload,
    });
  };

  const handleSavePreset = () => {
    const defaultName = mechanicType === ENV_MECHANIC_TYPE.WEATHER
      ? tGm(`envCombat.weather.conditions.${conditionKey}.title`, locale)
      : mechanicType === ENV_MECHANIC_TYPE.RADIATION
        ? tGm('envCombat.radiation.modalTitle', locale)
        : mechanicType === ENV_MECHANIC_TYPE.INJURY
          ? tGm('envCombat.tiles.injury.title', locale)
          : tGm(`envCombat.attackFail.outcomes.${attackOutcome}.title`, locale);
    const presetPayload = buildCurrentEnvPayload();
    if (mechanicType === ENV_MECHANIC_TYPE.INJURY) presetPayload.zoneKey = 'auto';
    onSavePresetTile?.({
      id: initialPresetMeta?.id || undefined,
      mechanicType,
      name: presetName.trim() || defaultName,
      description: presetDesc.trim(),
      parentFolderId: presetFolderId || null,
      payload: presetPayload,
    });
    setSavePanelOpen(false);
  };

  const renderStrengthAndDuration = ({ showDuration = true, fixedOnly = false, intervalOnly = false, valueLabel = null, stepperLabel = null } = {}) => {
    const valSummary = valueMode === 'cd' ? `${value} {CD}` : `${value}`;
    return (
      <View style={styles.blockBox}>
        <IconText style={styles.sectionLabel}>{valueLabel || tGm('envCombat.valueMode.label', locale)}</IconText>
        {!fixedOnly ? <View style={styles.chipsRow}>
          {['fixed', 'cd'].map((m) => {
            const active = valueMode === m;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setValueMode(m)}
              >
                <IconText style={[styles.chipText, active && styles.chipTextActive]}>
                  {tGm(`envCombat.valueMode.${m}`, locale)}
                </IconText>
              </TouchableOpacity>
            );
          })}
          {valueMode === 'cd' ? (
            <TouchableOpacity style={styles.diceBtn} onPress={handleRollCdPreview}>
              <MaterialCommunityIcons name="dice-multiple" size={16} color="#ffffff" />
              <IconText style={styles.diceBtnText}>
                {formatGm(tGm('envCombat.valueMode.rollNowBtn', locale), { count: value })}
              </IconText>
            </TouchableOpacity>
          ) : null}
        </View> : null}
        <StepperRow
          label={stepperLabel || (valueMode === 'cd' ? `{CD}` : '#')}
          value={value}
          min={1}
          max={30}
          onChange={setValue}
        />
        {rolledCdLine ? <Text style={styles.rolledInfo}>{rolledCdLine}</Text> : null}

        {showDuration ? (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 10 }]}>
              {tGm('envCombat.duration.label', locale)}
            </Text>
            <View style={styles.chipsRow}>
              {DURATION_UNITS.filter((u) => !intervalOnly || u !== 'once').map((u) => {
                const active = durationUnit === u;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setDurationUnit(u)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {tGm(`envCombat.duration.units.${u}`, locale)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {durationUnit !== 'once' || intervalOnly ? (
              <>
                <StepperRow
                  label={tGm('envCombat.duration.intervalsLabel', locale)}
                  value={totalIntervals}
                  min={1}
                  max={48}
                  onChange={setTotalIntervals}
                />
                <IconText style={styles.hintText}>
                  {formatGm(tGm('envCombat.duration.periodicHint', locale), {
                    value: valSummary,
                    intervals: totalIntervals,
                    unit: tGm(`envCombat.duration.units.${durationUnit}`, locale).toLowerCase(),
                  })}
                </IconText>
              </>
            ) : (
              <Text style={styles.hintText}>{tGm('envCombat.duration.onceHint', locale)}</Text>
            )}
          </>
        ) : null}
      </View>
    );
  };

  const modalTitle = mechanicType === ENV_MECHANIC_TYPE.WEATHER
    ? tGm('envCombat.weather.modalTitle', locale)
    : mechanicType === ENV_MECHANIC_TYPE.RADIATION
      ? tGm('envCombat.radiation.modalTitle', locale)
      : mechanicType === ENV_MECHANIC_TYPE.INJURY
        ? tGm('envCombat.injury.modalTitle', locale)
        : tGm('envCombat.attackFail.modalTitle', locale);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{modalTitle}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color="#d1d5db" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {/* 1. ПОГОДА */}
            {mechanicType === ENV_MECHANIC_TYPE.WEATHER ? (
              <>
                <View style={styles.optionGrid}>
                  {WEATHER_CONDITIONS.map((cond) => {
                    const active = conditionKey === cond.key;
                    return (
                      <TouchableOpacity
                        key={cond.key}
                        style={[styles.optionCard, active && styles.optionCardActive]}
                        onPress={() => selectWeatherCond(cond)}
                      >
                        <View style={styles.optionHeader}>
                          <MaterialCommunityIcons
                            name={cond.icon}
                            size={20}
                            color={active ? '#f0e68c' : '#9ca3af'}
                          />
                          <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                            {tGm(`envCombat.weather.conditions.${cond.key}.title`, locale)}
                          </Text>
                        </View>
                        <Text style={styles.optionDesc}>
                          {tGm(`envCombat.weather.conditions.${cond.key}.desc`, locale)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {renderStrengthAndDuration({ showDuration: true, fixedOnly: true })}

                {hasLiveRoom ? (
                  <View style={styles.inlineBtnsRow}>
                    <TouchableOpacity
                      style={styles.ghostDangerBtn}
                      onPress={() => onDispatchDirective?.({
                        kind: ENV_DIRECTIVE_KIND.WEATHER_CLEAR,
                        envPayload: { conditionKey },
                      })}
                    >
                      <Text style={styles.ghostDangerText}>{tGm('envCombat.weather.clearThisBtn', locale)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ghostDangerBtn}
                      onPress={() => onDispatchDirective?.({
                        kind: ENV_DIRECTIVE_KIND.WEATHER_CLEAR,
                        envPayload: {},
                      })}
                    >
                      <Text style={styles.ghostDangerText}>{tGm('envCombat.weather.clearAllBtn', locale)}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : null}

            {/* 2. РАДИАЦИЯ: задаётся только урон за тик и его интервал/длительность */}
            {mechanicType === ENV_MECHANIC_TYPE.RADIATION ? (
              <>
                {renderStrengthAndDuration({
                  showDuration: true,
                  fixedOnly: true,
                  intervalOnly: true,
                  valueLabel: tGm('envCombat.radiation.damagePerInterval', locale),
                  stepperLabel: tGm('envCombat.radiation.damageLabel', locale),
                })}
                <Text style={styles.hintText}>
                  {tGm('envCombat.radiation.resolvedOnCharacter', locale)}
                </Text>
              </>
            ) : null}

            {/* 3. УВЕЧЬЕ */}
            {mechanicType === ENV_MECHANIC_TYPE.INJURY ? (
              <>
                {!primaryCharacter ? (
                  <Text style={styles.hintText}>{tGm('envCombat.injury.chooseCharacterFirst', locale)}</Text>
                ) : null}
                {targetIsRobot ? (
                  <Text style={styles.robotHint}>{tGm('envCombat.injury.robotAdaptedHint', locale)}</Text>
                ) : null}

                <View style={styles.chipsRow}>
                  <TouchableOpacity
                    style={[styles.chip, zoneKey === 'auto' && styles.chipActive]}
                    onPress={() => setZoneKey('auto')}
                  >
                    <Text style={[styles.chipText, zoneKey === 'auto' && styles.chipTextActive]}>
                      {tGm('envCombat.injury.autoZone', locale)}
                    </Text>
                  </TouchableOpacity>
                </View>

                {primaryCharacter ? (
                  <View style={styles.optionGrid}>
                    {charZones.map((z) => {
                      const active = zoneKey === z.key;
                      const effectDesc = describeInjuryEffect(
                        z.key,
                        { isRobotZone: z.isRobotZone, bleedDice, stage: 'active' },
                        locale,
                      );
                      return (
                        <TouchableOpacity
                          key={z.key}
                          style={[styles.optionCard, active && styles.optionCardActive]}
                          onPress={() => setZoneKey(z.key)}
                        >
                          <View style={styles.optionHeader}>
                            <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                              {z.label} (d20: {z.hitRangeLabel})
                            </Text>
                          </View>
                          <IconText style={styles.optionDesc}>{effectDesc}</IconText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {zoneKey === 'auto' || ['body', 'torso', 'chassis', 'hull'].includes(String(zoneKey).toLowerCase()) ? (
                  <View style={styles.blockBox}>
                    <StepperRow
                      label={tGm('envCombat.injury.bleedLabel', locale)}
                      value={bleedDice}
                      min={1}
                      max={10}
                      onChange={setBleedDice}
                    />
                  </View>
                ) : null}

                {hasLiveRoom && primaryCharacter ? (
                  <View style={styles.inlineBtnsRow}>
                    {zoneKey !== 'auto' ? (
                      <TouchableOpacity
                        style={styles.ghostDangerBtn}
                        onPress={() => onDispatchDirective?.({
                          kind: ENV_DIRECTIVE_KIND.INJURY_CLEAR,
                          envPayload: { zoneKey },
                        })}
                      >
                        <Text style={styles.ghostDangerText}>{tGm('envCombat.injury.clearZoneBtn', locale)}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.ghostDangerBtn}
                      onPress={() => onDispatchDirective?.({
                        kind: ENV_DIRECTIVE_KIND.INJURY_CLEAR,
                        envPayload: {},
                      })}
                    >
                      <Text style={styles.ghostDangerText}>{tGm('envCombat.injury.clearAllBtn', locale)}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : null}

            {/* 4. ПРОВАЛ АТАКИ */}
            {mechanicType === ENV_MECHANIC_TYPE.ATTACK_FAIL ? (
              <>
                <View style={styles.chipsRow}>
                  <TouchableOpacity style={styles.diceBtn} onPress={handleRandomAttackOutcome}>
                    <MaterialCommunityIcons name="dice-d20" size={18} color="#ffffff" />
                    <Text style={styles.diceBtnText}>{tGm('envCombat.attackFail.randomOutcomeBtn', locale)}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.optionGrid}>
                  {ATTACK_FAIL_OUTCOMES.map((o) => {
                    const active = attackOutcome === o.key;
                    return (
                      <TouchableOpacity
                        key={o.key}
                        style={[styles.optionCard, active && styles.optionCardActive]}
                        onPress={() => setAttackOutcome(o.key)}
                      >
                        <View style={styles.optionHeader}>
                          <MaterialCommunityIcons
                            name={o.icon}
                            size={19}
                            color={active ? '#f0e68c' : '#9ca3af'}
                          />
                          <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                            {tGm(`envCombat.attackFail.outcomes.${o.key}.title`, locale)}
                          </Text>
                        </View>
                        <Text style={styles.optionDesc}>
                          {tGm(`envCombat.attackFail.outcomes.${o.key}.desc`, locale)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {attackOutcome !== 'ricochet' ? (
                  <View style={styles.blockBox}>
                    <Text style={styles.sectionLabel}>
                      {tGm('envCombat.attackFail.weaponSelectLabel', locale)}
                    </Text>
                    {targetWeapons.length === 0 ? (
                      <Text style={styles.hintText}>
                        {tGm('envCombat.attackFail.noEquippedWeapons', locale)}
                      </Text>
                    ) : (
                      <View style={styles.chipsRow}>
                        {targetWeapons.map((w) => {
                          const active = selectedWeaponId === w.id;
                          return (
                            <TouchableOpacity
                              key={w.id}
                              style={[styles.chip, active && styles.chipActive]}
                              onPress={() => setSelectedWeaponId(w.id)}
                            >
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                {w.name}{w.equipped ? ' ★' : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : null}

                {attackOutcome === 'ammoLoss' ? (
                  <View style={styles.blockBox}>
                    <Text style={styles.sectionLabel}>
                      {tGm('envCombat.attackFail.ammoSpendModeLabel', locale)}
                    </Text>
                    <View style={styles.chipsRow}>
                      {['fixed', 'cd', 'allPack'].map((am) => {
                        const active = ammoMode === am;
                        return (
                          <TouchableOpacity
                            key={am}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setAmmoMode(am)}
                          >
                            <IconText style={[styles.chipText, active && styles.chipTextActive]}>
                              {tGm(`envCombat.attackFail.ammoModes.${am}`, locale)}
                            </IconText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {ammoMode !== 'allPack' ? (
                      <StepperRow
                        label={ammoMode === 'cd' ? '{CD}' : '#'}
                        value={value}
                        min={1}
                        max={50}
                        onChange={setValue}
                      />
                    ) : null}
                  </View>
                ) : null}

                {attackOutcome === 'weaponExplode' ? (
                  <>
                    {renderStrengthAndDuration({ showDuration: false })}
                    <View style={styles.blockBox}>
                      <View style={styles.switchRow}>
                        <Text style={[styles.fieldLabel, { flex: 1 }]}>
                          {tGm('envCombat.attackFail.repairableLabel', locale)}
                        </Text>
                        <Switch
                          value={explodeRepairable}
                          onValueChange={setExplodeRepairable}
                          trackColor={{ false: '#7f1d1d', true: '#a16207' }}
                          thumbColor={explodeRepairable ? '#f0e68c' : '#fca5a5'}
                        />
                      </View>
                      <Text style={[styles.hintText, !explodeRepairable && { color: '#fca5a5' }]}>
                        {tGm(explodeRepairable ? 'envCombat.attackFail.repairableYesHint' : 'envCombat.attackFail.repairableNoHint', locale)}
                      </Text>
                    </View>
                  </>
                ) : null}

                {attackOutcome === 'ricochet' ? (
                  <>
                    <View style={styles.blockBox}>
                      <Text style={styles.sectionLabel}>
                        {tGm('envCombat.attackFail.ricochetTargetLabel', locale)}
                      </Text>
                      <View style={styles.chipsRow}>
                        {['self', 'randomAlly', 'chosen'].map((rt) => {
                          const active = ricochetTargetMode === rt;
                          return (
                            <TouchableOpacity
                              key={rt}
                              style={[styles.chip, active && styles.chipActive]}
                              onPress={() => setRicochetTargetMode(rt)}
                            >
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                {tGm(`envCombat.attackFail.ricochetTargets.${rt}`, locale)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {ricochetTargetMode === 'chosen' && roomCharacters.length > 0 ? (
                        <View style={[styles.chipsRow, { marginTop: 6 }]}>
                          {roomCharacters.map((c) => {
                            const active = ricochetChosenCharId === c.characterId;
                            return (
                              <TouchableOpacity
                                key={c.characterId}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => setRicochetChosenCharId(c.characterId)}
                              >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                  {c.name || '—'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                    {renderStrengthAndDuration({ showDuration: false })}
                  </>
                ) : null}
              </>
            ) : null}

            {/* Блок сохранения настроек как отдельной плитки */}
            {savePanelOpen ? (
              <View style={styles.savePresetBox}>
                <Text style={styles.sectionLabel}>{tGm('envCombat.presetModal.saveTitle', locale)}</Text>
                <TextInput
                  style={styles.input}
                  value={presetName}
                  onChangeText={setPresetName}
                  placeholder={tGm('envCombat.presetModal.namePlaceholder', locale)}
                  placeholderTextColor="#6b7280"
                />
                <TextInput
                  style={[styles.input, { minHeight: 54 }]}
                  value={presetDesc}
                  onChangeText={setPresetDesc}
                  multiline
                  placeholder={tGm('envCombat.presetModal.descPlaceholder', locale)}
                  placeholderTextColor="#6b7280"
                />
                {folders.length > 0 ? (
                  <>
                    <Text style={styles.fieldLabel}>{tGm('envCombat.presetModal.folderLabel', locale)}</Text>
                    <View style={styles.chipsRow}>
                      <TouchableOpacity
                        style={[styles.chip, !presetFolderId && styles.chipActive]}
                        onPress={() => setPresetFolderId(null)}
                      >
                        <Text style={[styles.chipText, !presetFolderId && styles.chipTextActive]}>
                          {tGm('envCombat.presetModal.noFolder', locale)}
                        </Text>
                      </TouchableOpacity>
                      {folders.map((f) => {
                        const active = presetFolderId === f.id;
                        return (
                          <TouchableOpacity
                            key={f.id}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setPresetFolderId(f.id)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {f.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : null}
                <View style={styles.inlineBtnsRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => setSavePanelOpen(false)}>
                    <Text style={styles.secondaryBtnText}>{tGm('commands.cancelBtn', locale)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleSavePreset}>
                    <Text style={styles.primaryBtnText}>{tGm('envCombat.presetModal.saveBtn', locale)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {!hasLiveRoom ? (
            <Text style={styles.hintText}>{tGm('envCombat.requiresLiveRoom', locale)}</Text>
          ) : (requiresCharacter && !primaryCharacter ? (
            <Text style={styles.hintText}>
              {mechanicType === ENV_MECHANIC_TYPE.INJURY
                ? tGm('envCombat.injury.chooseCharacterFirst', locale)
                : tGm('envCombat.chooseCharacterFirst', locale)}
            </Text>
          ) : null)}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setSavePanelOpen((v) => !v)}
            >
              <MaterialCommunityIcons name="bookmark-plus-outline" size={16} color="#f0e68c" />
              <Text style={[styles.secondaryBtnText, { color: '#f0e68c' }]}>
                {tGm('envCombat.presetModal.saveAsTileBtn', locale)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, (!hasLiveRoom || (requiresCharacter && !primaryCharacter)) && { opacity: 0.45 }]}
              onPress={handleApply}
              disabled={!hasLiveRoom || (requiresCharacter && !primaryCharacter)}
            >
              <Text style={styles.primaryBtnText}>{tGm('envCombat.applyBtn', locale)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  card: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '92%',
    backgroundColor: '#1f2328',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(240, 230, 140, 0.42)',
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  title: {
    color: '#f0e68c',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  scrollArea: {
    marginVertical: 8,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  optionGrid: {
    gap: 7,
  },
  optionCard: {
    backgroundColor: '#272c33',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 10,
  },
  optionCardActive: {
    borderColor: '#f0e68c',
    backgroundColor: 'rgba(240, 230, 140, 0.1)',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 3,
  },
  optionTitle: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  optionTitleActive: {
    color: '#f0e68c',
  },
  optionDesc: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 16,
  },
  blockBox: {
    backgroundColor: '#181b20',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 10,
    gap: 7,
  },
  sectionLabel: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
  },
  fieldLabel: {
    color: '#d1d5db',
    fontSize: 13,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#272c33',
  },
  chipActive: {
    borderColor: '#f0e68c',
    backgroundColor: '#f0e68c',
  },
  chipText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  diceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#374151',
    borderColor: '#6b7280',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  diceBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 5,
    backgroundColor: '#272c33',
    borderWidth: 1,
    borderColor: '#f0e68c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: '#f0e68c',
    fontSize: 17,
    fontWeight: '700',
  },
  stepValue: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  rolledInfo: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '600',
  },
  robotHint: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
  },
  hintText: {
    color: '#9ca3af',
    fontSize: 11,
    lineHeight: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#272c33',
  },
  previewName: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
  previewVal: {
    color: '#f0e68c',
    fontSize: 12,
  },
  inlineBtnsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  ghostDangerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  ghostDangerText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '600',
  },
  savePresetBox: {
    backgroundColor: '#181b20',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#f0e68c',
    padding: 10,
    gap: 8,
  },
  input: {
    backgroundColor: '#272c33',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4b5563',
    color: '#f9fafb',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    gap: 8,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    paddingHorizontal: 16,
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
