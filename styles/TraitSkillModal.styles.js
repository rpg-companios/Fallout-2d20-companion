import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  modalText: { fontSize: 16, marginBottom: 20, textAlign: 'center' },
  modalButton: {
    padding: 10,
    marginVertical: 5,
    borderRadius: 4,
    alignItems: 'center',
    width: '100%',
  },
  skillOption: { backgroundColor: '#2196F3' },
  cancelButton: { backgroundColor: '#9E9E9E' },
  buttonText: { color: 'white', fontWeight: 'bold' },
});

export default styles;
