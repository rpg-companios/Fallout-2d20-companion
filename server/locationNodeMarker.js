'use strict';

/**
 * Патч 544: маркер пространственного узла для старых серверов комнат.
 *
 * Старый сервер нормализует узел локации по белому списку полей: `kind: 'hub'`
 * понижается до `'loot'`, а `parentIds`/`childIds`/`accessExpression` теряются.
 * Из-за этого игрок видел локацию как сундук, а всё дерево — плоским списком.
 * Терминалы и замки уже переживали этот сброс через маркеры в `lockLabel`;
 * этот модуль тем же способом сохраняет тип и рёбра графа у локаций и узлов
 * с детьми. Канон CommonJS внутри server/ для лёгкого деплоя NetAngels.
 *
 * Формат — обёртка вокруг исходного `lockLabel` (внутри может лежать маркер
 * терминала/замка). Новый сервер разворачивает обёртку при нормализации;
 * старый сервер сохраняет её как строку, а клиент разворачивает сам.
 */

const LOCATION_NODE_MARKER = 'F2D20-LOC:';

const normalizeIdList = (raw) => (
  Array.isArray(raw)
    ? [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))]
    : []
);

const needsLocationNodeMarker = (node) => Boolean(node && (
  node.kind === 'hub'
  || normalizeIdList(node.childIds).length > 0
  || node.exitOnly
  || node.hiddenForPlayers
  || node.passageBlocked
  || normalizeIdList(node.parentIds).length > 0
  || String(node.exitLocationId || '').trim()
  || String(node.requiredKeyItemId || '').trim()
  || normalizeIdList(node.linkedCheckIds).length > 0
  || (Array.isArray(node.accessExpression) && node.accessExpression.length > 0)
));

const encodeLocationNodeMarker = (node = {}) => `${LOCATION_NODE_MARKER}${JSON.stringify({
  v: 1,
  k: String(node.kind || 'loot'),
  p: normalizeIdList(node.parentIds),
  c: normalizeIdList(node.childIds),
  d: Math.max(0, Math.floor(Number(node.depth) || 0)),
  x: String(node.exitLocationId || '').trim(),
  e: node.exitOnly ? 1 : 0,
  h: node.hiddenForPlayers ? 1 : 0,
  b: node.passageBlocked ? 1 : 0,
  r: String(node.passageReason || '').trim(),
  a: Array.isArray(node.accessExpression) ? node.accessExpression : [],
  g: normalizeIdList(node.linkedCheckIds),
  q: String(node.requiredKeyItemId || '').trim(),
  y: String(node.keyRequirement || 'none'),
  l: String(node.lockLabel || ''),
})}`;

const decodeLocationNodeMarker = (value) => {
  const raw = String(value || '');
  if (!raw.startsWith(LOCATION_NODE_MARKER)) return null;
  try {
    const parsed = JSON.parse(raw.slice(LOCATION_NODE_MARKER.length));
    if (!parsed || parsed.v !== 1) return null;
    return {
      kind: String(parsed.k || 'loot'),
      parentIds: normalizeIdList(parsed.p),
      childIds: normalizeIdList(parsed.c),
      depth: Math.max(0, Math.floor(Number(parsed.d) || 0)),
      exitLocationId: String(parsed.x || '').trim(),
      exitOnly: Boolean(parsed.e),
      hiddenForPlayers: Boolean(parsed.h),
      passageBlocked: Boolean(parsed.b),
      passageReason: String(parsed.r || '').trim(),
      accessExpression: Array.isArray(parsed.a) ? parsed.a : [],
      linkedCheckIds: normalizeIdList(parsed.g),
      requiredKeyItemId: String(parsed.q || '').trim(),
      keyRequirement: String(parsed.y || 'none'),
      lockLabel: String(parsed.l || ''),
    };
  } catch {
    return null;
  }
};

/** Оборачивает узел, если его пространственные поля могут не пережить старый WS. */
const withLocationNodeMarker = (node) => (
  needsLocationNodeMarker(node)
    ? { ...node, lockLabel: encodeLocationNodeMarker(node) }
    : node
);

/** Разворачивает обёртку, восстанавливая тип и рёбра поверх понижённого узла. */
const resolveLocationNodeMarker = (node) => {
  const marker = decodeLocationNodeMarker(node?.lockLabel);
  if (!marker) return node;
  return {
    ...node,
    kind: marker.kind,
    parentIds: marker.parentIds,
    childIds: marker.childIds,
    depth: marker.depth,
    exitLocationId: marker.exitLocationId,
    exitOnly: marker.exitOnly,
    hiddenForPlayers: marker.hiddenForPlayers,
    passageBlocked: marker.passageBlocked,
    passageReason: marker.passageReason,
    accessExpression: marker.accessExpression,
    linkedCheckIds: marker.linkedCheckIds,
    requiredKeyItemId: marker.requiredKeyItemId,
    keyRequirement: marker.keyRequirement,
    lockLabel: marker.lockLabel,
  };
};

/**
 * Клиентское восстановление графа после старого сервера: развернуть маркеры и
 * вернуть потерянные `parentIds` детей по `childIds` родителей. Узел с несколькими
 * родителями получает все восстановленные рёбра; уже присутствующие не теряются.
 */
const restoreLocationSessionNodes = (rawNodes, rootId = '') => {
  if (!Array.isArray(rawNodes)) return [];
  const nodes = rawNodes.map((node) => resolveLocationNodeMarker(node)).filter(Boolean);
  const byId = new Map(nodes.map((node) => [String(node.containerId || node.id || ''), node]));
  for (const parent of nodes) {
    const parentId = String(parent.containerId || parent.id || '');
    for (const childId of normalizeIdList(parent.childIds)) {
      const child = byId.get(childId);
      if (!child || childId === parentId) continue;
      const parents = normalizeIdList(child.parentIds);
      if (!parents.includes(parentId)) parents.push(parentId);
      child.parentIds = parents;
    }
  }
  const root = String(rootId || '').trim();
  if (root) {
    for (const node of nodes) {
      if (!normalizeIdList(node.parentIds).length) node.parentIds = [root];
    }
  }
  return nodes;
};

module.exports = {
  LOCATION_NODE_MARKER,
  needsLocationNodeMarker,
  encodeLocationNodeMarker,
  decodeLocationNodeMarker,
  withLocationNodeMarker,
  resolveLocationNodeMarker,
  restoreLocationSessionNodes,
};
