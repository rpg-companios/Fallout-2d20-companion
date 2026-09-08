// Операции выживания — модуль сеттинга Fallout.
//
// sleepSurvival применяет сон (docs/survival-system-design.md §4–§7):
// лестницы + усталость (чистый домен rest; текущие ОЗ сон не трогает —
// усталость снижает максимум, патч 213), мост контуров — временные
// эффекты продвигаются на N × 12 сцен (родовая операция контекста
// advanceEffectsByGameHours), и при сне в пустоши — проверка болезни по
// имеющейся механике (событие sleepOnGround, родовая операция
// resolveSceneRiskEventById). Прогноз для модали делает чистый домен
// forecastSleep (состояние не фиксируется) — эта функция фиксирует.
//
// Зависимости приходят объектом контекста (useCharacter()): модуль не
// импортирует React и не знает, где живёт состояние.

import useCharacterStore from '../../../src/store/characterStore';
import useAppSettingsStore from '../../../src/store/appSettingsStore';
import { debugLog } from '../../../src/debug/falloutDebug';
import { consumeDrink, consumeFood, rest } from './survival';

// Хранилище выживания — слайс stateExtensions стора (патч 209). Операции
// читают СВЕЖЕЕ состояние прямо из стора (не из замыканий рендеров), а
// пишут — действием стора через ctx.setStateExtension (контекст делегирует
// туда же). Так «поесть/попить/поспать» из любого места работают на одних
// данных — в точности как items/effects.
const currentSurvival = () =>
  useCharacterStore.getState().stateExtensions?.survival ?? null;

// Гейт настройкой (этап 5, патч 210): выключенное выживание заморожено —
// шкалы не двигаются, трекинг не идёт; состояние в сейве сохраняется.
const survivalEnabled = () =>
  useAppSettingsStore.getState().getSettingValue('survivalModeEnabled') === true;

/**
 * Слушатель применённых расходников (реестр stateExtensions, патч 208).
 * Движок зовёт его в конце applyConsumableFull — то есть при употреблении
 * еды/напитков ЛЮБЫМ путём (инвентарь или модалка выживания) шкалы
 * выживания двигаются одинаково. Возвращает null, если предмет —
 * не еда/напиток, у персонажа нет выживания (робот/киборг) или система
 * выключена настройкой (заморожено).
 */
export const survivalConsumableListener = (item, ctx) => {
  if (!survivalEnabled()) return null;
  const survival = currentSurvival();
  if (!survival) return null;

  const apply = (result) => {
    if (!result.ok) return { ok: false, reason: result.reason };
    ctx.setStateExtension('survival', result.state);
    return { ok: true, gained: result.gained };
  };

  if (item?.itemType === 'food') {
    return apply(consumeFood(survival, item));
  }
  if (item?.itemType === 'drinks') {
    return apply(consumeDrink(survival, item));
  }
  return null;
};

export const sleepSurvival = (ctx, { place, hours }) => {
  if (!survivalEnabled()) return { ok: false, reason: 'disabled' };

  const {
    setStateExtension,
    reducePersistentDiseaseRanks,
    advanceEffectsByGameHours,
    resolveSceneRiskEventById,
  } = ctx;

  const survival = currentSurvival();
  if (!survival) return { ok: false, reason: 'notCapable' };

  const result = rest(survival, { place, hours });
  setStateExtension('survival', result.state);

  // Отдых в постели (патч 215): каждая накопленная порция 12 часов сна
  // в кровати снимает 1 единицу с каждой болезни.
  let bedRestHealed = [];
  if (result.bedRestCompleted > 0 && typeof reducePersistentDiseaseRanks === 'function') {
    bedRestHealed = reducePersistentDiseaseRanks(result.bedRestCompleted).healed;
  }

  // Мост контуров (§5): сон двигает таймеры эффектов как N × 12 сцен.
  const { expired } = advanceEffectsByGameHours(hours);

  // Сон в пустоши — проверка заболевания (sleepOnGround, §7).
  const diseaseRiskResult = place === 'wasteland'
    ? resolveSceneRiskEventById('sleepOnGround')
    : null;

  debugLog('survival.sleep.apply', {
    place,
    hours,
    sleepTo: result.state.sleep,
    fatigueAfter: result.state.fatigue.reduce((sum, f) => sum + f.amount, 0),
    bedRestCompleted: result.bedRestCompleted,
    bedRestHealed,
    diseaseRiskResult,
    effectsExpired: expired.length,
  });

  return {
    ok: true,
    result,
    bedRestCompleted: result.bedRestCompleted,
    bedRestHealed,
    diseaseRiskResult,
    effectsExpired: expired,
  };
};
