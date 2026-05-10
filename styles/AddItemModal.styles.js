import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalContent: {
    width: '80%',
    height: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  backButton: { alignSelf: 'flex-start', marginBottom: 8 },
  backButtonText: { color: '#1A73E8', fontSize: 14 },
  searchInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 12 },
  itemContainer: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: { fontSize: 16, flex: 1, paddingRight: 8 },
  itemType: { fontSize: 14, color: '#444' },
  emptyText: { textAlign: 'center', marginVertical: 20, color: '#777' },
  closeButton: { backgroundColor: '#DC3545', padding: 10, borderRadius: 5, marginTop: 12, alignItems: 'center' },
  closeButtonText: { color: 'white', fontWeight: 'bold' },
});

export default styles;
