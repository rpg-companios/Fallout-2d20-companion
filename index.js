import 'expo-font';
import { registerRootComponent } from 'expo';
import React from 'react';
import { View, Text } from 'react-native';

import { setupRichText } from './modules/fallout/screens/WeaponsAndArmorScreen/textUtils';
import { debugLog } from './src/debug/falloutDebug';

// Страховка веб-загрузчика шрифтов (452): в expo-font (FontLoader.web.js #22954)
// синхронный try/catch не перехватывает асинхронный таймаут fontfaceobserver,
// хотя @font-face уже вставлен в <head>. Гарантируем, что промис не уронит старт.
const webFontLoader = globalThis?.expo?.modules?.ExpoFontLoader;
if (webFontLoader && typeof webFontLoader.loadAsync === 'function' && !webFontLoader.__safeWrapped) {
  const rawLoadAsync = webFontLoader.loadAsync.bind(webFontLoader);
  webFontLoader.loadAsync = (fontFamilyName, resource) => {
    try {
      const result = rawLoadAsync(fontFamilyName, resource);
      if (result && typeof result.catch === 'function') {
        return result.catch((err) => {
          debugLog('font.web.timeoutSwallowed', {
            fontFamilyName,
            message: err?.message || String(err),
          });
        });
      }
      return result;
    } catch {
      return Promise.resolve();
    }
  };
  webFontLoader.__safeWrapped = true;
}

// Глобально: любой <Text> рендерит токен {/CD} как картинку кубика (assets/CD.png).
setupRichText();

import App from './App';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    debugLog('app.crash', { error, info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 20 }}>
          <Text style={{ color: '#ff4444', fontSize: 16, marginBottom: 10 }}>App Error</Text>
          <Text style={{ color: '#ffffff', fontSize: 12 }}>{String(this.state.error)}</Text>
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
