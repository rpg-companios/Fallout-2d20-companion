import { registerRootComponent } from 'expo';
import React from 'react';
import { View, Text } from 'react-native';

import { setupRichText } from './modules/fallout/screens/WeaponsAndArmorScreen/textUtils';
import { debugLog } from './src/debug/falloutDebug';
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
  window.addEventListener('load', () => {
    const currentWorkerUrl = `${window.location.origin}/service-worker.js`;
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.scope === `${window.location.origin}/`
            && registration.active?.scriptURL !== currentWorkerUrl)
          .map((registration) => registration.unregister())
      ))
      .then(() => navigator.serviceWorker.register('/service-worker.js'))
      .catch((error) => {
        debugLog('serviceWorker.registrationFailed', { error });
      });
  });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(AppWithBoundary);
