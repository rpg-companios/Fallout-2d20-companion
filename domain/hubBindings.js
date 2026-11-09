// domain/hubBindings.js
// Патч 563 — «тождественность привязки терминалов/замков к локации и наоборот».
//
// Слово владельца: «Если я в терминале/замке выбираю локацию, то они туда
// встраиваются. А не только через локацию». И: «Могут [лежать в нескольких],
// например "бродячий" торговец».
//
// Откуда путаница. Привязка живёт ТОЛЬКО в родителе и в двух разных полях:
//   - сундук/торговец/терминал/замок — `hub.links[].containerId`;
//   - локация-в-локации — `child.parentLocationId`.
// Правок было две разных: одна в форме предмета, другая в дереве локации, и
// каждая знала только своё поле. Отсюда «через локацию работает, из терминала
// нет». Здесь ОДИН закон на все входы: что видно в дереве, то и записывается из
// формы, и наоборот. Никаких новых полей у ребёнка не появляется — иначе появятся
// две правды, которые разъедутся при первом же переносе.
import { CONTAINER_KIND } from './lootTrade';

const text = (value) => String(value ?? '').trim();

/** Кем является узел для графа: локация хранит родителя у СЕБЯ, остальные — в родителе. */
export const isLocationNode = (container) => container?.kind === CONTAINER_KIND.HUB;

/**
 * Где сейчас лежит сущность — один ответ для всех экранов.
 * Локация: её `parentLocationId`. Остальные: все локации, у которых она в links.
 *
 * @returns {{ primary: string, all: string[] }}
 */
export const locateContainer = (container, allContainers = []) => {
  const list = Array.isArray(allContainers) ? allContainers : [];
  if (!container?.id) return { primary: '', all: [] };
  if (isLocationNode(container)) {
    const parent = text(container.parentLocationId);
    return { primary: parent, all: parent ? [parent] : [] };
  }
  const ids = [];
  for (const hub of list) {
    if (!hub || hub.kind !== CONTAINER_KIND.HUB || hub.id === container.id) continue;
    if ((hub.links || []).some((link) => text(link?.containerId) === container.id)) ids.push(hub.id);
  }
  return { primary: ids[0] || '', all: ids };
};

const linkFor = (containerId) => ({ containerId, locked: false, lockLabel: '' });

/**
 * План записи: что сохранить ребёнку и какие локации переписать.
 * Чистая функция — экран только применяет результат через persistAndSyncContainer.
 *
 * Семантика та же, что у человека перед глазами: «основная локация» + «ещё
 * локации». Основная первой попадает в links, чтобы дерево и карточка читали её
 * первой; порядок остальных сохраняется.
 *
 * @param {object} params
 * @param {object} params.container      — сохраняемая сущность
 * @param {string} params.primaryHubId   — основная локация ('' = на корень)
 * @param {string[]} [params.extraHubIds] — дополнительные локации (бродячий торговец)
 * @param {object[]} params.allContainers — все контейнеры Мастера
 * @returns {{ containerPatch: object, hubUpdates: Array<{id: string, links: object[]}> }}
 */
export const planLocationBinding = ({
  container,
  primaryHubId = '',
  extraHubIds = [],
  allContainers = [],
}) => {
  const target = container || {};
  const list = Array.isArray(allContainers) ? allContainers : [];
  const primary = text(primaryHubId);
  const extras = [];
  const seen = new Set(primary ? [primary] : []);
  for (const id of Array.isArray(extraHubIds) ? extraHubIds : []) {
    const clean = text(id);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    extras.push(clean);
  }
  const nextIds = [...(primary ? [primary] : []), ...extras];

  if (isLocationNode(target)) {
    const current = text(target.parentLocationId);
    const containerPatch = current === primary
      ? {}
      : { parentLocationId: primary, inRoot: !primary };
    return { containerPatch, hubUpdates: [] };
  }

  const hubUpdates = [];
  for (const hub of list) {
    if (!hub || hub.kind !== CONTAINER_KIND.HUB || hub.id === target.id) continue;
    const links = Array.isArray(hub.links) ? hub.links : [];
    const has = links.some((link) => text(link?.containerId) === target.id);
    const should = nextIds.includes(hub.id);
    if (has === should) continue;
    const nextLinks = should
      ? [
        // Основная локация — первой, чтобы «Где лежит» читалось однозначно.
        ...(hub.id === primary ? [linkFor(target.id)] : []),
        ...links.filter((link) => text(link?.containerId) !== target.id),
        ...(hub.id === primary ? [] : [linkFor(target.id)]),
      ]
      : links.filter((link) => text(link?.containerId) !== target.id);
    hubUpdates.push({ id: hub.id, links: nextLinks });
  }
  // Ребёнок, привязанный хоть куда-то, с корня уходит; без локаций — возвращается.
  const inRoot = nextIds.length === 0 ? true : false;
  const containerPatch = target.inRoot === inRoot ? {} : { inRoot };
  return { containerPatch, hubUpdates };
};

/**
 * Перенос из одной локации в другую (перетаскиванием строки в дереве или через
 * «Переместить»). Источник убираем, цель добавляем, прочие привязки не трогаем:
 * бродячий торговец остаётся в тех локациях, где стоял.
 *
 * @param {object} params
 * @param {object} params.container
 * @param {string} params.targetHubId
 * @param {string} [params.fromHubId] — из какой локации тащим (её и снимаем)
 * @param {object[]} params.allContainers
 */
export const planMoveIntoLocation = ({
  container,
  targetHubId,
  fromHubId = '',
  allContainers = [],
}) => {
  const target = container || {};
  const to = text(targetHubId);
  if (!to || to === target.id) return { containerPatch: {}, hubUpdates: [] };
  if (isLocationNode(target)) {
    return planLocationBinding({ container: target, primaryHubId: to, allContainers });
  }
  const current = locateContainer(target, allContainers).all;
  const from = text(fromHubId);
  const extras = current.filter((id) => id !== from && id !== to);
  return planLocationBinding({
    container: target,
    primaryHubId: to,
    extraHubIds: extras,
    allContainers,
  });
};

export default { locateContainer, planLocationBinding, planMoveIntoLocation, isLocationNode };
