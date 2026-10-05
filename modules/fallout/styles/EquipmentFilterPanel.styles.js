// Стили панели фильтров снаряжения (патчи 425–427). 427: чекбоксы
// категорий по 3 в ряд (слово владельца: «квадраты по 3 в ряд»),
// шапка-спойлер убрана — кнопка «Фильтр» живёт в строке поиска окна.
import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  panel: { marginBottom: 8 },
  body: { paddingHorizontal: 10, paddingTop: 8 },
  kindsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  kindBox: { width: '31%', marginRight: '2%', marginBottom: 6, flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4, borderRadius: 6 },
  kindBoxOn: { backgroundColor: '#e8f0fe' },
  kindCheck: { fontSize: 14, marginRight: 4, color: '#333' },
  kindName: { fontSize: 12, color: '#333', flex: 1 },
  kindNameOn: { color: '#2f6df6', fontWeight: 'bold' },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#555', marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  rowLabel: { fontSize: 13, color: '#333', width: 120 },
  rangeInput: { borderBottomWidth: 1, borderColor: '#bbb', width: 56, textAlign: 'center', paddingVertical: 2, fontSize: 14, color: '#333', marginHorizontal: 4 },
  rangeDash: { fontSize: 13, color: '#777' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#999', marginRight: 6, marginBottom: 4 },
  chipOn: { backgroundColor: '#2f6df6', borderColor: '#2f6df6' },
  chipText: { fontSize: 12, color: '#333' },
  chipTextOn: { color: '#fff' },
  dropdownHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  dropdownArrow: { fontSize: 11, color: '#555', marginRight: 6 },
  dropdownTitle: { fontSize: 13, color: '#333' },
  dropdownCount: { fontSize: 12, color: '#2f6df6', marginLeft: 6 },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingLeft: 18 },
  optionText: { fontSize: 12, color: '#333', flex: 1 },
  resetButton: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, backgroundColor: '#eee', borderWidth: 1, borderColor: '#bbb' },
  resetText: { fontSize: 13, color: '#333' },
});
