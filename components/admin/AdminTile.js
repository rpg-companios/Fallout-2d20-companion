import React from 'react';
import {
  MaterialCommunityIcons,
} from '@expo/vector-icons';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/**
 * Shared flat tile for the character manager and GM workspace.
 * Keep it to an icon, a short title, and optional compact metadata—no split
 * hero/description panel. This is the standard surface for future admin tiles.
 */
export default function AdminTile({
  iconName,
  iconColor = '#333333',
  label,
  detail,
  onPress,
  onActionPress,
  actionRef,
  actionIcon = 'dots-vertical',
  badge,
  testID,
  disabled = false,
  active = false,
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.tile, active && styles.tileActive, disabled && styles.tileDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {onActionPress ? (
        <TouchableOpacity
          ref={actionRef}
          style={styles.actionButton}
          onPress={(event) => {
            event?.stopPropagation?.();
            onActionPress(event);
          }}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name={actionIcon} size={17} color="#ffffff" />
        </TouchableOpacity>
      ) : null}
      <MaterialCommunityIcons name={iconName} size={40} color={iconColor} />
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
      {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    margin: 5,
    aspectRatio: 0.75,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#5a5a5a',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    overflow: 'hidden',
  },
  tileActive: {
    borderColor: '#111111',
    backgroundColor: '#f0f7e8',
  },
  tileDisabled: {
    opacity: 0.5,
  },
  label: {
    marginTop: 8,
    color: '#111111',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  detail: {
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: '100%',
    borderRadius: 4,
    backgroundColor: '#222222',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 5,
    left: 5,
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  actionButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
});
