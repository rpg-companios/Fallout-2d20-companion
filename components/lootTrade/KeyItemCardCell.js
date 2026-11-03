/**
 * Патч 511: карточка ключевой записи на экране «Добыча / Торговля».
 *
 * Владелец явно попросил, чтобы ключ выглядел как карточка контейнера /
 * торговца / терминала, а не как отдельный пункт в шапке. Поэтому используется
 * та же сетка и те же стили (styles/LootTradeScreen.styles.js).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../i18n/locale';
import { tLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import cardStyles from '../../styles/LootTradeScreen.styles';
import { formatRoomCodeForDisplay } from '../../src/room/roomCode';

const KeyItemCardCell = ({ keyItem, roomLabel = '', onEdit, onIssue }) => {
  useLocale();
  return (
    <TouchableOpacity
      testID={`key-item-card-${keyItem.id}`}
      style={cardStyles.cardCell}
      onPress={onEdit}
      activeOpacity={0.8}
    >
      <View style={[cardStyles.cardHero, styles.cardHeroKey]}>
        <MaterialCommunityIcons name="key-variant" size={34} color="#f0e68c" />
      </View>
      <View style={cardStyles.cardBody}>
        <Text style={cardStyles.cardTitle} numberOfLines={2}>{keyItem.name}</Text>
        {Boolean(keyItem.description) && (
          <Text style={cardStyles.cardDesc} numberOfLines={2}>{keyItem.description}</Text>
        )}
        {Boolean(roomLabel) && (
          <Text style={cardStyles.cardMeta} numberOfLines={1}>{roomLabel}</Text>
        )}
        {!roomLabel && Boolean(keyItem.roomCode) && (
          <Text style={cardStyles.cardMeta} numberOfLines={1}>
            {formatRoomCodeForDisplay(keyItem.roomCode)}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          testID={`key-item-edit-${keyItem.id}`}
          style={cardStyles.cardActionButton}
          onPress={(event) => { event?.stopPropagation?.(); onEdit?.(); }}
          accessibilityLabel={tLootTrade('keyItems.edit')}
        >
          <MaterialCommunityIcons name="pencil" size={18} color="#555555" />
        </TouchableOpacity>
        <TouchableOpacity
          testID={`key-item-issue-${keyItem.id}`}
          style={[cardStyles.cardActionButton, styles.issueButton]}
          onPress={(event) => { event?.stopPropagation?.(); onIssue?.(); }}
          accessibilityLabel={tLootTrade('keyItems.issue')}
        >
          <MaterialCommunityIcons name="send" size={18} color="#555555" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardHeroKey: { backgroundColor: '#2d2a1e' },
  actions: { position: 'absolute', left: 5, right: 5, bottom: 5, zIndex: 10 },
  issueButton: { left: 0, right: undefined },
});

export default KeyItemCardCell;
