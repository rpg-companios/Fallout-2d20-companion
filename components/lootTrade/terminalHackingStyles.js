import { StyleSheet } from 'react-native';

/**
 * Патч 520: каркас окна мини-игры вынесен из TerminalHackingModal.js, чтобы
 * окно взлома замка переиспользовало те же backdrop/window/header/statusRow/
 * кнопки/бейджи, а не рисовало «похожий, но чуть другой» набор (правило
 * docs/ui-modals-rules.md). Стили ячеек и стрелок — в LockPickingModal.js.
 */
export const terminalHackingStyles = StyleSheet.create({
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

export default terminalHackingStyles;
