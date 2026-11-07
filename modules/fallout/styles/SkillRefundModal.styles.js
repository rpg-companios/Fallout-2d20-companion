import { StyleSheet } from 'react-native';

// 552: модалка «с каких навыков снять очки при снятии перка».
// Тот же визуальный язык, что у PerkSelectModal (светлый лист на тёмном фоне).
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '92%',
    maxWidth: 640,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#5a5a5a',
  },
  title: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 8,
  },
  message: {
    color: '#000',
    marginBottom: 6,
  },
  remaining: {
    color: '#000',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  list: {
    maxHeight: 360,
    borderTopWidth: 1,
    borderTopColor: 'rgb(221, 221, 221)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgb(221, 221, 221)',
  },
  listContent: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgb(235, 235, 235)',
  },
  rowInfo: {
    flex: 1,
    paddingRight: 8,
  },
  rowName: {
    color: '#000',
  },
  rowValue: {
    color: '#444',
    fontSize: 12,
  },
  stepButton: {
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 6,
    backgroundColor: '#f2f2f2',
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  stepButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  undoButton: {
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 6,
    backgroundColor: '#fff',
  },
  undoButtonText: {
    color: '#000',
  },
  hint: {
    color: '#444',
    fontSize: 12,
    marginTop: 8,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  cancelButtonText: {
    color: '#000',
  },
  confirmButton: {
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2e6b2e',
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default styles;
