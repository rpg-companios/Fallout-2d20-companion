// Хуки выживания для экранов Fallout. С патча 209 хранилище — слайс
// stateExtensions зустанд-стора: хук подписан селектором напрямую на стор
// (как экраны на items/effects), мутации — только действия стора. Движок
// хранит поле как непрозрачный словарь и правил не знает.
//
// С этапа 5 (патч 210) состояние видимо только при включённой настройке
// survivalModeEnabled (док §10): выключено — хук возвращает null, шкалы,
// кнопки и строки эффектов скрываются сами, состояние в сейве остаётся.

import useCharacterStore from '../../../src/store/characterStore';
import useAppSettingsStore, { selectSurvivalModeEnabled } from '../../../src/store/appSettingsStore';
import { useCharacter } from '../../../components/CharacterContext';
import { sleepSurvival } from './operations';

/** Текущее состояние выживания (null: выключено настройкой, робот/киборг, не создано). */
export const useSurvivalState = () => {
  const enabled = useAppSettingsStore(selectSurvivalModeEnabled);
  const survival = useCharacterStore((s) => s.stateExtensions?.survival ?? null);
  return enabled ? survival : null;
};

/** Операции выживания: смена состояния поля (действие стора) и сон. */
export const useSurvivalActions = () => {
  const ctx = useCharacter();
  return {
    setSurvival: (state) => useCharacterStore.getState().setStateExtension('survival', state),
    sleepSurvival: (options) => sleepSurvival(ctx, options),
  };
};
