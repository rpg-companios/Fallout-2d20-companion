// modules/fallout/gm/gmDirectives.js
// Каталог команд Мастера сеттинга Fallout 2d20 и чистые функции их применения
// на стороне клиента Игрока (как к открытому в characterStore листу, так и к
// сохранённому в локальной SQLite/WebAdapter персонажу, если сейчас открыт
// другой экран или другой персонаж).

import { getCurrentLocale } from '../../../i18n/locale';
import { selectLegacyAttributes } from '../../../src/store/selectors';
import { getAttributeValue } from '../../../domain/characterCreation';
import { findEnrichedOrigin, isRobotCharacter } from '../../../domain/origins';
import { findTraitById } from '../../../domain/traits';
import { hasRadiationImmunity } from '../../../domain/immunities';
import { calculateMaxHealth } from '../logic/derivedStats';
import {
  ENV_DIRECTIVE_KIND,
  applyEnvCombatDirectiveToStore,
  applyEnvCombatDirectiveToStoredRow,
} from './gmEnvCombat';
import { formatGm, tGm } from './gmI18n';

export const GM_DIRECTIVE_KIND = Object.freeze({
  LEVEL_GRANT: 'level.grant',
  CAPS_GRANT: 'caps.grant',
  LUCK_RESTORE: 'luck.restore',
  HP_HEAL: 'hp.heal',
  RAD_ADJUST: 'rad.adjust',
});

export const GM_DIRECTIVE_CATALOG = Object.freeze([
  {
    kind: GM_DIRECTIVE_KIND.LEVEL_GRANT,
    icon: 'chevron-double-up',
    defaultAmount: 1,
    presets: [1, 2],
    hasAmountInput: true,
    allowNegative: false,
  },
  {
    kind: GM_DIRECTIVE_KIND.CAPS_GRANT,
    icon: 'circle-multiple-outline',
    defaultAmount: 25,
    presets: [10, 25, 50, 100],
    hasAmountInput: true,
    allowNegative: true,
  },
  {
    kind: GM_DIRECTIVE_KIND.LUCK_RESTORE,
    icon: 'clover',
    defaultAmount: 0,
    presets: [],
    hasAmountInput: false,
    allowNegative: false,
  },
  {
    kind: GM_DIRECTIVE_KIND.HP_HEAL,
    icon: 'heart-plus-outline',
    defaultAmount: 0,
    defaultMode: 'full',
    presets: [2, 5, 10],
    hasAmountInput: true,
    allowNegative: false,
  },
  {
    kind: GM_DIRECTIVE_KIND.RAD_ADJUST,
    icon: 'radioactive',
    defaultAmount: 1,
    presets: [1, 2, -1, -2],
    hasAmountInput: true,
    allowNegative: true,
  },
]);

export const formatDirectiveBadgeLabel = (directive, locale = getCurrentLocale()) => {
  if (!directive?.kind) return '';
  if (directive.kind.startsWith('env.weather.')) return tGm('envCombat.tiles.weather.title', locale);
  if (directive.kind.startsWith('env.radiation.')) return tGm('envCombat.tiles.radiation.title', locale);
  if (directive.kind.startsWith('env.injury.')) return tGm('envCombat.tiles.injury.title', locale);
  if (directive.kind.startsWith('env.attackFail.')) return tGm('envCombat.tiles.attackFail.title', locale);
  if (directive.kind === ENV_DIRECTIVE_KIND.TIME_ADVANCE) return tGm('envCombat.targetBar.stepScene', locale);
  if (directive.kind === ENV_DIRECTIVE_KIND.PEER_CONSUMABLE) return directive.fromName || 'Aid';
  const amount = Number(directive.amount) || 0;
  if (directive.kind === GM_DIRECTIVE_KIND.HP_HEAL && (directive.mode === 'full' || amount <= 0)) {
    return tGm('commands.kinds.hp.heal.fullShort', locale);
  }
  const tpl = tGm(`commands.kinds.${directive.kind}.short`, locale);
  return formatGm(tpl, {
    amount: Math.abs(amount) || 1,
    sign: amount < 0 ? '−' : '+',
  });
};

const isCharacterRadImmune = (originLike, traitLike, robotSlots = null) => {
  const originId = typeof originLike === 'string' ? originLike : originLike?.id;
  let resolvedOrigin = originLike && typeof originLike === 'object' ? originLike : null;
  if (originId && !resolvedOrigin?.bodyPlan) {
    try { resolvedOrigin = findEnrichedOrigin(originId) || resolvedOrigin; } catch { /* ignore */ }
  }
  const traitId = (typeof traitLike === 'string' ? traitLike : traitLike?.id)
    || (Array.isArray(resolvedOrigin?.traitIds) && resolvedOrigin.traitIds.length === 1 ? resolvedOrigin.traitIds[0] : null);
  let resolvedTrait = traitLike && typeof traitLike === 'object' ? traitLike : null;
  if (traitId && !resolvedTrait?.modifiers) {
    try { resolvedTrait = findTraitById(traitId) || resolvedTrait; } catch { /* ignore */ }
  }
  const ctx = { origin: resolvedOrigin || (originId ? { id: originId } : null), trait: resolvedTrait };
  if (isRobotCharacter(ctx) || (robotSlots && Object.keys(robotSlots).length > 0)) return true;
  return Boolean(hasRadiationImmunity(ctx));
};

/**
 * Применяет директиву Мастера к активному персонажу в `useCharacterStore`.
 * Возвращает локализованное сообщение для показа игроку.
 */
export const applyDirectiveToLiveCharacterStore = (directive, useCharacterStore, locale = getCurrentLocale()) => {
  const state = useCharacterStore.getState();
  const kind = directive?.kind;
  const rawAmount = Number(directive?.amount);
  let summaryLine = '';

  if (kind === GM_DIRECTIVE_KIND.LEVEL_GRANT) {
    const delta = Math.max(1, Math.min(20, Math.floor(rawAmount || 1)));
    const nextLevel = Math.max(1, (Number(state.level) || 1) + delta);
    if (state.attributesSaved) {
      state.setSkillsSaved(false);
    }
    state.setLevel(nextLevel);
    summaryLine = formatGm(tGm('commands.playerAlert.levelUp', locale), {
      delta,
      level: nextLevel,
    });
  } else if (kind === GM_DIRECTIVE_KIND.CAPS_GRANT) {
    const delta = Math.trunc(rawAmount || 0);
    const prevCaps = Math.max(0, Math.floor(Number(state.currency) || 0));
    const nextCaps = Math.max(0, prevCaps + delta);
    state.setCurrency(nextCaps);
    summaryLine = delta >= 0
      ? formatGm(tGm('commands.playerAlert.capsAdded', locale), { delta, total: nextCaps })
      : formatGm(tGm('commands.playerAlert.capsSpent', locale), { delta: Math.abs(delta), total: nextCaps });
  } else if (kind === GM_DIRECTIVE_KIND.LUCK_RESTORE) {
    const attrs = selectLegacyAttributes({ attributes: state.attributes });
    const maxLuck = Math.max(0, getAttributeValue(attrs, 'LCK'));
    state.setLuckPoints(maxLuck);
    summaryLine = formatGm(tGm('commands.playerAlert.luckRestored', locale), {
      luck: maxLuck,
      max: maxLuck,
    });
  } else if (kind === GM_DIRECTIVE_KIND.HP_HEAL) {
    const attrs = selectLegacyAttributes({ attributes: state.attributes });
    const maxHp = calculateMaxHealth(attrs, state.level || 1);
    const rad = Math.max(0, Number(state.radiation) || 0);
    const ceiling = Math.max(0, maxHp - rad);
    if (directive?.mode === 'full' || !(rawAmount > 0)) {
      const nextHp = Math.max(Number(state.currentHealth) || 0, ceiling);
      state.setCurrentHealth(nextHp);
      summaryLine = formatGm(tGm('commands.playerAlert.hpHealed', locale), { hp: nextHp, max: ceiling });
    } else {
      const healAmt = Math.max(1, Math.floor(rawAmount));
      state.healCharacter(healAmt, ceiling);
      const nextHp = useCharacterStore.getState().currentHealth;
      summaryLine = formatGm(tGm('commands.playerAlert.hpHealed', locale), { hp: nextHp, max: ceiling });
    }
  } else if (kind === GM_DIRECTIVE_KIND.RAD_ADJUST) {
    const delta = Math.trunc(rawAmount || 0);
    const immune = isCharacterRadImmune(state.origin, state.trait, state.robot?.slots);
    if (delta > 0 && immune) {
      summaryLine = formatGm(tGm('commands.playerAlert.radImmune', locale), { delta });
    } else {
      const prevRad = Math.max(0, Number(state.radiation) || 0);
      const nextRad = Math.max(0, prevRad + delta);
      state.setRadiation(nextRad);
      summaryLine = formatGm(tGm('commands.playerAlert.radChanged', locale), { rad: nextRad });
    }
  } else if (kind?.startsWith('env.') || kind === ENV_DIRECTIVE_KIND.PEER_CONSUMABLE) {
    summaryLine = applyEnvCombatDirectiveToStore(directive, state, locale);
  }

  return summaryLine;
};

/**
 * Применяет директиву Мастера напрямую к сохранённой строке персонажа из БД
 * (когда персонаж привязан к комнате, но сейчас не открыт в characterStore).
 */
export const applyDirectiveToStoredCharacterRow = (directive, row, locale = getCurrentLocale()) => {
  const data = row?.data && typeof row.data === 'object'
    ? JSON.parse(JSON.stringify(row.data))
    : {};
  const kind = directive?.kind;
  const rawAmount = Number(directive?.amount);
  let nextLevel = Math.max(1, Number(data.level ?? row?.level) || 1);
  let summaryLine = '';

  const attrs = Array.isArray(data.attributes) ? data.attributes : [];

  if (kind === GM_DIRECTIVE_KIND.LEVEL_GRANT) {
    const delta = Math.max(1, Math.min(20, Math.floor(rawAmount || 1)));
    nextLevel += delta;
    data.level = nextLevel;
    if (data.attributesSaved) {
      data.skillsSaved = false;
    }
    summaryLine = formatGm(tGm('commands.playerAlert.levelUp', locale), {
      delta,
      level: nextLevel,
    });
  } else if (kind === GM_DIRECTIVE_KIND.CAPS_GRANT) {
    const delta = Math.trunc(rawAmount || 0);
    const prevCaps = Math.max(0, Math.floor(Number(data.caps ?? data.currency) || 0));
    const nextCaps = Math.max(0, prevCaps + delta);
    data.caps = nextCaps;
    summaryLine = delta >= 0
      ? formatGm(tGm('commands.playerAlert.capsAdded', locale), { delta, total: nextCaps })
      : formatGm(tGm('commands.playerAlert.capsSpent', locale), { delta: Math.abs(delta), total: nextCaps });
  } else if (kind === GM_DIRECTIVE_KIND.LUCK_RESTORE) {
    const maxLuck = Math.max(0, getAttributeValue(attrs, 'LCK'));
    data.luckPoints = maxLuck;
    summaryLine = formatGm(tGm('commands.playerAlert.luckRestored', locale), {
      luck: maxLuck,
      max: maxLuck,
    });
  } else if (kind === GM_DIRECTIVE_KIND.HP_HEAL) {
    const maxHp = calculateMaxHealth(attrs, nextLevel);
    const rad = Math.max(0, Number(data.radiation) || 0);
    const ceiling = Math.max(0, maxHp - rad);
    const prevHp = data.currentHealth != null ? Number(data.currentHealth) : ceiling;
    let nextHp = prevHp;
    if (directive?.mode === 'full' || !(rawAmount > 0)) {
      nextHp = Math.max(prevHp, ceiling);
    } else {
      const healAmt = Math.max(1, Math.floor(rawAmount));
      nextHp = prevHp > ceiling ? prevHp : Math.min(ceiling, prevHp + healAmt);
    }
    data.currentHealth = nextHp;
    summaryLine = formatGm(tGm('commands.playerAlert.hpHealed', locale), { hp: nextHp, max: ceiling });
  } else if (kind === GM_DIRECTIVE_KIND.RAD_ADJUST) {
    const delta = Math.trunc(rawAmount || 0);
    const immune = isCharacterRadImmune(data.origin, data.trait, data.equippedRobotSlots);
    if (delta > 0 && immune) {
      summaryLine = formatGm(tGm('commands.playerAlert.radImmune', locale), { delta });
    } else {
      const prevRad = Math.max(0, Number(data.radiation) || 0);
      const nextRad = Math.max(0, prevRad + delta);
      data.radiation = nextRad;
      summaryLine = formatGm(tGm('commands.playerAlert.radChanged', locale), { rad: nextRad });
    }
  } else if (kind?.startsWith('env.') || kind === ENV_DIRECTIVE_KIND.PEER_CONSUMABLE) {
    return applyEnvCombatDirectiveToStoredRow(directive, row, locale);
  }

  return {
    nextLevel,
    nextData: data,
    summaryLine,
  };
};
