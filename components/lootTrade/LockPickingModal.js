import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore, { roomHasTerminalProtocol } from '../../src/room/roomStore';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import { useLocale } from '../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { showRawAlert } from '../alerts/alertService';
import { terminalHackingStyles } from './terminalHackingStyles';
import { CELL_STATE } from './lockPickingConstants';
import {
  initialLocalLockState,
  applyLocalLockAction,
  buildLocalLockSnapshot,
} from './localLockGame';
import { shouldAutoStartLock, autoStartLockKey } from './lockAutoStart';

// Патч 520: каркас окна (backdrop/window/header/statusRow/кнопки/бейджи)
// целиком берётся у TerminalHackingModal. Здесь только то, чего у терминала
// нет: ячейки комбинации и крестовина стрелок.
const styles = StyleSheet.create({
  pinCount: { color: '#c8efb8', fontSize: 17, fontWeight: '800', fontFamily: 'monospace' },
  statText: { color: '#8da38b', fontSize: 11, marginTop: 4, fontFamily: 'monospace' },
  board: { marginTop: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#1b3822', backgroundColor: '#030805' },
  cellRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginVertical: 5 },
  cell: {
    width: 38, height: 38, borderWidth: 1.5, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
    borderColor: '#3a5c3d', backgroundColor: '#0c160e',
  },
  cellHidden: { borderColor: '#3a5c3d' },
  cellGreen: { borderColor: '#8fd06a', backgroundColor: 'rgba(80,150,55,0.18)' },
  cellRed: { borderColor: '#d05a5a', backgroundColor: 'rgba(150,45,45,0.22)' },
  cellGrey: { borderColor: '#5a5a5a', backgroundColor: 'rgba(90,90,90,0.14)' },
  cellText: { color: '#8b9a87', fontSize: 20, fontWeight: '800', fontFamily: 'monospace' },
  cellTextGreen: { color: '#a9f07d' },
  cellTextRed: { color: '#ff6b6b' },
  cellTextGrey: { color: '#9a9a9a' },
  crossArea: { alignItems: 'center', marginTop: 14, marginBottom: 6 },
  crossRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrowButton: {
    width: 52, height: 44, borderRadius: 4, borderWidth: 1,
    borderColor: '#88bf70', backgroundColor: '#1a2c19',
    alignItems: 'center', justifyContent: 'center',
  },
  arrowButtonDisabled: { opacity: 0.4 },
  arrowSpacer: { width: 52, height: 44 },
  resultText: { color: '#e2c477', fontSize: 12, marginTop: 9, textAlign: 'center', fontFamily: 'monospace', letterSpacing: 1 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 14 },
  ghostButton: { borderWidth: 1, borderColor: '#507052', borderRadius: 4, paddingHorizontal: 18, paddingVertical: 9 },
  ghostButtonText: { color: '#c9ddb9', fontFamily: 'monospace', fontWeight: '700' },
  retryActions: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 },
  hintText: { color: '#d7c68e', fontSize: 12, textAlign: 'center', marginTop: 8, fontFamily: 'monospace' },
});

const ARROW_ICON = {
  left: 'arrow-left-bold',
  up: 'arrow-up-bold',
  right: 'arrow-right-bold',
  down: 'arrow-down-bold',
};

const ARROW_KEY = {
  left: 'lock.arrowLeft',
  up: 'lock.arrowUp',
  right: 'lock.arrowRight',
  down: 'lock.arrowDown',
};

const CELL_ICON = {
  left: 'arrow-left',
  up: 'arrow-up',
  right: 'arrow-right',
  down: 'arrow-down',
};

// Патч 524: повторный start, «уже закрыт», «ждём Мастера» и отсутствие
// отмычек — штатные состояния доски, а не «Действие не выполнено».
const SILENT_ERRORS = new Set([
  'ROOM_TIMEOUT',
  'LOCK_NOT_ACTIVE',
  'LOCK_ALREADY_ACTIVE',
  'LOCK_NO_PINS',
  'LOCK_INVALID_ARROW',
  'TERMINAL_NOT_ACTIVE',
  'TERMINAL_ALREADY_ACTIVE',
  'TERMINAL_AWAITING_RETRY',
  'TERMINAL_INVALID_GUESS',
]);

const LockPickingModal = ({ visible, lock, roomCode, autoStart = false, ownerToken, onClose }) => {
  useLocale();
  const characterId = useCharacterStore((state) => state.currentCharacterId);
  const myClientId = useRoomStore((state) => state.clientId);
  const rooms = useRoomStore((state) => state.rooms);
  const [busy, setBusy] = useState(false);
  const [localState, setLocalState] = useState(initialLocalLockState);
  const [forceLocal, setForceLocal] = useState(false);
  const autoStartRef = useRef('');
  const republishRef = useRef(false);

  const containerId = String(lock?.containerId || '').trim();
  const terminalState = rooms?.[roomCode]?.terminalStates?.[containerId] || null;
  // Патч 524: как и у терминала, при отсутствии протокола комнаты доска
  // собирается локально. Никакого переключателя «локальный режим» в UI нет.
  const localMode = forceLocal || !roomHasTerminalProtocol(rooms?.[roomCode]);
  const game = localMode ? localState.view : (terminalState?.game || null);
  const isClosed = Boolean(game?.status === 'closed'
    || (!localMode && (terminalState?.closed || terminalState?.locked)));
  const awaitingGm = !isClosed && Boolean(game?.status === 'awaitingRetry'
    || (!localMode && terminalState?.awaitingGm));
  const won = game?.status === 'won';
  const isOperator = localMode || Boolean(game && game.operatorClientId === myClientId);
  const boardOfAnotherOperator = !localMode && Boolean(
    game && game.status === 'playing'
    && (game.operatorClientId !== myClientId || game.operatorCharacterId !== characterId),
  );
  const viewOnly = !localMode && Boolean(game && game.status === 'playing' && !isOperator);
  const canPress = Boolean(
    characterId && (roomCode || localMode) && containerId
    && game?.status === 'playing' && isOperator && !busy,
  );
  const pinsLeft = game ? (game.pinsRemaining || 0) + (game.pinActive ? 1 : 0) : 0;

  const localStep = (state, action, value) => {
    const snapshot = buildLocalLockSnapshot(useCharacterStore.getState());
    const next = applyLocalLockAction(state, action, value, {
      lock: lock || terminalState?.config,
      characterId,
      characterSnapshot: snapshot,
    });
    setLocalState(next);
    if (action === 'start' && next.view?.status === 'awaitingRetry' && next.view?.result === 'OUT OF PINS') {
      showRawAlert({
        title: tLootTrade('lock.noPins'),
        message: tLootTrade('lock.noPinsHint'),
      });
    } else if (next.error && !SILENT_ERRORS.has(next.error)) {
      showRawAlert({ title: tLootTrade('lock.actionFailed') });
    }
    return next;
  };

  const doAction = async (action, value) => {
    if (!containerId || (!roomCode && !localMode)) return;
    if (action !== 'retry' && !characterId) {
      showRawAlert({ title: tLootTrade('lock.selectCharacter') });
      return;
    }
    if (localMode) {
      localStep(localState, action, value);
      return;
    }
    setBusy(true);
    const publish = () => useRoomStore.getState().actOnTerminal({
      code: roomCode,
      containerId,
      action,
      characterId: characterId || undefined,
      value,
      ownerToken,
    });
    try {
      await publish();
      republishRef.current = false;
    } catch (error) {
      const code = error?.code || error?.message;
      // Старый сервер комнат не знает terminal.action: уходим в локальную
      // доску тем же безмолвным способом, что и мини-игра терминала.
      if (code === 'UNKNOWN_TYPE' || code === 'TERMINAL_NOT_ISSUED') {
        setForceLocal(true);
        localStep(initialLocalLockState(), 'start');
        return;
      }
      // Лист персонажа мог ещё не уехать в комнату (первый вход, реконнект).
      // Публикуем его и один раз повторяем действие вместо глухого отказа.
      if ((code === 'SESSION_FORBIDDEN' || code === 'CHAR_NOT_PUBLISHED') && !republishRef.current) {
        republishRef.current = true;
        try {
          await pushSavedCharacterToBoundRoomIfAny(characterId);
          await publish();
          return;
        } catch (retryError) {
          const retryCode = retryError?.code || retryError?.message;
          if (!SILENT_ERRORS.has(retryCode)) {
            showRawAlert({ title: tLootTrade('lock.sessionNotPublished') });
          }
          return;
        }
      }
      if (code === 'LOCK_VIEW_ONLY' || code === 'TERMINAL_VIEW_ONLY') {
        showRawAlert({ title: tLootTrade('lock.viewOnly') });
      } else if (code === 'KEY_REQUIRED') {
        showRawAlert({ title: tLootTrade('terminal.keyRequiredError') });
      } else if (code === 'TERMINAL_CLOSED') {
        showRawAlert({ title: tLootTrade('lock.closed'), message: tLootTrade('terminal.closedHint') });
      } else if (code === 'TERMINAL_AWAITING_RETRY') {
        showRawAlert({ title: tLootTrade('lock.awaiting'), message: tLootTrade('terminal.retryWaitingHint') });
      } else if (!SILENT_ERRORS.has(code)) {
        showRawAlert({ title: tLootTrade('lock.actionFailed') });
      }
    } finally {
      setBusy(false);
    }
  };

  // «Взломать» из карточки сразу собирает доску под текущий лист персонажа.
  // Патч 524: ключ дедупликации не зависит от accessId — приход состояния
  // комнаты больше не порождает второй start и ложное «Действие не выполнено».
  useEffect(() => {
    const allowed = shouldAutoStartLock({
      visible,
      autoStart,
      hasLock: Boolean(containerId),
      hasRoom: Boolean(roomCode || localMode),
      characterId,
      isClosed,
      awaitingGm,
      game,
      boardOfAnotherOperator,
    });
    if (!allowed) return;
    const key = autoStartLockKey({ roomCode, containerId, characterId, localMode });
    if (autoStartRef.current === key) return;
    autoStartRef.current = key;
    void doAction('start');
  // Статус доски намеренно входит в зависимости: после start повтор не нужен.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoStart, containerId, roomCode, characterId, localMode, game?.status, game?.operatorCharacterId, isClosed, awaitingGm]);

  const rows = useMemo(() => {
    const cells = game?.cells || [];
    const sizes = game?.rows || [cells.length];
    const out = [];
    let at = 0;
    for (const size of sizes) {
      out.push(cells.slice(at, at + size));
      at += size;
    }
    return out;
  }, [game?.cells, game?.rows]);

  const resultLabel = {
    'PIN BROKEN': 'lock.pinBroken',
    'PIN HELD': 'lock.pinHeld',
    'TRY AGAIN': 'lock.wrong',
    'OUT OF PINS': 'lock.noPins',
    'ACCESS GRANTED': 'lock.won',
  }[game?.result] || null;

  const renderCell = (cell, idx) => {
    const stateStyle = {
      [CELL_STATE.GREEN]: styles.cellGreen,
      [CELL_STATE.RED]: styles.cellRed,
      [CELL_STATE.GREY]: styles.cellGrey,
      [CELL_STATE.HIDDEN]: styles.cellHidden,
    }[cell?.state] || styles.cellHidden;
    const textStyle = {
      [CELL_STATE.GREEN]: styles.cellTextGreen,
      [CELL_STATE.RED]: styles.cellTextRed,
      [CELL_STATE.GREY]: styles.cellTextGrey,
    }[cell?.state] || null;
    const shown = cell?.arrow && cell.state !== CELL_STATE.HIDDEN && cell.state !== CELL_STATE.RED;
    return (
      <View key={`${idx}-${cell?.state}`} testID={`lock-cell-${idx}`} style={[styles.cell, stateStyle]}>
        {shown ? (
          <MaterialCommunityIcons name={CELL_ICON[cell.arrow]} size={22} color={
            cell.state === CELL_STATE.GREEN ? '#a9f07d' : '#9a9a9a'
          } />
        ) : (
          <Text style={[styles.cellText, textStyle]}>?</Text>
        )}
      </View>
    );
  };

  const arrowButton = (arrow) => (
    <TouchableOpacity
      key={arrow}
      testID={`lock-arrow-${arrow}`}
      accessibilityRole="button"
      accessibilityLabel={tLootTrade(ARROW_KEY[arrow])}
      style={[styles.arrowButton, !canPress && styles.arrowButtonDisabled]}
      disabled={!canPress}
      onPress={() => void doAction('press', arrow)}
    >
      <MaterialCommunityIcons name={ARROW_ICON[arrow]} size={22} color="#c8efb8" />
    </TouchableOpacity>
  );

  return (
    <Modal visible={Boolean(visible)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={terminalHackingStyles.backdrop}>
        <View style={terminalHackingStyles.window}>
          <View style={terminalHackingStyles.header}>
            <View style={terminalHackingStyles.heading}>
              <MaterialCommunityIcons name="lock" size={22} color="#93d17a" />
              <Text numberOfLines={1} style={terminalHackingStyles.title}>
                {lock?.name || terminalState?.config?.name || tLootTrade('lock.title')}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={tLootTrade('lock.close')}
              style={terminalHackingStyles.closeButton}
              onPress={onClose}
            >
              <MaterialCommunityIcons name="close" size={20} color="#bdc8b7" />
            </TouchableOpacity>
          </View>

          {(lock?.description || terminalState?.config?.description) ? (
            <Text style={terminalHackingStyles.description}>
              {lock?.description || terminalState?.config?.description}
            </Text>
          ) : null}

          <View style={terminalHackingStyles.statusRow}>
            <View>
              <Text testID="lock-pins-count" style={styles.pinCount}>
                {formatLootTrade(tLootTrade('lock.pins'), { count: pinsLeft })}
              </Text>
              <Text style={styles.statText}>
                {game?.cellCount
                  ? formatLootTrade(tLootTrade('lock.difficulty'), {
                      difficulty: game.difficulty,
                      count: game.cellCount,
                    })
                  : tLootTrade('lock.ready')}
              </Text>
            </View>
            <View style={terminalHackingStyles.operatorBox}>
              <Text style={terminalHackingStyles.statusLabel}>LOCKPICK</Text>
              {game ? (
                <Text style={styles.statText}>
                  {formatLootTrade(tLootTrade('lock.skill'), {
                    skill: game.skill, per: game.per, luck: game.luck,
                  })}
                </Text>
              ) : null}
            </View>
          </View>

          {won ? (
            <View style={terminalHackingStyles.successPanel}>
              <Text accessibilityRole="alert" style={terminalHackingStyles.accessGranted}>
                {tLootTrade('lock.won')}
              </Text>
              <Text style={terminalHackingStyles.statusHint}>{tLootTrade('terminal.stateWon')}</Text>
            </View>
          ) : isClosed ? (
            <View style={terminalHackingStyles.accessPanel}>
              <Text style={terminalHackingStyles.closedBadge}>{tLootTrade('lock.closed')}</Text>
              <Text style={terminalHackingStyles.statusHint}>{tLootTrade('terminal.closedHint')}</Text>
            </View>
          ) : awaitingGm ? (
            <View style={terminalHackingStyles.accessPanel}>
              <Text style={terminalHackingStyles.retryWaiting}>{tLootTrade('lock.awaiting')}</Text>
              <Text style={terminalHackingStyles.statusHint} testID="lock-retry-prompt">
                {tLootTrade('lock.retryPrompt')}
              </Text>
              {game?.result === 'OUT OF PINS' ? (
                <Text style={styles.hintText} testID="lock-no-pins-hint">
                  {tLootTrade('lock.noPinsHint')}
                </Text>
              ) : null}
              <View style={styles.retryActions}>
                <TouchableOpacity
                  testID="lock-retry-yes"
                  style={[terminalHackingStyles.primaryButton, { marginTop: 4 }]}
                  onPress={() => void doAction('retry', 'yes')}
                >
                  <Text style={terminalHackingStyles.primaryButtonText}>{tLootTrade('lock.retryYes')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="lock-retry-no"
                  style={styles.ghostButton}
                  onPress={() => void doAction('retry', 'no')}
                >
                  <Text style={styles.ghostButtonText}>{tLootTrade('lock.retryNo')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.board} testID="lock-cells-board">
                {rows.length > 0 ? rows.map((row, rowIdx) => (
                  <View key={`row-${rowIdx}`} style={styles.cellRow}>
                    {row.map(renderCell)}
                  </View>
                )) : (
                  <View style={terminalHackingStyles.idlePanel}>
                    <Text style={terminalHackingStyles.idleText}>{tLootTrade('lock.ready')}</Text>
                  </View>
                )}
              </View>

              <View style={styles.crossArea}>
                <View style={styles.crossRow}>
                  <View style={styles.arrowSpacer} />
                  {arrowButton('up')}
                  <View style={styles.arrowSpacer} />
                </View>
                <View style={styles.crossRow}>
                  {arrowButton('left')}
                  {arrowButton('down')}
                  {arrowButton('right')}
                </View>
              </View>

              {resultLabel ? (
                <Text testID="lock-result" style={styles.resultText}>{tLootTrade(resultLabel)}</Text>
              ) : null}
              {viewOnly ? (
                <Text style={terminalHackingStyles.spectatorNotice}>{tLootTrade('lock.viewOnly')}</Text>
              ) : null}
              {game && game.cells?.some((c) => c.state === CELL_STATE.GREY) ? (
                <Text style={terminalHackingStyles.statusHint}>{tLootTrade('lock.greyHint')}</Text>
              ) : null}
              {game && game.cellCount ? (
                <Text style={terminalHackingStyles.statusHint}>
                  {formatLootTrade(tLootTrade('lock.progress'), {
                    done: game.cells.filter((c) => c.state === CELL_STATE.GREEN).length,
                    total: game.cellCount,
                  })}
                </Text>
              ) : null}

              <View style={styles.footerRow}>
                <TouchableOpacity
                  testID="lock-hack-button"
                  style={[terminalHackingStyles.primaryButton, !characterId && terminalHackingStyles.disabledButton]}
                  disabled={!characterId || Boolean(game?.status === 'playing')}
                  onPress={() => void doAction('start')}
                >
                  <Text style={terminalHackingStyles.primaryButtonText}>{tLootTrade('lock.hack')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default LockPickingModal;
