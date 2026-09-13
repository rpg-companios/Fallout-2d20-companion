// Часы выживания — компонент модуля Fallout (этап 5, патч 210).
//
// Реальный тик контура A (док §5): X реальных минут = 1 игровой час,
// курс — настройка survivalTimeCourseMinutes (дефолт 30). Правила:
//   - копится только пока приложение открыто (AppState active) и персонаж
//     загружен (есть поле survival); между запусками и в фоне — ничего;
//   - при выключенной настройке survivalModeEnabled трекинг заморожен;
//   - за один тик учитывается не более 5 реальных минут — страховка от
//     патологических скачков таймера (при активном приложении они не
//     случаются в норме).
//
// Монтируется в App.js рядом с AlertHost (внутри CharacterProvider).
// Рендерит null: только таймер и запись результата в стор. Текущие ОЗ
// не трогаются: усталость снижает МАКСИМУМ ОЗ (производная от N, патч 213),
// и это пересчитывается в сторе самим тиком.
//
// Патч 232 (решение владельца, по книге): усталость — потеря ТЕКУЩИХ ОЗ
// «на начале сцены» (N/2 без сопротивлений). Сцены в приложении не тикают,
// поэтому потеря привязана к игровому часу тика (сумма событий hpMaxPenalty)
// и применяется через applySurvivalHpLoss стора. Часы сна потерь не
// дают: сон идёт через rest() (sleepSurvival), а не через эти тики.
//
// Движок не знает правил: компонент читает настройки через общий стор,
// состояние — из слайса stateExtensions.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import useCharacterStore from '../../../src/store/characterStore';
import useAppSettingsStore from '../../../src/store/appSettingsStore';
import { advanceRealMinutes, fatigueHpLossFromEvents } from './survival';

const TICK_INTERVAL_MS = 30_000;
const MAX_REAL_MINUTES_PER_TICK = 5;

const SurvivalClock = () => {
  useEffect(() => {
    let lastTickAt = null;
    let timer = null;

    const tick = () => {
      const now = Date.now();
      const elapsedRealMinutes = Math.min(
        (now - (lastTickAt ?? now)) / 60_000,
        MAX_REAL_MINUTES_PER_TICK,
      );
      lastTickAt = now;

      const settings = useAppSettingsStore.getState();
      if (!settings.getSettingValue('survivalModeEnabled')) return;

      const store = useCharacterStore.getState();
      const survival = store.stateExtensions?.survival ?? null;
      if (!survival) return;

      const course = settings.getSettingValue('survivalTimeCourseMinutes');
      if (!(course > 0)) return; // страховка: домен бросает на неположительном курсе
      const result = advanceRealMinutes(survival, elapsedRealMinutes, course);
      store.setStateExtension('survival', result.state);

      // Патч 232: потеря текущих ОЗ от усталости за прошедшие игровые часы.
      const hpLoss = fatigueHpLossFromEvents(result.events);
      // Шаг 8а: прямо в стор — циклическая ссылка на контекст не нужна.
      if (hpLoss > 0) useCharacterStore.getState().applySurvivalHpLoss(hpLoss);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      lastTickAt = null; // в фоне время не копится
    };

    const start = () => {
      if (timer) return;
      lastTickAt = Date.now();
      timer = setInterval(tick, TICK_INTERVAL_MS);
    };

    const handleAppStateChange = (nextState) => {
      if (nextState === 'active') start();
      else stop();
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    // AppState.currentState бывает null при первом рендере (native) — считаем
    // приложение активным и запускаемся; фоновое состояние поймает 'change'.
    if (AppState.currentState !== 'background') start();

    return () => {
      stop();
      subscription.remove();
    };
  }, []);

  return null;
};

export default SurvivalClock;
