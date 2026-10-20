import { Appearance } from 'react-native';

if (Appearance.removeChangeListener === undefined) {
  Appearance.removeChangeListener = () => {};
}

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
// Шаг 8б (патч 242): автосейв — модуль src/saves/characterSaves.js (zustand-subscribe).
import { startCharacterAutosave } from './src/saves/characterSaves';
import AlertHost from './components/alerts/AlertHost';
// Окно «Что нового» (321; 335 — один раз на релиз, без галочки):
// /version.json + описание релиза (логика — src/utils/appVersion.js).
import UpdateNoticeModal from './components/UpdateNotice/UpdateNoticeModal';
import { initDatabase } from './db/Database';
import { seedDatabase } from './db/seed';
import { useLocale, useModuleLocale } from './i18n/locale';
import { tApp } from './i18n/appI18n';
import useCharacterStore from './src/store/characterStore';
import { debugLog } from './src/engine/debug/runtimeTrace.js';

import HomeScreen from './components/screens/HomeScreen/HomeScreen';
import PositroniumBootScreen from './components/boot/PositroniumBootScreen';
import useAppSettingsStore, {
  selectBootScreenEnabled,
  selectSettingsHydrated,
} from './src/store/appSettingsStore';
import useSettingPackStore, {
  selectActiveSettingId,
  selectActiveSettingRuntime,
  selectSettingStoreHydrated,
} from './src/store/settingPackStore';
import useSettingUpdateStore, { selectSettingUpdatesHydrated } from './src/store/settingUpdateStore';
import { startSettingUpdateBootstrap } from './src/utils/settingUpdates';

const Tab = createMaterialTopTabNavigator();
// Каноническое название приложения (Google OAuth branding, PWA, заголовок вкладки).
// Единый бренд — Positronium (движок-менеджер персонажей для настольных RPG).
const APP_BRAND = 'Positronium';
const TAB_ROUTES = {
  HOME: 'HomeTab',
  CHARACTER: 'CharacterTab',
  EQUIPMENT: 'EquipmentTab',
  INVENTORY: 'InventoryTab',
  PERKS: 'PerksTab',
};

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [characterStoreReady, setCharacterStoreReady] = useState(false);
  const [settingBootstrapped, setSettingBootstrapped] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  // Решение фиксируется один раз после гидратации: переключение настройки
  // применяется со следующего запуска и не открывает заставку поверх приложения.
  const [bootEnabledForLaunch, setBootEnabledForLaunch] = useState(null);
  const bootScreenEnabled = useAppSettingsStore(selectBootScreenEnabled);
  const settingsHydrated = useAppSettingsStore(selectSettingsHydrated);
  const locale = useLocale();
  useModuleLocale();
  const activeSettingId = useSettingPackStore(selectActiveSettingId);
  const activeRuntime = useSettingPackStore(selectActiveSettingRuntime);
  const settingStoreHydrated = useSettingPackStore(selectSettingStoreHydrated);
  const settingUpdatesHydrated = useSettingUpdateStore(selectSettingUpdatesHydrated);
  const activateSetting = useSettingPackStore((state) => state.selectSetting);
  const moduleTabsActive = Boolean(activeRuntime);
  const activeGlobalComponents = Object.entries(activeRuntime?.globalComponents ?? {});

  // Restore a persisted package before character state/database bootstrap, so
  // setting-owned save extensions register before saved characters are read.
  useEffect(() => {
    if (!settingStoreHydrated) return undefined;
    if (!activeSettingId || activeRuntime) {
      setSettingBootstrapped(true);
      return undefined;
    }
    let cancelled = false;
    activateSetting(activeSettingId)
      .then(() => {
        if (!cancelled) setSettingBootstrapped(true);
      })
      .catch((error) => {
        if (!cancelled) {
          debugLog('setting.runtime.restore.failed', {
            settingId: activeSettingId,
            message: error?.message || String(error),
          });
          setSettingBootstrapped(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activateSetting, activeRuntime, activeSettingId, settingStoreHydrated]);

  // Фолбэк: гарантируем имя приложения в заголовке вкладки браузера на вебе,
  // даже если версия @react-navigation/native не поддерживает documentTitle.
  // Заодно проставляем lang документа: включает браузерные словари переносов
  // (CSS hyphens: auto в стилях текста) для активной локали приложения.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = APP_BRAND;
      document.documentElement.lang = locale;
    }
  }, [locale, moduleTabsActive]);

  useEffect(() => {
    if (settingsHydrated && bootEnabledForLaunch === null) {
      setBootEnabledForLaunch(bootScreenEnabled);
    }
  }, [bootEnabledForLaunch, bootScreenEnabled, settingsHydrated]);

  useEffect(() => {
    if (!settingBootstrapped) return undefined;
    let cancelled = false;
    const hydrateCharacterStore = async () => {
      try {
        await useCharacterStore.persist.rehydrate();
        useCharacterStore.getState().initializeCharacterCreationDefaults?.();
        if (!cancelled) setCharacterStoreReady(true);
      } catch (error) {
        // character-store is a rebuildable cache; SQLite/WebAdapter remains
        // the canonical source for saved characters.
        debugLog('characterStore.rehydrate.failed', {
          message: error?.message || String(error),
        });
        try {
          await useCharacterStore.persist.clearStorage();
          useCharacterStore.getState().resetCharacterStore();
          debugLog('characterStore.rehydrate.recovered', {});
        } catch (recoveryError) {
          debugLog('characterStore.rehydrate.recoveryFailed', {
            message: recoveryError?.message || String(recoveryError),
          });
        } finally {
          if (!cancelled) setCharacterStoreReady(true);
        }
      }
    };

    hydrateCharacterStore();
    return () => {
      cancelled = true;
    };
  }, [settingBootstrapped]);

  // Шаг 8б (патч 242): автосейв активен с готовностью базы и стора;
  // подписка живёт в модуле сейвов (zustand-subscribe, debounce 500 мс).
  useEffect(() => {
    if (!dbReady || !characterStoreReady) return undefined;
    return startCharacterAutosave();
  }, [dbReady, characterStoreReady]);

  // Обновление сеттинга по сети (слово владельца 2026-10-20): при запуске
  // сеттинг смотрит в свой репозиторий и сам ставит вышедший релиз. Провал
  // проверки не мешает запуску — игра идёт на установленной версии.
  useEffect(() => {
    if (!settingBootstrapped || !dbReady || !characterStoreReady || !settingUpdatesHydrated) {
      return undefined;
    }
    let cancelled = false;
    startSettingUpdateBootstrap({ hydrated: settingStoreHydrated })
      .then((results) => {
        if (!cancelled && results.length > 0) {
          debugLog('setting.update.bootstrap', { results });
        }
      })
      .catch((error) => {
        debugLog('setting.update.bootstrap.failed', { message: error?.message ?? String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [
    characterStoreReady,
    dbReady,
    settingBootstrapped,
    settingStoreHydrated,
    settingUpdatesHydrated,
  ]);

  useEffect(() => {
    if (!settingBootstrapped) return undefined;
    let cancelled = false;
    async function initDb() {
      try {
        if (!cancelled) setBootProgress(0.2);
        const isFirstRun = await initDatabase();
        if (!cancelled) setBootProgress(0.62);
        await seedDatabase(isFirstRun);
        if (!cancelled) setBootProgress(1);
      } catch (e) {
        if (!cancelled) setBootProgress(1);
      } finally {
        if (!cancelled) setDbReady(true);
      }
    }
    initDb();
    return () => {
      cancelled = true;
    };
  }, [settingBootstrapped]);

  if (settingBootstrapped && bootEnabledForLaunch === true && !bootDone) {
    return (
      <PositroniumBootScreen
        ready={dbReady}
        progress={bootProgress}
        onFinished={() => setBootDone(true)}
      />
    );
  }

  if (!settingBootstrapped || bootEnabledForLaunch === null || !dbReady || !characterStoreReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' }}>
        <ActivityIndicator size="large" color="#f0e68c" />
        <Text style={{ color: '#f0e68c', marginTop: 16, fontSize: 14, letterSpacing: 1 }}>
          {tApp('loading')}
        </Text>
      </View>
    );
  }

  return (
    <PaperProvider>
      <SafeAreaProvider>
          <NavigationContainer
            key={`${locale}:${activeSettingId ?? 'empty'}`}
            // Единый бренд приложения в заголовке вкладки браузера (Google-брендинг):
            // react-navigation иначе подставляет имя маршрута («HomeTab» и т.п.).
            documentTitle={{ formatter: () => APP_BRAND }}
          >
            <View style={{ flex: 1, backgroundColor: 'white' }}>
              <View style={styles.background}>
                <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                  <Tab.Navigator
                    tabBarPosition="bottom"
                    initialRouteName={TAB_ROUTES.HOME}
                    screenOptions={({ route }) => ({
                      tabBarIcon: ({ focused, color }) => {
                        const settingScreen = activeRuntime?.screens.find(
                          (screen) => screen.route === route.name,
                        );
                        const iconBase = route.name === TAB_ROUTES.HOME
                          ? 'people'
                          : (settingScreen?.icon || 'ellipse');
                        const iconName = focused ? iconBase : `${iconBase}-outline`;
                        return <Ionicons name={iconName} size={16} color={color} />;
                      },
                      tabBarStyle: {
                        backgroundColor: '#1a1a1a',
                        borderTopColor: '#5a5a5a',
                      },
                      tabBarActiveTintColor: '#f0e68c',
                      tabBarInactiveTintColor: 'gray',
                      tabBarShowIcon: true,
                      tabBarIndicatorStyle: { backgroundColor: '#f0e68c', height: 2 },
                      swipeEnabled: true,
                      animationEnabled: true,
                      style: { backgroundColor: 'transparent' },
                    })}
                  >
                    <Tab.Screen
                      name={TAB_ROUTES.HOME}
                      component={HomeScreen}
                      options={{
                        tabBarLabel: ({ focused, color }) => (
                          <Text style={{ color, fontSize: 11, textAlign: 'center' }}>{tApp('tabs.home')}</Text>
                        ),
                      }}
                    />
                    {moduleTabsActive ? activeRuntime.screens.map((screen) => (
                      <Tab.Screen
                        key={screen.id}
                        name={screen.route}
                        component={screen.component}
                        options={{
                          tabBarLabel: ({ color }) => (
                            <Text style={{ color, fontSize: 11, textAlign: 'center' }}>
                              {tApp(screen.labelKey)}
                            </Text>
                          ),
                        }}
                      />
                    )) : null}
                  </Tab.Navigator>
                </SafeAreaView>
              </View>
            </View>
          </NavigationContainer>
          <AlertHost />
          <UpdateNoticeModal />
          {activeGlobalComponents.map(([id, Component]) => (
            Component ? <Component key={id} /> : null
          ))}
      </SafeAreaProvider>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default App;
