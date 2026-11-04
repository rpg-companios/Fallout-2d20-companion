/**
 * Патч 528: штатное списание заколки по команде сервера.
 *
 * Сервер больше НЕ уменьшает quantity в опубликованном снимке листа. При
 * поломке он шлёт оператору две команды подряд (порядок кадров WebSocket
 * гарантирован):
 *
 *   1. `char.spend`   — «спиши заколку из инвентаря штатными средствами»;
 *   2. `char.refresh` — «после списания обнови снимок» (обычный char.publish).
 *
 * Здесь команды применяются последовательно: вторая всегда дожидается первой.
 * Списание идёт через общий `spendItemStacks` + `saveCharacter`, публикация —
 * через штатный `pushSavedCharacterToBoundRoomIfAny`. `spendId` дедуплицирует
 * повтор команды после реконнекта, чтобы не списать заколку дважды.
 *
 * Монтируется один раз в App.js: игрок мог уже закрыть окно мини-игры, а лист
 * всё равно должен обновиться. Компонент ничего не рисует.
 */

import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';
import { onRoomCharSpend } from '../../src/room/roomStore';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import { debugLog } from '../../src/debug/falloutDebug';
import { spendBobbyPins } from './spendBobbyPins';

const APPLIED_KEY = 'positronium_applied_pin_spends_v1';
const MAX_APPLIED = 200;
const applied = new Set();
let hydrated = false;

const hydrateOnce = async () => {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(APPLIED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) list.forEach((id) => { if (typeof id === 'string') applied.add(id); });
  } catch { /* нет хранилища — дедуплицируем в памяти сессии */ }
};

const markApplied = async (spendId) => {
  applied.add(spendId);
  try {
    await AsyncStorage.setItem(APPLIED_KEY, JSON.stringify([...applied].slice(-MAX_APPLIED)));
  } catch { /* не блокируем списание */ }
};

/** Точка сброса для тестов. */
export const resetAppliedPinSpendsForTests = () => {
  applied.clear();
  hydrated = false;
};

/** Чистый обработчик кадра — экспортирован для приёмочных тестов. */
export const applyCharSpendCommand = async (message, jobs, deps = {}) => {
  const {
    spendBobbyPins: spend = spendBobbyPins,
    publish = pushSavedCharacterToBoundRoomIfAny,
    getCharacterId = () => useCharacterStore.getState().currentCharacterId,
    isApplied = async (id) => { await hydrateOnce(); return applied.has(id); },
    setApplied = markApplied,
    log = debugLog,
  } = deps;
  const type = message?.type;
  const payload = message?.payload || {};
  const spendId = String(payload.spendId || '').trim();
  if (!spendId) return { ok: false, reason: 'no-spend-id' };

  if (type === ROOM_MESSAGE.CHAR_SPEND) {
    if (await isApplied(spendId)) return { ok: true, duplicate: true };
    const characterId = String(payload.characterId || '').trim();
    if (!characterId) return { ok: false, reason: 'no-character' };
    const current = getCharacterId();
    if (current && current !== characterId) {
      // Другая вкладка/персонаж: команда адресована не этому листу.
      return { ok: false, reason: 'other-character' };
    }
    if (String(payload.itemId || 'item_bobby_pin') !== 'item_bobby_pin') {
      return { ok: false, reason: 'wrong-item' };
    }
    const job = (async () => {
      const spent = await spend(Math.max(1, Math.floor(Number(payload.count) || 1)), {
        characterId,
        publish: false, // публикация — вторая команда char.refresh
      });
      await setApplied(spendId);
      return spent;
    })().catch((error) => {
      log('lock.charSpend:failed', { spendId, message: error?.message });
      return 0;
    });
    jobs.set(spendId, job);
    return { ok: true, started: true };
  }

  if (type === ROOM_MESSAGE.CHAR_REFRESH) {
    // Вторая команда приходит сразу за первой, но списание асинхронно:
    // явно ждём его, чтобы в комнату ушёл УЖЕ обновлённый лист.
    const job = jobs.get(spendId) || Promise.resolve(0);
    await job;
    const characterId = String(payload.characterId || '').trim();
    if (characterId) {
      try { await publish(characterId); } catch (error) {
        log('lock.charRefresh:failed', { spendId, message: error?.message });
      }
    }
    jobs.delete(spendId);
    return { ok: true, refreshed: true };
  }
  return { ok: false, reason: 'unknown-type' };
};

const CharSpendCommandHost = () => {
  useEffect(() => {
    const jobs = new Map();
    const unsubscribe = onRoomCharSpend((message) => {
      void applyCharSpendCommand(message, jobs);
    });
    return () => {
      unsubscribe();
      jobs.clear();
    };
  }, []);
  return null;
};

export default CharSpendCommandHost;
