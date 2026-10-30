import { useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../../db';
import * as savesModule from '../../src/saves/characterSaves';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore, { selectUiMode } from '../../src/store/appSettingsStore';
import useUiModeStore from '../../src/room/uiModeStore';
import useRoomStore, { onRoomDirective } from '../../src/room/roomStore';
import { syncBoundCharacterToRoom } from '../../src/room/roomCharacterSync';
import { syncCharacterToCloudIfEnabled } from '../cloudSync/googleDriveSync';
import { showRawAlert } from '../alerts/alertService';
import { getCurrentLocale } from '../../i18n/locale';
import {
  applyDirectiveToLiveCharacterStore,
  applyDirectiveToStoredCharacterRow,
} from '../../modules/fallout/gm/gmDirectives';
import { formatGm, tGm } from '../../modules/fallout/gm/gmI18n';
import { debugLog } from '../../src/debug/falloutDebug';

const APPLIED_DIRECTIVES_STORAGE_KEY = 'positronium_applied_gm_directives_v1';
const MAX_APPLIED_LOG = 200;

const appliedMemorySet = new Set();
let storageHydrated = false;
let processingChain = Promise.resolve();
const directiveAppliedListeners = new Set();

export const subscribePlayerDirectiveApplied = (listener) => {
  directiveAppliedListeners.add(listener);
  return () => { directiveAppliedListeners.delete(listener); };
};

export const resetAppliedDirectivesForTests = async () => {
  appliedMemorySet.clear();
  storageHydrated = false;
  try {
    await AsyncStorage.removeItem(APPLIED_DIRECTIVES_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const hydrateAppliedDirectivesOnce = async () => {
  if (storageHydrated) return;
  storageHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(APPLIED_DIRECTIVES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach((key) => {
        if (typeof key === 'string' && key) appliedMemorySet.add(key);
      });
    }
  } catch {
    // ignore storage errors
  }
};

const markDirectiveApplied = async (dedupeKey) => {
  appliedMemorySet.add(dedupeKey);
  try {
    const list = [...appliedMemorySet].slice(-MAX_APPLIED_LOG);
    await AsyncStorage.setItem(APPLIED_DIRECTIVES_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
};

const doesDirectiveTargetCharacter = (directive, characterId) => {
  if (!directive?.directiveId || !characterId) return false;
  if (Array.isArray(directive.ackedByCharacterIds) && directive.ackedByCharacterIds.includes(characterId)) {
    return false;
  }
  if (directive.targetType === 'character') {
    return directive.targetCharacterId === characterId;
  }
  if (Array.isArray(directive.targetCharacterIds) && directive.targetCharacterIds.length > 0) {
    return directive.targetCharacterIds.includes(characterId);
  }
  return true;
};

/**
 * Единая точка обработки входящих команд Мастера на стороне Игрока
 * (можно вызывать напрямую в интеграционных тестах и из фонового оверлея App.js).
 */
export const processPendingDirectivesForPlayer = async () => {
  const uiState = useUiModeStore.getState();
  const appUiMode = selectUiMode(useAppSettingsStore.getState());
  if ((uiState.tabUiMode || appUiMode) === 'gm') return [];

  await hydrateAppliedDirectivesOnce();

  let bindingRows = [];
  try {
    bindingRows = await db.getCharacterRoomBindings();
  } catch {
    return [];
  }
  if (!Array.isArray(bindingRows) || bindingRows.length === 0) return [];

  const roomStateMap = useRoomStore.getState().rooms || {};
  const locale = getCurrentLocale();
  const appliedResults = [];

  for (const binding of bindingRows) {
    const characterId = binding?.character_id;
    const roomCode = binding?.code;
    if (!characterId || !roomCode) continue;

    const room = roomStateMap[roomCode];
    if (!room || room.role === 'gm') continue;

    const directives = Array.isArray(room.directives) ? room.directives : [];
    for (const directive of directives) {
      if (!doesDirectiveTargetCharacter(directive, characterId)) continue;
      const dedupeKey = `${roomCode}:${directive.directiveId}:${characterId}`;
      if (appliedMemorySet.has(dedupeKey)) {
        // Даже если применили ранее до обрыва связи — повторяем ack серверу.
        useRoomStore.getState().ackGmDirective({
          code: roomCode,
          directiveId: directive.directiveId,
          characterId,
        }).catch(() => {});
        continue;
      }

      let characterName = '—';
      let summaryLine = '';

      if (useCharacterStore.getState().currentCharacterId === characterId) {
        characterName = useCharacterStore.getState().characterName || '—';
        summaryLine = applyDirectiveToLiveCharacterStore(directive, useCharacterStore, locale);
        await savesModule.saveCharacter(characterName);
      } else {
        const row = await db.loadCharacterById(characterId);
        if (!row) continue;
        characterName = row.name || '—';
        const res = applyDirectiveToStoredCharacterRow(directive, row, locale);
        summaryLine = res.summaryLine;
        await db.saveCharacter(
          row.id,
          row.name,
          res.nextLevel,
          row.originName ?? row.origin_name ?? null,
          res.nextData,
        );
        void syncCharacterToCloudIfEnabled(row.id).catch(() => {});
      }

      await markDirectiveApplied(dedupeKey);

      try {
        await useRoomStore.getState().ackGmDirective({
          code: roomCode,
          directiveId: directive.directiveId,
          characterId,
        });
      } catch (ackErr) {
        debugLog('gmDirective.ack:failed', { message: ackErr?.message });
      }

      try {
        await syncBoundCharacterToRoom(characterId, roomCode);
      } catch (syncErr) {
        debugLog('gmDirective.syncSnapshot:failed', { message: syncErr?.message });
      }

      if (summaryLine) {
        const noteBlock = directive.note
          ? `\n\n${formatGm(tGm('commands.playerAlert.notePrefix', locale), { note: directive.note })}`
          : '';
        showRawAlert({
          title: formatGm(tGm('commands.playerAlert.title', locale), { character: characterName }),
          message: `${summaryLine}${noteBlock}`,
        });
      }

      const appliedItem = {
        roomCode,
        characterId,
        directiveId: directive.directiveId,
        kind: directive.kind,
        summaryLine,
      };
      appliedResults.push(appliedItem);
      directiveAppliedListeners.forEach((fn) => {
        try { fn(appliedItem); } catch { /* ignore */ }
      });
    }
  }

  return appliedResults;
};

export const enqueuePendingDirectivesCheck = () => {
  processingChain = processingChain
    .catch(() => {})
    .then(() => processPendingDirectivesForPlayer());
  return processingChain;
};

export default function PlayerDirectiveOverlay() {
  const storeUiMode = useAppSettingsStore(selectUiMode);
  const tabUiMode = useUiModeStore((s) => s.tabUiMode);
  const isGmMode = (tabUiMode || storeUiMode) === 'gm';
  const roomStatus = useRoomStore((s) => s.status);
  const rooms = useRoomStore((s) => s.rooms);

  const triggerCheck = useCallback(() => {
    if (isGmMode) return;
    void enqueuePendingDirectivesCheck();
  }, [isGmMode]);

  useEffect(() => {
    triggerCheck();
  }, [triggerCheck, roomStatus, rooms]);

  useEffect(() => {
    if (isGmMode) return undefined;
    return onRoomDirective(() => {
      void enqueuePendingDirectivesCheck();
    });
  }, [isGmMode]);

  return null;
}
