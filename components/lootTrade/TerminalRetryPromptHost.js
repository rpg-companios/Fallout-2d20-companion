/**
 * Патч 504 — вопрос Мастеру «Разрешить повторный взлом? Да/Нет».
 * Патч 505 — уведомление Мастеру «Терминал взломан» после ACCESS GRANTED.
 *
 * Монтируется один раз в App.js поверх ЛЮБОГО экрана: Мастер может в этот
 * момент править лист, смотреть карту или быть в админке, а сообщение всё
 * равно всплывёт. Источник правды — terminalStates комнат из roomStore:
 * сервер выставляет `awaitingGm` при исчерпании попыток и присылает `won`
 * при победе. Диалоги рисует AlertHost через showRawAlert; этот компонент
 * ничего не рендерит (return null), он только слушает сеть и решает, какой
 * запрос отправить.
 *
 * Диалоги показываются по очереди: AlertHost держит один запрос, поэтому
 * несколько событий обрабатываются последовательной очередью.
 */

import React, { useEffect, useRef } from 'react';
import * as db from '../../db';
import useRoomStore from '../../src/room/roomStore';
import { showRawAlert } from '../alerts/alertService';
import { useLocale } from '../../i18n/locale';
import {
  tLootTrade,
  formatLootTrade,
} from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { debugLog } from '../../src/debug/falloutDebug';
import { findPending, findCompleted } from './terminalRetryPrompt';

const TerminalRetryPromptHost = () => {
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
        // Патч 506: БД больше не может заблокировать показ уведомления.
        // Если локальное хранилище недоступно или транзакция зависла,
        // продолжаем без ownerToken (он нужен только для ответа «Да/Нет»).
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

          // Патч 505: успех — просто видимое уведомление Мастеру. Никакого
          // действия на сервер: доска после победы не пересобирается, новую
          // партию Мастер начинает явной повторной трансляцией.
          if (item.kind === 'won') {
            // eslint-disable-next-line no-await-in-loop
            await showRawAlert({
              // Патч 526: у замка свой текст — «новую доску создаст только
              // повторная трансляция» для него больше неверно: игрок сам
              // начинает новый подход.
              title: tLootTrade(item.isLock ? 'lock.hackedTitle' : 'terminal.hackedTitle'),
              message: formatLootTrade(tLootTrade(
                item.isLock ? 'lock.hackedMessage' : 'terminal.hackedMessage',
              ), {
                name: item.name,
                operator: item.operatorName || '—',
              }),
              kind: 'info',
            });
            continue;
          }

          const message = [
            tLootTrade('terminal.attemptsExhausted'),
            `${item.name} · ${formatLootTrade(tLootTrade('card.terminalDifficulty'), { difficulty: item.difficulty })}`,
            tLootTrade('terminal.retryMessage'),
          ].join('\n');
          // eslint-disable-next-line no-await-in-loop
          const index = await showRawAlert({
            title: tLootTrade('terminal.retryTitle'),
            message,
            kind: 'info',
            buttons: [
              { text: tLootTrade('terminal.retryYes') },
              { text: tLootTrade('terminal.retryNo'), style: 'cancel' },
            ],
          });
          if (index !== 0 && index !== 1) {
            // Диалог закрыли без ответа — вопрос остаётся обязательным.
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
            await useRoomStore.getState().actOnTerminal({
              code: item.code,
              containerId: item.containerId,
              action: 'retry',
              value,
              ownerToken: ownerTokens[item.code],
            });
          } catch (error) {
            debugLog('terminal.retry:failed', { message: error?.message });
            handledRef.current.delete(item.key);
            // eslint-disable-next-line no-await-in-loop
            await showRawAlert({ title: tLootTrade('terminal.retryFailed') });
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
      // Патч 506: владельца определяем и по participant'у с role 'gm' —
      // UI-режим вкладки больше не влияет на доставку сообщений Мастеру.
      const clientId = state?.clientId || useRoomStore.getState().clientId;
      const events = [
        ...findPending(state?.rooms, clientId).map((item) => ({ ...item, kind: 'retry' })),
        ...findCompleted(state?.rooms, clientId),
      ];
      for (const item of events) {
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

export default TerminalRetryPromptHost;
