import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../logic/lootTradeI18n';
import {
  CONTAINER_KIND,
  CONTAINER_KIND_SORT_ORDER,
  getHubIdsContainingChild,
} from '../../../../domain/lootTrade';
import {
  resolveAccessExpression,
  formatAccessExpression,
} from '../../../../domain/accessExpression';

/**
 * Патч 539: хаб сам по себе — древовидная папка. Открыв локацию-хаб, Мастер
 * видит дерево вложенного: локации — спойлерами (нажал — видно, что входит),
 * а пунктирные линии показывают, что от чего зависит (что чем заблокировано,
 * что во что выходит, какой ключ нужен). Нажатие на узел открывает настройки.
 *
 * Дети узла = объединение (без дублей):
 *   - вложенные локации: containers с parentLocationId === node.id (матрёшка);
 *   - не-локационные узлы из node.links (контейнеры/торговцы/замки/терминалы).
 * Игровой путь (links) не трогаем — дерево только читает и то, и другое.
 */
const HubTreeView = ({
  hub,
  containers = [],
  keyItemNames = {},
  roomLabelOf,
  onOpenSettings,
  onOpenChild,
  onToggleLock,
  onMoveOut,
  onUnlink,
  onUpdateLockLabel,
  onMoveNestedOut,
}) => {
  useLocale();
  const [expanded, setExpanded] = useState(() => new Set());

  const list = Array.isArray(containers) ? containers : [];
  const byId = useMemo(() => {
    const map = new Map();
    for (const c of list) if (c?.id) map.set(c.id, c);
    return map;
  }, [list]);

  const nameOf = (id) => byId.get(id)?.name || keyItemNames[id] || id;

  const blockedLabel = (container) => {
    const tokens = resolveAccessExpression(container || {});
    if (!tokens.length) return '';
    return formatAccessExpression(tokens, nameOf);
  };

  const kindIcon = (kind) => {
    if (kind === CONTAINER_KIND.HUB) return 'map-marker-multiple';
    if (kind === CONTAINER_KIND.LOCK) return 'lock';
    if (kind === CONTAINER_KIND.TERMINAL) return 'desktop-classic';
    if (kind === CONTAINER_KIND.MERCHANT) return 'account-cash';
    return 'treasure-chest';
  };

  // Дети узла: вложенные локации (parentLocationId) + не-хабы из links.
  const childrenOf = (node) => {
    const seen = new Set();
    const result = [];
    for (const c of list) {
      if (c?.kind === CONTAINER_KIND.HUB
        && String(c.parentLocationId || '').trim() === node.id
        && !seen.has(c.id)) {
        seen.add(c.id);
        result.push({ container: c, link: null });
      }
    }
    for (const link of node.links || []) {
      const c = byId.get(link.containerId);
      if (c && c.kind !== CONTAINER_KIND.HUB && !seen.has(c.id)) {
        seen.add(c.id);
        result.push({ container: c, link });
      }
    }
    result.sort((a, b) => {
      const ra = CONTAINER_KIND_SORT_ORDER[a.container?.kind] ?? 99;
      const rb = CONTAINER_KIND_SORT_ORDER[b.container?.kind] ?? 99;
      if (ra !== rb) return ra - rb;
      return String(a.container?.name || '').localeCompare(String(b.container?.name || ''), 'ru');
    });
    return result;
  };

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const open = (container) => {
    if (typeof onOpenSettings === 'function' && container) onOpenSettings(container);
  };

  // Пунктирные строки зависимости: что блокирует, куда выход, какой ключ.
  const renderDependencies = (container) => {
    const blocked = blockedLabel(container);
    const exitId = String(container.exitLocationId || '').trim();
    const exitTarget = exitId ? byId.get(exitId) : null;
    const keyId = String(container.requiredKeyItemId || '').trim();
    const keyName = keyId ? (keyItemNames[keyId] || nameOf(keyId)) : '';
    if (!blocked && !exitTarget && !keyName) return null;
    return (
      <View style={styles.depBlock}>
        {blocked ? (
          <View style={styles.depRow}>
            <View style={styles.depDash} />
            <MaterialCommunityIcons name="lock" size={13} color={ADMIN_MODAL_PALETTE.mutedText} />
            <Text style={styles.depText} numberOfLines={2}>
              {tLootTrade('form.locationTreeBlockedBy')} {blocked}
            </Text>
          </View>
        ) : null}
        {keyName ? (
          <View style={styles.depRow}>
            <View style={styles.depDash} />
            <MaterialCommunityIcons name="key-variant" size={13} color={ADMIN_MODAL_PALETTE.gold} />
            <Text style={styles.depText} numberOfLines={1}>
              {tLootTrade('form.locationTreeKey')} {keyName}
            </Text>
          </View>
        ) : null}
        {exitTarget ? (
          <TouchableOpacity
            testID={`hub-tree-exit-${container.id}`}
            style={styles.depRow}
            onPress={() => open(exitTarget)}
          >
            <View style={styles.depDash} />
            <MaterialCommunityIcons name="exit-run" size={13} color={ADMIN_MODAL_PALETTE.mutedText} />
            <Text style={styles.depText} numberOfLines={1}>
              {tLootTrade('form.locationTreeExitTo')} {exitTarget.name}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  // Патч 540: параметры вложенной локации — как у других записей в хабе.
  // Комнаты, число объектов и запертых точек; ключ/замок/выход — ниже пунктиром.
  const renderHubMeta = (container) => {
    const links = Array.isArray(container.links) ? container.links : [];
    const lockedCount = links.filter((l) => l?.locked).length;
    const roomLabel = typeof roomLabelOf === 'function' ? (roomLabelOf(container) || '') : '';
    const parts = [];
    if (roomLabel) {
      parts.push(formatLootTrade(tLootTrade('detail.roomsLabel'), { rooms: roomLabel }));
    }
    parts.push(formatLootTrade(tLootTrade('card.hubNodesCount'), { count: links.length }));
    if (lockedCount > 0) {
      parts.push(formatLootTrade(tLootTrade('card.hubLockedCount'), { count: lockedCount }));
    }
    return (
      <Text testID={`hub-tree-meta-${container.id}`} style={styles.hubMeta} numberOfLines={2}>
        {parts.join(' · ')}
      </Text>
    );
  };

  // Рекурсивный узел. visited защищает от циклов матрёшки.
  const renderNode = (entry, depth, visited, isDirectChild) => {
    const { container, link } = entry;
    if (!container || visited.has(container.id)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(container.id);

    const isHub = container.kind === CONTAINER_KIND.HUB;
    const isOpen = expanded.has(container.id);
    const kids = isHub ? childrenOf(container) : [];
    const sharedHubCount = getHubIdsContainingChild(container.id, list).length;
    const pieces = (container.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

    return (
      <View key={container.id} style={[styles.node, { marginLeft: depth * 16 }]}>
        <View style={styles.nodeHeader}>
          {isHub ? (
            <TouchableOpacity
              testID={`hub-tree-toggle-${container.id}`}
              style={styles.chevronBtn}
              onPress={() => toggleExpanded(container.id)}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name={isOpen ? 'chevron-down' : 'chevron-right'}
                size={20}
                color={ADMIN_MODAL_PALETTE.text}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.chevronBtn}>
              <MaterialCommunityIcons name={kindIcon(container.kind)} size={16} color={ADMIN_MODAL_PALETTE.mutedText} />
            </View>
          )}

          <TouchableOpacity
            testID={`hub-tree-node-${container.id}`}
            style={styles.nodeNameBtn}
            onPress={() => open(container)}
          >
            {isHub && (
              <MaterialCommunityIcons name={kindIcon(container.kind)} size={16} color={ADMIN_MODAL_PALETTE.text} />
            )}
            <Text style={styles.nodeName} numberOfLines={1}>{container.name}</Text>
            {isHub && container.isCatalogHub && (
              <View style={styles.catalogBadge}>
                <Text style={styles.catalogBadgeText}>{tLootTrade('form.locationTreeCatalogBadge')}</Text>
              </View>
            )}
            {!isHub && (
              <Text style={styles.nodeMeta} numberOfLines={1}>
                {formatLootTrade(tLootTrade('card.itemsCount'), { count: pieces })}
              </Text>
            )}
          </TouchableOpacity>

          {/* Патч 539/540: вложенную локацию можно открыть (перейти внутрь) и
              вынуть обратно на корень. */}
          {isHub && isDirectChild && (
            <View style={styles.nodeControls}>
              <TouchableOpacity
                testID={`hub-tree-open-nested-${container.id}`}
                style={styles.smallBtn}
                onPress={() => onOpenChild?.(container)}
              >
                <Text style={styles.smallBtnText}>{tLootTrade('detail.hubOpenChildCard')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`hub-tree-move-nested-out-${container.id}`}
                style={styles.smallBtn}
                onPress={() => onMoveNestedOut?.(container.id)}
              >
                <Text style={styles.smallBtnText}>{tLootTrade('detail.hubMoveOutToRoot')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Управление прямыми детьми активного хаба (ссылки links). */}
          {!isHub && isDirectChild && link && (
            <View style={styles.nodeControls}>
              <TouchableOpacity
                style={[styles.lockChip, link.locked ? styles.lockChipLocked : styles.lockChipUnlocked]}
                onPress={() => onToggleLock?.(container.id)}
              >
                <Text style={link.locked ? styles.lockChipTextLocked : styles.lockChipTextUnlocked}>
                  {tLootTrade(link.locked ? 'detail.hubLockStateLocked' : 'detail.hubLockStateUnlocked')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={() => onOpenChild?.(container)}>
                <Text style={styles.smallBtnText}>{tLootTrade('detail.hubOpenChildCard')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={() => onMoveOut?.(container.id)}>
                <Text style={styles.smallBtnText}>{tLootTrade('detail.hubMoveOutToRoot')}</Text>
              </TouchableOpacity>
              {(sharedHubCount > 1 || container.inRoot === true) && (
                <TouchableOpacity style={[styles.smallBtn, styles.unlinkBtn]} onPress={() => onUnlink?.(container.id)}>
                  <Text style={styles.unlinkBtnText}>{tLootTrade('detail.hubUnlinkChild')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {isHub && renderHubMeta(container)}

        {renderDependencies(container)}

        {!isHub && isDirectChild && link && link.locked && (
          <TextInput
            style={styles.lockNoteInput}
            defaultValue={link.lockLabel || ''}
            placeholder={tLootTrade('detail.hubLockLabelPlaceholder')}
            placeholderTextColor="#888888"
            onEndEditing={(e) => onUpdateLockLabel?.(container.id, e.nativeEvent.text)}
            onSubmitEditing={(e) => onUpdateLockLabel?.(container.id, e.nativeEvent.text)}
          />
        )}

        {isHub && isOpen && (
          <View style={styles.childrenBlock}>
            {kids.length === 0 ? (
              <Text style={styles.emptyText}>{tLootTrade('form.locationTreeEmptyNode')}</Text>
            ) : kids.map((kid) => renderNode(kid, depth + 1, nextVisited, false))}
          </View>
        )}
      </View>
    );
  };

  if (!hub) return null;
  const directKids = childrenOf(hub);

  return (
    <ScrollView style={styles.scroll} nestedScrollEnabled>
      {directKids.length === 0 ? (
        <Text style={styles.emptyText}>{tLootTrade('detail.emptyHubNodes')}</Text>
      ) : (
        directKids.map((entry) => renderNode(entry, 0, new Set([hub.id]), true))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  node: { marginBottom: 6 },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  chevronBtn: { width: 26, alignItems: 'center', justifyContent: 'center' },
  nodeNameBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  nodeName: { flex: 1, color: ADMIN_MODAL_PALETTE.text, fontSize: 13, fontWeight: '700' },
  nodeMeta: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11 },
  hubMeta: { marginLeft: 30, marginTop: 2, color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11 },
  catalogBadge: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
    backgroundColor: ADMIN_MODAL_PALETTE.accent,
  },
  catalogBadgeText: { color: ADMIN_MODAL_PALETTE.accentText, fontSize: 9, fontWeight: '700' },
  nodeControls: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' },
  lockChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  lockChipLocked: { backgroundColor: '#fdecea', borderColor: ADMIN_MODAL_PALETTE.danger },
  lockChipUnlocked: { backgroundColor: '#eef7ee', borderColor: '#3a7d3a' },
  lockChipTextLocked: { color: ADMIN_MODAL_PALETTE.danger, fontSize: 10, fontWeight: '700' },
  lockChipTextUnlocked: { color: '#3a7d3a', fontSize: 10, fontWeight: '700' },
  smallBtn: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4,
    borderWidth: 1, borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceMuted,
  },
  smallBtnText: { color: ADMIN_MODAL_PALETTE.text, fontSize: 10 },
  unlinkBtn: { borderColor: ADMIN_MODAL_PALETTE.danger },
  unlinkBtnText: { color: ADMIN_MODAL_PALETTE.danger, fontSize: 10 },
  depBlock: { marginLeft: 30, marginTop: 3 },
  depRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 1 },
  depDash: {
    width: 16, height: 0, borderTopWidth: 1, borderStyle: 'dashed',
    borderTopColor: ADMIN_MODAL_PALETTE.borderMuted,
  },
  depText: { flex: 1, color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11 },
  childrenBlock: {
    marginTop: 4, marginLeft: 12, paddingLeft: 10,
    borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: ADMIN_MODAL_PALETTE.borderMuted,
  },
  lockNoteInput: {
    marginLeft: 30, marginTop: 4, borderWidth: 1, borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12,
    color: ADMIN_MODAL_PALETTE.text, backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  emptyText: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 12, lineHeight: 18, paddingVertical: 6 },
});

export default HubTreeView;
