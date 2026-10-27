// Стили модалки ремонта (патч 413). Скролл-закон (402): заголовок и футер
// с кнопками фиксированы, содержимое — в ScrollView. Тёмная палитра окон
// сеттинга; успех/провал — зелёный #22c55e / приглушённый красный.
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  window: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    backgroundColor: '#1e1e1e',
    borderColor: '#5a5a5a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#b8b8b8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 8 },
  block: {
    backgroundColor: '#262626',
    borderColor: '#3d3d3d',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  requirementLine: {
    color: '#e6e6e6',
    fontSize: 13,
    paddingVertical: 2,
  },
  donorRow: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  donorRowSelected: { backgroundColor: '#333' },
  donorText: { color: '#e6e6e6', fontSize: 13 },
  timeLine: {
    color: '#9fb4c7',
    fontSize: 13,
    marginBottom: 6,
  },
  blockedLine: {
    color: '#e06c6c',
    fontSize: 13,
  },
  reportLine: {
    color: '#e6e6e6',
    fontSize: 13,
    paddingVertical: 2,
  },
  success: { color: '#22c55e', fontWeight: 'bold' },
  failure: { color: '#e06c6c', fontWeight: 'bold' },
  apBlock: { marginTop: 8 },
  apQuestion: { color: '#d9c36c', fontSize: 13, marginBottom: 6 },
  apRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  apButton: {
    backgroundColor: '#2f3d33',
    borderColor: '#22c55e',
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 6,
  },
  apButtonText: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  mainButton: {
    backgroundColor: '#22c55e',
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 18,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  mainButtonDisabled: { backgroundColor: '#3a4a3e' },
  mainButtonText: { color: '#0b2416', fontWeight: 'bold', fontSize: 14 },
  closeButton: {
    borderColor: '#5a5a5a',
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  closeButtonText: { color: '#cfcfcf', fontSize: 14 },
});

export default styles;
