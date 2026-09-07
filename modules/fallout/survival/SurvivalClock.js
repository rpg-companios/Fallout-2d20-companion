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
// Рендерит null: только таймер и запись результата в стор + дрен ОЗ.
//
// Движок не знает правил: компонент читает настройки через общий стор,
// состояние — из слайса stateExtensions, дрен ОЗ — через контекст
// (setCurrentHealth — родовой счётчик персонажа).

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import useCharacterStore from '../../../src/store/characterStore';
import useAppSettingsStore from '../../../src/store/appSettingsStore';
import { useCharacter } from '../../../components/CharacterContext';
import { advanceRealMinutes } from './survival';

const TICK_INTERVAL_MS = 30_000;
const MAX_REAL_MINUTES_PER_TICK = 5;

const SurvivalClock = () => {
  const { currentHealth, setCurrentHealth } = useCharacter();
  const healthRef = useRef(currentHealth);
  healthRef.current = currentHealth;
  const setHealthRef = useRef(setCurrentHealth);
  setHealthRef.current = setCurrentHealth;

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

      if (result.hpLost > 0) {
        const hp = healthRef.current;
        if (hp != null) {
          setHealthRef.current(Math.max(0, hp - result.hpLost));
        }
      }
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
