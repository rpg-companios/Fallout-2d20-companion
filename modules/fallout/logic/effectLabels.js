import { getCurrentModuleLocale } from 'engine:i18n/locale';
import { getFalloutModuleI18n } from './settingI18n.js';
import { SCENE_RULES } from 'engine:domain/effects';

export const getFalloutEffectText = (path, vars = {}) => {
  const parts = path.split('.');
  const locale = getCurrentModuleLocale();
  let current = getFalloutModuleI18n(locale)?.effects;
  if (!current || Object.keys(current).length === 0) {
    throw new Error(`[effects] Setting "${locale}" has no effects dictionary`);
  }
  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) {
      throw new Error(`[effects] Для ключа "${path}" нет перевода`);
    }
  }
  if (typeof current !== 'string') {
    throw new Error(`[effects] Перевод "${path}" должен быть строкой`);
  }
  return current.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] ?? ''));
};

export const getDefenseModifierEffectLabel = (modifier) => {
  if (
    !modifier
    || !['+', '-'].includes(modifier.op)
    || typeof modifier.value !== 'number'
    || !Number.isFinite(modifier.value)
  ) {
    throw new Error('[effects] Некорректный модификатор защиты');
  }
  return getFalloutEffectText('display.defenseModifier', {
    modifier: `${modifier.op}${modifier.value}`,
  });
};

export const getEffectTimeText = (scenesLeft) => {
  const scenes = Number(scenesLeft) || 0;
  const totalMinutes = scenes * SCENE_RULES.SCENE_DURATION_MINUTES;
  return getFalloutEffectText('display.scenesAndMinutes', { scenes, minutes: totalMinutes });
};
