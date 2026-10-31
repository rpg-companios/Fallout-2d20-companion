import React, { useMemo } from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, StyleSheet } from 'react-native';
import HomeScreen from '../screens/HomeScreen/HomeScreen';
import LootTradeScreen from '../screens/LootTradeScreen/LootTradeScreen';
import EnvCombatScreen from '../screens/EnvCombatScreen/EnvCombatScreen';
import { tApp } from '../../i18n/appI18n';

// Отдельный навигатор пространства Мастера (navbar2):
// - полностью изолирован от вкладок листа персонажа Игрока;
// - сохраняет привычное горизонтальное перелистывание (swipeEnabled: true);
// - строится по расширяемому реестру разделов Мастера (кампании, добыча/торговля,
//   окружающая среда/бой и будущие экраны ведущего без пересборки игроцкого навигатора).
const GmTab = createMaterialTopTabNavigator();

export const GM_TAB_ROUTES = Object.freeze({
  CAMPAIGNS: 'GmCampaignsTab',
  LOOT_TRADE: 'GmLootTradeTab',
  ENV_COMBAT: 'GmEnvCombatTab',
});

export function buildGmWorkspaceSections({
  gmLootTradeLicensed = true,
  gmEnvCombatLicensed = true,
} = {}) {
  const sections = [
    {
      name: GM_TAB_ROUTES.CAMPAIGNS,
      component: HomeScreen,
      labelKey: 'tabs.gmCampaigns',
      activeIcon: 'albums',
      inactiveIcon: 'albums-outline',
    },
  ];
  if (gmLootTradeLicensed) {
    sections.push({
      name: GM_TAB_ROUTES.LOOT_TRADE,
      component: LootTradeScreen,
      labelKey: 'tabs.gmLootTrade',
      activeIcon: 'cube',
      inactiveIcon: 'cube-outline',
    });
  }
  if (gmEnvCombatLicensed) {
    sections.push({
      name: GM_TAB_ROUTES.ENV_COMBAT,
      component: EnvCombatScreen,
      labelKey: 'tabs.gmEnvCombat',
      activeIcon: 'thunderstorm',
      inactiveIcon: 'thunderstorm-outline',
    });
  }
  return sections;
}

export default function GmWorkspaceNavigator({
  gmLootTradeLicensed = true,
  gmEnvCombatLicensed = true,
  campaignsLabel,
  lootTradeLabel,
  envCombatLabel,
}) {
  const sections = useMemo(
    () => buildGmWorkspaceSections({ gmLootTradeLicensed, gmEnvCombatLicensed }),
    [gmLootTradeLicensed, gmEnvCombatLicensed],
  );

  const iconByRoute = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.name, s])),
    [sections],
  );

  const resolveSectionLabel = (section) => {
    if (section.name === GM_TAB_ROUTES.CAMPAIGNS && campaignsLabel) return campaignsLabel;
    if (section.name === GM_TAB_ROUTES.LOOT_TRADE && lootTradeLabel) return lootTradeLabel;
    if (section.name === GM_TAB_ROUTES.ENV_COMBAT && envCombatLabel) return envCombatLabel;
    return tApp(section.labelKey);
  };

  return (
    <GmTab.Navigator
      id="GmNavbar2"
      initialRouteName={GM_TAB_ROUTES.CAMPAIGNS}
      tabBarPosition="bottom"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          const meta = iconByRoute[route.name];
          const iconName = focused ? meta?.activeIcon : meta?.inactiveIcon;
          return <Ionicons name={iconName || 'grid-outline'} size={16} color={color} />;
        },
        tabBarStyle: styles.navbar2,
        tabBarActiveTintColor: '#f0e68c',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarShowIcon: true,
        tabBarIndicatorStyle: styles.indicator,
        swipeEnabled: true,
        animationEnabled: true,
        style: styles.sceneContainer,
      })}
    >
      {sections.map((section) => (
        <GmTab.Screen
          key={section.name}
          name={section.name}
          component={section.component}
          options={{
            tabBarLabel: ({ color }) => (
              <Text style={[styles.tabLabel, { color }]}>
                {resolveSectionLabel(section)}
              </Text>
            ),
          }}
        />
      ))}
    </GmTab.Navigator>
  );
}

const styles = StyleSheet.create({
  navbar2: {
    backgroundColor: '#171717',
    borderTopWidth: 1,
    borderTopColor: '#6b6335',
  },
  indicator: {
    backgroundColor: '#f0e68c',
    height: 2,
  },
  sceneContainer: {
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
});
