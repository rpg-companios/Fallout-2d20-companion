/**
 * Патч 530 — семантика взлома в иерархии пространств (тезис 13).
 *
 * Слово владельца: «развести в интерфейсе семантику "взлом локации = вход"
 * и "взлом контейнера = содержимое"».
 *
 * Локация — узел с детьми (или kind=hub у старых сессий без childIds):
 * успешный взлом ВВОДИТ игрока внутрь, показывая её точки. Контейнер — узел
 * без детей: успешный взлом показывает СОДЕРЖИМОЕ (добычу или торговца).
 *
 * Чистые функции: их можно проверять без React и без комнатного сервера.
 */

export const HACK_OUTCOME = Object.freeze({
  ENTER: 'enter',
  CONTENTS: 'contents',
});

/** Небольшая пауза, чтобы игрок увидел ACCESS GRANTED до перехода. */
export const HACK_OUTCOME_DELAY_MS = 700;

export const HUB_KIND = 'hub';

export const nodeHasChildren = (node) => {
  if (Array.isArray(node?.childIds)) return node.childIds.length > 0;
  return node?.kind === HUB_KIND;
};

export const hackOutcomeForNode = (node) => (
  nodeHasChildren(node) ? HACK_OUTCOME.ENTER : HACK_OUTCOME.CONTENTS
);

/** Ключ победы, чтобы один и тот же ACCESS GRANTED не отработал дважды. */
export const hackWinKey = (containerId, state) => (
  `${containerId}|${state?.accessId || ''}|${state?.game?.revision || 0}`
);

/**
 * Применить исход взлома к навигации игрока. enter — вложенная локация,
 * contents — открытый контейнер. Никаких каскадов: только адресный узел.
 */
export const applyHackOutcome = (outcome, targetId, handlers = {}) => {
  const { enterLocation = () => {}, openContents = () => {} } = handlers;
  const id = String(targetId || '').trim();
  if (!id) return HACK_OUTCOME.CONTENTS;
  if (outcome === HACK_OUTCOME.ENTER) {
    enterLocation(id);
    return HACK_OUTCOME.ENTER;
  }
  openContents(id);
  return HACK_OUTCOME.CONTENTS;
};

export default hackOutcomeForNode;
