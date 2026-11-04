import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
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
// Патч 525: светлая гамма модалок, а не зелёный «терминал». Каркас окна
// (overlay/card/title/кнопки/подписи) импортируется из lootTradeFormStyles,
// ниже — только уникальные для замка ячейки и крестовина стрелок.
import { modalStyles, lockLightStyles, LOCK_PALETTE } from './lockPickingStyles';
import { CELL_STATE } from './lockPickingConstants';
import {
  initialLocalLockState,
  applyLocalLockAction,
  buildLocalLockSnapshot,
} from './localLockGame';
import { shouldAutoStartLock, autoStartLockKey } from './lockAutoStart';

const styles = lockLightStyles;

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

  // «Взломать» из карточки точки сразу собирает доску под текущий лист
  // персонажа. Патч 524: ключ дедупликации не зависит от accessId — приход
  // состояния комнаты больше не порождает второй start и ложный отказ.
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
            cell.state === CELL_STATE.GREEN ? '#1b5e20' : LOCK_PALETTE.mutedText
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
      style={[
        modalStyles.btn,
        modalStyles.saveBtn,
        styles.arrowButton,
        !canPress && styles.arrowButtonDisabled,
      ]}
      disabled={!canPress}
      onPress={() => void doAction('press', arrow)}
    >
      <MaterialCommunityIcons name={ARROW_ICON[arrow]} size={22} color={LOCK_PALETTE.text} />
    </TouchableOpacity>
  );

  const hasBoard = Boolean(game && rows.length > 0);

  return (
    <Modal visible={Boolean(visible)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.card}>
          <View style={styles.headerRow}>
            <MaterialCommunityIcons name="lock" size={22} color={LOCK_PALETTE.text} />
            <Text numberOfLines={1} style={[modalStyles.title, styles.headerTitle]}>
              {lock?.name || terminalState?.config?.name || tLootTrade('lock.title')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={tLootTrade('lock.close')}
              testID="lock-close-button"
              style={styles.closeButton}
              onPress={onClose}
            >
              <MaterialCommunityIcons name="close" size={20} color={LOCK_PALETTE.mutedText} />
            </TouchableOpacity>
          </View>

          {(lock?.description || terminalState?.config?.description) ? (
            <Text style={modalStyles.hintText}>
              {lock?.description || terminalState?.config?.description}
            </Text>
          ) : null}

          <View style={styles.statusRow}>
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
            <View style={{ alignItems: 'flex-end', maxWidth: '48%' }}>
              <Text style={styles.statusLabel}>LOCKPICK</Text>
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
            <View style={styles.accessPanel}>
              <Text accessibilityRole="alert" style={styles.wonText}>
                {tLootTrade('lock.won')}
              </Text>
              <Text style={styles.statusHint}>{tLootTrade('terminal.stateWon')}</Text>
            </View>
          ) : isClosed ? (
            <View style={styles.accessPanel}>
              <Text style={styles.closedText}>{tLootTrade('lock.closed')}</Text>
              <Text style={styles.statusHint}>{tLootTrade('terminal.closedHint')}</Text>
            </View>
          ) : awaitingGm ? (
            <View style={styles.accessPanel}>
              <Text style={styles.awaitingText}>{tLootTrade('lock.awaiting')}</Text>
              <Text style={styles.statusHint} testID="lock-retry-prompt">
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
                  style={[modalStyles.btn, modalStyles.saveBtn]}
                  onPress={() => void doAction('retry', 'yes')}
                >
                  <Text style={modalStyles.saveBtnText}>{tLootTrade('lock.retryYes')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="lock-retry-no"
                  style={[modalStyles.btn, modalStyles.cancelBtn]}
                  onPress={() => void doAction('retry', 'no')}
                >
                  <Text style={modalStyles.cancelBtnText}>{tLootTrade('lock.retryNo')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : !hasBoard ? (
            // Патч 525: окно мини-игры больше не притворяется запущенной игрой.
            // Доска появляется только после «Взломать» во входной модалке точки.
            <View style={styles.idlePanel} testID="lock-waiting-board">
              <Text style={styles.idleText}>{tLootTrade('player.checkWaitingBoard')}</Text>
              <Text style={styles.hintText}>{tLootTrade('player.checkEntryHint')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.board} testID="lock-cells-board">
                {rows.map((row, rowIdx) => (
                  <View key={`row-${rowIdx}`} style={styles.cellRow}>
                    {row.map(renderCell)}
                  </View>
                ))}
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
                <Text style={styles.spectatorNotice}>{tLootTrade('lock.viewOnly')}</Text>
              ) : null}
              {game.cells?.some((c) => c.state === CELL_STATE.GREY) ? (
                <Text style={styles.statusHint}>{tLootTrade('lock.greyHint')}</Text>
              ) : null}
              <Text style={styles.statusHint}>
                {formatLootTrade(tLootTrade('lock.progress'), {
                  done: game.cells.filter((c) => c.state === CELL_STATE.GREEN).length,
                  total: game.cellCount,
                })}
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default LockPickingModal;
