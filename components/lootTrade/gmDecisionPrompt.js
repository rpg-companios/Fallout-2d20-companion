/**
 * Патч 535: чистый отбор запросов «Мастер решает» (без React Native).
 *
 * Один каркас на все будущие спорные ситуации: сервер присылает решения с
 * полем `kind`, здесь мы только отбираем нерешённые и НЕ гадаем, какие ещё
 * виды появятся. Тексты для известных видов лежат в словаре, для неизвестных
 * есть общая пара строк — добавить новый вид = добавить строки и kind в
 * `GM_DECISION_KINDS` на сервере.
 */
import { isGmRoom } from './terminalRetryPrompt';

export const findPendingGmDecisions = (rooms, clientId = null) => {
  const out = [];
  for (const [code, room] of Object.entries(rooms || {})) {
    if (!isGmRoom(room, clientId)) continue;
    for (const decision of room?.gmDecisions || []) {
      if (!decision?.id || decision.status !== 'pending') continue;
      out.push({
        code,
        id: decision.id,
        kind: decision.kind,
        containerId: decision.containerId,
        name: decision.name || decision.containerId,
        requester: decision.requestedBy?.name || '',
        key: `${code}|${decision.id}`,
      });
    }
  }
  return out;
};

/** Какой парой строк подписать диалог. Расширяется вместе с видами решений. */
export const gmDecisionTextKeys = (kind) => (kind === 'lock.open'
  ? { titleKey: 'gmDecision.lockOpenTitle', messageKey: 'gmDecision.lockOpenMessage' }
  : { titleKey: 'gmDecision.genericTitle', messageKey: 'gmDecision.genericMessage' });
