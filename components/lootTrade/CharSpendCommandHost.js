/**
 * Патч 528/529: ЗАКОН СНИМКА — исполнитель команд изменения листа.
 *
 * «Снапшот юзера не трогаем, если надо что-то изменить у пользователя —
 * посылаем команду, которую исполнит клиент. По нему должно работать всё
 * пространство мастера. Снапшот нужен для наблюдения за изменением состояния
 * пользователя без вмешательства даже между сессиями».
 *
 * Сервер шлёт оператору два кадра подряд (порядок WebSocket гарантирован):
 *
 *   1. `char.command` (528-алиас `char.spend`) — { commandId, characterId,
 *      kind, payload }. Исполнители — `components/gm/charCommands.js`: только
 *      штатные действия characterStore + saveCharacter, белый список kind.
 *   2. `char.refresh` — «после исполнения обнови снимок»: обычный char.publish
 *      через `pushSavedCharacterToBoundRoomIfAny`.
 *
 * `commandId` дедуплицируется (память + AsyncStorage), поэтому повтор команды
 * после реконнекта не применит изменение дважды. Монтируется один раз в App.js
 * поверх ВСЕХ экранов: окно мини-игры/终端а могло быть уже закрыто, а лист
 * всё равно должен обновиться. Компонент ничего не рисует.
 */

import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';
import { onRoomCharSpend } from '../../src/room/roomStore';
import { ROOM_MESSAGE } from '../../src/room/roomProtocol';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import { debugLog } from '../../src/debug/falloutDebug';
import {
  normalizeCharacterCommand,
  applyCharacterCommand,
} from '../gm/charCommands';

const APPLIED_KEY = 'positronium_applied_char_commands_v1';
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

const markApplied = async (commandId) => {
  applied.add(commandId);
  try {
    await AsyncStorage.setItem(APPLIED_KEY, JSON.stringify([...applied].slice(-MAX_APPLIED)));
  } catch { /* не блокируем исполнение */ }
};

/** Точка сброса для тестов. */
export const resetAppliedPinSpendsForTests = () => {
  applied.clear();
  hydrated = false;
};

/** Чистый обработчик кадра — экспортирован для приёмочных тестов. */
export const applyCharSpendCommand = async (message, jobs, deps = {}) => {
  const {
    execute = applyCharacterCommand,
    publish = pushSavedCharacterToBoundRoomIfAny,
    getCharacterId = () => useCharacterStore.getState().currentCharacterId,
    isApplied = async (id) => { await hydrateOnce(); return applied.has(id); },
    setApplied = markApplied,
    log = debugLog,
    executionDeps = {},
  } = deps;
  const type = message?.type;
  const payload = message?.payload || {};

  if (type === ROOM_MESSAGE.CHAR_COMMAND || type === ROOM_MESSAGE.CHAR_SPEND) {
    const command = normalizeCharacterCommand(message, ROOM_MESSAGE);
    const commandId = command.commandId;
    if (!commandId) return { ok: false, reason: 'no-command-id' };
    if (await isApplied(commandId)) return { ok: true, duplicate: true };
    if (!command.characterId) return { ok: false, reason: 'no-character' };
    const current = getCharacterId();
    if (current && current !== command.characterId) {
      // Другая вкладка/персонаж: команда адресована не этому листу.
      return { ok: false, reason: 'other-character' };
    }
    const job = (async () => {
      const result = await execute(command, executionDeps);
      if (!result?.ok) return 0;
      await setApplied(commandId);
      return 1;
    })().catch((error) => {
      log('gm.charCommand:jobFailed', { commandId, message: error?.message });
      return 0;
    });
    jobs.set(commandId, job);
    return { ok: true, started: true, kind: command.kind };
  }

  if (type === ROOM_MESSAGE.CHAR_REFRESH) {
    const commandId = String(payload.commandId || payload.spendId || '').trim();
    if (!commandId) return { ok: false, reason: 'no-command-id' };
    // Вторая команда приходит сразу за первой, но исполнение асинхронно:
    // явно ждём его, чтобы в комнату ушёл УЖЕ обновлённый лист.
    const job = jobs.get(commandId) || Promise.resolve(0);
    await job;
    const characterId = String(payload.characterId || '').trim();
    if (characterId) {
      try { await publish(characterId); } catch (error) {
        log('gm.charRefresh:failed', { commandId, message: error?.message });
      }
    }
    jobs.delete(commandId);
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
