import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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

const COLUMN_WIDTH = 12;
const ATTEMPTS_MAX = 4;

const TerminalHackingModal = ({
  visible,
  terminal,
  roomCode,
  autoStart = false,
  ownerToken,
  onClose,
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

  useEffect(() => {
    if (!visible || !autoStart || !terminal?.containerId || (!roomCode && !localMode) || !characterId) return;
    if (isClosed || awaitingGm) return;
    if (['playing', 'pendingDigest'].includes(game?.status) && !boardOfAnotherOperator) return;
    const key = `${roomCode}:${terminal.containerId}:${characterId}:${game?.operatorCharacterId || ''}`;
    if (lastAutoStartKey.current === key) return;
    lastAutoStartKey.current = key;
    void doAction('start');
  // State intentionally tracks the terminal's latest game revision.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoStart, terminal?.containerId, roomCode, characterId, game?.status, game?.operatorCharacterId, isClosed, awaitingGm]);

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
      else if (code !== 'ROOM_TIMEOUT' && code !== 'TERMINAL_NOT_ACTIVE') showRawAlert({ title: tLootTrade('terminal.actionFailed') });
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

  return (
    <Modal visible={Boolean(visible)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.window}>
          <View style={styles.header}>
            <View style={styles.heading}>
              <MaterialCommunityIcons name="console" size={22} color="#93d17a" />
              <Text numberOfLines={1} style={styles.title}>{terminal?.name || terminalState?.config?.name || tLootTrade('terminal.title')}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={tLootTrade('player.close')} style={styles.closeButton} onPress={onClose}>
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

              {game.guesses?.length > 0 && (
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
              )}
              {statusLabel ? <Text style={styles.statusLabel}>{statusLabel}</Text> : null}
              {resultLabel ? <Text style={styles.resultLabel}>{resultLabel}</Text> : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  window: { width: '100%', maxWidth: 760, maxHeight: '94%', backgroundColor: '#08110b', borderColor: '#42784a', borderWidth: 1.5, borderRadius: 6, padding: 14, shadowColor: '#000', shadowOpacity: 0.65, shadowRadius: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#29482d', paddingBottom: 9, marginBottom: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  title: { color: '#c8efb8', fontSize: 17, fontWeight: '800', flex: 1, fontFamily: 'monospace' },
  closeButton: { padding: 5, marginLeft: 8 },
  description: { color: '#9db197', fontSize: 13, marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#203923' },
  statusLabel: { color: '#8da38b', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'monospace' },
  attemptDots: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  attemptDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: '#507052' },
  attemptDotOn: { backgroundColor: '#a5dc88', borderColor: '#d0f2b7' },
  attemptCount: { color: '#c9ddb9', fontSize: 12, marginLeft: 4, fontFamily: 'monospace' },
  operatorBox: { alignItems: 'flex-end', maxWidth: '48%' },
  operatorName: { color: '#d2e7c7', fontSize: 12, marginTop: 5, fontFamily: 'monospace' },
  spectatorNotice: { color: '#f1d77b', backgroundColor: '#292712', borderRadius: 4, padding: 7, marginTop: 8, fontSize: 12, textAlign: 'center' },
  codeScroll: { maxHeight: 405, marginTop: 10, borderWidth: 1, borderColor: '#1b3822', backgroundColor: '#030805' },
  codeBoard: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 8, gap: 6 },
  codeColumn: { flex: 1 },
  codeLine: { height: 18, flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  codeText: { fontFamily: 'monospace', fontSize: 11, lineHeight: 17 },
  wordText: { fontWeight: '700', textDecorationLine: 'underline', textDecorationColor: '#98d97e' },
  wordActive: { color: '#c4efa5', backgroundColor: 'rgba(106,155,67,0.2)' },
  passwordHint: { textDecorationLine: 'underline', textDecorationStyle: 'double', color: '#fff0a3' },
  bracketText: { color: '#67d8dc', backgroundColor: 'rgba(44,145,150,0.2)', fontWeight: '800' },
  junkText: { color: '#536b53' },
  removedText: { color: '#263527', textDecorationLine: 'none' },
  guessesPanel: { paddingTop: 8 },
  guessesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  guessText: { color: '#c8d4b1', fontFamily: 'monospace', fontSize: 12, backgroundColor: '#18231a', paddingHorizontal: 6, paddingVertical: 3 },
  accessPanel: { minHeight: 190, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  successPanel: { minHeight: 250, alignItems: 'center', overflow: 'hidden', marginTop: 8 },
  wonBoard: { width: '100%' },
  accessDenied: { color: '#ff4b4b', fontFamily: 'monospace', fontSize: 24, fontWeight: '900', letterSpacing: 2, textAlign: 'center', textShadowColor: '#f00', textShadowRadius: 12 },
  closedBadge: { color: '#b9c2b4', fontFamily: 'monospace', fontSize: 24, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  retryWaiting: { color: '#f0d68d', fontFamily: 'monospace', fontSize: 14, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  accessGranted: { color: '#a9f07d', fontFamily: 'monospace', fontSize: 25, fontWeight: '900', letterSpacing: 2, textAlign: 'center', textShadowColor: '#5dff43', textShadowRadius: 12 },
  statusHint: { color: '#97a392', fontSize: 12, textAlign: 'center', marginTop: 8 },
  hackerHint: { color: '#a5dc88', fontSize: 11, marginTop: 5, fontFamily: 'monospace' },
  resultLabel: { color: '#e2c477', fontSize: 12, marginTop: 6, letterSpacing: 1, fontFamily: 'monospace' },
  idlePanel: { paddingVertical: 22, alignItems: 'center' },
  idleText: { color: '#b2c9a5', fontFamily: 'monospace', fontSize: 15, fontWeight: '700' },
  primaryButton: { backgroundColor: '#335a30', borderColor: '#88bf70', borderWidth: 1, borderRadius: 4, paddingHorizontal: 24, paddingVertical: 11, marginTop: 18 },
  primaryButtonText: { color: '#edffe4', fontFamily: 'monospace', fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  digestPanel: { marginTop: 10, padding: 10, borderWidth: 1, borderColor: '#89733e', backgroundColor: '#292516' },
  digestPrompt: { color: '#f0d68d', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  digestActions: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 9 },
  digestUseButton: { borderWidth: 1, borderColor: '#a9d982', padding: 8, borderRadius: 4 },
  digestUseText: { color: '#c4eba0', fontWeight: '700', fontSize: 12 },
  digestDeclineButton: { borderWidth: 1, borderColor: '#a16d68', padding: 8, borderRadius: 4 },
  digestDeclineText: { color: '#efaaa5', fontWeight: '700', fontSize: 12 },
});

export default TerminalHackingModal;
