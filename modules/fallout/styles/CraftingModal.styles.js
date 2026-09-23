// Стили модалки крафта (редизайн, патч 318: квадраты категорий, спойлеры
// рецептов, окно количества). Тёмная тема по образцу остальных модалок
// инвентаря; отдельных палитр не заводим — цвета редкостей придут своим слоем.
import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { flex: 1, backgroundColor: '#fff', paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  headerTitle: { color: '#000', fontSize: 18, fontWeight: '700', flexShrink: 1 },
  headerSpacer: { flex: 1 },
  closeText: { color: '#444', fontSize: 20, paddingHorizontal: 8 },
  backText: { color: '#444', fontSize: 14, paddingRight: 8 },

  // Квадраты категорий (318; 322 — прокрутка, строки по 3, выравнивание от центра)
  body: { flex: 1, paddingHorizontal: 12 },
  tilesContent: { paddingBottom: 8 },
  tileRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  tileRowCenter: { justifyContent: 'center' },
  tileRowLeft: { justifyContent: 'flex-start' },
  tile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 4,
  },
  tileIcon: { fontSize: 38, color: '#fff' },
  tileLabel: { color: '#000', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  tileCount: { color: '#16a34a', fontSize: 11 },
  tileCountZero: { color: '#777' },
  closeBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  closeBtnText: { color: '#444', fontSize: 15, fontWeight: '600' },

  // Список рецептов-спойлеров (318): доступные белые, недоступные серые
  list: { flex: 1, paddingHorizontal: 12 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowDisabled: { backgroundColor: '#f1f5f9' },
  spoilerHead: { },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { color: '#000', fontSize: 15, fontWeight: '600', flex: 1 },
  rowNameReady: { color: '#000' },
  spoilerArrow: { color: '#777', fontSize: 14 },
  rowMeta: { color: '#777', fontSize: 12, marginTop: 2 },
  rowReason: { color: '#dc2626', fontSize: 12, marginTop: 2 },
  rowReady: { color: '#16a34a', fontSize: 12, marginTop: 2 },
  spoilerBody: { paddingTop: 8 },
  detailLabel: { color: '#777', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' },
  rarityLine: { color: '#444', fontSize: 12, fontWeight: '700', marginTop: 6 },
  // 322: «есть · нужно» — рядом с названием материала, не на другом конце строки.
  materialLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 3 },
  materialName: { color: '#000', fontSize: 13, flexShrink: 1 },
  materialOk: { color: '#16a34a', fontSize: 12 },
  materialBad: { color: '#dc2626', fontSize: 12 },
  bigCraft: { backgroundColor: '#16a34a', borderRadius: 10, padding: 12, marginTop: 14, alignItems: 'center' },
  bigCraftText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Окно количества (318): «сколько штук создать?»
  qtyOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  qtyDialog: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#5a5a5a', padding: 16, width: '100%' },
  qtyText: { color: '#000', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 },
  qtyBtn: { borderWidth: 1, borderColor: '#5a5a5a', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
  qtyBtnText: { color: '#fff', fontSize: 18 },
  qtyValue: { color: '#000', fontSize: 16, minWidth: 28, textAlign: 'center', fontWeight: '700' },
  qtyActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  qtyCancel: { backgroundColor: '#f1f5f9', borderRadius: 10, padding: 12, flex: 1, alignItems: 'center' },
  qtyCancelText: { color: '#444', fontSize: 14 },
  qtyActionsBigCraft: { flex: 1, marginTop: 0 },

  // Решение про 2 ОД (323)
  apBox: { marginTop: 12 },
  apQuestion: { color: '#000', fontSize: 13, lineHeight: 19 },

  // Отчёт (265, формат владельца)
  resultBox: { backgroundColor: 'rgb(245, 245, 245)', borderRadius: 10, padding: 12, marginTop: 12 },
  resultLine: { color: '#000', fontSize: 13, lineHeight: 19 },
  doneBtn: { backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10, marginTop: 12, alignItems: 'center' },
  doneBtnText: { color: '#444', fontSize: 14 },
  empty: { color: '#777', fontSize: 13, textAlign: 'center', marginTop: 30 },
});
