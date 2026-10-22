import { registerRootComponent } from 'expo';
import React from 'react';
import { ScrollView, View, Text } from 'react-native';

import { debugLog } from './src/engine/debug/runtimeTrace.js';
import App from './App';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ componentStack: info?.componentStack ?? null });
    debugLog('app.crash', { error, info });
  }
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
