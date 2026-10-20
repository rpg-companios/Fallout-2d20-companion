import ruApp from './ru-RU/App.json';
import enApp from './en-EN/App.json';
import { getActiveSettingRuntime } from '../src/engine/settings/activeSettingRuntime';
import { getCurrentLocale, getCurrentModuleLocale } from './locale';
import { deepMerge } from './mergeDicts';

const ENGINE_DICTIONARIES = {
  'ru-RU': ruApp,
  'en-EN': enApp,
};

// Engine UI stays in the engine locale; an active package contributes only
// its own app-level labels in the package's independent content locale.
const getAppDictionary = () => {
  const engineLocale = getCurrentLocale();
  const moduleLocale = getCurrentModuleLocale();
  const engineDictionary = ENGINE_DICTIONARIES[engineLocale] ?? {};
  const settingDictionary = getActiveSettingRuntime()?.setting?.names?.[moduleLocale]?.app ?? {};
  return deepMerge(engineDictionary, settingDictionary);
};

export const tApp = (path) => {
  // ПРАВИЛО (владелец): никаких фолбэков и хардкода — ключ обязан быть в словаре;
  // промах ключа — дефект данных, видимый маркер — сам путь.
  let current = getAppDictionary();
  for (const part of path.split('.')) {
    current = current?.[part];
    if (current === undefined) return path;
  }
  return current;
};
