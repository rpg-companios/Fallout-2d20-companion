/**
 * Патч 535 — штатный выход «Мастер решает»: «Да/Нет» поверх ЛЮБОГО экрана.
 *
 * Тот же паттерн, что и TerminalRetryPromptHost (504), но источник правды —
 * не доска терминала, а реестр запросов `gmDecisions` в roomStore. Состояние
 * запросов принадлежит Мастеру и приходит с сервера (закон снимка 529), так
 * что вопрос всплывет во всех вкладках Мастера, а игрок видит ожидание.
 *
 * Компонент ничего не рендерит: диалоги рисует AlertHost через showRawAlert.
 * Несколько запросов обрабатываются последовательной очередью.
 */

import React, { useEffect, useRef } from 'react';
import * as db from '../../db';
import useRoomStore from '../../src/room/roomStore';
import { showRawAlert } from '../alerts/alertService';
import { useLocale } from '../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { debugLog } from '../../src/debug/falloutDebug';
import { findPendingGmDecisions, gmDecisionTextKeys } from './gmDecisionPrompt';

const GmDecisionPromptHost = () => {
  useLocale();
  const handledRef = useRef(new Set());
  const queueRef = useRef([]);
  const busyRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const drain = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        let ownerTokens = {};
        try {
          const rows = await Promise.race([
            db.getFolderRooms(),
            new Promise((resolve) => setTimeout(() => resolve([]), 1000)),
          ]);
          ownerTokens = Object.fromEntries(
            (rows || [])
              .filter((row) => row?.code && row?.owner_token)
              .map((row) => [String(row.code), String(row.owner_token)]),
          );
        } catch {
          ownerTokens = {};
        }
        while (queueRef.current.length > 0) {
          const item = queueRef.current.shift();
          const keys = gmDecisionTextKeys(item.kind);
          const message = [
            formatLootTrade(tLootTrade(keys.messageKey), {
              name: item.name,
              requester: item.requester || '—',
            }),
          ].join('\n');
          // eslint-disable-next-line no-await-in-loop
          const index = await showRawAlert({
            title: tLootTrade(keys.titleKey),
            message,
            kind: 'info',
            buttons: [
              { text: tLootTrade('gmDecision.yes') },
              { text: tLootTrade('gmDecision.no'), style: 'cancel' },
            ],
          });
          if (index !== 0 && index !== 1) {
            const requeue = () => {
              queueRef.current.push(item);
              busyRef.current = false;
              void drain();
            };
            handledRef.current.delete(item.key);
            timerRef.current = setTimeout(requeue, 1500);
            return;
          }
          const value = index === 0 ? 'yes' : 'no';
          try {
            // eslint-disable-next-line no-await-in-loop
            await useRoomStore.getState().resolveGmDecision({
              code: item.code,
              decisionId: item.id,
              value,
              ownerToken: ownerTokens[item.code],
            });
          } catch (error) {
            debugLog('gm.decision:failed', { message: error?.message });
            handledRef.current.delete(item.key);
            // eslint-disable-next-line no-await-in-loop
            await showRawAlert({ title: tLootTrade('gmDecision.failed') });
            timerRef.current = setTimeout(() => {
              queueRef.current.push(item);
              busyRef.current = false;
              void drain();
            }, 1500);
            return;
          }
        }
      } finally {
        busyRef.current = false;
      }
    };

    const collect = (state) => {
      const clientId = state?.clientId || useRoomStore.getState().clientId;
      for (const item of findPendingGmDecisions(state?.rooms, clientId)) {
        if (handledRef.current.has(item.key)) continue;
        handledRef.current.add(item.key);
        queueRef.current.push(item);
      }
      if (queueRef.current.length > 0) void drain();
    };

    const unsubscribe = useRoomStore.subscribe(collect);
    collect(useRoomStore.getState());
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return null;
};

export default GmDecisionPromptHost;
