import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useCharacterStore from '../../src/store/characterStore';
import useRoomStore, { roomHasTerminalProtocol } from '../../src/room/roomStore';
import {
  initialLocalTerminalState,
  applyLocalTerminalAction,
  buildLocalCharacterSnapshot,
} from './localTerminalGame';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import { useLocale } from '../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { showRawAlert } from '../alerts/alertService';
import { shouldAutoStart, autoStartKey } from './terminalAutoStart';
import { terminalHackingStyles } from './terminalHackingStyles';
import { hackSuccessKey, isHackWon } from './hackOutcome';

const COLUMN_WIDTH = 12;
const ATTEMPTS_MAX = 4;

const TerminalHackingModal = ({
  visible,
  terminal,
  roomCode,
  autoStart = false,
  ownerToken,
  onClose,
  onHacked,
}) => {
  useLocale();
  const characterId = useCharacterStore((state) => state.currentCharacterId);
  const characterName = useCharacterStore((state) => state.characterName);
  const markMagazineEffectUsed = useCharacterStore((state) => state.markMagazineEffectUsed);
  const rooms = useRoomStore((state) => state.rooms);
  const myClientId = useRoomStore((state) => state.clientId);
  const [busy, setBusy] = useState(false);
  const [localState, setLocalState] = useState(initialLocalTerminalState);
  const lastAutoStartKey = useRef('');
  const scrollAnim = useRef(new Animated.Value(0)).current;

  const terminalState = rooms?.[roomCode]?.terminalStates?.[terminal?.containerId]
    || (terminal?.containerId ? { containerId: terminal.containerId, game: null, closed: false } : null);
  // Обновлённый сервер присылает capabilities.terminalHacking. Старый сервер
  // (или офлайн-комната) не поддерживает протокол терминалов — играем локально.
  const localMode = !roomHasTerminalProtocol(rooms?.[roomCode]);
  const game = localMode ? localState.view : (terminalState?.game || null);
  const isOperator = localMode ? true : Boolean(
    game
    && game.operatorClientId === myClientId
    && game.operatorCharacterId === characterId,
  );
  const isSpectator = localMode ? false : Boolean(game && ['playing', 'pendingDigest'].includes(game.status) && !isOperator);
  // Патч 503: доска может принадлежать другому персонажу. Нажатие «Взломать»
  // (autoStart) тогда собирает новую доску под текущий лист, а «Смотреть» нет.
  const boardOfAnotherOperator = Boolean(game && !isOperator && (
    game.operatorCharacterId !== characterId || (!localMode && game.operatorClientId !== myClientId)
  ));
  // Патч 504: после исчерпания попыток доска НЕ перезапускается сама —
  // сначала Мастер отвечает на «Разрешить повторный взлом? Да/Нет».
  const isClosed = Boolean(terminalState?.closed || terminalState?.locked || game?.status === 'closed');
  const awaitingGm = !isClosed && (game?.status === 'awaitingRetry' || Boolean(terminalState?.awaitingGm));
  const canHack = Boolean(characterId && (localMode || roomCode) && !isClosed && !awaitingGm);

  /**
   * Патч 547: терминал, как и замок, сам передаёт сигнал об успешном взломе.
   * Наблюдение за реестром комнаты не работало в локальном резерве, поэтому
   * успех не доходил до окна локации и игрок не мог пройти дальше.
   */
  const reportedWinRef = useRef('');
  const onHackedRef = useRef(onHacked);
  onHackedRef.current = onHacked;
  const reportWin = useCallback(() => {
    if (!isHackWon(game)) return;
    const key = hackSuccessKey(terminal?.containerId, game, terminalState?.accessId);
    if (reportedWinRef.current === key) return;
    reportedWinRef.current = key;
    onHackedRef.current?.({
      containerId: String(terminal?.containerId || '').trim(), kind: 'terminal', local: localMode,
    });
  }, [game, terminal?.containerId, terminalState?.accessId, localMode]);

  useEffect(() => {
    if (!visible) return;
    reportWin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, game?.status, terminal?.containerId, game?.revision, terminalState?.accessId, localMode]);

  // Патч 547: закрытие окна после ACCESS GRANTED передаёт сигнал о взломе.
  const closeModal = () => {
    reportWin();
    onClose?.();
  };

  // В локальной партии (сервер комнат недоступен) Мастер сидит за этим же
  // устройством: показываем тот же вопрос «Да/Нет» здесь. В сетевой партии
  // решение принимает глобальный TerminalRetryPromptHost на устройстве Мастера.
  const localPromptKey = useRef('');
  useEffect(() => {
    if (!visible || !localMode || !awaitingGm) return;
    const key = `${terminal?.containerId || ''}:${game?.revision ?? 'none'}`;
    if (localPromptKey.current === key) return;
    localPromptKey.current = key;
    void showRawAlert({
      title: tLootTrade('terminal.retryTitle'),
      message: `${tLootTrade('terminal.attemptsExhausted')}
${tLootTrade('terminal.retryMessage')}`,
      kind: 'info',
      buttons: [
        { text: tLootTrade('terminal.retryYes') },
        { text: tLootTrade('terminal.retryNo'), style: 'cancel' },
      ],
    }).then((index) => {
      if (index === 0) doAction('retryYes');
      else if (index === 1) doAction('retryNo');
      else localPromptKey.current = '';
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, localMode, awaitingGm, game?.revision, terminal?.containerId]);

  // Патч 505: после ACCESS GRANTED окно больше не шлёт лишний `start`.
  // Раньше статус `won` не входил в guard, и доска пересобиралась заново,
  // стоило clientId вкладки разойтись с оператором (две вкладки одного
  // браузера, переподключение). Правило вынесено в чистый модуль и покрыто
  // тестами отдельно от React Native.
  useEffect(() => {
    const allowed = shouldAutoStart({
      visible,
      autoStart,
      hasTerminal: Boolean(terminal?.containerId),
      hasRoom: Boolean(roomCode || localMode),
      characterId,
      isClosed,
      awaitingGm,
      game,
      boardOfAnotherOperator,
    });
    if (!allowed) return;
    const key = autoStartKey({
      roomCode,
      containerId: terminal.containerId,
      characterId,
      game,
    });
    if (lastAutoStartKey.current === key) return;
    lastAutoStartKey.current = key;
    void doAction('start');
  // State intentionally tracks the terminal's latest game status.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoStart, terminal?.containerId, roomCode, localMode, characterId, game?.status, game?.operatorCharacterId, boardOfAnotherOperator, isClosed, awaitingGm]);

  useEffect(() => {
    if (game?.status === 'won' && game.scrollUp) {
      scrollAnim.setValue(0);
      Animated.timing(scrollAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    } else {
      scrollAnim.setValue(0);
    }
  }, [game?.revision, game?.status, scrollAnim]);

  const wordsByStart = useMemo(() => new Map((game?.wordRanges || []).map((word) => [word.start, word])), [game?.wordRanges]);
  const bracketsByStart = useMemo(() => new Map((game?.bracketRanges || []).map((bracket) => [bracket.start, bracket])), [game?.bracketRanges]);

  const doAction = async (action, value) => {
    if (busy || !terminal?.containerId || (!roomCode && !localMode)) return;
    if (['start', 'guess', 'bracket', 'useDigest', 'declineDigest'].includes(action) && !characterId) {
      showRawAlert({ title: tLootTrade('terminal.selectCharacter') });
      return;
    }
    // Повторный взлом без разрешения Мастера запрещён и в локальном резерве.
    if (isClosed && !['retryYes', 'retryNo'].includes(action)) return;
    if (awaitingGm && !localMode && !['retryYes', 'retryNo'].includes(action)) return;
    if (localMode) {
      const snapshot = buildLocalCharacterSnapshot(useCharacterStore.getState());
      const next = applyLocalTerminalAction(localState, action, value, {
        terminal: terminalState?.config || terminal,
        characterId,
        characterSnapshot: snapshot,
      });
      setLocalState(next);
      if (action === 'useDigest' && next.usedDigest) {
        markMagazineEffectUsed?.('mag_programmers_digest');
      }
      if (next.error && next.error !== 'TERMINAL_INVALID_GUESS') {
        showRawAlert({ title: tLootTrade('terminal.actionFailed') });
      }
      return;
    }
    setBusy(true);
    try {
      const updated = await useRoomStore.getState().actOnTerminal({
        code: roomCode,
        containerId: terminal.containerId,
        action,
        characterId: characterId || undefined,
        value,
        ownerToken,
      });
      // Патч 529 (ЗАКОН СНИМКА): сервер 529 присылает char.command с
      // kind=magazine.use, его исполняет CharSpendCommandHost. Эта ветка —
      // локальный резерв для сервера 528 без общего кадра команд; действие
      // стора идемпотентно, поэтому двойного эффекта нет. Снимок на сервере
      // не правит никто: лист публикует сам клиент.
      if (action === 'useDigest' && updated?.game?.digestUsed) {
        markMagazineEffectUsed?.('mag_programmers_digest');
        if (characterId) {
          setTimeout(() => { void pushSavedCharacterToBoundRoomIfAny(characterId); }, 100);
        }
      }
    } catch (error) {
      const code = error?.code || error?.message;
      if (code === 'TERMINAL_VIEW_ONLY') showRawAlert({ title: tLootTrade('terminal.viewOnly') });
      else if (code === 'TERMINAL_CLOSED') showRawAlert({ title: tLootTrade('terminal.closedBadge'), message: tLootTrade('terminal.closedHint') });
      else if (code === 'TERMINAL_AWAITING_RETRY') showRawAlert({ title: tLootTrade('terminal.retryWaiting'), message: tLootTrade('terminal.retryWaitingHint') });
      else if (code === 'KEY_REQUIRED') showRawAlert({ title: tLootTrade('terminal.keyRequiredError') });
      else if (!['ROOM_TIMEOUT', 'TERMINAL_NOT_ACTIVE', 'TERMINAL_ALREADY_ACTIVE'].includes(code)) {
        showRawAlert({ title: tLootTrade('terminal.actionFailed') });
      }
    } finally {
      setBusy(false);
    }
  };

  const renderLine = (columnIndex, lineIndex) => {
    const startIndex = (columnIndex * 17 + lineIndex) * COLUMN_WIDTH;
    const endIndex = startIndex + COLUMN_WIDTH;
    const chunks = [];
    let index = startIndex;
    while (index < endIndex) {
      const word = wordsByStart.get(index);
      if (word) {
        chunks.push({ kind: 'word', item: word, key: word.id });
        index = word.end;
        continue;
      }
      const bracket = bracketsByStart.get(index);
      if (bracket) {
        chunks.push({ kind: 'bracket', item: bracket, key: bracket.id });
        index = bracket.end;
        continue;
      }
      chunks.push({ kind: 'junk', text: game?.board?.[index] || '.', key: `cell-${index}` });
      index += 1;
    }
    return (
      <View key={`${columnIndex}-${lineIndex}`} style={styles.codeLine}>
        {chunks.map((chunk) => {
          if (chunk.kind === 'word') {
            const removed = Boolean(chunk.item.removed || chunk.item.guessed);
            const content = removed ? '·'.repeat(chunk.item.word.length) : chunk.item.word;
            const common = [styles.codeText, styles.wordText, !removed && styles.wordActive, removed && styles.removedText, chunk.item.isPassword && styles.passwordHint];
            return (
              <Pressable
                key={chunk.key}
                disabled={!isOperator || busy || removed || game?.status !== 'playing'}
                accessibilityRole="button"
                accessibilityLabel={`${tLootTrade('terminal.guessWord')}: ${chunk.item.word}`}
                accessibilityHint={tLootTrade('terminal.guessHint')}
                onPress={() => doAction('guess', chunk.item.id)}
              >
                <Text style={common}>{content}</Text>
              </Pressable>
            );
          }
          if (chunk.kind === 'bracket') {
            const used = Boolean(chunk.item.used);
            return (
              <Pressable
                key={chunk.key}
                disabled={!isOperator || busy || used || game?.status !== 'playing'}
                accessibilityRole="button"
                accessibilityLabel={`${tLootTrade('terminal.bracketCombo')}: ${chunk.item.text}`}
                accessibilityHint={tLootTrade('terminal.bracketHint')}
                onPress={() => doAction('bracket', chunk.item.id)}
              >
                <Text style={[styles.codeText, styles.bracketText, used && styles.removedText]}>
                  {used ? ' '.repeat(chunk.item.text.length) : chunk.item.text}
                </Text>
              </Pressable>
            );
          }
          return <Text key={chunk.key} style={[styles.codeText, styles.junkText]}>{chunk.text}</Text>;
        })}
      </View>
    );
  };

  const renderColumn = (columnIndex) => (
    <View key={`column-${columnIndex}`} style={styles.codeColumn}>
      {Array.from({ length: 17 }, (_, lineIndex) => renderLine(columnIndex, lineIndex))}
    </View>
  );

  const statusLabel = game?.status === 'won'
    ? tLootTrade('terminal.accessGranted')
    : (game?.status === 'awaitingRetry' ? tLootTrade('terminal.hackFailed') : null);
  // Патч 496: эффект скобки игрок узнаёт только после нажатия.
  const resultLabel = game?.result === 'DUD REMOVED' ? tLootTrade('terminal.dudRemoved')
    : game?.result === 'ATTEMPT RESTORED' ? tLootTrade('terminal.attemptRestored')
      : game?.result === 'ATTEMPTS RESET' ? tLootTrade('terminal.attemptsReset')
        : game?.result === 'ATTEMPTS EXHAUSTED' ? tLootTrade('terminal.attemptsExhausted') : null;
  const shownAttempts = Math.max(game?.attempts || 0, game?.maxAttempts || ATTEMPTS_MAX);
  // Патч 505: история подсказок остаётся на экране и при провале, и при
  // успехе. Раньше панель «ВЗЛОМ ПРОВАЛЕН» полностью заменяла доску, и
  // игрок терял только что найденную комбинацию вроде «5 из 7».
  const guessesPanel = game?.guesses?.length > 0 ? (
    <View style={styles.guessesPanel}>
      <Text style={styles.statusLabel}>{tLootTrade('terminal.likeness')}</Text>
      <View style={styles.guessesRow}>
        {game.guesses.map((guess, index) => (
          <Text key={`${guess.word}-${index}`} style={styles.guessText}>
            {`${guess.word}: ${guess.likeness}/${game?.wordLength || ''}`}
          </Text>
        ))}
      </View>
    </View>
  ) : null;

  return (
    <Modal visible={Boolean(visible)} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={styles.backdrop}>
        <View style={styles.window}>
          <View style={styles.header}>
            <View style={styles.heading}>
              <MaterialCommunityIcons name="console" size={22} color="#93d17a" />
              <Text numberOfLines={1} style={styles.title}>{terminal?.name || terminalState?.config?.name || tLootTrade('terminal.title')}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={tLootTrade('player.close')} style={styles.closeButton} onPress={closeModal}>
              <MaterialCommunityIcons name="close" size={20} color="#bdc8b7" />
            </TouchableOpacity>
          </View>

          {(terminal?.description || terminalState?.config?.description) ? (
            <Text style={styles.description}>{terminal?.description || terminalState?.config?.description}</Text>
          ) : null}

          {isClosed ? (
            <View style={styles.accessPanel}>
              <Text accessibilityRole="alert" style={styles.closedBadge}>{tLootTrade('terminal.closedBadge')}</Text>
              <Text style={styles.statusHint}>{tLootTrade('terminal.closedHint')}</Text>
            </View>
          ) : awaitingGm ? (
            <View style={styles.accessPanel}>
              <Text accessibilityRole="alert" style={styles.accessDenied}>{tLootTrade('terminal.hackFailed')}</Text>
              <Text style={styles.statusHint}>{tLootTrade('terminal.attemptsExhausted')}</Text>
              <Text style={styles.retryWaiting}>{tLootTrade('terminal.retryWaiting')}</Text>
              <Text style={styles.statusHint}>{tLootTrade('terminal.retryWaitingHint')}</Text>
              {guessesPanel}
            </View>
          ) : game?.status === 'won' ? (
            <View style={styles.successPanel}>
              <Animated.View style={[styles.wonBoard, { transform: [{ translateY: scrollAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -92] }) }] }]}>
                <View style={styles.codeBoard}>
                  {renderColumn(0)}
                  {renderColumn(1)}
                </View>
              </Animated.View>
              <Text accessibilityRole="alert" style={styles.accessGranted}>{tLootTrade('terminal.accessGranted')}</Text>
              <Text style={styles.statusHint}>{tLootTrade('terminal.wonAccessHint')}</Text>
              {guessesPanel}
              {/* Патч 547: успех → «Закрыть» → сигнал о взломе → доступ. */}
              <TouchableOpacity
                testID="terminal-success-close"
                accessibilityRole="button"
                style={styles.primaryButton}
                onPress={closeModal}
              >
                <Text style={styles.primaryButtonText}>{tLootTrade('terminal.wonClose')}</Text>
              </TouchableOpacity>
            </View>
          ) : !game ? (
            <View style={styles.idlePanel}>
              <Text style={styles.idleText}>{tLootTrade('terminal.ready')}</Text>
              <Text style={styles.statusHint}>
                {formatLootTrade(tLootTrade('card.terminalDifficulty'), {
                  difficulty: terminalState?.config?.difficulty ?? terminal?.difficulty ?? 0,
                })}
              </Text>
              {canHack && (
                <TouchableOpacity disabled={busy} style={[styles.primaryButton, busy && styles.disabledButton]} onPress={() => doAction('start')}>
                  <Text style={styles.primaryButtonText}>{tLootTrade('terminal.hack')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              <View style={styles.statusRow}>
                <View>
                  <Text style={styles.statusLabel}>{tLootTrade('terminal.attempts')}</Text>
                  <View style={styles.attemptDots}>
                    {Array.from({ length: shownAttempts }, (_, index) => (
                      <View key={index} style={[styles.attemptDot, index < (game.attempts || 0) && styles.attemptDotOn]} />
                    ))}
                    <Text style={styles.attemptCount}>{game.attempts} / {game.maxAttempts || ATTEMPTS_MAX}</Text>
                  </View>
                  {game.difficulty !== game.effectiveDifficulty && (
                    <Text style={styles.hackerHint}>
                      {formatLootTrade(tLootTrade('terminal.hackerReduced'), {
                        difficulty: game.difficulty,
                        effective: game.effectiveDifficulty,
                      })}
                    </Text>
                  )}
                </View>
                <View style={styles.operatorBox}>
                  <Text style={styles.statusLabel}>{tLootTrade('terminal.operator')}</Text>
                  <Text style={styles.operatorName} numberOfLines={1}>{game.operatorName || characterName || '—'}</Text>
                </View>
              </View>

              {isSpectator && <Text style={styles.spectatorNotice}>{tLootTrade('terminal.spectator')}</Text>}
              {game.status === 'pendingDigest' && game.digestEligible ? (
                <View style={styles.digestPanel}>
                  <Text style={styles.digestPrompt}>{tLootTrade('terminal.digestPrompt')}</Text>
                  {isOperator ? (
                    <View style={styles.digestActions}>
                      <TouchableOpacity disabled={busy} style={styles.digestUseButton} onPress={() => doAction('useDigest')}>
                        <Text style={styles.digestUseText}>{tLootTrade('terminal.digestUse')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity disabled={busy} style={styles.digestDeclineButton} onPress={() => doAction('declineDigest')}>
                        <Text style={styles.digestDeclineText}>{tLootTrade('terminal.digestDecline')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : <Text style={styles.statusHint}>{tLootTrade('terminal.waitingOperator')}</Text>}
                </View>
              ) : null}

              <ScrollView style={styles.codeScroll} contentContainerStyle={styles.codeBoard}>
                {renderColumn(0)}
                {renderColumn(1)}
              </ScrollView>

              {guessesPanel}
              {statusLabel ? <Text style={styles.statusLabel}>{statusLabel}</Text> : null}
              {resultLabel ? <Text style={styles.resultLabel}>{resultLabel}</Text> : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = terminalHackingStyles;

export default TerminalHackingModal;
