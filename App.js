import { Appearance } from 'react-native';

if (Appearance.removeChangeListener === undefined) {
  Appearance.removeChangeListener = () => {};
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
// Шаг 8б (патч 242): автосейв — модуль src/saves/characterSaves.js (zustand-subscribe).
import { startCharacterAutosave } from './src/saves/characterSaves';
import AlertHost from './components/alerts/AlertHost';
import { showRawAlert } from './components/alerts/alertService';
// Предохранитель вокруг кода сеттинга: падение экрана пакета не должно
// превращать всё приложение в App Error.
import SettingRuntimeBoundary from './components/SettingRuntimeBoundary';
// Окно «Что нового» (321; 335 — один раз на релиз, без галочки):
// /version.json + описание релиза (логика — src/utils/appVersion.js).
import UpdateNoticeModal from './components/UpdateNotice/UpdateNoticeModal';
// Окно «Доступна новая версия» (2026-10-22): app-release.json движка —
// проверка обновлений для APK и PWA (логика — src/utils/appUpdates.js).
import AppUpdateModal from './components/UpdateNotice/AppUpdateModal';
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
import { SETTING_THEME_DEFAULTS } from './src/engine/settings/settingScreens';
import useSettingPackStore, {
  selectActiveSettingId,
  selectActivationGuard,
  selectActiveSettingRuntime,
  selectSettingStoreHydrated,
} from './src/store/settingPackStore';
import useSettingUpdateStore, { selectSettingUpdatesHydrated } from './src/store/settingUpdateStore';
import { startSettingUpdateBootstrap } from './src/utils/settingUpdates';
import useAppUpdateStore, { selectAppUpdatesHydrated } from './src/store/appUpdateStore';
import { startAppUpdateBootstrap } from './src/utils/appUpdates';
import { checkForOtaUpdate } from './src/utils/otaUpdates';

const Tab = createMaterialTopTabNavigator();
// Каноническое название приложения (Google OAuth branding, PWA, заголовок вкладки).
// Единый бренд — Positronium (движок-менеджер персонажей для настольных RPG).
const APP_BRAND = 'Positronium';
// Движок владеет только своими экранами: главный и слоты сеттинга.
// Имена экранов сеттинга — `SettingScreen1…7`, их выдаёт settingScreens.js;
// App.js не знает ни Fallout, ни D&D.
const TAB_ROUTES = {
  HOME: 'HomeTab',
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
  const appUpdatesHydrated = useAppUpdateStore(selectAppUpdatesHydrated);
  const activateSetting = useSettingPackStore((state) => state.selectSetting);
  const activationGuard = useSettingPackStore(selectActivationGuard);
  const moduleTabsActive = Boolean(activeRuntime);

  /**
   * Сбой рендера внутри сеттинга: выключаем пакет и оставляем движку рабочее
   * состояние. Никаких «сбросить данные» — activeId сбрасывается сам, поэтому
   * следующий запуск чист.
   */
  const handleSettingRuntimeCrash = useCallback(({ error, info }) => {
    const state = useSettingPackStore.getState();
    const failedId = state.activeId;
    const failedName = state.installed.find((item) => item.id === failedId)?.name ?? failedId ?? '';
    debugLog('setting.runtime.crash', {
      settingId: failedId,
      message: error?.message ?? String(error),
      stack: typeof error?.stack === 'string' ? error.stack.slice(0, 4000) : null,
      componentStack: typeof info?.componentStack === 'string' ? info.componentStack.slice(0, 4000) : null,
    });
    state.disableBrokenSetting({ reason: error?.message || String(error) }).catch(() => {});
    // Диалог короткий, но с диагнозом: без него в релизе не остаётся следа,
    // какой компонент пакета упал.
    const component = String(info?.componentStack ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at ')) ?? '';
    const details = [
      String(tApp('settingCrash.details')).replace('{message}', error?.message ?? String(error)),
      component ? String(tApp('settingCrash.component')).replace('{component}', component) : '',
    ].filter(Boolean).join('\n');
    showRawAlert({
      title: tApp('settingCrash.title'),
      message: `${String(tApp('settingCrash.message')).replace('{name}', failedName)}\n\n${details}`,
    }).catch(() => {});
  }, []);

  // Стабильные обёртки: Tab.Screen не должен пересоздавать компоненты на каждом рендере.
  const settingScreens = useMemo(() => (activeRuntime?.screens ?? []).map((screen) => {
    const RuntimeComponent = screen.component;
    const Guarded = (props) => (
      <SettingRuntimeBoundary onError={handleSettingRuntimeCrash}>
        <RuntimeComponent {...props} />
      </SettingRuntimeBoundary>
    );
    Guarded.displayName = `SettingScreen(${screen.id})`;
    return { ...screen, component: Guarded };
  }), [activeRuntime, handleSettingRuntimeCrash]);

  // Оформление рамки задаёт сеттинг; движок подставляет своё, если пакет молчит.
  const tabTheme = activeRuntime?.theme?.tabBar ?? SETTING_THEME_DEFAULTS.tabBar;

  const activeGlobalComponents = useMemo(
    () => Object.entries(activeRuntime?.globalComponents ?? {}).map(([id, RuntimeComponent]) => {
      const Guarded = () => (
        <SettingRuntimeBoundary onError={handleSettingRuntimeCrash}>
          <RuntimeComponent />
        </SettingRuntimeBoundary>
      );
      Guarded.displayName = `SettingGlobal(${id})`;
      return [id, Guarded];
    }),
    [activeRuntime, handleSettingRuntimeCrash],
  );

  // Restore a persisted package before character state/database bootstrap, so
  // setting-owned save extensions register before saved characters are read.
  useEffect(() => {
    if (!settingStoreHydrated) return undefined;
    if (activeRuntime) {
      setSettingBootstrapped(true);
      return undefined;
    }
    if (!activeSettingId) {
      // Нет активного сеттинга — забываем осиротевший guard, иначе он
      // заблокирует следующую осознанную активацию.
      if (activationGuard) useSettingPackStore.getState().confirmActivation();
      setSettingBootstrapped(true);
      return undefined;
    }
    if (activationGuard) {
      // Прошлый запуск активировал пакет, но так и не подтвердил живой рендер
      // (падение или принудительное закрытие сразу после активации). Повторная
      // автозагрузка рискует повторить падение до бесконечности — стартуем без
      // сеттинга и сообщаем об этом.
      debugLog('setting.runtime.guard.blocked', { settingId: activationGuard.id });
      useSettingPackStore.getState()
        .disableBrokenSetting({ reason: 'previous activation was not confirmed' })
        .catch(() => {})
        .finally(() => setSettingBootstrapped(true));
      showRawAlert({
        title: tApp('settingCrash.title'),
        message: tApp('settingCrash.recovered'),
      }).catch(() => {});
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
  }, [activateSetting, activationGuard, activeRuntime, activeSettingId, settingStoreHydrated]);

  // Подтверждаем активацию только когда пакет отрисовался без падений:
  // после этого его можно смело поднимать автоматически при следующем запуске.
  useEffect(() => {
    if (!activeRuntime || !settingBootstrapped) return undefined;
    const timer = setTimeout(() => {
      const state = useSettingPackStore.getState();
      if (state.activeRuntime === activeRuntime) state.confirmActivation();
    }, 2500);
    return () => clearTimeout(timer);
  }, [activeRuntime, settingBootstrapped]);

  // OTA-обновление бандла: качаем в фоне и спрашиваем, перезапуститься ли.
  // Молчаливых обновлений больше нет (слово владельца 2026-10-22).
  useEffect(() => {
    if (!settingBootstrapped || !dbReady || !characterStoreReady) return undefined;
    let cancelled = false;
    checkForOtaUpdate()
      .then((result) => {
        if (!cancelled) debugLog('ota.update.checked', result);
      })
      .catch((error) => {
        debugLog('ota.update.failed', { message: error?.message ?? String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [characterStoreReady, dbReady, settingBootstrapped]);

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

  // Обновление самого приложения (2026-10-22): раз в 6 часов смотрим
  // app-release.json движка; окно покажет AppUpdateModal. Проверка не
  // блокирует запуск и молчит при любой сетевой неудаче.
  useEffect(() => {
    if (!settingBootstrapped || !appUpdatesHydrated) return undefined;
    let cancelled = false;
    startAppUpdateBootstrap({ hydrated: appUpdatesHydrated })
      .then((plan) => {
        if (!cancelled && plan?.status === 'available') {
          debugLog('app.update.bootstrap', { version: plan.version });
        }
      })
      .catch((error) => {
        debugLog('app.update.bootstrap.failed', { message: error?.message ?? String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [appUpdatesHydrated, settingBootstrapped]);

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
                        const settingScreen = settingScreens.find(
                          (screen) => screen.route === route.name,
                        );
                        const iconBase = route.name === TAB_ROUTES.HOME
                          ? 'people'
                          : (settingScreen?.icon || 'ellipse');
                        const iconName = focused ? iconBase : `${iconBase}-outline`;
                        return <Ionicons name={iconName} size={16} color={color} />;
                      },
                      tabBarStyle: {
                        backgroundColor: tabTheme.background,
                        borderTopColor: '#5a5a5a',
                      },
                      tabBarActiveTintColor: tabTheme.active,
                      tabBarInactiveTintColor: tabTheme.inactive,
                      tabBarShowIcon: true,
                      tabBarIndicatorStyle: { backgroundColor: tabTheme.active, height: 2 },
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
                    {moduleTabsActive ? settingScreens.map((screen) => (
                      <Tab.Screen
                        key={screen.id}
                        name={screen.route}
                        component={screen.component}
                        options={{
                          tabBarLabel: ({ color }) => (
                            <Text style={{ color, fontSize: 11, textAlign: 'center' }}>
                              {screen.titleKey ? tApp(screen.titleKey) : screen.title}
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
          <AppUpdateModal />
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
