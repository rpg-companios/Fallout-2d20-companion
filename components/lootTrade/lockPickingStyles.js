import { StyleSheet } from 'react-native';
import { ADMIN_MODAL_PALETTE } from '../admin/adminModalTheme';
// Патч 525: светлый каркас берём у ближайшего образца — формы создания
// карточки «Добыча / Торговля» (правило docs/ui-modals-rules.md). Базовые ключи
// overlay/card/title/label/footer/btn/saveBtn/cancelBtn НЕ описываем заново:
// они приходят из lootTradeFormStyles. Ниже только то, чего у формы нет —
// ячейки, стрелки, строка статуса и карточка точки входа.
import { lootTradeFormStyles } from '../screens/LootTradeScreen/modals/ContainerFormModal';

export const modalStyles = lootTradeFormStyles;
export const LOCK_PALETTE = ADMIN_MODAL_PALETTE;

export const lockLightStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    paddingBottom: 9,
    marginBottom: 10,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'left',
    marginBottom: 0,
  },
  closeButton: { padding: 5 },

  pointCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  pointBody: { flex: 1 },
  badgeText: {
    color: ADMIN_MODAL_PALETTE.danger,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
  },
  buttonDisabled: { opacity: 0.5 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
  },
  // Патч 531: левая колонка строки статуса должна СЖИМАТЬСЯ до ширины
  // карточки. Иначе длинная подсказка задаёт собственную (огромную) ширину,
  // текст встаёт в одну строку и уходит за границы модалки.
  statusLeft: { flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 4 },
  pinCount: { color: ADMIN_MODAL_PALETTE.text, fontSize: 17, fontWeight: '800' },
  statText: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 11, marginTop: 4 },
  statusLabel: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 10, fontWeight: '700' },

  board: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  cellRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginVertical: 5 },
  cell: {
    width: 38,
    height: 38,
    borderWidth: 1.5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: ADMIN_MODAL_PALETTE.borderMuted,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceMuted,
  },
  cellHidden: {},
  cellGreen: { borderColor: '#2e7d32', backgroundColor: '#dff0d8' },
  // Патч 527: ошибочный «?» должен быть ЯВНО красным, а не просто тёмным
  // знаком на чуть розовом фоне.
  cellRed: { borderColor: '#c1121f', backgroundColor: '#fbe0e2' },
  cellGrey: { borderColor: '#888888', backgroundColor: '#e3e3e3' },
  cellText: { color: ADMIN_MODAL_PALETTE.text, fontSize: 20, fontWeight: '800' },
  cellTextGreen: { color: '#1b5e20' },
  cellTextRed: { color: '#c1121f', fontSize: 22, fontWeight: '900' },
  cellTextGrey: { color: ADMIN_MODAL_PALETTE.mutedText },

  // Патч 527: длинная подсказка + доска + стрелки должны прокручиваться на
  // телефоне, иначе строки накладываются друг на друга («стрелки пересекает
  // черты»). Каркас карточки (maxHeight 84 %) остаётся общим с формами.
  scrollArea: { flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  arrowsHint: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 2,
    textAlign: 'left',
    // Явно разрешаем перенос: ограничение ширины приходит от statusLeft.
    flexShrink: 1,
    maxWidth: '100%',
  },

  // Область стрелок: заливка чуть темнее светлой карточки, кнопки — ещё чуть
  // темнее области. Стрелки крупнее и разведены дальше друг от друга.
  // Патч 531: область осталась чуть темнее карточки (закон 527), но БЕЗ
  // рамки: лишняя горизонтальная черта вокруг стрелок и была «полосой через
  // центр». В до-светлой версии у крестовины не было ни рамки, ни подложки.
  arrowPad: {
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceMuted,
    alignItems: 'center',
  },
  crossArea: { alignItems: 'center' },
  crossRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 5,
  },
  // Патч 531 по зацепке владельца: артефакт «линия через центр» давал
  // `flex: 0` (в браузере он превращается в `flex: 0 1 0%` и схлопывает
  // кнопку). Убираем flex, собственный фон и жёсткие width/height — фоном
  // служит затемнённая область arrowPad. Остаётся начертание 520–524:
  // иконка arrow-*-bold размера 22, явно отцентрированная по обеим осям.
  arrowButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  arrowButtonDisabled: { opacity: 0.45 },
  // Пустышки в верхнем ряду равны кнопке, чтобы «вверх» стоял ровно над
  // «вниз»: иконка 22 + отступы 12*2 / 10*2.
  arrowSpacer: { width: 46, height: 42 },

  resultText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    marginTop: 9,
    textAlign: 'center',
    fontWeight: '700',
  },
  hintText: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 12, textAlign: 'center', marginTop: 8 },
  statusHint: { color: ADMIN_MODAL_PALETTE.mutedText, fontSize: 12, textAlign: 'center', marginTop: 8 },
  spectatorNotice: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceMuted,
    borderRadius: 5,
    padding: 8,
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },

  accessPanel: { minHeight: 150, justifyContent: 'center', alignItems: 'center' },
  wonText: { color: '#1b5e20', fontSize: 23, fontWeight: '800', textAlign: 'center', letterSpacing: 1 },
  closedText: { color: ADMIN_MODAL_PALETTE.danger, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  awaitingText: { color: '#8a6100', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  idlePanel: { paddingVertical: 26, alignItems: 'center' },
  idleText: { color: ADMIN_MODAL_PALETTE.text, fontSize: 15, fontWeight: '700' },
  retryActions: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 },
});

export default lockLightStyles;
