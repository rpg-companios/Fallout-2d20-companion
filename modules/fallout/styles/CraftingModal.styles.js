// Стили модалки крафта (318: квадраты категорий, спойлеры; 325 — светлая
// гамма; 329 — слово владельца: фон окна категорий = фон окон сеттинга
// (assets/bg.png), квадраты — как области home screen (тёмная панель с
// золотой рамкой), спойлеры рецептов — карточки по образцу модалки перков
// (рамка, отступы, не сплошное полотно); доступные рецепты — светлые,
// недоступные по перку/рангу — серые; доступность материалов — в скобках
// рядом с названием; сложность/навык/время — внутри спойлера).
import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { flex: 1, backgroundColor: '#fff', paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  headerTitle: { color: '#000', fontSize: 18, fontWeight: '700', flexShrink: 1 },
  headerSpacer: { flex: 1 },
  closeText: { color: '#444', fontSize: 20, paddingHorizontal: 8 },
  backText: { color: '#444', fontSize: 14, paddingRight: 8 },

  // Квадраты категорий (318; 322 — прокрутка, строки по 3; 329 — фон сеттинга;
  // 330 — поправка владельца: оформление областей — как КАРТОЧКИ ПЕРСОНАЖЕЙ
  // home screen (characterCell), а не папок: светлая панель, серая рамка,
  // скругление 8; имя #222, подпись #555 — как characterName/characterLevel)
  bg: { flex: 1 },
  bgImage: { opacity: 0.3 }, // как на экранах сеттинга (WeaponsAndArmor)
  body: { flex: 1, paddingHorizontal: 12 },
  tilesContent: { paddingBottom: 8 },
  tileRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  tileRowCenter: { justifyContent: 'center' },
  tileRowLeft: { justifyContent: 'flex-start' },
  tile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#5a5a5a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 4,
  },
  tileIcon: { fontSize: 38, color: '#5a5a5a' },
  tileLabel: { color: '#222', fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
  tileCount: { color: '#555', fontSize: 11 },
  tileCountZero: { color: '#9aa1a9' },
  closeBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  closeBtnText: { color: '#444', fontSize: 15, fontWeight: '600' },

  // Список рецептов (329): карточки-спойлеры по образцу модалки перков —
  // рамка #ddd, скругление 6, отступы; доступные — светлые (белые),
  // недоступные по перку/рангу — серые (#f1f5f9), материалы — текстом
  // в скобках рядом с названием. Сложность/навык/время — внутри спойлера.
  list: { flex: 1, paddingHorizontal: 12 },
  row: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  rowDisabled: { backgroundColor: '#f1f5f9' }, // недоступен по перку/рангу
  spoilerHead: { paddingHorizontal: 10, paddingVertical: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { color: '#000', fontSize: 15, fontWeight: 'bold', flex: 1, flexShrink: 1 },
  rowNameLocked: { color: '#9aa1a9' }, // серое имя как perkNameDisabled
  rowNote: { fontSize: 12, flexShrink: 0 },
  rowNoteOk: { color: '#16a34a' }, // «(можно создать)»
  rowNoteBad: { color: '#dc2626' }, // «(не хватает материалов)»
  rowNoteLocked: { color: '#9aa1a9' }, // «(нужен перк)»
  spoilerArrow: { color: '#777', fontSize: 14 },
  rowMeta: { color: '#777', fontSize: 12, marginBottom: 6 },
  rowReason: { color: '#dc2626', fontSize: 12, marginBottom: 6 },
  spoilerBody: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
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
