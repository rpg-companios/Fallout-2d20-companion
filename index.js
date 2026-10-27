import 'expo-font';
import * as Font from 'expo-font';
import { registerRootComponent } from 'expo';
import React from 'react';
import { Platform, View, Text } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';

import { setupRichText } from './modules/fallout/screens/WeaponsAndArmorScreen/textUtils';
import { debugLog } from './src/debug/falloutDebug';

// Высокоприоритетная предзагрузка шрифта в <head> (453): браузер начинает
// скачивать .ttf сразу с приоритетом high, не дожидаясь первого layout текста.
const preloadedFontUris = new Set();
const injectHighPriorityFontPreload = (uri) => {
  if (typeof document === 'undefined' || !document.head || typeof uri !== 'string' || !uri) return;
  if (preloadedFontUris.has(uri)) return;
  preloadedFontUris.add(uri);
  try {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/ttf';
    link.crossOrigin = 'anonymous';
    link.setAttribute('fetchpriority', 'high');
    link.href = uri;
    document.head.appendChild(link);
  } catch {
    // Среда без полноценного DOM — пропускаем без сбоя.
  }
};

// Страховка веб-загрузчика шрифтов (452/453):
// 1) перехватываем асинхронный таймаут fontfaceobserver (#22954 в expo-font);
// 2) поднимаем сетевой приоритет .ttf через <link rel="preload" fetchpriority="high">
//    и задаём font-display: swap, чтобы глифы рисовались сразу по готовности.
const webFontLoader = globalThis?.expo?.modules?.ExpoFontLoader;
if (webFontLoader && typeof webFontLoader.loadAsync === 'function' && !webFontLoader.__safeWrapped) {
  const rawLoadAsync = webFontLoader.loadAsync.bind(webFontLoader);
  webFontLoader.loadAsync = (fontFamilyName, resource) => {
    try {
      const normalizedResource =
        resource && typeof resource === 'object'
          ? {
              ...resource,
              display:
                resource.display && resource.display !== 'auto'
                  ? resource.display
                  : 'swap',
            }
          : resource;
      if (normalizedResource && typeof normalizedResource === 'object' && normalizedResource.uri) {
        injectHighPriorityFontPreload(normalizedResource.uri);
      }
      const result = rawLoadAsync(fontFamilyName, normalizedResource);
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

// Ранняя предзагрузка основных иконочных шрифтов UI (453): запускаем скачивание
// и вставку @font-face на T=0 мс (параллельно с инициализацией БД и стора),
// чтобы бургер-меню, «три точки», нижние вкладки и пункты меню открывались сразу.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const priorityIconFonts = {
    ...(MaterialCommunityIcons?.font || {}),
    ...(Ionicons?.font || {}),
    ...(FontAwesome5?.font?.['FontAwesome5Free-Brand']
      ? { 'FontAwesome5Free-Brand': FontAwesome5.font['FontAwesome5Free-Brand'] }
      : {}),
  };
  if (Object.keys(priorityIconFonts).length > 0) {
    Font.loadAsync(priorityIconFonts).catch(() => {});
  }
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
