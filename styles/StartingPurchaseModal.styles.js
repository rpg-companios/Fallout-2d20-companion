import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    width: '92%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 18,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F6FA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  budgetLabel: { fontSize: 14, color: '#444' },
  budgetValue: { fontSize: 18, fontWeight: '700', color: '#005A9C' },
  budgetValueEmpty: { color: '#B03030' },

  addButton: {
    backgroundColor: '#005A9C',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  addButtonDisabled: { backgroundColor: '#9BB4C7' },
  addButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },

  cartList: { maxHeight: 260 },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  cartInfo: { flex: 1, paddingRight: 8 },
  cartName: { fontSize: 15, color: '#222' },
  cartMeta: { fontSize: 12, color: '#777', marginTop: 2 },
  qtyControls: { flexDirection: 'row', alignItems: 'center' },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E4EBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { fontSize: 18, fontWeight: '700', color: '#005A9C' },
  qtyValue: { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '600' },

  emptyState: { paddingVertical: 24, alignItems: 'center' },
  emptyStateText: { color: '#888', fontSize: 14, textAlign: 'center' },

  footer: { marginTop: 14 },
  finishButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  finishButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cancelButton: {
    backgroundColor: '#888',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
});

export default styles;
