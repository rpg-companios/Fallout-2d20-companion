'use strict';

/**
 * Патч 523: граф пространств «Добыча / Торговля».
 *
 * Слово владельца: «Локация может содержать локации, в которых тоже локации...
 * пол/шкаф может быть локацией. Контейнер может содержать контейнеры...
 * несколько родителей, циклы A–B–C–A и ветвящиеся лабиринты разрешены.
 * Наследование — "все те же коды от каждого родителя". "Верхний родитель" не
 * структурный: любой узел, у которого есть хотя бы один ребёнок, может
 * "заблокировать всё". Замок — граница видимости: не вошёл в локацию — не
 * знаешь, что за ней; запертый сундук скрывает содержимое».
 *
 * Модуль CommonJS и без зависимостей: канон живёт в server/, чтобы лёгкий
 * деплой NetAngels (app/ = server/ + ws) оставался автономным. Клиентская
 * точка входа — domain/locationGraph.js. Чистые функции, циклы безопасны.
 */

const LOCKABLE_KINDS = Object.freeze(new Set([
  'loot', 'merchant', 'hub', 'terminal', 'lock',
]));

const isLockableKind = (kind) => LOCKABLE_KINDS.has(String(kind || ''));

const normalizeId = (value) => String(value || '').trim();

const normalizeRoomCodes = (raw) => {
  const list = Array.isArray(raw?.roomCodes)
    ? raw.roomCodes
    : (raw?.roomCode ? [raw.roomCode] : []);
  const seen = new Set();
  const out = [];
  for (const value of list) {
    const code = normalizeId(value);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
};

const normalizeLinks = (raw) => {
  if (!Array.isArray(raw?.links)) return [];
  const seen = new Set();
  const out = [];
  for (const link of raw.links) {
    const containerId = normalizeId(link?.containerId || link?.id);
    if (!containerId || seen.has(containerId)) continue;
    seen.add(containerId);
    out.push({
      containerId,
      locked: Boolean(link?.locked),
      lockLabel: String(link?.lockLabel || '').trim(),
    });
  }
  return out;
};

/** Узел графа: только то, что важно для связей и видимости. */
const normalizeGraphNode = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const id = normalizeId(raw.id || raw.containerId);
  if (!id) return null;
  return {
    id,
    kind: String(raw.kind || 'loot'),
    roomCodes: normalizeRoomCodes(raw),
    locked: Boolean(raw.locked),
    links: normalizeLinks(raw),
  };
};

/**
 * Собрать граф из карточек Мастера. Рёбра — `links` ЛЮБОГО узла, а не только
 * локации: контейнер может содержать контейнер, локация — локацию.
 * Несколько родителей и циклы допустимы и сохраняются как есть.
 */
const buildLocationGraph = (containers = []) => {
  const list = Array.isArray(containers) ? containers : [];
  const byId = new Map();
  const children = new Map();
  const parents = new Map();

  for (const raw of list) {
    const node = normalizeGraphNode(raw);
    if (!node || byId.has(node.id)) continue;
    byId.set(node.id, node);
    children.set(node.id, []);
    parents.set(node.id, []);
  }
  for (const node of byId.values()) {
    for (const link of node.links) {
      if (!byId.has(link.containerId)) continue;
      if (!children.get(node.id).includes(link.containerId)) {
        children.get(node.id).push(link.containerId);
      }
      if (!parents.get(link.containerId).includes(node.id)) {
        parents.get(link.containerId).push(node.id);
      }
    }
  }
  return { byId, children, parents };
};

/** Обход по рёбрам с защитой от циклов. Возвращает все достижимые id, кроме старта. */
const reachable = (graph, startId, direction = 'children') => {
  const start = normalizeId(startId);
  const adjacency = direction === 'parents' ? graph.parents : graph.children;
  if (!start || !graph.byId.has(start)) return { ids: [], hasCycle: false };
  const visited = new Set([start]);
  const queue = [start];
  const ids = [];
  let hasCycle = false;
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (next === start) hasCycle = true;
      if (visited.has(next)) continue;
      visited.add(next);
      ids.push(next);
      queue.push(next);
    }
  }
  return { ids, hasCycle };
};

const descendantsOf = (graph, id) => reachable(graph, id, 'children').ids;
const ancestorsOf = (graph, id) => reachable(graph, id, 'parents').ids;
const hasCycleAt = (graph, id) => reachable(graph, id, 'children').hasCycle;

/**
 * Эффективные коды комнат узла = объединение его собственных кодов и кодов
 * ВСЕХ родителей (наследование «все те же коды от каждого родителя»).
 * Коды комнат задают видимость групп, а состояние локации и её ресурсы общи
 * для всех привязанных комнат.
 */
const effectiveRoomCodes = (graph, id) => {
  const start = normalizeId(id);
  if (!start || !graph.byId.has(start)) return [];
  const ids = [start, ...ancestorsOf(graph, start)];
  const seen = new Set();
  const out = [];
  for (const nodeId of ids) {
    for (const code of graph.byId.get(nodeId)?.roomCodes || []) {
      if (seen.has(code)) continue;
      seen.add(code);
      out.push(code);
    }
  }
  return out.sort();
};

const childIdsOf = (graph, id) => [...(graph.children.get(normalizeId(id)) || [])];
const parentIdsOf = (graph, id) => [...(graph.parents.get(normalizeId(id)) || [])];
const hasChildren = (graph, id) => childIdsOf(graph, id).length > 0;
const isLockable = (graph, id) => isLockableKind(graph.byId.get(normalizeId(id))?.kind);

/**
 * «Заблокировать всё» доступно на ЛЮБОМ узле с детьми, а не только на
 * «верхнем родителе». Блокируются только запираемые узлы-потомки.
 */
const lockAllTargets = (graph, id) => descendantsOf(graph, id)
  .filter((nodeId) => isLockable(graph, nodeId));

/**
 * Замок — граница видимости. Игрок видит сам запертый узел («дверь»), но не
 * знает, что за ним: все потомки скрыты. Мастер видит всё. Цикл A–B–C–A
 * не взрывает обход: посещённые узлы не пересчитываются повторно.
 */
const hiddenBehindLock = (graph, { lockedIds = [], isGm = false, rootId = '' } = {}) => {
  if (isGm) return [];
  const hidden = new Set();
  const locked = new Set((Array.isArray(lockedIds) ? lockedIds : []).map(normalizeId).filter(Boolean));
  for (const lockedId of locked) {
    for (const nodeId of descendantsOf(graph, lockedId)) hidden.add(nodeId);
  }
  // Корень сессии всегда виден игроку.
  hidden.delete(normalizeId(rootId));
  return [...hidden];
};

/**
 * Плоский список узлов сессии для сервера и клиента. Один и тот же узел может
 * иметь НЕСКОЛЬКО родителей — поэтому `parentIds` — массив, а не строка.
 * `childIds` и `roomCodes` (эффективные) едут вместе с узлом.
 */
const flattenForSession = (graph, rootId) => {
  const root = normalizeId(rootId);
  if (!root || !graph.byId.has(root)) return [];
  const result = new Map();
  const queue = [{ id: root, parentId: '', depth: 0 }];
  const visited = new Set();
  while (queue.length) {
    const { id, parentId, depth } = queue.shift();
    if (visited.has(id)) {
      const existing = result.get(id);
      if (existing && parentId && !existing.parentIds.includes(parentId)) {
        existing.parentIds.push(parentId);
        existing.depth = Math.min(existing.depth, depth);
      }
      continue;
    }
    visited.add(id);
    const node = graph.byId.get(id);
    const entry = {
      id,
      kind: node.kind,
      parentIds: parentId ? [parentId] : [],
      depth,
      childIds: childIdsOf(graph, id),
      roomCodes: effectiveRoomCodes(graph, id),
      locked: node.locked,
    };
    if (id !== root) result.set(id, entry);
    for (const child of entry.childIds) queue.push({ id: child, parentId: id, depth: depth + 1 });
  }
  return [...result.values()];
};

/**
 * Граф из уже нормализованных узлов сессии (у них есть `parentIds`/`childIds`).
 * Нужен на сервере, чтобы граница видимости и «заблокировать всё» работали
 * с тем же законом, что и граф карточек Мастера.
 */
const buildGraphFromSession = (rootId = '', nodes = []) => {
  const byId = new Map();
  const children = new Map();
  const parents = new Map();
  const root = normalizeId(rootId);
  if (root) {
    byId.set(root, { id: root, kind: 'hub', roomCodes: [], locked: false, links: [] });
    children.set(root, []);
    parents.set(root, []);
  }
  const list = Array.isArray(nodes) ? nodes : [];
  const nodeId = (node) => normalizeId(node?.containerId || node?.id);
  for (const node of list) {
    const id = nodeId(node);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      kind: String(node.kind || 'loot'),
      roomCodes: normalizeRoomCodes(node),
      locked: Boolean(node.locked),
      links: [],
    });
    children.set(id, []);
    parents.set(id, []);
  }
  for (const node of list) {
    const id = nodeId(node);
    if (!byId.has(id)) continue;
    // Старые сессии (516–522) не носили parentIds: считаем их детьми корня.
    const rawParentIds = Array.isArray(node.parentIds) ? node.parentIds : [];
    const parentIds = rawParentIds.length === 0 && root ? [root] : rawParentIds;
    const childIds = Array.isArray(node.childIds) ? node.childIds : [];
    for (const parent of parentIds.map(normalizeId).filter(Boolean)) {
      if (!byId.has(parent)) byId.set(parent, { id: parent, kind: 'hub', roomCodes: [], locked: false, links: [] });
      if (!children.has(parent)) children.set(parent, []);
      if (!parents.has(parent)) parents.set(parent, []);
      if (!children.get(parent).includes(id)) children.get(parent).push(id);
      if (!parents.get(id).includes(parent)) parents.get(id).push(parent);
    }
    for (const child of childIds.map(normalizeId).filter(Boolean)) {
      if (!byId.has(child)) continue;
      if (!children.get(id).includes(child)) children.get(id).push(child);
      if (!parents.get(child).includes(id)) parents.get(child).push(id);
    }
  }
  return { byId, children, parents };
};

/** Адресный взлом: открыть РОВНО одну точку, без каскада по потомкам. */
const addressableUnlock = (nodes = [], containerId) => {
  const id = normalizeId(containerId);
  return (Array.isArray(nodes) ? nodes : []).map((node) => (
    normalizeId(node.containerId || node.id) === id
      ? { ...node, locked: false }
      : node
  ));
};

module.exports = {
  LOCKABLE_KINDS,
  isLockableKind,
  normalizeId,
  normalizeRoomCodes,
  normalizeLinks,
  normalizeGraphNode,
  buildLocationGraph,
  descendantsOf,
  ancestorsOf,
  hasCycleAt,
  effectiveRoomCodes,
  childIdsOf,
  parentIdsOf,
  hasChildren,
  isLockable,
  lockAllTargets,
  hiddenBehindLock,
  flattenForSession,
  buildGraphFromSession,
  addressableUnlock,
};
