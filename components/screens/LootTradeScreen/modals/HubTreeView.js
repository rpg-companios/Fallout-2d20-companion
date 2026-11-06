import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Modal, PanResponder } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../logic/lootTradeI18n';
import {
  CONTAINER_KIND,
  getHubIdsContainingChild,
} from '../../../../domain/lootTrade';
import locationGraph from '../../../../domain/locationGraph';
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
 *   - не-локационные узлы из node.links (контейнеры/торговцы/замки/терминалы);
 *   - патч 541: ключевые записи узла (keyItemIds) — отдельными строками дерева.
 * Игровой путь (links) не трогаем — дерево только читает и то, и другое.
 *
 * Патч 541: название элемента больше не открывает настройки. У каждой строки
 * (локация, сундук, торговец, терминал, замок, ключ) справа стоит кнопка
 * «Параметры»; раскрытие вложенных локаций по-прежнему идёт стрелкой-шевроном.
 *
 * Патч 545: строки одного родителя меняются местами перетаскиванием за ручку.
 * Дерево не пишет в БД само — отдаёт новый порядок наружу; канон порядка и
 * переноса живёт в `server/locationGraph.js` (через domain-фасад), тот же
 * порядок получает игрок. Ключи остаются после объектов и не перетаскиваются.
 */
const HubTreeView = ({
  hub,
  containers = [],
  keyItems = [],
  keyItemNames = {},
  roomLabelOf,
  onOpenSettings,
  onOpenKeySettings,
  onOpenChild,
  onToggleLock,
  onMoveOut,
  onUnlink,
  onUpdateLockLabel,
  onMoveNestedOut,
  onTogglePassage,
  onReorderChildren,
}) => {
  useLocale();
  const [expanded, setExpanded] = useState(() => new Set());
  // Патч 543: диалог причины перекрытия (пусто = «Проход заблокирован»).
  const [passagePrompt, setPassagePrompt] = useState(null);
  // Патч 545: перетаскивание строк одного родителя. Контекст задаётся ручкой
  // строки, PanResponder только измеряет/подсвечивает и отдаёт новый порядок.
  const rowRefs = useRef({});
  const dragContextRef = useRef(null);
  const activeDragRef = useRef(null);
  const reorderRef = useRef(onReorderChildren);
  reorderRef.current = onReorderChildren;
  const [dragPreview, setDragPreview] = useState(null);

  const list = Array.isArray(containers) ? containers : [];
  const byId = useMemo(() => {
    const map = new Map();
    for (const c of list) if (c?.id) map.set(c.id, c);
    return map;
  }, [list]);

  const keyById = useMemo(() => {
    const map = new Map();
    for (const k of Array.isArray(keyItems) ? keyItems : []) if (k?.id) map.set(k.id, k);
    return map;
  }, [keyItems]);

  const nameOf = (id) => byId.get(id)?.name || keyItemNames[id] || keyById.get(id)?.name || id;

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
    // Патч 545: тот же закон порядка, что у графа сессии: явный childOrder
    // Мастера, затем новые дети по типу/имени. Мастер и игрок не расходятся.
    const entryById = new Map(result.map((entry) => [entry.container.id, entry]));
    return locationGraph.orderChildIds(node, result.map((entry) => entry.container.id), byId)
      .map((id) => entryById.get(id))
      .filter(Boolean);
  };

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Патч 545: перетаскивание меняет порядок только среди строк одного
  // родителя. Границы строк измеряются в окне, как у карточек на сетке.
  const measureSiblingRows = (siblingIds) => {
    const bounds = {};
    for (const id of siblingIds) {
      const ref = rowRefs.current[id];
      if (ref?.measureInWindow) {
        ref.measureInWindow((x, y, width, height) => {
          bounds[id] = { x, y, width, height };
        });
      }
    }
    return bounds;
  };

  const siblingAtPoint = (drag, point) => {
    if (!drag || !point) return null;
    for (const id of drag.siblingIds) {
      if (id === drag.childId) continue;
      const b = drag.bounds[id];
      if (b
        && point.x >= b.x && point.x <= b.x + b.width
        && point.y >= b.y && point.y <= b.y + b.height) return id;
    }
    return null;
  };

  const finishDrag = (cancelled) => {
    const drag = activeDragRef.current;
    activeDragRef.current = null;
    dragContextRef.current = null;
    setDragPreview(null);
    if (cancelled || !drag) return;
    // Патч 548: порядок меняет только настоящее движение. Иначе простое
    // нажатие на стрелку (точка нажатия ещё не сдвинулась) могло попасть
    // в соседнюю строку и молча переставить позицию.
    if (!drag.moved) return;
    const targetId = drag.overId || siblingAtPoint(drag, drag.point);
    if (!targetId || targetId === drag.childId) return;
    const nextOrder = locationGraph.moveChildInOrder(drag.siblingIds, drag.childId, targetId);
    if (nextOrder.join('\u0000') === drag.siblingIds.join('\u0000')) return;
    reorderRef.current?.(drag.parentId, nextOrder);
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (_evt, gesture) => {
      const context = dragContextRef.current;
      if (!context) return;
      activeDragRef.current = {
        ...context,
        bounds: measureSiblingRows(context.siblingIds),
        overId: null,
        moved: false,
        point: { x: gesture.x0, y: gesture.y0 },
      };
      setDragPreview({ parentId: context.parentId, childId: context.childId, overId: null });
    },
    onPanResponderMove: (_evt, gesture) => {
      const drag = activeDragRef.current;
      if (!drag) return;
      if (gesture.moveX === 0 && gesture.moveY === 0) return;
      drag.moved = true;
      drag.point = { x: gesture.moveX, y: gesture.moveY };
      const overId = siblingAtPoint(drag, drag.point);
      if (overId !== drag.overId) {
        drag.overId = overId;
        setDragPreview((prev) => (prev ? { ...prev, overId } : prev));
      }
    },
    onPanResponderRelease: () => finishDrag(false),
    onPanResponderTerminate: () => finishDrag(true),
  })).current;

  /**
   * Патч 548: контекст строки задаётся в CAPTURE-фазе, а не только в bubble.
   *
   * Баг владельца: «стрелки перемещения в админке не активны». Ручка отдавала
   * `onStartShouldSetPanResponderCapture: () => true`, а контекст (`parentId`,
   * `childId`, братья) писала только в `onStartShouldSetPanResponder`. Система
   * ответственности RN (и react-native-web: `findWantsResponder`) опрашивает
   * capture сверху вниз и ПРИНИМАЕТ решение сразу, как только обработчик вернул
   * true — до bubble-фазы дело не доходит. Поэтому контекст оставался null,
   * `onPanResponderGrant` выходил по проверке `if (!context) return`, и
   * перетаскивание не начиналось никогда: стрелка выглядела мёртвой.
   *
   * Теперь одна функция `claimDrag` пишет контекст во всех четырёх точках
   * опроса — и в capture (реальный путь), и в bubble (запасной).
   */
  const dragHandlersFor = (parentNode, container, siblingIds) => {
    const claimDrag = () => {
      dragContextRef.current = { parentId: parentNode.id, childId: container.id, siblingIds };
      return true;
    };
    return {
      ...panResponder.panHandlers,
      onStartShouldSetPanResponderCapture: claimDrag,
      onMoveShouldSetPanResponderCapture: claimDrag,
      onStartShouldSetPanResponder: claimDrag,
      onMoveShouldSetPanResponder: claimDrag,
    };
  };

  const setRowRef = (id) => (ref) => {
    if (ref) rowRefs.current[id] = ref;
    else delete rowRefs.current[id];
  };

  const open = (container) => {
    if (typeof onOpenSettings === 'function' && container) onOpenSettings(container);
  };

  const openKey = (keyItem, parentNode) => {
    if (typeof onOpenKeySettings === 'function' && keyItem) onOpenKeySettings(keyItem, parentNode);
  };

  // Патч 541: единая кнопка «Параметры» в правой части строки названия.
  const renderParametersButton = (testID, onPress) => (
    <TouchableOpacity
      testID={testID}
      style={styles.smallBtn}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.smallBtnText}>{tLootTrade('detail.editSettings')}</Text>
    </TouchableOpacity>
  );

  // Патч 541: ключевые записи узла — такие же строки дерева с «Параметрами».
  const renderKeyNode = (keyId, depth, parentNode) => {
    const record = keyById.get(keyId);
    const label = record?.name || keyItemNames[keyId] || keyId;
    return (
      <View key={`key-${keyId}`} style={[styles.node, { marginLeft: depth * 16 }]}>
        <View style={styles.nodeHeader}>
          <View style={styles.chevronBtn}>
            <MaterialCommunityIcons name="key-variant" size={16} color={ADMIN_MODAL_PALETTE.gold} />
          </View>
          <View testID={`hub-tree-key-${keyId}`} style={styles.nodeNameBtn}>
            <Text style={styles.nodeName} numberOfLines={1}>{label}</Text>
          </View>
          {renderParametersButton(`hub-tree-parameters-key-${keyId}`, () => openKey(record || { id: keyId, name: label }, parentNode))}
        </View>
      </View>
    );
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
  const renderNode = (entry, depth, visited, isDirectChild, parentNode) => {
    const { container, link } = entry;
    if (!container || visited.has(container.id)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(container.id);

    const isHub = container.kind === CONTAINER_KIND.HUB;
    const isOpen = expanded.has(container.id);
    const kids = isHub ? childrenOf(container) : [];
    const sharedHubCount = getHubIdsContainingChild(container.id, list).length;
    const pieces = (container.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    // Патч 545: ручка перестановки есть у строк с братьями внутри одного
    // родителя (включая раскрытую вложенную локацию). Ключи не трогаем.
    const siblingIds = parentNode ? childrenOf(parentNode).map((kid) => kid.container.id) : [];
    const canReorder = Boolean(parentNode && siblingIds.length > 1 && typeof onReorderChildren === 'function');
    const isDragging = dragPreview?.childId === container.id;
    const isDropTarget = dragPreview?.overId === container.id;

    return (
      <View key={container.id} style={[styles.node, { marginLeft: depth * 16 }]}>
        <View
          ref={setRowRef(container.id)}
          testID={`hub-tree-row-${container.id}`}
          style={[
            styles.nodeHeader,
            isDragging && styles.nodeHeaderDragging,
            isDropTarget && styles.nodeHeaderDropTarget,
          ]}
        >
          {canReorder && (
            <View
              testID={`hub-tree-reorder-${container.id}`}
              {...dragHandlersFor(parentNode, container, siblingIds)}
              style={styles.dragHandle}
              accessibilityRole="button"
              accessibilityLabel={formatLootTrade(tLootTrade('detail.hubReorderHandle'), { name: container.name })}
            >
              <MaterialCommunityIcons name="arrow-all" size={14} color={ADMIN_MODAL_PALETTE.mutedText} />
            </View>
          )}
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

          {/* Патч 541: название больше не открывает настройки — только кнопка
              «Параметры» в правой части строки. */}
          <View
            testID={`hub-tree-node-${container.id}`}
            style={styles.nodeNameBtn}
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
          </View>

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

          {/* Патч 543: перекрытие прохода — только у локаций, в строке
              названия, сразу перед кнопкой «Параметры». */}
          {isHub && (
            <TouchableOpacity
              testID={`hub-tree-passage-${container.id}`}
              style={[styles.smallBtn, container.passageBlocked && styles.passageBtnBlocked]}
              onPress={() => {
                if (container.passageBlocked) {
                  onTogglePassage?.(container, false, '');
                } else {
                  setPassagePrompt({ container, reason: '' });
                }
              }}
              accessibilityRole="button"
            >
              <Text style={container.passageBlocked ? styles.passageBtnBlockedText : styles.smallBtnText}>
                {tLootTrade(container.passageBlocked ? 'detail.passageOpen' : 'detail.passageBlock')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Патч 541: «Параметры» в правой части строки названия — у каждого
              элемента дерева, а не только у прямого ребёнка активного хаба. */}
          {renderParametersButton(`hub-tree-parameters-${container.id}`, () => open(container))}
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
            {kids.length === 0 && (container.keyItemIds || []).length === 0 ? (
              <Text style={styles.emptyText}>{tLootTrade('form.locationTreeEmptyNode')}</Text>
            ) : (
              <>
                {kids.map((kid) => renderNode(kid, depth + 1, nextVisited, false, container))}
                {(container.keyItemIds || []).map((keyId) => renderKeyNode(keyId, depth + 1, container))}
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  if (!hub) return null;
  const directKids = childrenOf(hub);
  const directKeyIds = Array.isArray(hub.keyItemIds) ? hub.keyItemIds : [];

  return (
    <ScrollView style={styles.scroll} nestedScrollEnabled>
      {dragPreview ? (
        <Text testID="hub-tree-reorder-hint" style={styles.reorderHint}>
          {tLootTrade('detail.hubReorderHint')}
        </Text>
      ) : null}
      {directKids.length === 0 && directKeyIds.length === 0 ? (
        <Text style={styles.emptyText}>{tLootTrade('detail.emptyHubNodes')}</Text>
      ) : (
        <>
          {directKids.map((entry) => renderNode(entry, 0, new Set([hub.id]), true, hub))}
          {directKeyIds.map((keyId) => renderKeyNode(keyId, 0, hub))}
        </>
      )}
      {/* Патч 543: причина перекрытия — свободный текст Мастера. */}
      {passagePrompt ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setPassagePrompt(null)}
        >
          <View style={styles.passageBackdrop}>
            <View style={styles.passageDialog}>
              <Text style={styles.passageDialogTitle}>
                {tLootTrade('detail.passageReasonTitle')}
              </Text>
              <TextInput
                testID="passage-reason-input"
                style={styles.passageReasonInput}
                value={passagePrompt.reason}
                onChangeText={(text) => setPassagePrompt((prev) => (prev ? { ...prev, reason: text } : prev))}
                placeholder={tLootTrade('detail.passageReasonPlaceholder')}
                placeholderTextColor="#888888"
                autoFocus
              />
              <View style={styles.passageDialogRow}>
                <TouchableOpacity
                  testID="passage-block-cancel"
                  style={styles.smallBtn}
                  onPress={() => setPassagePrompt(null)}
                  accessibilityRole="button"
                >
                  <Text style={styles.smallBtnText}>{tLootTrade('form.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="passage-block-confirm"
                  style={styles.smallBtn}
                  onPress={() => {
                    const next = passagePrompt;
                    setPassagePrompt(null);
                    if (next) onTogglePassage?.(next.container, true, next.reason);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.smallBtnText}>{tLootTrade('detail.passageBlock')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
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
  // Патч 545: ручка и подсветка перестановки — в палитре соседних модалок.
  dragHandle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  nodeHeaderDragging: { opacity: 0.55 },
  nodeHeaderDropTarget: {
    borderWidth: 2,
    borderColor: ADMIN_MODAL_PALETTE.gold,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  reorderHint: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 11,
    paddingVertical: 4,
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
  // Патч 543: состояние перекрытия и диалог причины.
  passageBtnBlocked: { borderWidth: 1, borderColor: '#c9a227', backgroundColor: '#3a3212' },
  passageBtnBlockedText: { color: '#e8c95a', fontSize: 10 },
  passageBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  passageDialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: ADMIN_MODAL_PALETTE.card || '#1d2126',
    borderWidth: 1,
    borderColor: '#3d4650',
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  passageDialogTitle: { color: ADMIN_MODAL_PALETTE.text, fontSize: 14, fontWeight: '600' },
  passageReasonInput: {
    borderWidth: 1,
    borderColor: '#3d4650',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: ADMIN_MODAL_PALETTE.text,
    backgroundColor: '#12161b',
  },
  passageDialogRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
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
