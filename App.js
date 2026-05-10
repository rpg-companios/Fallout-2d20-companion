import { Appearance } from 'react-native';

if (Appearance.removeChangeListener === undefined) {
  Appearance.removeChangeListener = () => {};
}

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, View, StyleSheet, ImageBackground, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { CharacterProvider } from './components/CharacterContext';
import { initDatabase } from './db/Database';
import { seedDatabase } from './db/seed';
import { useLocale } from './i18n/locale';
import { tApp } from './i18n/appI18n';

import HomeScreen from './components/screens/HomeScreen/HomeScreen';
import CharacterScreen from './components/screens/CharacterScreen/CharacterScreen';
import EquipmentScreen from './components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen';
import InventoryScreen from './components/screens/InventoryScreen/InventoryScreen';
import PerksAndTraitsScreen from './components/screens/PerksAndTraitsScreen/PerksAndTraitsScreen';

const Tab = createMaterialTopTabNavigator();
const TAB_ROUTES = {
  HOME: 'HomeTab',
  CHARACTER: 'CharacterTab',
  EQUIPMENT: 'EquipmentTab',
  INVENTORY: 'InventoryTab',
  PERKS: 'PerksTab',
};

function App() {
  const [dbReady, setDbReady] = useState(false);
  const locale = useLocale();

  useEffect(() => {
    async function initDb() {
      try {
        const isFirstRun = await initDatabase();
        await seedDatabase(isFirstRun);
      } catch (e) {
      } finally {
        setDbReady(true);
      }
    }
    initDb();
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' }}>
        <ActivityIndicator size="large" color="#f0e68c" />
        <Text style={{ color: '#f0e68c', marginTop: 16, fontSize: 14, letterSpacing: 1 }}>
          {tApp('loading', 'Загрузка данных...')}
        </Text>
      </View>
    );
  }

  return (
    <PaperProvider>
      <SafeAreaProvider>
        <CharacterProvider>
          <NavigationContainer key={locale}>
            <View style={{ flex: 1, backgroundColor: 'white' }}>
              <ImageBackground
                source={require('./assets/bg.png')}
                style={styles.background}
                imageStyle={{ opacity: 0.3 }}
              >
                <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                  <Tab.Navigator
                    tabBarPosition="bottom"
                    initialRouteName={TAB_ROUTES.HOME}
                    screenOptions={({ route }) => ({
                      tabBarIcon: ({ focused, color }) => {
                        let iconName;
                        if (route.name === TAB_ROUTES.HOME) {
                          iconName = focused ? 'people' : 'people-outline';
                        } else if (route.name === TAB_ROUTES.CHARACTER) {
                          iconName = focused ? 'person' : 'person-outline';
                        } else if (route.name === TAB_ROUTES.EQUIPMENT) {
                          iconName = focused ? 'shield' : 'shield-outline';
                        } else if (route.name === TAB_ROUTES.INVENTORY) {
                          iconName = focused ? 'briefcase' : 'briefcase-outline';
                        } else if (route.name === TAB_ROUTES.PERKS) {
                          iconName = focused ? 'star' : 'star-outline';
                        }
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
                          <Text style={{ color, fontSize: 11, textAlign: 'center' }}>{tApp('tabs.home', 'Менеджер')}</Text>
                        ),
                      }}
                    />
                    <Tab.Screen
                      name={TAB_ROUTES.CHARACTER}
                      component={CharacterScreen}
                      options={{
                        tabBarLabel: ({ focused, color }) => (
                          <Text style={{ color, fontSize: 11, textAlign: 'center' }}>{tApp('tabs.character', 'Персонаж')}</Text>
                        ),
                      }}
                    />
                    <Tab.Screen
                      name={TAB_ROUTES.EQUIPMENT}
                      component={EquipmentScreen}
                      options={{
                        tabBarLabel: ({ focused, color }) => (
                          <Text style={{ color, fontSize: 11, textAlign: 'center' }}>{tApp('tabs.equipment', 'Броня и оружие')}</Text>
                        ),
                      }}
                    />
                    <Tab.Screen
                      name={TAB_ROUTES.INVENTORY}
                      component={InventoryScreen}
                      options={{
                        tabBarLabel: ({ focused, color }) => (
                          <Text style={{ color, fontSize: 11, textAlign: 'center' }}>{tApp('tabs.inventory', 'Инвентарь')}</Text>
                        ),
                      }}
                    />
                    <Tab.Screen
                      name={TAB_ROUTES.PERKS}
                      component={PerksAndTraitsScreen}
                      options={{
                        tabBarLabel: ({ focused, color }) => (
                          <Text style={{ color, fontSize: 11, textAlign: 'center' }}>{tApp('tabs.perks', 'Перки')}</Text>
                        ),
                      }}
                    />
                  </Tab.Navigator>
                </SafeAreaView>
              </ImageBackground>
            </View>
          </NavigationContainer>
        </CharacterProvider>
      </SafeAreaProvider>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default App;
