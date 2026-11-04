/**
 * Патч 518: «у мастера отдельная карточка» общего хранилища.
 * Стили берутся из карточек сетки (правило docs/ui-modals-rules.md соседних
 * окон и общий каркас карточек LootTradeScreen.styles.js).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { tInventory } from '../screens/InventoryScreen/logic/inventoryI18n';
import cardStyles from '../../styles/LootTradeScreen.styles';

const StorageCardCell = ({ itemCount = 0, onOpen }) => {
  useLocale();
  return (
    <TouchableOpacity
      testID="storage-card-cell"
      style={cardStyles.cardCell}
      onPress={onOpen}
      activeOpacity={0.82}
    >
      <View style={[cardStyles.cardHero, localStyles.hero]}>
        <MaterialCommunityIcons name="warehouse" size={34} color="#a4cb77" />
      </View>
      <View style={cardStyles.cardBody}>
        <Text style={cardStyles.cardTitle} numberOfLines={2}>
          {tInventory('screen.storage.title')}
        </Text>
        <Text style={cardStyles.cardDesc} numberOfLines={2}>
          {tInventory('screen.storage.gmNoActions')}
        </Text>
        <Text style={cardStyles.cardMeta} numberOfLines={1}>
          {formatLootTrade(tLootTrade('card.itemsCount'), { count: itemCount })}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const localStyles = StyleSheet.create({
  hero: { backgroundColor: '#1d2f20' },
});

export default StorageCardCell;
