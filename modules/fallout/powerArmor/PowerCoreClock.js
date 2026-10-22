import { useEffect } from 'react';
import useCharacterStore from 'engine:src/store/characterStore';

const TICK_INTERVAL_MS = 1000;

/** Fallout power-core lifecycle attached only while this setting is active. */
const PowerCoreClock = () => {
  useEffect(() => {
    const interval = setInterval(() => {
      useCharacterStore.getState().getSettingAction('powerArmor', 'tickPowerArmorCore')(TICK_INTERVAL_MS);
    }, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
};

export default PowerCoreClock;
