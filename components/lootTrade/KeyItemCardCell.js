/**
 * Патч 512: карточка ключевой записи повторяет не только сетку, но и поведение
 * `ContainerCardCell`: одна кнопка «⋮» в правом нижнем углу и такое же
 * выпадающее меню (`menuBackdrop` / `actionMenu` / `actionMenuItem`).
 *
 * Владелец: «если создаёшь модалки, то хотя бы ориентируйся на дизайн других
 * модалок, которые рядом или делают что-то похожее». Соседняя карточка —
 * главный образец, поэтому все стили берутся из `LootTradeScreen.styles.js`.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../i18n/locale';
import { tLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import cardStyles from '../../styles/LootTradeScreen.styles';
import { formatRoomCodeForDisplay } from '../../src/room/roomCode';
import useDragResponder from '../../src/ui/useDragResponder';

const MENU_WIDTH = 224;
const MENU_HEIGHT = 100;

const KeyItemCardCell = ({
  keyItem,
  roomLabel = '',
  canMoveToHub = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  onEdit,
  onIssue,
}) => {
  useLocale();
  const menuBtnRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  // Патч 549: единый механизм перетаскивания на всё приложение.
  const { panHandlers } = useDragResponder({
    onStart: (point) => onDragStart?.(point),
    onMove: (point) => onDragMove?.(point),
    // Признак движения передаётся дальше: перенос засчитывает только жест,
    // а не простое нажатие на стрелку (единое правило 549).
    onEnd: (point, _payload, meta) => onDragEnd?.(point, undefined, meta),
    enabled: Boolean(onDragStart),
  });

  const openMenu = (event) => {
    event?.stopPropagation?.();
    menuBtnRef.current?.measureInWindow((x, y, width, height) => {
      const { width: winW, height: winH } = Dimensions.get('window');
      const left = Math.max(8, Math.min(x + width - MENU_WIDTH, winW - MENU_WIDTH - 8));
      const top = y + height + MENU_HEIGHT + 8 <= winH
        ? y + height + 4
        : Math.max(8, y - MENU_HEIGHT - 4);
      setMenuPos({ top, left });
    });
  };

  const runMenuAction = (fn) => {
    setMenuPos(null);
    fn?.();
  };

  return (
    <TouchableOpacity
      testID={`key-item-card-${keyItem.id}`}
      style={cardStyles.cardCell}
      onPress={onEdit}
      activeOpacity={0.82}
    >
      {canMoveToHub && onDragStart && (
        <View testID={`key-item-drag-${keyItem.id}`} {...panHandlers} style={cardStyles.cardDragHandle}>
          <MaterialCommunityIcons name="arrow-all" size={16} color="#1f1f1f" />
        </View>
      )}
      <View style={[cardStyles.cardHero, localStyles.cardHeroKey]}>
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

      <TouchableOpacity
        ref={menuBtnRef}
        testID={`key-item-menu-${keyItem.id}`}
        style={cardStyles.cardActionButton}
        onPress={openMenu}
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
        accessibilityLabel={tLootTrade('card.openMenu')}
      >
        <MaterialCommunityIcons name="dots-vertical" size={20} color="#555555" />
      </TouchableOpacity>

      <Modal
        visible={Boolean(menuPos)}
        transparent
        animationType="none"
        onRequestClose={() => setMenuPos(null)}
      >
        <Pressable style={cardStyles.menuBackdrop} onPress={() => setMenuPos(null)}>
          {menuPos && (
            <View style={[cardStyles.actionMenu, menuPos]}>
              <TouchableOpacity
                testID={`key-item-edit-${keyItem.id}`}
                style={cardStyles.actionMenuItem}
                onPress={() => runMenuAction(onEdit)}
              >
                <MaterialCommunityIcons name="pencil-outline" size={19} color="#d4af37" />
                <Text style={cardStyles.actionMenuText}>{tLootTrade('keyItems.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`key-item-issue-${keyItem.id}`}
                style={cardStyles.actionMenuItem}
                onPress={() => runMenuAction(onIssue)}
              >
                <MaterialCommunityIcons name="broadcast" size={19} color="#f0e68c" />
                <Text style={cardStyles.actionMenuText}>{tLootTrade('keyItems.issue')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Modal>
    </TouchableOpacity>
  );
};

// Единственное отличие от соседних карточек — оттенок шапки под иконку ключа.
const localStyles = StyleSheet.create({
  cardHeroKey: { backgroundColor: '#2d2a1e' },
});

export default KeyItemCardCell;
