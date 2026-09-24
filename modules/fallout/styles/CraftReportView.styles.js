// Стили общего отчёта о крафте (патч 357). Значения — точная копия отчёта
// окна крафта (styles/CraftingModal.styles.js, патчи 265/318/323): модалка
// установки модов показывает ровно тот же отчёт, что и окно крафта.
import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  list: { flex: 1, paddingHorizontal: 12 },
  resultBox: { backgroundColor: 'rgb(245, 245, 245)', borderRadius: 10, padding: 12, marginTop: 12 },
  resultLine: { color: '#000', fontSize: 13, lineHeight: 19 },
  apBox: { marginTop: 12 },
  apQuestion: { color: '#000', fontSize: 13, lineHeight: 19 },
  qtyActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  bigCraft: { backgroundColor: '#16a34a', borderRadius: 10, padding: 12, marginTop: 14, alignItems: 'center' },
  bigCraftText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  qtyActionsBigCraft: { flex: 1, marginTop: 0 },
  qtyCancel: { backgroundColor: '#f1f5f9', borderRadius: 10, padding: 12, flex: 1, alignItems: 'center' },
  qtyCancelText: { color: '#444', fontSize: 14 },
  doneBtn: { backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10, marginTop: 12, alignItems: 'center' },
  doneBtnText: { color: '#444', fontSize: 14 },
});
