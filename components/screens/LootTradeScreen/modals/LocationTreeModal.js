import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade } from '../logic/lootTradeI18n';
import { CONTAINER_KIND } from '../../../../domain/lootTrade';
import {
  resolveAccessExpression,
  formatAccessExpression,
} from '../../../../domain/accessExpression';

/**
 * Патч 538: дерево структуры локаций («Хаб»-каталог).
 * Показывает, что за чем идёт (вложенность), что чем заблокировано
 * (условие И/ИЛИ) и что во что выходит (особый выход/телепорт).
 * Нажатие на любой узел открывает настройки этой секции.
 */
const LocationTreeModal = ({ visible, containers = [], onOpenSettings, onClose }) => {
  useLocale();

  const list = Array.isArray(containers) ? containers : [];
  const byId = useMemo(() => {
    const map = new Map();
    for (const c of list) if (c?.id) map.set(c.id, c);
    return map;
  }, [list]);

  const hubs = useMemo(
    () => list.filter((c) => c?.kind === CONTAINER_KIND.HUB),
    [list],
  );

  // Вложенные локации: parentLocationId -> список дочерних хабов.
  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const hub of hubs) {
      const parentId = String(hub.parentLocationId || '').trim();
      if (!parentId) continue;
      if (!map.has(parentId)) map.set(parentId, []);
      map.get(parentId).push(hub);
    }
    return map;
  }, [hubs]);

  const roots = useMemo(
    () => hubs.filter((hub) => {
      const parentId = String(hub.parentLocationId || '').trim();
      return !parentId || !byId.has(parentId);
    }),
    [hubs, byId],
  );

  const nameOf = (id) => byId.get(id)?.name || id;

  const blockedLabel = (container) => {
    const tokens = resolveAccessExpression(container || {});
    if (!tokens.length) return '';
    return formatAccessExpression(tokens, nameOf);
  };

  const open = (container) => {
    if (typeof onOpenSettings === 'function' && container) onOpenSettings(container);
  };

  const kindIcon = (kind) => {
    if (kind === CONTAINER_KIND.HUB) return 'map-marker-multiple';
    if (kind === CONTAINER_KIND.LOCK) return 'lock';
    if (kind === CONTAINER_KIND.TERMINAL) return 'desktop-classic';
    if (kind === CONTAINER_KIND.MERCHANT) return 'account-cash';
    return 'treasure-chest';
  };

  // Рекурсивный узел локации; visited защищает от циклов матрёшки.
  const renderHub = (hub, depth, visited) => {
    if (!hub || visited.has(hub.id)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(hub.id);

    const nestedHubs = childrenByParent.get(hub.id) || [];
    const linkedChildren = (hub.links || [])
      .map((l) => byId.get(l.containerId))
      .filter((c) => c && c.kind !== CONTAINER_KIND.HUB);
    const exitId = String(hub.exitLocationId || '').trim();
    const exitTarget = exitId ? byId.get(exitId) : null;
    const blocked = blockedLabel(hub);

    return (
      <View key={hub.id} style={[styles.node, { marginLeft: depth * 18 }]}>
        <TouchableOpacity
          testID={`location-tree-node-${hub.id}`}
          style={styles.nodeHeader}
          onPress={() => open(hub)}
        >
          <MaterialCommunityIcons name={kindIcon(hub.kind)} size={18} color={ADMIN_MODAL_PALETTE.text} />
          <Text style={styles.nodeName} numberOfLines={1}>{hub.name}</Text>
          {hub.isCatalogHub && (
            <View style={styles.catalogBadge}>
              <Text style={styles.catalogBadgeText}>{tLootTrade('form.locationTreeCatalogBadge')}</Text>
            </View>
          )}
          <MaterialCommunityIcons name="chevron-right" size={18} color={ADMIN_MODAL_PALETTE.mutedText} />
        </TouchableOpacity>

        {blocked ? (
          <Text style={styles.metaRow} numberOfLines={2}>
            {tLootTrade('form.locationTreeBlockedBy')} {blocked}
          </Text>
        ) : null}

        {exitTarget ? (
          <TouchableOpacity
            testID={`location-tree-exit-${hub.id}`}
            style={styles.exitRow}
            onPress={() => open(exitTarget)}
          >
            <MaterialCommunityIcons name="exit-run" size={14} color={ADMIN_MODAL_PALETTE.mutedText} />
            <Text style={styles.metaRow} numberOfLines={1}>
              {tLootTrade('form.locationTreeExitTo')} {exitTarget.name}
            </Text>
          </TouchableOpacity>
        ) : null}

        {linkedChildren.map((child) => (
          <TouchableOpacity
            key={child.id}
            testID={`location-tree-child-${child.id}`}
            style={[styles.childRow, { marginLeft: 18 }]}
            onPress={() => open(child)}
          >
            <MaterialCommunityIcons name={kindIcon(child.kind)} size={15} color={ADMIN_MODAL_PALETTE.mutedText} />
            <Text style={styles.childName} numberOfLines={1}>{child.name}</Text>
            {blockedLabel(child) ? (
              <Text style={styles.childMeta} numberOfLines={1}>{blockedLabel(child)}</Text>
            ) : null}
          </TouchableOpacity>
        ))}

        {nestedHubs.map((childHub) => renderHub(childHub, depth + 1, nextVisited))}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{tLootTrade('form.locationTreeTitle')}</Text>
            <TouchableOpacity testID="location-tree-close" onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={ADMIN_MODAL_PALETTE.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {hubs.length === 0 ? (
              <Text style={styles.emptyText}>{tLootTrade('form.locationTreeEmpty')}</Text>
            ) : (
              roots.map((hub) => renderHub(hub, 0, new Set()))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '84%',
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  title: { color: ADMIN_MODAL_PALETTE.text, fontSize: 16, fontWeight: '700' },
  closeBtn: { padding: 4 },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 14 },
  emptyText: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 13, lineHeight: 19 },
  node: { marginBottom: 10 },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  nodeName: { flex: 1, color: ADMIN_MODAL_PALETTE.text, fontSize: 14, fontWeight: '700' },
  catalogBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: ADMIN_MODAL_PALETTE.accent,
  },
  catalogBadgeText: { color: ADMIN_MODAL_PALETTE.accentText, fontSize: 10, fontWeight: '700' },
  metaRow: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11, marginTop: 3, marginLeft: 26 },
  exitRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 4,
    borderRadius: 5,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceMuted,
  },
  childName: { flex: 1, color: ADMIN_MODAL_PALETTE.text, fontSize: 12, fontWeight: '600' },
  childMeta: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 10, maxWidth: 160 },
});

export default LocationTreeModal;
