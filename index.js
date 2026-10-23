import { registerRootComponent } from 'expo';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { debugLog } from './src/engine/debug/runtimeTrace.js';
import { showRawAlert } from './components/alerts/alertService';
import { tApp } from './i18n/appI18n';
import useSettingPackStore from './src/store/settingPackStore';
import App from './App';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  autoRecoveries = 0;

  componentDidCatch(error, info) {
    this.setState({ componentStack: info?.componentStack ?? null });
    debugLog('app.crash', { error, info });

    // Приложение не должно умирать из-за пакета сеттинга. Если активен
    // сеттинг, выключаем его и поднимаем движок заново; игрок увидит
    // объяснение, а не мёртвый экран. Больше двух автоматических попыток
    // за сессию не делаем: иначе неисправный движок зациклит перезапуск.
    const state = useSettingPackStore.getState();
    if (!state.activeId || this.autoRecoveries >= 2) return;
    this.autoRecoveries += 1;
    const failedName = state.installed.find((item) => item.id === state.activeId)?.name
      ?? state.activeId;
    const component = String(info?.componentStack ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at ')) ?? '';
    const message = [
      String(tApp('settingCrash.message')).replace('{name}', failedName),
      String(tApp('settingCrash.details')).replace('{message}', error?.message ?? String(error)),
      component ? String(tApp('settingCrash.component')).replace('{component}', component) : '',
    ].filter(Boolean).join('\n\n');

    Promise.resolve(state.disableBrokenSetting({ reason: error?.message || String(error) }))
      .catch(() => {})
      .then(() => {
        this.setState({ hasError: false, error: null, componentStack: null });
        showRawAlert({ title: tApp('settingCrash.title'), message }).catch(() => {});
      });
  }
  // Последний рубеж: даже если упал сам App, игрок не должен оставаться
  // с мёртвым экраном и советом «сбросить данные». Отключаем активный
  // сеттинг и поднимаем приложение заново.
  handleDisableSetting = async () => {
    try {
      await useSettingPackStore.getState().disableBrokenSetting({ reason: String(this.state.error) });
    } catch {
      // Стор мог не подняться — тогда просто показываем приложение заново.
    }
    this.setState({ hasError: false, error: null, componentStack: null });
  };
  render() {
    if (this.state.hasError) {
      const { error, componentStack } = this.state;
      // Стек и дерево компонентов — единственный след сбоя в release-сборке:
      // без них экран сообщает только тип ошибки и починить причину нельзя.
      const details = [String(error), error?.stack ?? '', componentStack ?? '']
        .filter(Boolean)
        .join('\n\n');
      return (
        <View style={{ flex: 1, backgroundColor: '#1a1a1a', padding: 20 }}>
          <Text style={{ color: '#ff4444', fontSize: 16, marginBottom: 10 }}>App Error</Text>
          {useSettingPackStore.getState().activeId ? (
            <TouchableOpacity
              onPress={this.handleDisableSetting}
              style={{ backgroundColor: '#c9b458', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 }}
            >
              <Text style={{ color: '#1a1a1a', fontSize: 14, fontWeight: '700' }}>
                {tApp('settingCrash.disable')}
              </Text>
            </TouchableOpacity>
          ) : null}
          <ScrollView>
            <Text selectable style={{ color: '#ffffff', fontSize: 11, fontFamily: 'monospace' }}>
              {details}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const AppWithBoundary = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // Регистрируем сразу, не дожидаясь события load. Раньше ожидание означало,
  // что первый визит проходит вообще без воркера: оболочка не попадала в кэш,
  // и следующий холодный старт установленного PWA при слабой сети упирался
  // в пустой кэш (белый экран).
  const currentWorkerUrl = `${window.location.origin}/service-worker.js`;
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(
      registrations
        .filter((registration) => registration.scope === `${window.location.origin}/`
          && registration.active?.scriptURL !== currentWorkerUrl)
        .map((registration) => registration.unregister())
    ))
    .then(() => navigator.serviceWorker.register('/service-worker.js'))
    .then((registration) => {
      debugLog('serviceWorker.registered', { scope: registration?.scope });
      // Обновление воркера при возврате в приложение: установленное PWA живёт
      // неделями без перезагрузки вкладки, иначе новая версия не доедет.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    })
    .catch((error) => {
      debugLog('serviceWorker.registrationFailed', { error: error?.message || String(error) });
    });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(AppWithBoundary);
