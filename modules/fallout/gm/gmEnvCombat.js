// modules/fallout/gm/gmEnvCombat.js
// Сеттинговый слой Fallout 2d20 для экрана Мастера «Окружающая среда/бой» (патч 482):
// - 4 системные плитки: Погода, Радиация, Увечье, Провал атаки;
// - периодические эффекты (тик в конце каждого из N промежутков: сцены, минуты, часы, сутки);
// - автоадаптация зон увечий под корпус роботов + стадии (активное → стабилизировано → зажило во сне);
// - состояния оружия: заклинивание (jammed), поломка 0% (forceBroken), необратимое разрушение (unrepairable), сброс в сумку;
// - Первая помощь при применении медицины/ремкомплекта (+ИНТ+Медицина/Ремонт при успехе) и лечение соседа по комнате.

import { getCurrentLocale } from '../../../i18n/locale';
import { rollDie, rollMultipleCombatDice } from '../../../domain/diceRollsLogic';
import { isSkillTagged, resolveD20Check } from '../../../domain/d20Checks';
import { findEnrichedOrigin, isRobotCharacter } from '../../../domain/origins';
import { findTraitById, hasTraitEffect } from '../../../domain/traits';
import { hasPoisonImmunity, hasRadiationImmunity } from '../../../domain/immunities';
import { createEmptyEquippedArmor } from '../../../domain/equippedArmor';
import { getPieceDR, hasFrame } from '../../../domain/powerArmor';
import { resolveBodyPlan } from '../../../domain/bodyplan';
import { getBodyPlans } from '../../../domain/registry';
import { getRobotSlotDamageResistance } from '../../../domain/robotDamageResistance';
import { getSlotHitRange } from '../../../domain/robotSlots';
import { getInstantHealAmount } from '../../../domain/effects';
import { calculateMaxHealth } from '../logic/derivedStats';
import { effectsDictToLegacyArray, syncTimedEffectsToStore } from '../../../src/store/effectsSync';
import { selectLegacyAttributes, selectLegacySkills } from '../../../src/store/selectors';
import { tWeaponsAndArmorScreen } from '../screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';
import { formatGm, tGm } from './gmI18n';

export const ENV_DIRECTIVE_KIND = Object.freeze({
  WEATHER_APPLY: 'env.weather.apply',
  WEATHER_CLEAR: 'env.weather.clear',
  RADIATION_APPLY: 'env.radiation.apply',
  INJURY_APPLY: 'env.injury.apply',
  INJURY_CLEAR: 'env.injury.clear',
  ATTACK_FAIL: 'env.attackFail.apply',
  TIME_ADVANCE: 'env.time.advance',
  PEER_CONSUMABLE: 'peer.consumable',
});

export const WEATHER_CONDITIONS = Object.freeze([
  { key: 'heat', icon: 'weather-sunny-alert', defaultValue: 1, defaultMode: 'fixed', defaultUnit: 'hours', defaultIntervals: 3 },
  { key: 'cold', icon: 'snowflake-alert', defaultValue: 1, defaultMode: 'fixed', defaultUnit: 'hours', defaultIntervals: 3 },
  { key: 'dustStorm', icon: 'weather-windy', defaultValue: 2, defaultMode: 'fixed', defaultUnit: 'scenes', defaultIntervals: 3 },
  { key: 'denseFog', icon: 'weather-fog', defaultValue: 1, defaultMode: 'fixed', defaultUnit: 'hours', defaultIntervals: 2 },
  { key: 'radStorm', icon: 'weather-lightning-rainy', defaultValue: 2, defaultMode: 'fixed', defaultUnit: 'scenes', defaultIntervals: 3 },
  { key: 'acidRain', icon: 'weather-pouring', defaultValue: 2, defaultMode: 'fixed', defaultUnit: 'scenes', defaultIntervals: 3 },
]);

export const ATTACK_FAIL_OUTCOMES = Object.freeze([
  { key: 'ammoLoss', icon: 'ammunition' },
  { key: 'weaponJam', icon: 'lock-alert-outline' },
  { key: 'weaponBreak', icon: 'wrench-clock' },
  { key: 'weaponExplode', icon: 'bomb' },
  { key: 'ricochet', icon: 'call-split' },
  { key: 'dropWeapon', icon: 'hand-back-left-off-outline' },
]);

export const DURATION_UNITS = Object.freeze(['once', 'scenes', 'minutes', 'hours', 'days']);

export const HUMANOID_HIT_TABLE = Object.freeze([
  { key: 'head', min: 1, max: 2 },
  { key: 'body', min: 3, max: 8 },
  { key: 'leftArm', min: 9, max: 11 },
  { key: 'rightArm', min: 12, max: 14 },
  { key: 'leftLeg', min: 15, max: 17 },
  { key: 'rightLeg', min: 18, max: 20 },
]);

export const FIRST_AID_ITEM_IDS = new Set([
  'chem_stimpak',
  'chem_stimpak_diluted',
  'chem_super_stimpak',
  'item_doctors_bag',
  'item_first_aid_kit',
  'robot_item_repair_kit',
]);

export const REUSABLE_MEDICAL_TOOL_IDS = new Set([
  'item_doctors_bag',
  'item_first_aid_kit',
]);

export const isFirstAidCapableItem = (item) => {
  const id = String(item?.weaponId || item?.id || '').trim();
  return FIRST_AID_ITEM_IDS.has(id);
};

export const isReusableMedicalTool = (item) => {
  const id = String(item?.weaponId || item?.id || '').trim();
  return REUSABLE_MEDICAL_TOOL_IDS.has(id);
};

export const intervalMinutesForUnit = (unit) => {
  if (unit === 'minutes') return 1;
  if (unit === 'hours') return 60;
  if (unit === 'days') return 1440;
  return 0;
};

export const rollCdValue = (count) => {
  const n = Math.max(1, Math.min(30, Math.floor(Number(count) || 1)));
  const res = rollMultipleCombatDice(n);
  return {
    total: res.total,
    rolls: res.rolls || [],
    effectCount: res.effectCount || 0,
  };
};

export const evaluateStrengthAmount = ({ valueMode = 'fixed', value = 1 } = {}) => {
  const num = Math.max(0, Math.floor(Number(value) || 0));
  if (valueMode === 'cd') {
    if (num <= 0) return { amount: 0, rolls: [] };
    const rolled = rollCdValue(num);
    return { amount: rolled.total, rolls: rolled.rolls };
  }
  return { amount: num, rolls: null };
};

// ── Профиль защит и иммунитетов персонажа (работает и со стором, и со снапшотом/БД) ──

export const resolveCharacterImmunityContext = (charData = {}) => {
  const originLike = charData?.origin;
  const originId = typeof originLike === 'string' ? originLike : originLike?.id;
  let resolvedOrigin = originLike && typeof originLike === 'object' ? originLike : null;
  if (originId && !resolvedOrigin?.bodyPlan) {
    try { resolvedOrigin = findEnrichedOrigin(originId) || resolvedOrigin; } catch { /* ignore */ }
  }
  const traitLike = charData?.trait;
  const traitId = (typeof traitLike === 'string' ? traitLike : traitLike?.id)
    || (Array.isArray(resolvedOrigin?.traitIds) && resolvedOrigin.traitIds.length === 1 ? resolvedOrigin.traitIds[0] : null);
  let resolvedTrait = traitLike && typeof traitLike === 'object' ? traitLike : null;
  if (traitId && !resolvedTrait?.modifiers) {
    try { resolvedTrait = findTraitById(traitId) || resolvedTrait; } catch { /* ignore */ }
  }
  const robotSlots = charData?.equippedRobotSlots || charData?.robot?.slots || null;
  const ctx = { origin: resolvedOrigin || (originId ? { id: originId } : null), trait: resolvedTrait };
  const isRobot = Boolean(isRobotCharacter(ctx) || (robotSlots && Object.keys(robotSlots).length > 0));
  const radImmune = Boolean(isRobot || hasRadiationImmunity(ctx));
  const poisonImmune = Boolean(isRobot || hasPoisonImmunity(ctx));
  return { resolvedOrigin, resolvedTrait, isRobot, radImmune, poisonImmune, robotSlots };
};

export const getCharacterZonesForInjury = (charData = {}, locale = getCurrentLocale()) => {
  const { resolvedOrigin, isRobot, robotSlots } = resolveCharacterImmunityContext(charData);
  if (isRobot) {
    const bodyPlanId = resolveBodyPlan({ origin: resolvedOrigin || charData?.origin });
    const bodyPlan = getBodyPlans()?.[bodyPlanId] || null;
    const slotKeys = Array.isArray(bodyPlan?.slots)
      ? bodyPlan.slots.map((slot) => (typeof slot === 'string' ? slot : slot?.id)).filter(Boolean)
      : [];
    const keys = slotKeys.length > 0 ? slotKeys : Object.keys(robotSlots || {});
    const fallbackKeys = keys.length > 0 ? keys : ['optics', 'body', 'armLeft', 'armRight', 'thruster'];
    return fallbackKeys.map((key) => {
      const range = bodyPlan ? getSlotHitRange(bodyPlan, key) : null;
      return {
        key,
        isRobotZone: true,
        label: tWeaponsAndArmorScreen(`robotSlot.slotNames.${key}`) || key,
        min: range ? range.from : null,
        max: range ? range.to : null,
        hitRangeLabel: range ? (range.from === range.to ? `${range.from}` : `${range.from}–${range.to}`) : '—',
      };
    });
  }
  return HUMANOID_HIT_TABLE.map((row) => ({
    key: row.key,
    isRobotZone: false,
    label: tGm(`card.armorTable.zones.${row.key}`, locale),
    min: row.min,
    max: row.max,
    hitRangeLabel: `${row.min}–${row.max}`,
  }));
};

export const rollHitZoneForCharacter = (charData = {}, locale = getCurrentLocale(), rollFn = () => rollDie(20)) => {
  const roll = Math.max(1, Math.min(20, Math.floor(Number(rollFn()) || 1)));
  const zones = getCharacterZonesForInjury(charData, locale);
  const matched = zones.find((z) => z.min != null && z.max != null && roll >= z.min && roll <= z.max)
    || zones[Math.min(zones.length - 1, Math.floor(((roll - 1) / 20) * zones.length))]
    || zones[0];
  return { roll, zone: matched };
};

export const getCharacterZoneDR = (charData = {}, zoneKey = 'body') => {
  const { isRobot, robotSlots } = resolveCharacterImmunityContext(charData);
  if (isRobot && robotSlots) {
    const slot = robotSlots[zoneKey] || robotSlots.body || {};
    const dr = getRobotSlotDamageResistance(slot);
    return {
      physical: Number(dr.physical) || 0,
      energy: Number(dr.energy) || 0,
      radiation: Infinity,
      sealed: true,
    };
  }
  const pa = charData?.equippedPowerArmor;
  if (hasFrame(pa)) {
    const piece = pa?.pieces?.[zoneKey] || null;
    if (piece && (Number(piece.hpCurrent ?? piece.hp ?? 1) > 0)) {
      const dr = getPieceDR(piece);
      const allPiecesIntact = Object.keys(createEmptyEquippedArmor()).every((s) => {
        const p = pa?.pieces?.[s];
        return p && Number(p.hpCurrent ?? p.hp ?? 1) > 0;
      });
      return {
        physical: Number(dr.physical) || 0,
        energy: Number(dr.energy) || 0,
        radiation: Number(dr.radiation) || 0,
        sealed: allPiecesIntact,
      };
    }
  }
  const slot = charData?.equippedArmor?.[zoneKey] || {};
  const armor = slot.armor || {};
  const clothing = slot.clothing || {};
  const physical = (Number(armor.physicalDamageRating ?? armor.physicalDR) || 0)
    + (Number(clothing.physicalDamageRating ?? clothing.physicalDR) || 0);
  const energy = (Number(armor.energyDamageRating ?? armor.energyDR) || 0)
    + (Number(clothing.energyDamageRating ?? clothing.energyDR) || 0);
  const radiation = (Number(armor.radiationDamageRating ?? armor.radDR) || 0)
    + (Number(clothing.radiationDamageRating ?? clothing.radDR) || 0);
  return {
    physical,
    energy,
    radiation,
    sealed: radiation >= 10,
  };
};

export const computeRadiationExposure = (charData = {}, rawAmount = 0, {
  resistMode = 'minBody',
  hitZone = 'body',
} = {}) => {
  const incoming = Math.max(0, Math.floor(Number(rawAmount) || 0));
  const { radImmune } = resolveCharacterImmunityContext(charData);
  if (radImmune) {
    return { immune: true, dr: 0, netRad: 0, blocked: incoming };
  }
  let dr = 0;
  if (resistMode === 'direct') {
    dr = 0;
  } else if (resistMode === 'zone') {
    dr = Math.max(0, Number(getCharacterZoneDR(charData, hitZone || 'body').radiation) || 0);
  } else {
    // По книге Fallout 2d20: фоновое облучение гасится НАИМЕНЬШИМ СУ рад. среди всех зон тела
    const drs = Object.keys(createEmptyEquippedArmor()).map((slot) => {
      const z = getCharacterZoneDR(charData, slot);
      return Number.isFinite(z.radiation) ? z.radiation : 999;
    });
    dr = drs.length > 0 ? Math.max(0, Math.min(...drs)) : 0;
  }
  if (!Number.isFinite(dr)) dr = incoming;
  const netRad = Math.max(0, incoming - dr);
  return {
    immune: false,
    dr,
    netRad,
    blocked: Math.max(0, incoming - netRad),
  };
};

const resolveGhoulRadiationHealing = (charData, amount, remainder = 0) => {
  const { resolvedTrait } = resolveCharacterImmunityContext(charData);
  if (!hasTraitEffect(resolvedTrait, 'radiation_healing')) return { heal: 0, remainder: 0 };
  const total = Math.max(0, Number(amount) || 0) + Math.max(0, Number(remainder) || 0);
  return { heal: Math.floor(total / 3), remainder: total % 3 };
};

// ── Множители погоды для системы выживания (жара → вода, холод → еда) ──

export const getWeatherSurvivalMultipliers = (effectsDictOrArray) => {
  const list = Array.isArray(effectsDictOrArray)
    ? effectsDictOrArray
    : Object.values(effectsDictOrArray || {}).filter((e) => e && e.active !== false);
  let foodMult = 1;
  let waterMult = 1;
  for (const eff of list) {
    if (eff?.effectType !== 'gmPeriodic' || eff?.gmPeriodic?.category !== 'weather') continue;
    const cond = eff.gmPeriodic.conditionKey;
    const val = Math.max(1, Number(eff.gmPeriodic.value) || 1);
    if (cond === 'heat') {
      waterMult = Math.max(waterMult, 1 + 0.5 * val);
    } else if (cond === 'cold') {
      foodMult = Math.max(foodMult, 1 + 0.5 * val);
    }
  }
  if (foodMult === 1 && waterMult === 1) return null;
  return { food: foodMult, water: waterMult, sleep: 1 };
};

// ── Тексты эффектов увечий и периодических состояний для EffectsPanel и карточек ──

const isCoreInjuryZone = (zoneKey) => ['body', 'torso', 'chassis', 'hull'].includes(String(zoneKey || '').toLowerCase());

export const describeInjuryEffect = (zoneKey, { isRobotZone = false, bleedDice = 1, stage = 'active' } = {}, locale = getCurrentLocale()) => {
  if (stage === 'stabilized') {
    return tGm('envCombat.injury.stages.stabilized', locale);
  }
  const k = String(zoneKey || '').toLowerCase();
  if (k === 'head') return tGm('envCombat.injury.effects.head', locale);
  if (k === 'optics') return tGm('envCombat.injury.effects.optics', locale);
  if (isCoreInjuryZone(k)) {
    return formatGm(
      tGm(isRobotZone ? 'envCombat.injury.effects.robotBody' : 'envCombat.injury.effects.body', locale),
      { bleed: Math.max(1, Number(bleedDice) || 1) },
    );
  }
  if (k.includes('thruster')) return tGm('envCombat.injury.effects.thruster', locale);
  if (k.includes('leg') || k.includes('tread') || k.includes('wheel')) return tGm('envCombat.injury.effects.leg', locale);
  return tGm('envCombat.injury.effects.arm', locale);
};

export const formatGmPeriodicRemaining = (gmPeriodic, locale = getCurrentLocale()) => {
  if (!gmPeriodic) return '';
  const total = Math.max(1, Number(gmPeriodic.totalIntervals) || 1);
  const done = Math.max(0, Number(gmPeriodic.completedIntervals) || 0);
  const left = Math.max(0, total - done);
  const unitShort = tGm(`envCombat.duration.shortUnits.${gmPeriodic.durationUnit}`, locale) || gmPeriodic.durationUnit;
  return `${left}/${total} ${unitShort}`;
};

export const buildInjuryTimedEffect = ({
  zoneKey,
  zoneLabel,
  isRobotZone = false,
  bleedDice = 1,
  stage = 'active',
  locale = getCurrentLocale(),
}) => {
  const stageText = tGm(`envCombat.injury.stages.${stage}`, locale);
  const desc = describeInjuryEffect(zoneKey, { isRobotZone, bleedDice, stage }, locale);
  return {
    id: `gm-injury-${zoneKey}`,
    effectType: 'injury',
    effectKind: 'negative',
    isPermanent: true,
    scenesLeft: 9999,
    createdAt: Date.now(),
    injuryZone: zoneKey,
    injuryStage: stage,
    isRobotZone: Boolean(isRobotZone),
    bleedDice: isCoreInjuryZone(zoneKey) ? Math.max(1, Number(bleedDice) || 1) : 0,
    effectName: `${tGm('envCombat.tiles.injury.title', locale)}: ${zoneLabel} (${stageText})`,
    effectLabel: `${zoneLabel} [${stageText}] — ${desc}`,
    sourceName: 'GM',
  };
};

export const buildPeriodicTimedEffect = ({
  category,
  conditionKey,
  title,
  value = 1,
  durationUnit = 'scenes',
  totalIntervals = 1,
  locale = getCurrentLocale(),
}) => {
  const valLabel = `${value}`;
  const unitShort = tGm(`envCombat.duration.shortUnits.${durationUnit}`, locale) || durationUnit;
  const gmPeriodic = {
    category,
    conditionKey,
    title,
    valueMode: 'fixed',
    value: Math.max(1, Math.floor(Number(value) || 1)),
    durationUnit,
    totalIntervals: Math.max(1, Math.floor(Number(totalIntervals) || 1)),
    completedIntervals: 0,
    progressMinutes: 0,
  };
  const effectId = category === 'weather'
    ? `gm-weather-${conditionKey}`
    : `gm-rad-${conditionKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: effectId,
    effectType: 'gmPeriodic',
    effectKind: 'negative',
    isPermanent: true,
    scenesLeft: 9999,
    createdAt: Date.now(),
    gmPeriodic,
    effectName: `${title} (${valLabel} / ${unitShort})`,
    effectLabel: `${title}: ${valLabel} → ${formatGmPeriodicRemaining(gmPeriodic, locale)}`,
    sourceName: 'GM',
  };
};

// ── Применение одиночного тика Погоды или Радиации к мутабельному контексту персонажа ──

const applySingleHazardTick = (ctx, spec, locale = getCurrentLocale()) => {
  const { category, conditionKey, value = 1 } = spec;
  const amount = Math.max(0, Math.floor(Number(value) || 0));

  if (category === 'radiation' || (category === 'weather' && conditionKey === 'radStorm')) {
    const exp = computeRadiationExposure(ctx.charData, amount, { resistMode: 'minBody' });
    if (exp.immune) {
      const healing = resolveGhoulRadiationHealing(ctx.charData, amount, spec.radiationHealingRemainder);
      spec.radiationHealingRemainder = healing.remainder;
      if (healing.heal > 0) ctx.healHp?.(healing.heal);
      return healing.heal > 0
        ? formatGm(tGm('envCombat.radiation.immuneHealed', locale), { heal: healing.heal })
        : tGm('envCombat.radiation.immuneResult', locale);
    }
    if (exp.netRad > 0) {
      ctx.addRadiation(exp.netRad);
    }
    return formatGm(tGm('envCombat.playerAlerts.radAppliedOnce', locale), {
      rad: exp.netRad,
      blocked: exp.blocked,
    });
  }

  if (category === 'weather') {
    const imm = resolveCharacterImmunityContext(ctx.charData);
    const bodyDR = getCharacterZoneDR(ctx.charData, 'body');
    if (bodyDR.sealed && (conditionKey === 'heat' || conditionKey === 'cold' || conditionKey === 'acidRain' || conditionKey === 'dustStorm')) {
      return '0 (защищено герметичной бронёй)';
    }
    if (conditionKey === 'heat' || conditionKey === 'cold') {
      if (imm.isRobot) return '0 (робот не подвержен усталости погоды)';
      ctx.addWeatherFatigue(`weather_${conditionKey}`, Math.max(1, amount));
      return `+${Math.max(1, amount)} усталости`;
    }
    if (conditionKey === 'acidRain') {
      if (imm.poisonImmune) return '0 (иммунитет)';
      const dr = Math.max(0, Number(bodyDR.energy) || 0);
      const netDmg = Math.max(0, amount - dr);
      if (netDmg > 0) ctx.damageHp(netDmg);
      return `−${netDmg} ОЗ (СУ ${dr})`;
    }
    if (conditionKey === 'dustStorm') {
      const dr = Math.max(0, Number(bodyDR.physical) || 0);
      const netDmg = Math.max(0, amount - dr);
      if (netDmg > 0) ctx.damageHp(netDmg);
      return netDmg > 0 ? `−${netDmg} ОЗ` : `обзор затруднён (−${value} ВОС)`;
    }
    return `активно (−${value} обзор)`;
  }

  return '';
};

// ── Продвижение периодических эффектов (в конце каждого из N промежутков!) ──

export const advancePeriodicEffectsArray = (effectsList = [], ctx, {
  scenes = 0,
  gameMinutes = 0,
  locale = getCurrentLocale(),
} = {}) => {
  const logs = [];
  const nextEffects = [];
  const sceneSteps = Math.max(0, Math.floor(Number(scenes) || 0));
  const minSteps = Math.max(0, Number(gameMinutes) || 0);

  for (const eff of effectsList) {
    if (!eff) continue;

    // Кровотечение от активного увечья торса/корпуса: срабатывает в конце каждой сцены
    if (eff.effectType === 'injury' && eff.injuryStage === 'active' && isCoreInjuryZone(eff.injuryZone) && Number(eff.bleedDice) > 0 && sceneSteps > 0) {
      for (let s = 0; s < sceneSteps; s += 1) {
        const rolled = rollCdValue(eff.bleedDice);
        if (rolled.total > 0) {
          ctx.damageHp(rolled.total);
          logs.push(`${eff.effectName}: −${rolled.total} ОЗ`);
        }
      }
      nextEffects.push(eff);
      continue;
    }

    if (eff.effectType !== 'gmPeriodic' || !eff.gmPeriodic) {
      nextEffects.push(eff);
      continue;
    }

    const gp = { ...eff.gmPeriodic };
    const total = Math.max(1, Number(gp.totalIntervals) || 1);
    let done = Math.max(0, Number(gp.completedIntervals) || 0);
    const remaining = Math.max(0, total - done);
    let ticksToFire = 0;

    if (gp.durationUnit === 'scenes') {
      const fromScenes = sceneSteps + (minSteps > 0 ? Math.floor(minSteps / 5) : 0);
      ticksToFire = Math.min(remaining, fromScenes);
    } else {
      const unitMins = intervalMinutesForUnit(gp.durationUnit);
      if (unitMins > 0) {
        const addedMins = minSteps + (sceneSteps > 0 ? sceneSteps * 5 : 0);
        const totalProg = (Number(gp.progressMinutes) || 0) + addedMins;
        const crossed = Math.floor(totalProg / unitMins);
        ticksToFire = Math.min(remaining, crossed);
        gp.progressMinutes = Math.max(0, totalProg - crossed * unitMins);
      }
    }

    for (let i = 0; i < ticksToFire; i += 1) {
      done += 1;
      const outcome = applySingleHazardTick(ctx, gp, locale);
      logs.push(formatGm(tGm('envCombat.playerAlerts.periodicTickSummary', locale), {
        title: gp.title || eff.effectName,
        done,
        total,
        outcome,
      }));
    }

    gp.completedIntervals = done;
    if (done >= total) {
      // Все N промежутков завершены — эффект гаснет после последнего тика
      continue;
    }

    const valLabel = `${gp.value}`;
    nextEffects.push({
      ...eff,
      gmPeriodic: gp,
      effectLabel: `${gp.title}: ${valLabel} → ${formatGmPeriodicRemaining(gp, locale)}`,
    });
  }

  return { effects: nextEffects, logs };
};

// ── Стабилизация и заживление увечий ──

export const listActiveInjuries = (effectsDictOrArray = []) => {
  const list = Array.isArray(effectsDictOrArray)
    ? effectsDictOrArray
    : Object.values(effectsDictOrArray || {}).filter((e) => e && e.active !== false);
  return list.filter((e) => e?.effectType === 'injury' && e.injuryStage === 'active');
};

export const stabilizeInjuryInEffectsArray = (effectsList = [], preferredZone = null, locale = getCurrentLocale()) => {
  let stabilizedZoneLabel = null;
  let stabilizedZoneKey = null;
  const next = effectsList.map((eff) => {
    if (!eff || eff.effectType !== 'injury' || eff.injuryStage !== 'active') return eff;
    if (stabilizedZoneKey) return eff;
    if (preferredZone && eff.injuryZone !== preferredZone) return eff;
    stabilizedZoneKey = eff.injuryZone;
    const zones = getCharacterZonesForInjury({ equippedRobotSlots: eff.isRobotZone ? { [eff.injuryZone]: {} } : null }, locale);
    const foundZone = zones.find((z) => z.key === eff.injuryZone);
    const zLabel = foundZone?.label || eff.injuryZone;
    stabilizedZoneLabel = zLabel;
    return buildInjuryTimedEffect({
      zoneKey: eff.injuryZone,
      zoneLabel: zLabel,
      isRobotZone: eff.isRobotZone,
      bleedDice: 0,
      stage: 'stabilized',
      locale,
    });
  });
  return { effects: next, stabilizedZoneKey, stabilizedZoneLabel };
};

export const healStabilizedInjuriesInEffectsArray = (effectsList = [], locale = getCurrentLocale()) => {
  const healedZones = [];
  const next = effectsList.filter((eff) => {
    if (eff?.effectType === 'injury' && eff.injuryStage === 'stabilized') {
      healedZones.push(eff.injuryZone);
      return false;
    }
    return true;
  });
  return { effects: next, healedZones };
};

// ── Проверка Первой помощи (+ ИНТ + Медицина/Ремонт при успехе) ──

export const computeFirstAidStatsForStore = (storeState, { targetIsRobot = false } = {}, locale = getCurrentLocale()) => {
  const legacyAttrs = selectLegacyAttributes({ attributes: storeState.attributes });
  const legacySkills = selectLegacySkills({ skills: storeState.skills });
  const intVal = Math.max(0, Number(legacyAttrs.find((a) => a?.name === 'INT')?.value) || 0);
  const skillId = targetIsRobot ? 'REPAIR' : 'MEDICINE';
  const skillEntry = legacySkills.find((s) => s?.name === skillId);
  const skillVal = Math.max(0, Number(skillEntry?.value) || 0);
  const isTagged = isSkillTagged({
    skillId,
    primaryTaggedSkillIds: Array.isArray(storeState.selectedSkills) ? storeState.selectedSkills : [],
    extraTaggedSkillIds: Array.isArray(storeState.extraTaggedSkills) ? storeState.extraTaggedSkills : [],
  });
  const tn = intVal + skillVal;
  const skillLabel = targetIsRobot
    ? (locale === 'en-EN' ? 'INT + Repair' : 'ИНТ + Ремонт')
    : (locale === 'en-EN' ? 'INT + Medicine' : 'ИНТ + Медицина');
  return { intVal, skillId, skillVal, isTagged, tn, skillLabel };
};

export const rollFirstAidBoost = (storeState, { targetIsRobot = false, rollD20 } = {}, locale = getCurrentLocale()) => {
  const stats = computeFirstAidStatsForStore(storeState, { targetIsRobot }, locale);
  const check = resolveD20Check({
    attributeValue: stats.intVal,
    skillValue: stats.skillVal,
    isTagged: stats.isTagged,
    difficulty: 1,
    ...(typeof rollD20 === 'function' ? { rollD20 } : {}),
  });
  const bonusHp = check.passed ? stats.tn : 0;
  const rollsText = `[${check.rolls.join(', ')}]`;
  const reportLine = check.passed
    ? formatGm(tGm('envCombat.firstAid.rollSuccess', locale), {
        rolls: rollsText,
        tn: stats.tn,
        successes: check.successes,
        bonusHp,
      })
    : formatGm(tGm('envCombat.firstAid.rollFail', locale), {
        rolls: rollsText,
        tn: stats.tn,
        successes: check.successes,
      });
  return {
    ...stats,
    check,
    passed: check.passed,
    bonusHp,
    reportLine,
  };
};

// ── Применение всех директив Окружающей среды / боя к живому Zustand-стору Игрока ──

export const tickGmPeriodicEffectsForStore = (store, { scenes = 0, gameMinutes = 0 } = {}, locale = getCurrentLocale()) => {
  const currentEffects = effectsDictToLegacyArray(store.effects);
  const hasRelevant = currentEffects.some(
    (e) => e?.effectType === 'gmPeriodic'
      || (e?.effectType === 'injury' && e.injuryStage === 'active' && isCoreInjuryZone(e.injuryZone) && Number(e.bleedDice) > 0),
  );
  if (!hasRelevant) return { logs: [] };

  const charData = {
    origin: store.origin,
    trait: store.trait,
    equippedArmor: store.equippedArmor,
    equippedPowerArmor: store.equippedPowerArmor,
    robot: store.robot,
    equippedRobotSlots: store.robot?.slots,
  };

  const ctx = {
    charData,
    damageHp: (dmg) => {
      if (dmg > 0) store.damageCharacter(dmg);
    },
    healHp: (heal) => {
      if (heal > 0) store.healCharacter(heal);
    },
    addRadiation: (rad) => {
      if (rad > 0) store.addRadiation(rad);
    },
    addWeatherFatigue: (source, amount) => {
      const surv = store.stateExtensions?.survival;
      if (!surv || !Array.isArray(surv.fatigue)) return;
      const nextFatigue = [...surv.fatigue];
      const idx = nextFatigue.findIndex((f) => f.source === source);
      if (idx >= 0) nextFatigue[idx] = { ...nextFatigue[idx], amount: nextFatigue[idx].amount + amount };
      else nextFatigue.push({ source, amount });
      store.setStateExtension('survival', { ...surv, fatigue: nextFatigue });
    },
  };

  const { effects: nextEffects, logs } = advancePeriodicEffectsArray(currentEffects, ctx, {
    scenes,
    gameMinutes,
    locale,
  });
  syncTimedEffectsToStore(nextEffects, store);
  return { logs };
};

const findTargetWeaponInStore = (store, preferredWeaponId = null) => {
  const allItems = Object.values(store.items || {});
  const weapons = allItems.filter((it) => it && (it.itemType === 'weapon' || it.weaponId || it.damage !== undefined) && !it.isBuiltin && !it.isManipulator);
  if (preferredWeaponId) {
    const exact = weapons.find((w) => w.id === preferredWeaponId || w.instanceId === preferredWeaponId || w.weaponId === preferredWeaponId);
    if (exact) return exact;
  }
  const equipped = weapons.find((w) => w.equipped || w.isEquipped);
  return equipped || weapons[0] || null;
};

const unequipWeaponCompletelyInStore = (store, weaponItem) => {
  if (!weaponItem) return;
  if (typeof store.unequipItem === 'function' && weaponItem.equipped) {
    store.unequipItem(weaponItem.id);
  } else {
    store.updateItem(weaponItem.id, { equipped: false, isEquipped: false });
  }
  if (Array.isArray(store.equippedWeapons)) {
    store.setEquippedWeapons((prev) => (Array.isArray(prev)
      ? prev.filter((w) => w && w.id !== weaponItem.id && w.instanceId !== weaponItem.id)
      : prev));
  }
  if (store.robot?.slots && typeof store.unequipHeldWeapon === 'function') {
    for (const [slotKey, slotVal] of Object.entries(store.robot.slots)) {
      const held = slotVal?.heldWeapon;
      if (held && (held.id === weaponItem.id || held.instanceId === weaponItem.id)) {
        store.unequipHeldWeapon(slotKey);
      }
    }
  }
};

export const applyEnvCombatDirectiveToStore = (directive, store, locale = getCurrentLocale()) => {
  const kind = directive?.kind;
  const p = directive?.envPayload || {};
  const charData = {
    origin: store.origin,
    trait: store.trait,
    equippedArmor: store.equippedArmor,
    equippedPowerArmor: store.equippedPowerArmor,
    robot: store.robot,
    equippedRobotSlots: store.robot?.slots,
  };

  if (kind === ENV_DIRECTIVE_KIND.WEATHER_CLEAR) {
    const condKey = p.conditionKey || null;
    const cur = effectsDictToLegacyArray(store.effects);
    const next = cur.filter((e) => {
      if (e?.effectType !== 'gmPeriodic' || e.gmPeriodic?.category !== 'weather') return true;
      return condKey ? e.gmPeriodic.conditionKey !== condKey : false;
    });
    syncTimedEffectsToStore(next, store);
    return tGm('envCombat.playerAlerts.weatherCleared', locale);
  }

  if (kind === ENV_DIRECTIVE_KIND.WEATHER_APPLY) {
    const condKey = p.conditionKey || 'heat';
    const title = p.customTitle || tGm(`envCombat.weather.conditions.${condKey}.title`, locale);
    const durationUnit = p.durationUnit || 'hours';
    if (durationUnit === 'once') {
      const detail = applySingleHazardTick({
        charData,
        damageHp: (d) => d > 0 && store.damageCharacter(d),
        healHp: (h) => h > 0 && store.healCharacter(h),
        addRadiation: (r) => r > 0 && store.addRadiation(r),
        addWeatherFatigue: (src, amt) => {
          const surv = store.stateExtensions?.survival;
          if (!surv || !Array.isArray(surv.fatigue)) return;
          const nf = [...surv.fatigue, { source: src, amount: amt }];
          store.setStateExtension('survival', { ...surv, fatigue: nf });
        },
      }, { ...p, category: 'weather', conditionKey: condKey }, locale);
      return formatGm(tGm('envCombat.playerAlerts.weatherApplied', locale), { title, details: detail });
    }
    const cur = effectsDictToLegacyArray(store.effects).filter(
      (e) => !(e?.effectType === 'gmPeriodic' && e.gmPeriodic?.category === 'weather' && e.gmPeriodic?.conditionKey === condKey),
    );
    const eff = buildPeriodicTimedEffect({
      category: 'weather',
      conditionKey: condKey,
      title,
      value: p.value ?? 1,
      durationUnit,
      totalIntervals: p.totalIntervals ?? 1,
      locale,
    });
    syncTimedEffectsToStore([...cur, eff], store);
    return formatGm(tGm('envCombat.playerAlerts.weatherApplied', locale), {
      title,
      details: eff.effectLabel,
    });
  }

  if (kind === ENV_DIRECTIVE_KIND.RADIATION_APPLY) {
    const presetKey = 'radiation';
    const title = p.customTitle || tGm('envCombat.radiation.genericTitle', locale);
    const durationUnit = p.durationUnit || 'once';
    if (durationUnit === 'once') {
      const amount = Math.max(0, Math.floor(Number(p.value ?? 1) || 0));
      const exp = computeRadiationExposure(charData, amount, { resistMode: 'minBody' });
      if (exp.immune) {
        const healing = resolveGhoulRadiationHealing(charData, amount);
        if (healing.heal > 0) store.healCharacter(healing.heal);
        return healing.heal > 0
          ? formatGm(tGm('envCombat.radiation.immuneHealed', locale), { heal: healing.heal })
          : tGm('envCombat.radiation.immuneResult', locale);
      }
      if (exp.netRad > 0) store.addRadiation(exp.netRad);
      return formatGm(tGm('envCombat.playerAlerts.radAppliedOnce', locale), {
        rad: exp.netRad,
        blocked: exp.blocked,
      });
    }
    const cur = effectsDictToLegacyArray(store.effects);
    const eff = buildPeriodicTimedEffect({
      category: 'radiation',
      conditionKey: presetKey,
      title,
      value: p.value ?? 1,
      durationUnit,
      totalIntervals: p.totalIntervals ?? 1,
      locale,
    });
    syncTimedEffectsToStore([...cur, eff], store);
    const valStr = String(p.value ?? 1);
    return formatGm(tGm('envCombat.playerAlerts.radPeriodicStarted', locale), {
      title,
      val: valStr,
      n: p.totalIntervals ?? 1,
      unit: tGm(`envCombat.duration.shortUnits.${durationUnit}`, locale),
    });
  }

  if (kind === ENV_DIRECTIVE_KIND.INJURY_CLEAR) {
    const zKey = p.zoneKey || null;
    const cur = effectsDictToLegacyArray(store.effects).filter((e) => {
      if (e?.effectType !== 'injury') return true;
      return zKey ? e.injuryZone !== zKey : false;
    });
    syncTimedEffectsToStore(cur, store);
    return tGm('envCombat.playerAlerts.injuryCleared', locale);
  }

  if (kind === ENV_DIRECTIVE_KIND.INJURY_APPLY) {
    const zones = getCharacterZonesForInjury(charData, locale);
    const picked = (p.zoneKey && zones.find((z) => z.key === p.zoneKey))
      || rollHitZoneForCharacter(charData, locale).zone;
    const bleedDice = Math.max(1, Math.floor(Number(p.bleedDice) || 1));
    const eff = buildInjuryTimedEffect({
      zoneKey: picked.key,
      zoneLabel: picked.label,
      isRobotZone: picked.isRobotZone,
      bleedDice,
      stage: 'active',
      locale,
    });
    const cur = effectsDictToLegacyArray(store.effects).filter(
      (e) => !(e?.effectType === 'injury' && e.injuryZone === picked.key),
    );
    syncTimedEffectsToStore([...cur, eff], store);
    return formatGm(tGm('envCombat.playerAlerts.injuryApplied', locale), {
      zone: picked.label,
      effect: describeInjuryEffect(picked.key, { isRobotZone: picked.isRobotZone, bleedDice, stage: 'active' }, locale),
    });
  }

  if (kind === ENV_DIRECTIVE_KIND.ATTACK_FAIL) {
    const outcome = p.outcome || 'weaponJam';
    if (outcome === 'ricochet') {
      const zones = getCharacterZonesForInjury(charData, locale);
      const hitZ = (p.hitZone && zones.find((z) => z.key === p.hitZone)) || rollHitZoneForCharacter(charData, locale).zone;
      const { amount } = evaluateStrengthAmount({ valueMode: p.valueMode || 'cd', value: p.value ?? 3 });
      const dr = Math.max(0, Number(getCharacterZoneDR(charData, hitZ.key).physical) || 0);
      const net = Math.max(0, amount - dr);
      if (net > 0) store.damageCharacter(net);
      return formatGm(tGm('envCombat.playerAlerts.ricochetHit', locale), {
        zone: hitZ.label,
        dmg: net,
        dr,
      });
    }

    const weapon = findTargetWeaponInStore(store, p.weaponId);
    const weaponName = weapon?.name || weapon?.Name || p.weaponName || '—';

    if (outcome === 'ammoLoss') {
      const ammoIds = String(weapon?.ammoId || p.ammoId || '').split(',').map((s) => s.trim()).filter(Boolean);
      const ammoStacks = Object.values(store.items || {}).filter(
        (it) => it && (it.itemType === 'ammo' || it.type === 'ammo')
          && (ammoIds.length === 0 || ammoIds.includes(it.weaponId || it.id)),
      );
      const available = ammoStacks.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      let toSpend = 0;
      if (p.ammoMode === 'allPack') {
        toSpend = available;
      } else {
        toSpend = Math.min(available, evaluateStrengthAmount({ valueMode: p.ammoMode === 'cd' ? 'cd' : 'fixed', value: p.value ?? 3 }).amount);
      }
      let rem = toSpend;
      for (const st of ammoStacks) {
        if (rem <= 0) break;
        const q = Number(st.quantity) || 0;
        const take = Math.min(q, rem);
        if (take > 0) {
          store.adjustItemQuantity(st.id, -take);
          rem -= take;
        }
      }
      return formatGm(tGm('envCombat.playerAlerts.ammoLost', locale), { weapon: weaponName, lost: toSpend - rem });
    }

    if (outcome === 'weaponJam') {
      if (weapon) store.updateItem(weapon.id, { jammed: true });
      return formatGm(tGm('envCombat.playerAlerts.weaponJammed', locale), { weapon: weaponName });
    }

    if (outcome === 'weaponBreak') {
      if (weapon) {
        store.updateItem(weapon.id, {
          durabilityTracked: true,
          durability: 0,
          forceBroken: true,
        });
      }
      return formatGm(tGm('envCombat.playerAlerts.weaponBroken', locale), { weapon: weaponName });
    }

    if (outcome === 'weaponExplode') {
      const repairable = p.repairable !== false;
      const { amount } = evaluateStrengthAmount({ valueMode: p.valueMode || 'cd', value: p.value ?? 4 });
      const armDr = Math.max(0, Number(getCharacterZoneDR(charData, 'rightArm').physical) || 0);
      const net = Math.max(0, amount - armDr);
      if (net > 0) store.damageCharacter(net);
      if (weapon) {
        if (repairable) {
          store.updateItem(weapon.id, {
            durabilityTracked: true,
            durability: 0,
            forceBroken: true,
          });
        } else {
          unequipWeaponCompletelyInStore(store, weapon);
          store.updateItem(weapon.id, {
            durabilityTracked: true,
            durability: 0,
            forceBroken: true,
            unrepairable: true,
            equipped: false,
            isEquipped: false,
          });
        }
      }
      return formatGm(
        tGm(repairable ? 'envCombat.playerAlerts.weaponExplodedRepairable' : 'envCombat.playerAlerts.weaponExplodedRuined', locale),
        { weapon: weaponName, dmg: net, dr: armDr },
      );
    }

    if (outcome === 'dropWeapon') {
      if (weapon) unequipWeaponCompletelyInStore(store, weapon);
      return formatGm(tGm('envCombat.playerAlerts.weaponDropped', locale), { weapon: weaponName });
    }
  }

  if (kind === ENV_DIRECTIVE_KIND.TIME_ADVANCE) {
    const scenes = Math.max(0, Math.floor(Number(p.scenes) || 0));
    const gameMinutes = Math.max(0, Number(p.gameMinutes) || 0);
    if (scenes > 0 && typeof store.advanceScene === 'function') {
      const logs = [];
      for (let i = 0; i < scenes; i += 1) {
        const res = store.advanceScene();
        if (Array.isArray(res?.periodicLogs)) logs.push(...res.periodicLogs);
      }
      return logs.length > 0 ? logs.join('\n') : '';
    }
    if (gameMinutes > 0 && typeof store.advanceEffectsByGameHours === 'function') {
      const res = store.advanceEffectsByGameHours(gameMinutes / 60);
      return Array.isArray(res?.periodicLogs) && res.periodicLogs.length > 0
        ? res.periodicLogs.join('\n')
        : '';
    }
    return '';
  }

  if (kind === ENV_DIRECTIVE_KIND.PEER_CONSUMABLE) {
    const item = p.item || {};
    const bonusHp = Math.max(0, Math.floor(Number(p.firstAidBonusHp) || 0));
    const baseHeal = Math.max(0, getInstantHealAmount(item));
    const totalHeal = baseHeal + bonusHp;
    const lines = [];
    if (totalHeal > 0) {
      store.healCharacter(totalHeal);
      lines.push(`+${totalHeal} ОЗ`);
    }
    // Если предмет снимает радиацию (Антирадин и т.п.)
    if (item?.radiationModifier?.op === '-' && Number(item.radiationModifier.value) > 0) {
      store.healRadiation(Number(item.radiationModifier.value));
      lines.push(`−${Number(item.radiationModifier.value)} рад`);
    }
    if (p.stabilizeInjury || isFirstAidCapableItem(item)) {
      const cur = effectsDictToLegacyArray(store.effects);
      const stab = stabilizeInjuryInEffectsArray(cur, p.stabilizeInjuryZone || null, locale);
      if (stab.stabilizedZoneKey) {
        syncTimedEffectsToStore(stab.effects, store);
        lines.push(formatGm(tGm('envCombat.firstAid.injuryStabilized', locale), {
          zone: stab.stabilizedZoneLabel || stab.stabilizedZoneKey,
        }));
      }
    }
    if (p.firstAidReportLine) lines.push(String(p.firstAidReportLine));
    return formatGm(tGm('envCombat.firstAid.peerReceivedBody', locale), {
      from: directive?.fromName || 'Союзник',
      item: item?.name || item?.Name || item?.id || 'предмет',
      summary: lines.join('; ') || 'OK',
    });
  }

  return '';
};

// ── Применение тех же директив к сохранённой строке персонажа в БД (спящий / фоновый лист) ──

export const applyEnvCombatDirectiveToStoredRow = (directive, row, locale = getCurrentLocale()) => {
  const data = row?.data && typeof row.data === 'object'
    ? JSON.parse(JSON.stringify(row.data))
    : {};
  const nextLevel = Math.max(1, Number(data.level ?? row?.level) || 1);
  const attrs = Array.isArray(data.attributes) ? data.attributes : [];
  const maxHp = calculateMaxHealth(attrs, nextLevel);
  const getEffectsArr = () => (Array.isArray(data.activeTimedEffects) ? [...data.activeTimedEffects] : []);
  const setEffectsArr = (arr) => { data.activeTimedEffects = arr; };

  const damageHp = (dmg) => {
    const rad = Math.max(0, Number(data.radiation) || 0);
    const ceil = Math.max(0, maxHp - rad);
    const cur = data.currentHealth != null ? Number(data.currentHealth) : ceil;
    data.currentHealth = Math.max(0, cur - Math.max(0, dmg));
  };
  const healHp = (amt) => {
    const rad = Math.max(0, Number(data.radiation) || 0);
    const ceil = Math.max(0, maxHp - rad);
    const cur = data.currentHealth != null ? Number(data.currentHealth) : ceil;
    data.currentHealth = cur > ceil ? cur : Math.min(ceil, cur + Math.max(0, amt));
  };
  const addRadiation = (rad) => {
    const nextRad = Math.max(0, (Number(data.radiation) || 0) + Math.max(0, rad));
    data.radiation = nextRad;
    const ceil = Math.max(0, maxHp - nextRad);
    if (data.currentHealth != null && data.currentHealth > ceil) {
      data.currentHealth = ceil;
    }
  };
  const addWeatherFatigue = (src, amt) => {
    if (!data.survival || !Array.isArray(data.survival.fatigue)) return;
    const nf = [...data.survival.fatigue];
    const idx = nf.findIndex((f) => f.source === src);
    if (idx >= 0) nf[idx] = { ...nf[idx], amount: nf[idx].amount + amt };
    else nf.push({ source: src, amount: amt });
    data.survival = { ...data.survival, fatigue: nf };
  };

  const kind = directive?.kind;
  const p = directive?.envPayload || {};
  let summaryLine = '';

  if (kind === ENV_DIRECTIVE_KIND.WEATHER_CLEAR) {
    const condKey = p.conditionKey || null;
    setEffectsArr(getEffectsArr().filter((e) => {
      if (e?.effectType !== 'gmPeriodic' || e.gmPeriodic?.category !== 'weather') return true;
      return condKey ? e.gmPeriodic.conditionKey !== condKey : false;
    }));
    summaryLine = tGm('envCombat.playerAlerts.weatherCleared', locale);
  } else if (kind === ENV_DIRECTIVE_KIND.WEATHER_APPLY) {
    const condKey = p.conditionKey || 'heat';
    const title = p.customTitle || tGm(`envCombat.weather.conditions.${condKey}.title`, locale);
    const durationUnit = p.durationUnit || 'hours';
    if (durationUnit === 'once') {
      const detail = applySingleHazardTick({ charData: data, damageHp, healHp, addRadiation, addWeatherFatigue }, { ...p, category: 'weather', conditionKey: condKey }, locale);
      summaryLine = formatGm(tGm('envCombat.playerAlerts.weatherApplied', locale), { title, details: detail });
    } else {
      const filtered = getEffectsArr().filter(
        (e) => !(e?.effectType === 'gmPeriodic' && e.gmPeriodic?.category === 'weather' && e.gmPeriodic?.conditionKey === condKey),
      );
      const eff = buildPeriodicTimedEffect({
        category: 'weather',
        conditionKey: condKey,
        title,
        value: p.value ?? 1,
        durationUnit,
        totalIntervals: p.totalIntervals ?? 1,
        locale,
      });
      setEffectsArr([...filtered, eff]);
      summaryLine = formatGm(tGm('envCombat.playerAlerts.weatherApplied', locale), { title, details: eff.effectLabel });
    }
  } else if (kind === ENV_DIRECTIVE_KIND.RADIATION_APPLY) {
    const presetKey = 'radiation';
    const title = p.customTitle || tGm('envCombat.radiation.genericTitle', locale);
    const durationUnit = p.durationUnit || 'once';
    if (durationUnit === 'once') {
      const amount = Math.max(0, Math.floor(Number(p.value ?? 1) || 0));
      const exp = computeRadiationExposure(data, amount, { resistMode: 'minBody' });
      if (exp.immune) {
        const healing = resolveGhoulRadiationHealing(data, amount);
        if (healing.heal > 0) healHp(healing.heal);
        summaryLine = healing.heal > 0
          ? formatGm(tGm('envCombat.radiation.immuneHealed', locale), { heal: healing.heal })
          : tGm('envCombat.radiation.immuneResult', locale);
      } else {
        if (exp.netRad > 0) addRadiation(exp.netRad);
        summaryLine = formatGm(tGm('envCombat.playerAlerts.radAppliedOnce', locale), { rad: exp.netRad, blocked: exp.blocked });
      }
    } else {
      const eff = buildPeriodicTimedEffect({
        category: 'radiation',
        conditionKey: presetKey,
        title,
        value: p.value ?? 1,
        durationUnit,
        totalIntervals: p.totalIntervals ?? 1,
        locale,
      });
      setEffectsArr([...getEffectsArr(), eff]);
      summaryLine = formatGm(tGm('envCombat.playerAlerts.radPeriodicStarted', locale), {
        title,
        val: String(p.value ?? 1),
        n: p.totalIntervals ?? 1,
        unit: tGm(`envCombat.duration.shortUnits.${durationUnit}`, locale),
      });
    }
  } else if (kind === ENV_DIRECTIVE_KIND.INJURY_CLEAR) {
    const zKey = p.zoneKey || null;
    setEffectsArr(getEffectsArr().filter((e) => (e?.effectType !== 'injury' ? true : (zKey ? e.injuryZone !== zKey : false))));
    summaryLine = tGm('envCombat.playerAlerts.injuryCleared', locale);
  } else if (kind === ENV_DIRECTIVE_KIND.INJURY_APPLY) {
    const zones = getCharacterZonesForInjury(data, locale);
    const picked = (p.zoneKey && zones.find((z) => z.key === p.zoneKey)) || rollHitZoneForCharacter(data, locale).zone;
    const bleedDice = Math.max(1, Math.floor(Number(p.bleedDice) || 1));
    const eff = buildInjuryTimedEffect({
      zoneKey: picked.key,
      zoneLabel: picked.label,
      isRobotZone: picked.isRobotZone,
      bleedDice,
      stage: 'active',
      locale,
    });
    const filtered = getEffectsArr().filter((e) => !(e?.effectType === 'injury' && e.injuryZone === picked.key));
    setEffectsArr([...filtered, eff]);
    summaryLine = formatGm(tGm('envCombat.playerAlerts.injuryApplied', locale), {
      zone: picked.label,
      effect: describeInjuryEffect(picked.key, { isRobotZone: picked.isRobotZone, bleedDice, stage: 'active' }, locale),
    });
  } else if (kind === ENV_DIRECTIVE_KIND.ATTACK_FAIL) {
    const outcome = p.outcome || 'weaponJam';
    const items = Array.isArray(data.equipment?.items) ? [...data.equipment.items] : [];
    const eqWeapons = Array.isArray(data.equippedWeapons) ? [...data.equippedWeapons] : [];
    const findWepIdx = () => {
      if (p.weaponId) {
        const idx = items.findIndex((it) => it && (it.id === p.weaponId || it.instanceId === p.weaponId || it.weaponId === p.weaponId));
        if (idx >= 0) return idx;
      }
      const eqIdx = items.findIndex((it) => it && (it.itemType === 'weapon' || it.weaponId || it.damage !== undefined) && (it.equipped || it.isEquipped));
      if (eqIdx >= 0) return eqIdx;
      return items.findIndex((it) => it && (it.itemType === 'weapon' || it.weaponId || it.damage !== undefined));
    };

    if (outcome === 'ricochet') {
      const zones = getCharacterZonesForInjury(data, locale);
      const hitZ = (p.hitZone && zones.find((z) => z.key === p.hitZone)) || rollHitZoneForCharacter(data, locale).zone;
      const { amount } = evaluateStrengthAmount({ valueMode: p.valueMode || 'cd', value: p.value ?? 3 });
      const dr = Math.max(0, Number(getCharacterZoneDR(data, hitZ.key).physical) || 0);
      const net = Math.max(0, amount - dr);
      if (net > 0) damageHp(net);
      summaryLine = formatGm(tGm('envCombat.playerAlerts.ricochetHit', locale), { zone: hitZ.label, dmg: net, dr });
    } else {
      const wIdx = findWepIdx();
      const wep = wIdx >= 0 ? { ...items[wIdx] } : null;
      const weaponName = wep?.name || wep?.Name || p.weaponName || '—';

      if (outcome === 'ammoLoss') {
        const ammoIds = String(wep?.ammoId || p.ammoId || '').split(',').map((s) => s.trim()).filter(Boolean);
        let avail = 0;
        items.forEach((it) => {
          if (it && (it.itemType === 'ammo' || it.type === 'ammo') && (ammoIds.length === 0 || ammoIds.includes(it.weaponId || it.id))) {
            avail += Number(it.quantity) || 0;
          }
        });
        const want = p.ammoMode === 'allPack'
          ? avail
          : Math.min(avail, evaluateStrengthAmount({ valueMode: p.ammoMode === 'cd' ? 'cd' : 'fixed', value: p.value ?? 3 }).amount);
        let rem = want;
        const nextItems = [];
        for (const it of items) {
          if (rem > 0 && it && (it.itemType === 'ammo' || it.type === 'ammo') && (ammoIds.length === 0 || ammoIds.includes(it.weaponId || it.id))) {
            const q = Number(it.quantity) || 0;
            const take = Math.min(q, rem);
            rem -= take;
            if (q - take > 0) nextItems.push({ ...it, quantity: q - take });
          } else {
            nextItems.push(it);
          }
        }
        data.equipment = { ...(data.equipment || {}), items: nextItems };
        summaryLine = formatGm(tGm('envCombat.playerAlerts.ammoLost', locale), { weapon: weaponName, lost: want - rem });
      } else if (outcome === 'weaponJam') {
        if (wep && wIdx >= 0) {
          items[wIdx] = { ...wep, jammed: true };
          data.equipment = { ...(data.equipment || {}), items };
        }
        summaryLine = formatGm(tGm('envCombat.playerAlerts.weaponJammed', locale), { weapon: weaponName });
      } else if (outcome === 'weaponBreak') {
        if (wep && wIdx >= 0) {
          items[wIdx] = { ...wep, durabilityTracked: true, durability: 0, forceBroken: true };
          data.equipment = { ...(data.equipment || {}), items };
        }
        summaryLine = formatGm(tGm('envCombat.playerAlerts.weaponBroken', locale), { weapon: weaponName });
      } else if (outcome === 'weaponExplode') {
        const repairable = p.repairable !== false;
        const { amount } = evaluateStrengthAmount({ valueMode: p.valueMode || 'cd', value: p.value ?? 4 });
        const armDr = Math.max(0, Number(getCharacterZoneDR(data, 'rightArm').physical) || 0);
        const net = Math.max(0, amount - armDr);
        if (net > 0) damageHp(net);
        if (wep && wIdx >= 0) {
          if (repairable) {
            items[wIdx] = { ...wep, durabilityTracked: true, durability: 0, forceBroken: true };
          } else {
            items[wIdx] = { ...wep, durabilityTracked: true, durability: 0, forceBroken: true, unrepairable: true, equipped: false, isEquipped: false };
            data.equippedWeapons = eqWeapons.filter((ew) => ew && ew.id !== wep.id && ew.instanceId !== wep.instanceId);
          }
          data.equipment = { ...(data.equipment || {}), items };
        }
        summaryLine = formatGm(
          tGm(repairable ? 'envCombat.playerAlerts.weaponExplodedRepairable' : 'envCombat.playerAlerts.weaponExplodedRuined', locale),
          { weapon: weaponName, dmg: net, dr: armDr },
        );
      } else if (outcome === 'dropWeapon') {
        if (wep && wIdx >= 0) {
          items[wIdx] = { ...wep, equipped: false, isEquipped: false };
          data.equipment = { ...(data.equipment || {}), items };
          data.equippedWeapons = eqWeapons.filter((ew) => ew && ew.id !== wep.id && ew.instanceId !== wep.instanceId);
        }
        summaryLine = formatGm(tGm('envCombat.playerAlerts.weaponDropped', locale), { weapon: weaponName });
      }
    }
  } else if (kind === ENV_DIRECTIVE_KIND.TIME_ADVANCE) {
    const res = advancePeriodicEffectsArray(
      getEffectsArr(),
      { charData: data, damageHp, healHp, addRadiation, addWeatherFatigue },
      { scenes: p.scenes || 0, gameMinutes: p.gameMinutes || 0, locale },
    );
    setEffectsArr(res.effects);
    summaryLine = res.logs.join('\n');
  } else if (kind === ENV_DIRECTIVE_KIND.PEER_CONSUMABLE) {
    const item = p.item || {};
    const bonusHp = Math.max(0, Math.floor(Number(p.firstAidBonusHp) || 0));
    const baseHeal = Math.max(0, getInstantHealAmount(item));
    const totalHeal = baseHeal + bonusHp;
    const lines = [];
    if (totalHeal > 0) {
      healHp(totalHeal);
      lines.push(`+${totalHeal} ОЗ`);
    }
    if (item?.radiationModifier?.op === '-' && Number(item.radiationModifier.value) > 0) {
      data.radiation = Math.max(0, (Number(data.radiation) || 0) - Number(item.radiationModifier.value));
      lines.push(`−${Number(item.radiationModifier.value)} рад`);
    }
    if (p.stabilizeInjury || isFirstAidCapableItem(item)) {
      const stab = stabilizeInjuryInEffectsArray(getEffectsArr(), p.stabilizeInjuryZone || null, locale);
      if (stab.stabilizedZoneKey) {
        setEffectsArr(stab.effects);
        lines.push(formatGm(tGm('envCombat.firstAid.injuryStabilized', locale), {
          zone: stab.stabilizedZoneLabel || stab.stabilizedZoneKey,
        }));
      }
    }
    if (p.firstAidReportLine) lines.push(String(p.firstAidReportLine));
    summaryLine = formatGm(tGm('envCombat.firstAid.peerReceivedBody', locale), {
      from: directive?.fromName || 'Союзник',
      item: item?.name || item?.Name || item?.id || 'предмет',
      summary: lines.join('; ') || 'OK',
    });
  }

  return { nextLevel, nextData: data, summaryLine };
};
